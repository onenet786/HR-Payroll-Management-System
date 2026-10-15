const express = require('express');
const nodemailer = require('nodemailer');
const { pool } = require('./db.cjs');

const router = express.Router();
const money = value => Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function mailTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass || !process.env.SMTP_FROM?.trim()) return null;
  return nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user, pass }, requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false' });
}

router.post('/:runId/send', async (req, res, next) => {
  try {
    if (!req.identity.permissions.has('manage_payroll') && req.identity.roleId !== 'role-admin') return res.status(403).json({ error: 'Payroll permission required.' });
    const transport = mailTransport();
    if (!transport) return res.status(503).json({ error: 'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.' });
    const runResult = await pool.query(`SELECT data FROM payroll_runs WHERE id=$1`, [req.params.runId]);
    const run = runResult.rows[0]?.data;
    if (!run || !['Approved', 'Disbursed'].includes(run.status)) return res.status(409).json({ error: 'Only approved or disbursed payroll payslips can be emailed.' });
    const result = await pool.query(
      `SELECT p.id, p.data AS payslip, e.data AS employee
       FROM payroll_payslips p JOIN employees e ON e.id=p.employee_id
       WHERE p.payroll_run_id=$1 OR p.data->>'payrollRunId'=$1 ORDER BY p.id`, [req.params.runId],
    );
    if (!result.rowCount) return res.status(409).json({ error: 'No payslips found for this payroll run.' });
    let sent = 0; let skipped = 0; const failed = [];
    for (const record of result.rows) {
      const payslip = record.payslip; const employee = record.employee; const recipient = String(employee.email || '').trim().toLowerCase();
      const deliveryId = `${req.params.runId}-${record.id}`.slice(0, 240);
      const previous = await pool.query(`SELECT status FROM payslip_deliveries WHERE id=$1`, [deliveryId]);
      if (previous.rows[0]?.status === 'Sent') { skipped += 1; continue; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) { failed.push({ employeeId: payslip.employeeId, error: 'Valid employee email is missing.' }); continue; }
      await pool.query(`INSERT INTO payslip_deliveries(id,payroll_run_id,payslip_id,employee_id,recipient_email,status,attempt_count,requested_by)
        VALUES($1,$2,$3,$4,$5,'Sending',1,$6) ON CONFLICT(id) DO UPDATE SET status='Sending',attempt_count=payslip_deliveries.attempt_count+1,last_error=NULL,updated_at=now(),requested_by=$6`,
      [deliveryId, req.params.runId, record.id, payslip.employeeId, recipient, req.identity.uid]);
      try {
        const info = await transport.sendMail({
          from: process.env.SMTP_FROM, to: recipient,
          subject: `Payslip - ${run.title}`,
          text: `Dear ${employee.fullName}, your net salary for ${run.periodMonth}/${run.periodYear} is PKR ${money(payslip.netSalary)}. This message contains confidential payroll information.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:640px"><h2>${escapeHtml(run.title)}</h2><p>Dear ${escapeHtml(employee.fullName)},</p><p>Your approved payslip is summarized below.</p><table cellpadding="8" style="border-collapse:collapse;width:100%"><tr><td>Employee code</td><td><b>${escapeHtml(payslip.employeeCode)}</b></td></tr><tr><td>Gross salary</td><td>PKR ${money(payslip.grossSalary)}</td></tr><tr><td>Total deductions</td><td>PKR ${money(payslip.totalDeductions)}</td></tr><tr><td>Net salary</td><td><b>PKR ${money(payslip.netSalary)}</b></td></tr></table><p style="color:#64748b;font-size:12px">Confidential payroll communication. Contact HR if any information is incorrect.</p></div>`,
        });
        await pool.query(`UPDATE payslip_deliveries SET status='Sent',message_id=$2,sent_at=now(),updated_at=now() WHERE id=$1`, [deliveryId, info.messageId || null]);
        sent += 1;
      } catch (error) {
        const message = String(error?.message || 'Mail delivery failed').slice(0, 500);
        await pool.query(`UPDATE payslip_deliveries SET status='Failed',last_error=$2,updated_at=now() WHERE id=$1`, [deliveryId, message]);
        failed.push({ employeeId: payslip.employeeId, error: message });
      }
    }
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip)
      VALUES($1,$2,'payslip_email_batch','payrollRuns',$3,$4::jsonb,$5,$6)`, [req.identity.uid, req.identity.roleId, req.params.runId, JSON.stringify({ sent, skipped, failedCount: failed.length }), req.correlationId, req.ip]);
    res.json({ sent, skipped, failed });
  } catch (error) { next(error); }
});

module.exports = router;
