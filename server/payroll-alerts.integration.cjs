// Integration test for SMS / WhatsApp salary alerts against PostgreSQL and a mock provider.
// Run with the other integration suites: TEST_DATABASE_URL=... npm run test:integration
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  test('integration database not configured', { skip: 'Set TEST_DATABASE_URL to a database whose name contains "test".' }, () => {});
  return;
}
process.env.DATABASE_URL = url;
const express = require('express');
const { pool } = require('./db.cjs');

const received = [];
let failNext = false;
let provider;
let app;
let base;

async function post(path, body, uid = 'u-payroll') {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': uid }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test.before(async () => {
  const mock = express();
  mock.use(express.urlencoded({ extended: false }), express.json());
  mock.post('/2010-04-01/Accounts/:sid/Messages.json', (req, res) => {
    received.push({ provider: 'twilio', auth: req.get('authorization'), ...req.body });
    if (failNext) { failNext = false; return res.status(400).json({ message: 'Invalid To number' }); }
    res.status(201).json({ sid: `SM${received.length}` });
  });
  mock.post('/:phoneId/messages', (req, res) => { received.push({ provider: 'whatsapp-cloud', phoneId: req.params.phoneId, auth: req.get('authorization'), ...req.body }); res.json({ messages: [{ id: `wamid.${received.length}` }] }); });
  await new Promise(resolve => { provider = mock.listen(0, '127.0.0.1', resolve); });
  const providerBase = `http://127.0.0.1:${provider.address().port}`;
  Object.assign(process.env, {
    TWILIO_API_BASE: providerBase, TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret', TWILIO_SMS_FROM: '+15550001111',
    WHATSAPP_API_BASE: providerBase, WHATSAPP_CLOUD_TOKEN: 'wa-token', WHATSAPP_PHONE_NUMBER_ID: '998877', WHATSAPP_TEMPLATE_NAME: 'salary_processed',
  });

  for (const table of ['payroll_runs', 'payroll_payslips', 'employees', 'payslip_alert_deliveries']) await pool.query(`DELETE FROM ${table}`);
  const run = { id: 'run-alert', periodMonth: 10, periodYear: 2026, status: 'Disbursed' };
  await pool.query(`INSERT INTO payroll_runs(id, status, data) VALUES('run-alert','Disbursed',$1::jsonb)`, [JSON.stringify(run)]);
  const people = [['e-a', 'Ahmed Raza', '0300-1234567'], ['e-b', 'Sana Tariq', '+92 321 7654321'], ['e-c', 'Bilal Khan', '042-35761234']];
  for (const [id, fullName, contactNumber] of people) {
    await pool.query(`INSERT INTO employees(id, data) VALUES($1,$2::jsonb)`, [id, JSON.stringify({ id, fullName, contactNumber, cnic: '35202-1234567-1', iban: 'PK36SCBL0000001123456702' })]);
    await pool.query(`INSERT INTO payroll_payslips(id, payroll_run_id, employee_id, net_salary, data) VALUES($1,'run-alert',$2,90000,$3::jsonb)`,
      [`run-alert-${id}`, id, JSON.stringify({ id: `run-alert-${id}`, payrollRunId: 'run-alert', employeeId: id, netSalary: 90000 })]);
  }
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const uid = req.get('x-test-user');
    req.identity = { uid, roleId: uid === 'u-payroll' ? 'role-payroll' : 'role-employee', permissions: new Set(uid === 'u-payroll' ? ['manage_payroll'] : []) };
    req.correlationId = crypto.randomUUID();
    next();
  });
  app.use(require('./payroll-delivery.cjs'));
  app.use((error, _req, res, _next) => { console.error('[alerts] server error:', error.message); res.status(500).json({ error: error.message }); });
  await new Promise(resolve => { app.server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${app.server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => app.server.close(resolve));
  await new Promise(resolve => provider.close(resolve));
  await pool.end();
});

test('SMS alerts go to valid Pakistani mobiles only, carry no financial data, and are idempotent', async () => {
  assert.equal((await post('/run-alert/alerts', { channel: 'sms' }, 'u-employee')).status, 403);
  failNext = true;
  const first = await post('/run-alert/alerts', { channel: 'sms' });
  assert.equal(first.status, 200);
  assert.equal(first.body.sent, 1);
  assert.equal(first.body.failed.length, 2, 'provider rejection plus the landline number');
  assert.ok(first.body.failed.some(item => /Invalid To number/.test(item.error)));
  assert.ok(first.body.failed.some(item => item.employeeId === 'e-c' && /mobile number/.test(item.error)));
  const sms = received.filter(item => item.provider === 'twilio');
  assert.deepEqual(sms.map(item => item.To).sort(), ['+923001234567', '+923217654321']);
  assert.equal(sms[0].auth, `Basic ${Buffer.from('AC123:secret').toString('base64')}`);
  for (const message of sms) assert.doesNotMatch(message.Body, /90000|90,000|35202|PK36/);
  assert.match(sms[0].Body, /10\/2026/);

  const retry = await post('/run-alert/alerts', { channel: 'sms' });
  assert.equal(retry.body.skipped, 1, 'already-delivered alert is not re-sent');
  assert.equal(retry.body.sent, 1, 'previously failed alert is retried');
  const attempts = await pool.query(`SELECT employee_id, status, attempt_count FROM payslip_alert_deliveries WHERE channel='sms' ORDER BY employee_id`);
  assert.deepEqual(attempts.rows.map(row => [row.employee_id, row.status]), [['e-a', 'Sent'], ['e-b', 'Sent']]);
});

test('WhatsApp alerts use the approved Cloud API template with name and period parameters', async () => {
  const result = await post('/run-alert/alerts', { channel: 'whatsapp' });
  assert.equal(result.body.sent, 2);
  const messages = received.filter(item => item.provider === 'whatsapp-cloud');
  assert.equal(messages[0].phoneId, '998877');
  assert.equal(messages[0].auth, 'Bearer wa-token');
  assert.equal(messages[0].template.name, 'salary_processed');
  assert.deepEqual(messages.map(item => item.template.components[0].parameters.map(parameter => parameter.text)).sort(), [['Ahmed', '10/2026'], ['Sana', '10/2026']]);
});

test('alerts require a disbursed run and a configured channel', async () => {
  await pool.query(`UPDATE payroll_runs SET data = jsonb_set(data, '{status}', '"Approved"') WHERE id='run-alert'`);
  assert.equal((await post('/run-alert/alerts', { channel: 'sms' })).status, 409);
  const saved = process.env.TWILIO_SMS_FROM;
  delete process.env.TWILIO_SMS_FROM;
  assert.equal((await post('/run-alert/alerts', { channel: 'sms' })).status, 503);
  process.env.TWILIO_SMS_FROM = saved;
});

test('domain audit events (document vault, payslip batches, MFA recovery) are accepted by the audit log', async () => {
  for (const action of ['employee_document_uploaded', 'payslip_email_batch', 'payslip_alert_batch', 'mfa_recovery_requested']) {
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,action,collection_name,document_id) VALUES('test',$1,'audit','check')`, [action]);
  }
  await assert.rejects(pool.query(`INSERT INTO hr_audit_log(actor_uid,action,collection_name,document_id) VALUES('test','DROP TABLE','audit','check')`), /hr_audit_log_action_check/);
});
