// End-to-end test for "don't ask for a code on this device": runs the real server.cjs against PostgreSQL.
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
const { issueTrustedDevice, isTrustedDevice, revokeTrustedDevices } = require('./trusted-devices.cjs');

const USER_AGENT = 'HRApp/1.1 (Android 14; Infinix X663)';
const port = 18000 + Math.floor(Math.random() * 1000);
let server;
const fakeRequest = (ua = USER_AGENT) => ({ get: name => (name.toLowerCase() === 'user-agent' ? ua : undefined), ip: '127.0.0.1' });
const login = async (body, ua = USER_AGENT) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const userRecord = async passwordHash => ({ id: 'u-mfa', email: 'mfa@test.local', username: 'mfa', roleId: 'role-mfa', status: 'Active', passwordHash, mfaEnabled: true, mfaMethod: 'email', mfaEnrolledAt: '2026-10-01T00:00:00Z' });

test.before(async () => {
  await pool.query(`DELETE FROM mfa_trusted_devices`);
  await pool.query(`DELETE FROM users WHERE id='u-mfa'`);
  await pool.query(`DELETE FROM roles WHERE id='role-mfa'`);
  await pool.query(`INSERT INTO roles(id, data) VALUES('role-mfa', '{"id":"role-mfa","permissions":["view_dashboard"]}'::jsonb)`);
  const user = await userRecord(await bcrypt.hash('Correct-Horse-1', 10));
  await pool.query(`INSERT INTO users(id, email, username, role_id, status, data) VALUES('u-mfa','mfa@test.local','mfa','role-mfa','Active',$1::jsonb)`, [JSON.stringify(user)]);
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.cjs')], {
    env: { ...process.env, DATABASE_URL: url, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test', MFA_ENFORCE_PRIVILEGED: 'false' }, stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('server.cjs did not start');
});

test.after(async () => {
  server?.kill();
  await pool.end();
});

test('a trusted device signs in with the password alone; others still need the code', async () => {
  const user = (await pool.query(`SELECT data FROM users WHERE id='u-mfa'`)).rows[0].data;
  assert.equal((await login({ email: 'mfa@test.local', password: 'Correct-Horse-1' })).body.mfaRequired, true, 'no token: code required');
  const token = await issueTrustedDevice('u-mfa', user, fakeRequest());
  const trusted = await login({ email: 'mfa@test.local', password: 'Correct-Horse-1', rememberMe: true, trustedDeviceToken: token });
  assert.equal(trusted.status, 200);
  assert.ok(trusted.body.token, 'session issued without a code');
  assert.equal(trusted.body.trustedDevice, true);
  assert.equal(trusted.body.user.passwordHash, undefined, 'no secrets returned');
  assert.equal((await login({ email: 'mfa@test.local', password: 'wrong', trustedDeviceToken: token })).status, 401, 'password is still required');
  assert.equal((await login({ email: 'mfa@test.local', password: 'Correct-Horse-1', trustedDeviceToken: token }, 'OtherBrowser/1.0')).body.mfaRequired, true, 'token copied to another device is useless');
  assert.equal((await login({ email: 'mfa@test.local', password: 'Correct-Horse-1', trustedDeviceToken: 'x'.repeat(43) })).body.mfaRequired, true, 'forged token');
});

test('changing the password, revoking or expiry ends the trust', async () => {
  const user = (await pool.query(`SELECT data FROM users WHERE id='u-mfa'`)).rows[0].data;
  const token = await issueTrustedDevice('u-mfa', user, fakeRequest());
  assert.equal(await isTrustedDevice(token, 'u-mfa', user, fakeRequest()), true);
  assert.equal(await isTrustedDevice(token, 'someone-else', user, fakeRequest()), false, 'bound to the user');
  const newPassword = { ...user, passwordHash: await bcrypt.hash('New-Password-2', 10) };
  assert.equal(await isTrustedDevice(token, 'u-mfa', newPassword, fakeRequest()), false, 'password change invalidates trust');
  assert.equal(await isTrustedDevice(token, 'u-mfa', { ...user, mfaResetAt: '2026-10-17T00:00:00Z', mfaEnabled: false }, fakeRequest()), false, 'MFA reset invalidates trust');
  assert.ok(await revokeTrustedDevices('u-mfa') >= 1);
  assert.equal(await isTrustedDevice(token, 'u-mfa', user, fakeRequest()), false, 'revoked');
  const expiring = await issueTrustedDevice('u-mfa', user, fakeRequest());
  const { createHash } = require('node:crypto');
  await pool.query(`UPDATE mfa_trusted_devices SET expires_at=now() - interval '1 minute' WHERE token_hash=$1`, [createHash('sha256').update(expiring).digest('hex')]);
  assert.equal(await isTrustedDevice(expiring, 'u-mfa', user, fakeRequest()), false, 'expired');
});
