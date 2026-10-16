// End-to-end test for kiosk terminals: registration, device-key enforcement, least-privilege sync and punch rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  test('integration database not configured', { skip: 'Set TEST_DATABASE_URL to a database whose name contains "test".' }, () => {});
  return;
}
process.env.DATABASE_URL = url;
const bcrypt = require('bcryptjs');
const { pool } = require('./db.cjs');

const port = 19000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
let server;
const today = new Date().toISOString().slice(0, 10);
const call = async (method, route, body, headers = {}) => {
  const response = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const punch = (token, documentId, data) => call('POST', '/api/kiosk/punch', { collection: 'attendances', documentId, data }, { 'x-kiosk-token': token });

test.before(async () => {
  await pool.query(`DELETE FROM kiosk_devices`);
  await pool.query(`DELETE FROM attendances WHERE id LIKE 'att-kt-%'`);
  await pool.query(`DELETE FROM attendance_periods WHERE id=$1`, [`attendance-period-${today.slice(0, 7)}`]);
  await pool.query(`DELETE FROM users WHERE id IN ('u-kiosk','u-kiosk-hr')`);
  await pool.query(`DELETE FROM roles WHERE id IN ('role-kiosk','role-kt-hr')`);
  await pool.query(`DELETE FROM employees WHERE id IN ('e-kt-1','e-kt-2')`);
  await pool.query(`INSERT INTO roles(id, data) VALUES('role-kiosk', '{"id":"role-kiosk","permissions":["use_kiosk"]}'::jsonb), ('role-kt-hr', '{"id":"role-kt-hr","permissions":["manage_employees"]}'::jsonb)`);
  const hash = await bcrypt.hash('Kiosk-Pass-2026', 10);
  for (const [id, roleId] of [['u-kiosk', 'role-kiosk'], ['u-kiosk-hr', 'role-kt-hr']]) {
    await pool.query(`INSERT INTO users(id, email, username, role_id, status, data) VALUES($1,$2,$3,$4,'Active',$5::jsonb)`,
      [id, `${id}@test.local`, id, roleId, JSON.stringify({ id, email: `${id}@test.local`, username: id, roleId, status: 'Active', passwordHash: hash })]);
  }
  const employee = (id, status) => ({ id, employeeCode: `ONS-KT-${id}`, fullName: `Kiosk ${id}`, status, cnic: '35202-1234567-1', basicSalary: 250000, bankAccountNumber: 'PK00TEST', phone: '0300' });
  await pool.query(`INSERT INTO employees(id, data) VALUES('e-kt-1',$1::jsonb), ('e-kt-2',$2::jsonb)`, [JSON.stringify(employee('e-kt-1', 'Active')), JSON.stringify(employee('e-kt-2', 'Terminated'))]);
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.cjs')], {
    env: { ...process.env, DATABASE_URL: url, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', MFA_ENFORCE_PRIVILEGED: 'false' }, stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('server.cjs did not start');
});

test.after(async () => {
  server?.kill();
  await pool.query(`DELETE FROM attendance_periods WHERE id=$1`, [`attendance-period-${today.slice(0, 7)}`]);
  await pool.end();
});

test('without a device key nothing is readable or writable', async () => {
  for (const collection of ['users', 'employees', 'payslips', 'roles']) {
    assert.equal((await call('GET', `/api/kiosk/sync/${collection}`)).status, 401, collection);
  }
  assert.equal((await call('GET', '/api/kiosk/sync/employees', null, { 'x-kiosk-token': 'forged-token' })).status, 401);
  assert.equal((await punch('', 'att-kt-x', { employeeId: 'e-kt-1', date: today, method: 'RFID' })).status, 401);
});

test('only Kiosk Terminal accounts can register, with the right password', async () => {
  assert.equal((await call('POST', '/api/kiosk/register', { email: 'u-kiosk@test.local', password: 'wrong' })).status, 401);
  assert.equal((await call('POST', '/api/kiosk/register', { email: 'u-kiosk-hr@test.local', password: 'Kiosk-Pass-2026' })).status, 403, 'HR account without use_kiosk');
  const ok = await call('POST', '/api/kiosk/register', { email: 'U-Kiosk@test.local', password: 'Kiosk-Pass-2026', terminalName: 'Gate 1' });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.deviceToken?.length >= 40);
  const stored = (await pool.query(`SELECT token_hash FROM kiosk_devices WHERE id=$1`, [ok.body.deviceId])).rows[0];
  assert.notEqual(stored.token_hash, ok.body.deviceToken, 'only the hash is stored');
});

test('a registered kiosk syncs only allow-listed collections and fields', async () => {
  const { body } = await call('POST', '/api/kiosk/register', { email: 'u-kiosk', password: 'Kiosk-Pass-2026' });
  const auth = { 'x-kiosk-token': body.deviceToken };
  for (const collection of ['users', 'payslips', 'payrollRuns', 'roles', 'companies']) {
    assert.equal((await call('GET', `/api/kiosk/sync/${collection}`, null, auth)).status, 404, collection);
  }
  const employees = (await call('GET', '/api/kiosk/sync/employees', null, auth)).body.documents;
  const mine = employees.find(item => item.id === 'e-kt-1');
  assert.equal(mine.fullName, 'Kiosk e-kt-1');
  for (const field of ['cnic', 'basicSalary', 'bankAccountNumber', 'phone']) assert.equal(mine[field], undefined, `${field} withheld`);
  assert.equal(employees.some(item => item.id === 'e-kt-2'), false, 'terminated staff not sent');
});

test('punch rules: attendance only, active staff, date window, locked months, no self-approval', async () => {
  const token = (await call('POST', '/api/kiosk/register', { email: 'u-kiosk', password: 'Kiosk-Pass-2026' })).body.deviceToken;
  const base = { employeeId: 'e-kt-1', date: today, method: 'Biometric', punchIn: `${today}T09:00:00`, status: 'Present' };
  assert.equal((await call('POST', '/api/kiosk/punch', { collection: 'payslips', documentId: 'p1', data: base }, { 'x-kiosk-token': token })).status, 403);
  assert.equal((await punch(token, 'att-kt-1', { ...base, employeeId: 'e-kt-2' })).status, 403, 'terminated');
  assert.equal((await punch(token, 'att-kt-1', { ...base, date: '2020-01-01' })).status, 400, 'too old');
  assert.equal((await punch(token, 'att-kt-1', { ...base, method: 'Manual' })).status, 400, 'method');

  const first = await punch(token, 'att-kt-1', { ...base, regularizationRequested: true, regularizationApproved: true, reviewedBy: 'me' });
  assert.equal(first.status, 200);
  const saved = (await pool.query(`SELECT data FROM attendances WHERE id='att-kt-1'`)).rows[0].data;
  assert.equal(saved.regularizationApproved, undefined, 'kiosk cannot approve');
  assert.equal(saved.reviewedBy, undefined);
  assert.equal(saved.requestedById, 'u-kiosk');

  // HR approves; a later punch-out keeps HR's decision.
  await pool.query(`UPDATE attendances SET data = data || '{"regularizationApproved":true,"reviewedBy":"HR"}'::jsonb WHERE id='att-kt-1'`);
  assert.equal((await punch(token, 'att-kt-1', { ...base, punchOut: `${today}T17:00:00`, regularizationApproved: false })).status, 200);
  const out = (await pool.query(`SELECT data FROM attendances WHERE id='att-kt-1'`)).rows[0].data;
  assert.equal(out.punchOut, `${today}T17:00:00`);
  assert.equal(out.regularizationApproved, true);
  assert.equal(out.reviewedBy, 'HR');

  assert.equal((await punch(token, 'att-kt-1', { ...base, employeeId: 'e-kt-1', date: '2020-01-01' })).status, 400);
  await pool.query(`INSERT INTO employees(id, data) VALUES('e-kt-3', '{"id":"e-kt-3","status":"Active"}'::jsonb) ON CONFLICT (id) DO NOTHING`);
  assert.equal((await punch(token, 'att-kt-1', { ...base, employeeId: 'e-kt-3' })).status, 409, 'cannot take over another employee\'s record');
  await pool.query(`DELETE FROM employees WHERE id='e-kt-3'`);

  await pool.query(`INSERT INTO attendance_periods(id, status, data) VALUES($1,'Locked','{}'::jsonb)`, [`attendance-period-${today.slice(0, 7)}`]);
  assert.equal((await punch(token, 'att-kt-2', base)).status, 409, 'locked month');
  const audits = await pool.query(`SELECT count(*)::int AS n FROM hr_audit_log WHERE action='kiosk_punch' AND document_id='att-kt-1'`);
  assert.ok(audits.rows[0].n >= 2, 'punches are audited');
});

test('revoking a device or disabling the account cuts it off', async () => {
  const registered = (await call('POST', '/api/kiosk/register', { email: 'u-kiosk', password: 'Kiosk-Pass-2026' })).body;
  const auth = { 'x-kiosk-token': registered.deviceToken };
  assert.equal((await call('GET', '/api/kiosk/sync/branches', null, auth)).status, 200);
  await pool.query(`UPDATE kiosk_devices SET revoked_at=now() WHERE id=$1`, [registered.deviceId]);
  assert.equal((await call('GET', '/api/kiosk/sync/branches', null, auth)).status, 401, 'revoked');

  const second = (await call('POST', '/api/kiosk/register', { email: 'u-kiosk', password: 'Kiosk-Pass-2026' })).body;
  await pool.query(`UPDATE users SET data = data || '{"status":"Inactive"}'::jsonb WHERE id='u-kiosk'`);
  assert.equal((await call('GET', '/api/kiosk/sync/branches', null, { 'x-kiosk-token': second.deviceToken })).status, 403, 'account disabled');
  await pool.query(`UPDATE users SET data = data || '{"status":"Active"}'::jsonb WHERE id='u-kiosk'`);
});

test('administrators list and disconnect terminals; kiosk accounts cannot', async () => {
  const { createSession } = require('./sessions.cjs');
  const ua = 'KioskAdminTest/1.0';
  const fakeRequest = { ip: '127.0.0.1', get: name => (name.toLowerCase() === 'user-agent' ? ua : undefined) };
  await pool.query(`DELETE FROM users WHERE id='u-kt-admin'`);
  await pool.query(`INSERT INTO users(id, email, username, role_id, status, data) VALUES('u-kt-admin','u-kt-admin@test.local','u-kt-admin','role-admin','Active',$1::jsonb)`,
    [JSON.stringify({ id: 'u-kt-admin', email: 'u-kt-admin@test.local', username: 'u-kt-admin', roleId: 'role-admin', status: 'Active' })]);
  const admin = { authorization: `Bearer ${await createSession('u-kt-admin', fakeRequest)}`, 'user-agent': ua };
  const kioskUser = { authorization: `Bearer ${await createSession('u-kiosk', fakeRequest)}`, 'user-agent': ua };
  const registered = (await call('POST', '/api/kiosk/register', { email: 'u-kiosk', password: 'Kiosk-Pass-2026', terminalName: 'Admin test gate' })).body;

  assert.equal((await call('GET', '/api/kiosk-devices', null)).status, 401, 'signed-out');
  assert.equal((await call('GET', '/api/kiosk-devices', null, kioskUser)).status, 403, 'kiosk account');
  const listed = await call('GET', '/api/kiosk-devices', null, admin);
  assert.equal(listed.status, 200);
  const row = listed.body.devices.find(device => device.id === registered.deviceId);
  assert.equal(row.name, 'Admin test gate');
  assert.equal(row.token_hash, undefined, 'hash never listed');

  assert.equal((await call('POST', `/api/kiosk-devices/${registered.deviceId}/revoke`, {}, admin)).body.revoked, 1);
  assert.equal((await call('GET', '/api/kiosk/sync/branches', null, { 'x-kiosk-token': registered.deviceToken })).status, 401, 'disconnected');
  await pool.query(`DELETE FROM users WHERE id='u-kt-admin'`);
});
