const express = require('express');
const nodemailer = require('nodemailer');
const { pool } = require('./db.cjs');
const { configuredChannels, normalizePakistanMobile, payslipAlertText, sendAlert } = require('./notification-channels.cjs');

const router = express.Router();
const money = value => Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function payslipPdfBuffer(run, payslip, employee) {
  const clean = value => String(value ?? '').replace(/[\\()]/g, character => `\\${character}`).replace(/[^\x20-\x7E]/g, '?');
  const masked = value => value ? `****${String(value).replace(/\s/g, '').slice(-4)}` : '-';
  const optional = (label, amount) => Number(amount || 0) ? [`${label}: PKR ${money(amount)}`] : [];
  const lines = [
    'HR & Payroll - Confidential Payslip', `Period: ${run.periodMonth}/${run.periodYear}${run.runType && run.runType !== 'Regular' ? ` (${run.runType})` : ''}`,
    `Employee: ${employee.fullName} (${payslip.employeeCode})`, `Bank: ${payslip.bankName || '-'} ${masked(payslip.iban || payslip.bankAccountNumber)}`, '',
    'EARNINGS', ...optional('Basic earnings', payslip.basicEarnings), ...optional('House rent allowance', payslip.houseRentAllowance),
    ...optional('Conveyance allowance', payslip.conveyanceAllowance), ...optional('Medical allowance', payslip.medicalAllowance),
    ...optional('Other allowances', payslip.otherAllowances), ...optional('Overtime', payslip.overtimePay), ...optional('Bonus', payslip.bonusEarnings),
    ...optional('Commission', payslip.commissionEarnings), ...optional('Arrears', payslip.arrearsEarnings), ...optional('Absence deduction', -Number(payslip.unpaidLeaveDeduction || 0)),
    `Gross salary: PKR ${money(payslip.grossSalary)}`, ...optional('Reimbursements', payslip.reimbursements), '',
    'DEDUCTIONS', ...optional('FBR income tax', payslip.incomeTaxDeduction), ...optional('Tax adjustment', payslip.manualTaxAdjustment),
    ...optional('EOBI', payslip.eobiEmployeeDeduction), ...optional('Provident fund', payslip.providentFundDeduction),
    ...optional('Loan recovery', payslip.loanRepaymentDeduction), ...optional('Other deductions', payslip.otherAdjustmentsDeduction),
    `Total deductions: PKR ${money(payslip.totalDeductions)}`, '', `NET SALARY: PKR ${money(payslip.netSalary)}`, '',
    `Employer EOBI: PKR ${money(payslip.eobiEmployerContribution)} | Social security: PKR ${money(payslip.pessiEmployerContribution)} | Employer PF: PKR ${money(payslip.providentFundEmployerContribution)}`,
    `Tax year ${payslip.taxYear || '-'}: taxable income YTD PKR ${money(payslip.taxableIncomeYtd)}`,
    'Confidential payroll document. Contact HR if any information is incorrect.',
  ];
  const stream = ['BT', '/F1 11 Tf', '50 790 Td', ...lines.flatMap((line, index) => index === 0 ? [`(${clean(line)}) Tj`] : ['0 -16 Td', `(${clean(line)}) Tj`]), 'ET'].join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf, 'utf8')); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

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
    if (!run || run.status !== 'Disbursed') return res.status(409).json({ error: 'Payslips can be emailed only after payroll is marked Disbursed.' });
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
          subject: `Payslip available – ${run.periodMonth}/${run.periodYear}`,
          text: `Dear ${employee.fullName}, your approved payslip for ${run.periodMonth}/${run.periodYear} is available in the HR & Payroll portal. For your privacy, salary figures are not included in this email preview. Contact HR if you cannot access your record.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:640px"><h2>Payslip available</h2><p>Dear ${escapeHtml(employee.fullName)},</p><p>Your approved payslip for ${run.periodMonth}/${run.periodYear} is available in the HR &amp; Payroll employee portal.</p><p style="color:#64748b;font-size:12px">For your privacy, this notification does not include salary figures, CNIC, or bank details. Sign in to your employee account to review your complete paid-salary record. Contact HR if you cannot access it.</p></div>`,
          attachments: [{ filename: `payslip-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}-${payslip.employeeCode}.pdf`, content: payslipPdfBuffer(run, payslip, employee), contentType: 'application/pdf' }],
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

