// End-to-end: first-time setup can't be replayed, passwords are hashed, and login secrets never leave the server.
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

const port = 20000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${port}`;
const UA = 'UserSecretsTest/1.0';
let server;
const call = async (method, route, body, token) => {
  const response = await fetch(`${base}${route}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json', 'user-agent': UA, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const login = async (email, password) => (await call('POST', '/api/auth/login', { email, password })).body.token;
const stored = async id => (await pool.query(`SELECT data FROM users WHERE id=$1`, [id])).rows[0]?.data;

test.before(async () => {
  await pool.query(`DELETE FROM auth_sessions`);
  await pool.query(`DELETE FROM users WHERE id IN ('u-sec-admin','u-sec-new','u-sec-legacy','u-sec-mfa','usr-admin')`);
  await pool.query(`INSERT INTO roles(id, name, status, data) VALUES('role-admin','Super Admin','Active','{"id":"role-admin","permissions":[]}'::jsonb) ON CONFLICT (id) DO NOTHING`);
  const admin = { id: 'u-sec-admin', email: 'sec.admin@test.local', username: 'sec.admin', roleId: 'role-admin', status: 'Active', passwordHash: await bcrypt.hash('Admin-Password-2026', 10) };
  await pool.query(`INSERT INTO users(id, email, username, role_id, status, data) VALUES($1,$2,$3,'role-admin','Active',$4::jsonb)`, [admin.id, admin.email, admin.username, JSON.stringify(admin)]);
  const mfaUser = { id: 'u-sec-mfa', email: 'mfa.user@test.local', username: 'mfa.user', roleId: 'role-admin', status: 'Active', passwordHash: await bcrypt.hash('Mfa-User-Password-1', 10), mfaEnabled: true, mfaMethod: 'email', mfaSecretCipher: 'cipher-should-never-leak' };
  await pool.query(`INSERT INTO users(id, email, username, role_id, status, data) VALUES($1,$2,$3,'role-admin','Active',$4::jsonb)`, [mfaUser.id, mfaUser.email, mfaUser.username, JSON.stringify(mfaUser)]);
  const legacy = { id: 'u-sec-legacy', email: 'legacy@test.local', username: 'legacy', roleId: 'role-admin', status: 'Active', password: 'Legacy-Plain-2026' };
  await pool.query(`INSERT INTO users(id, email, username, role_id, status, data) VALUES($1,$2,$3,'role-admin','Active',$4::jsonb)`, [legacy.id, legacy.email, legacy.username, JSON.stringify(legacy)]);
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.cjs')], {
    env: { ...process.env, DATABASE_URL: url, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', MFA_ENFORCE_PRIVILEGED: 'false' }, stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
});

test.after(async () => {
  server?.kill();
  await pool.query(`DELETE FROM users WHERE id IN ('u-sec-admin','u-sec-new','u-sec-legacy','u-sec-mfa','usr-admin')`);
  await pool.end();
});

test('first-time setup cannot be replayed to take over an existing system', async () => {
  const attack = await call('POST', '/api/auth/setup', { companyName: 'Evil', adminEmail: 'attacker@evil.test', adminPassword: 'Attacker-Password-1' });
  assert.equal(attack.status, 409);
  assert.equal(attack.body.token, undefined, 'no session handed out');
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE id='usr-admin' OR LOWER(email)='attacker@evil.test'`)).rowCount, 0);
});

test('legacy plain-text passwords are hashed at start-up and still sign in', async () => {
  const data = await stored('u-sec-legacy');
  assert.equal(data.password, undefined, 'plain text removed');
  assert.ok(await bcrypt.compare('Legacy-Plain-2026', data.passwordHash));
  assert.ok(await login('legacy@test.local', 'Legacy-Plain-2026'));
});

test('new users are stored with a hash and secrets are never returned', async () => {
  const token = await login('sec.admin@test.local', 'Admin-Password-2026');
  assert.ok(token);
  const created = await call('PUT', '/api/documents/users/u-sec-new', { id: 'u-sec-new', email: 'new@test.local', username: 'new.user', roleId: 'role-admin', status: 'Active', password: 'New-User-Password-1', mfaEnabled: true, mfaSecretCipher: 'forged' }, token);
  assert.equal(created.status, 200);
  const data = await stored('u-sec-new');
  assert.equal(data.password, undefined);
  assert.equal(data.mfaSecretCipher, undefined, 'browser cannot plant MFA secrets');
  assert.equal(data.mfaEnabled, undefined, 'browser cannot switch MFA on or off');
  assert.ok(await bcrypt.compare('New-User-Password-1', data.passwordHash));
  assert.equal((await call('PUT', '/api/documents/users/u-sec-x', { id: 'u-sec-x', email: 'x@test.local', username: 'x', roleId: 'role-admin', status: 'Active', password: 'short' }, token)).status, 400);

  const list = await call('GET', '/api/documents/users', null, token);
  for (const row of list.body.documents) {
    assert.equal(row.data.passwordHash, undefined);
    assert.equal(row.data.password, undefined);
    assert.equal(row.data.mfaSecretCipher, undefined);
  }
  const single = await call('GET', '/api/documents/users/u-sec-mfa', null, token);
  assert.equal(single.body.data.passwordHash, undefined);
  assert.equal(single.body.data.mfaSecretCipher, undefined);
  assert.equal(single.body.data.mfaEnabled, true, 'non-secret MFA status still visible');
  const audit = await pool.query(`SELECT new_data FROM hr_audit_log WHERE collection_name='users' AND document_id='u-sec-new' ORDER BY created_at DESC LIMIT 1`);
  assert.equal(audit.rows[0].new_data.passwordHash, undefined, 'audit log holds no hash');
});

test('editing a user keeps the password and MFA; resetting the password signs them out', async () => {
  const adminToken = await login('sec.admin@test.local', 'Admin-Password-2026');
  const userToken = await login('new@test.local', 'New-User-Password-1');
  assert.ok(userToken);
  const current = (await call('GET', '/api/documents/users/u-sec-mfa', null, adminToken)).body.data;
  assert.equal((await call('PUT', '/api/documents/users/u-sec-mfa', { ...current, username: 'mfa.user2', mfaEnabled: false }, adminToken)).status, 200);
  const admin = await stored('u-sec-mfa');
  assert.equal(admin.username, 'mfa.user2');
  assert.equal(admin.mfaEnabled, true, 'MFA cannot be switched off by editing');
  assert.equal(admin.mfaSecretCipher, 'cipher-should-never-leak', 'secret kept');
  assert.ok(await bcrypt.compare('Mfa-User-Password-1', admin.passwordHash), 'password kept');

  const userRecord = (await call('GET', '/api/documents/users/u-sec-new', null, adminToken)).body.data;
  assert.equal((await call('PUT', '/api/documents/users/u-sec-new', { ...userRecord, password: 'Reset-Password-2026' }, adminToken)).status, 200);
  assert.equal((await call('GET', '/api/auth/session', null, userToken)).status, 401, 'old session ended');
  assert.equal(await login('new@test.local', 'New-User-Password-1'), undefined, 'old password rejected');
  assert.ok(await login('new@test.local', 'Reset-Password-2026'), 'new password works');
});
