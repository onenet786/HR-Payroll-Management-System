// Integration test for the employee document vault and payslip email delivery against PostgreSQL,
// a temporary storage folder and an in-process SMTP mock.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  test('integration database not configured', { skip: 'Set TEST_DATABASE_URL to a database whose name contains "test".' }, () => {});
  return;
}
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-vault-test-'));
process.env.DATABASE_URL = url;
process.env.DOCUMENT_STORAGE_PATH = storage;
const express = require('express');
const { pool } = require('./db.cjs');

const mails = [];
let smtp;
let app;
let base;

// Minimal SMTP responder: enough of RFC 5321 for nodemailer (EHLO, AUTH PLAIN, MAIL, RCPT, DATA, QUIT).
function startSmtp() {
  return new Promise(resolve => {
    smtp = net.createServer(socket => {
      let data = false; let message = ''; let envelope = {};
      socket.write('220 mock ESMTP\r\n');
      socket.on('data', chunk => {
        for (const line of chunk.toString('utf8').split('\r\n')) {
          if (data) {
            if (line === '.') { data = false; mails.push({ ...envelope, message }); message = ''; socket.write('250 OK queued\r\n'); }
            else message += `${line}\n`;
            continue;
          }
          if (!line) continue;
          const command = line.slice(0, 4).toUpperCase();
          if (command === 'EHLO' || command === 'HELO') socket.write('250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
          else if (command === 'AUTH') socket.write('235 Authenticated\r\n');
          else if (command === 'MAIL') { envelope = { from: line }; socket.write('250 OK\r\n'); }
          else if (command === 'RCPT') { envelope.to = line.match(/<([^>]+)>/)?.[1]; socket.write('250 OK\r\n'); }
          else if (command === 'DATA') { data = true; socket.write('354 End with .\r\n'); }
          else if (command === 'QUIT') { socket.write('221 Bye\r\n'); socket.end(); }
          else socket.write('250 OK\r\n');
        }
      });
    });
    smtp.listen(0, '127.0.0.1', resolve);
  });
}

const identities = {
  'u-hr': { roleId: 'role-hr', employeeId: null, permissions: ['manage_employees', 'manage_payroll'] },
  'u-att': { roleId: 'role-att', employeeId: null, permissions: ['manage_attendance'] },
  'u-emp': { roleId: 'role-employee', employeeId: 'e-v1', permissions: [] },
  'u-other': { roleId: 'role-employee', employeeId: 'e-v2', permissions: [] },
};
const call = async (uid, method, route, body, headers = {}) => {
  const response = await fetch(`${base}${route}`, { method, headers: { 'x-test-user': uid, ...headers }, body });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, body: type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
};
const upload = (uid, employeeId, documentType, bytes, mime = 'application/pdf') =>
  call(uid, 'POST', '/api/employee-documents/upload', bytes, { 'content-type': mime, 'x-employee-id': employeeId, 'x-document-type': documentType, 'x-file-name': `${documentType}.pdf` });

test.before(async () => {
  await startSmtp();
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_SECURE: 'false', SMTP_REQUIRE_TLS: 'false', SMTP_USER: 'payroll', SMTP_PASS: 'secret', SMTP_FROM: 'Payroll <payroll@test.local>' });
  for (const table of ['employee_documents', 'payroll_runs', 'payroll_payslips', 'employees', 'payslip_deliveries']) await pool.query(`DELETE FROM ${table}`);
  await pool.query(`DELETE FROM hr_audit_log WHERE document_id='run-mail' OR collection_name='employeeDocuments'`);
  for (const [id, email] of [['e-v1', 'ahmed@test.local'], ['e-v2', '']]) {
    await pool.query(`INSERT INTO employees(id, data) VALUES($1,$2::jsonb)`, [id, JSON.stringify({ id, fullName: `Employee ${id}`, email })]);
    await pool.query(`INSERT INTO payroll_payslips(id, payroll_run_id, employee_id, net_salary, data) VALUES($1,'run-mail',$2,90000,$3::jsonb)`,
      [`run-mail-${id}`, id, JSON.stringify({ id: `run-mail-${id}`, payrollRunId: 'run-mail', employeeId: id, employeeCode: id.toUpperCase(), netSalary: 90000, grossSalary: 100000, totalDeductions: 10000, incomeTaxDeduction: 5000, bankName: 'HBL', iban: 'PK36SCBL0000001123456702' })]);
  }
  await pool.query(`INSERT INTO payroll_runs(id, status, data) VALUES('run-mail','Disbursed',$1::jsonb)`, [JSON.stringify({ id: 'run-mail', periodMonth: 10, periodYear: 2026, status: 'Disbursed' })]);
  app = express();
  app.use((req, _res, next) => {
    const uid = req.get('x-test-user');
    const identity = identities[uid];
    req.identity = { uid, ...identity, permissions: new Set(identity.permissions) };
    req.correlationId = crypto.randomUUID();
    next();
  });
  app.use('/api/employee-documents', require('./employee-documents.cjs'));
  app.use('/api/payroll-delivery', express.json(), require('./payroll-delivery.cjs'));
  app.use((error, _req, res, _next) => { console.error('[vault-email] server error:', error.message); res.status(500).json({ error: error.message }); });
  await new Promise(resolve => { app.server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${app.server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => app.server.close(resolve));
  await new Promise(resolve => smtp.close(resolve));
  await pool.end();
  fs.rmSync(storage, { recursive: true, force: true });
});

test('document vault stores, scopes access, audits, and deletes files', async () => {
  const pdf = Buffer.from('%PDF-1.4\n% test evidence\n');
  const own = await upload('u-emp', 'e-v1', 'attendance-evidence', pdf);
  assert.equal(own.status, 201, 'employees may attach their own evidence');
  assert.equal((await upload('u-emp', 'e-v2', 'cnic', pdf)).status, 403, 'not for someone else');
  assert.equal((await upload('u-hr', 'e-v1', 'payslip-scan', pdf)).status, 400, 'unknown document type');
  assert.equal((await upload('u-hr', 'e-v1', 'cnic', Buffer.from('MZ'), 'application/x-msdownload')).status, 400, 'executable content type');
  const cnic = await upload('u-hr', 'e-v1', 'cnic', pdf);
  assert.equal(cnic.status, 201);
  const stored = await pool.query(`SELECT stored_name FROM employee_documents WHERE id=$1`, [own.body.id]);
  assert.ok(fs.existsSync(path.join(storage, 'e-v1', stored.rows[0].stored_name)), 'file is written to private storage');

  const evidence = await call('u-att', 'GET', `/api/employee-documents/${own.body.id}/download`);
  assert.equal(evidence.status, 200, 'attendance reviewers can open correction evidence');
  assert.deepEqual(evidence.body, pdf);
  assert.equal((await call('u-att', 'GET', `/api/employee-documents/${cnic.body.id}/download`)).status, 404, 'but not the rest of the vault');
  assert.equal((await call('u-other', 'GET', `/api/employee-documents/${own.body.id}/download`)).status, 404, 'other employees cannot read it');
  assert.equal((await call('u-emp', 'DELETE', `/api/employee-documents/${own.body.id}`)).status, 403, 'only HR deletes');
  assert.equal((await call('u-hr', 'DELETE', `/api/employee-documents/${own.body.id}`)).status, 204);
  assert.equal(fs.existsSync(path.join(storage, 'e-v1', stored.rows[0].stored_name)), false);
  const audit = await pool.query(`SELECT action FROM hr_audit_log WHERE collection_name='employeeDocuments' ORDER BY id`);
  for (const action of ['employee_document_uploaded', 'employee_document_downloaded', 'employee_document_deleted']) assert.ok(audit.rows.some(row => row.action === action), action);
});

test('payslip email sends a PDF attachment without salary figures in the body, once per payslip', async () => {
  const first = await call('u-hr', 'POST', '/api/payroll-delivery/run-mail/send', '{}', { 'content-type': 'application/json' });
  assert.equal(first.status, 200);
  assert.equal(first.body.sent, 1);
  assert.equal(first.body.failed.length, 1, 'employee without an email address');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'ahmed@test.local');
  const [body] = mails[0].message.split(/Content-Type: application\/pdf/i);
  assert.doesNotMatch(body, /90,000|90000|PK36/);
  assert.match(mails[0].message, /Content-Type: application\/pdf/i);
  assert.match(mails[0].message, /filename="?payslip-2026-10-E-V1\.pdf/i);
  const second = await call('u-hr', 'POST', '/api/payroll-delivery/run-mail/send', '{}', { 'content-type': 'application/json' });
  assert.equal(second.body.skipped, 1);
  assert.equal(mails.length, 1, 'already-delivered payslip is not re-sent');
  const audit = await pool.query(`SELECT 1 FROM hr_audit_log WHERE action='payslip_email_batch' AND document_id='run-mail'`);
  assert.equal(audit.rowCount, 2);
});

test('statutory source documents are company records visible only to settings and payroll users', async () => {
  const pdf = Buffer.from('%PDF-1.4\n% FBR rate card\n');
  assert.equal((await upload('u-emp', 'statutory-sources', 'statutory-source', pdf)).status, 403);
  assert.equal((await upload('u-hr', 'statutory-sources', 'cnic', pdf)).status, 400, 'only statutory-source documents under the reserved owner');
  assert.equal((await upload('u-hr', 'e-v1', 'statutory-source', pdf)).status, 400, 'statutory sources are not filed against employees');
  const source = await upload('u-hr', 'statutory-sources', 'statutory-source', pdf);
  assert.equal(source.status, 201);
  assert.equal((await call('u-hr', 'GET', `/api/employee-documents/${source.body.id}/download`)).status, 200);
  assert.equal((await call('u-att', 'GET', `/api/employee-documents/${source.body.id}/download`)).status, 404);
  assert.equal((await call('u-emp', 'GET', '/api/employee-documents/employee/statutory-sources')).status, 403);
});