const canSendPayroll = identity => identity.permissions.has('manage_payroll') || identity.roleId === 'role-admin';

router.get('/channels', (req, res) => {
  if (!canSendPayroll(req.identity)) return res.status(403).json({ error: 'Payroll permission required.' });
  const channels = configuredChannels();
  res.json({ email: Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM), sms: Boolean(channels.sms), whatsapp: Boolean(channels.whatsapp) });
});

router.post('/:runId/alerts', async (req, res, next) => {
  try {
    if (!canSendPayroll(req.identity)) return res.status(403).json({ error: 'Payroll permission required.' });
    const channel = req.body?.channel;
    if (!['sms', 'whatsapp'].includes(channel)) return res.status(400).json({ error: 'Choose sms or whatsapp.' });
    if (!configuredChannels()[channel]) return res.status(503).json({ error: `${channel === 'sms' ? 'SMS' : 'WhatsApp'} is not configured. See .env.example for the provider settings.` });
    const runResult = await pool.query(`SELECT data FROM payroll_runs WHERE id=$1`, [req.params.runId]);
    const run = runResult.rows[0]?.data;
    if (!run || run.status !== 'Disbursed') return res.status(409).json({ error: 'Salary alerts can be sent only after payroll is marked Disbursed.' });
    const result = await pool.query(
      `SELECT p.id, p.data AS payslip, e.data AS employee FROM payroll_payslips p JOIN employees e ON e.id=p.employee_id
       WHERE p.payroll_run_id=$1 OR p.data->>'payrollRunId'=$1 ORDER BY p.id`, [req.params.runId],
    );
    let sent = 0; let skipped = 0; const failed = [];
    for (const record of result.rows) {
      const deliveryId = `${req.params.runId}-${record.id}-${channel}`.slice(0, 300);
      const previous = await pool.query(`SELECT status FROM payslip_alert_deliveries WHERE id=$1`, [deliveryId]);
      if (previous.rows[0]?.status === 'Sent') { skipped += 1; continue; }
      const recipient = normalizePakistanMobile(record.employee.contactNumber);
      if (!recipient) { failed.push({ employeeId: record.payslip.employeeId, error: 'Valid Pakistani mobile number (+923XXXXXXXXX) is missing.' }); continue; }
      await pool.query(`INSERT INTO payslip_alert_deliveries(id,payroll_run_id,payslip_id,employee_id,channel,recipient,status,requested_by)
        VALUES($1,$2,$3,$4,$5,$6,'Sending',$7) ON CONFLICT(id) DO UPDATE SET status='Sending',attempt_count=payslip_alert_deliveries.attempt_count+1,last_error=NULL,recipient=$6,requested_by=$7,updated_at=now()`,
      [deliveryId, req.params.runId, record.id, record.payslip.employeeId, channel, recipient, req.identity.uid]);
      try {
        const messageId = await sendAlert(channel, recipient, payslipAlertText(run, record.employee));
        await pool.query(`UPDATE payslip_alert_deliveries SET status='Sent',provider_message_id=$2,sent_at=now(),updated_at=now() WHERE id=$1`, [deliveryId, messageId ? String(messageId).slice(0, 200) : null]);
        sent += 1;
      } catch (error) {
        const message = String(error?.message || 'Delivery failed').slice(0, 500);
        await pool.query(`UPDATE payslip_alert_deliveries SET status='Failed',last_error=$2,updated_at=now() WHERE id=$1`, [deliveryId, message]);
        failed.push({ employeeId: record.payslip.employeeId, error: message });
      }
    }
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip)
      VALUES($1,$2,'payslip_alert_batch','payrollRuns',$3,$4::jsonb,$5,$6)`, [req.identity.uid, req.identity.roleId, req.params.runId, JSON.stringify({ channel, sent, skipped, failedCount: failed.length }), req.correlationId, req.ip]);
    res.json({ sent, skipped, failed });
  } catch (error) { next(error); }
});

module.exports = router;
