// Integration test for session lifetimes ("Remember me for 5 days") against PostgreSQL.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  test('integration database not configured', { skip: 'Set TEST_DATABASE_URL to a database whose name contains "test".' }, () => {});
  return;
}
process.env.DATABASE_URL = url;
delete process.env.SESSION_IDLE_MINUTES;
const { pool } = require('./db.cjs');
const { createSession } = require('./sessions.cjs');
const { authenticate } = require('./auth.cjs');

const request = (token, userAgent = 'HRApp/1.1 (Android)') => ({
  correlationId: 'test', ip: '127.0.0.1',
  get: name => ({ authorization: token ? `Bearer ${token}` : '', 'user-agent': userAgent })[name.toLowerCase()],
});

async function authenticateWith(token, userAgent) {
  let status = 200;
  let passed = false;
  const res = { status(code) { status = code; return this; }, json() { return this; } };
  await authenticate(request(token, userAgent), res, () => { passed = true; });
  return passed ? 200 : status;
}

const hoursLeft = async token => {
  const { tokenHash } = require('./sessions.cjs');
  const result = await pool.query(`SELECT EXTRACT(EPOCH FROM idle_expires_at - now()) / 3600 AS hours FROM auth_sessions WHERE token_hash=$1`, [tokenHash(token)]);
  return Number(result.rows[0].hours);
};

test.before(async () => {
  await pool.query(`DELETE FROM auth_sessions`);
  await pool.query(`DELETE FROM users WHERE id='u-session'`);
  await pool.query(`DELETE FROM roles WHERE id='role-session'`);
  await pool.query(`INSERT INTO roles(id, data) VALUES('role-session', '{"id":"role-session","permissions":["view_dashboard"]}'::jsonb)`);
  await pool.query(`INSERT INTO users(id, data) VALUES('u-session', '{"id":"u-session","roleId":"role-session","status":"Active"}'::jsonb)`);
});

test.after(async () => { await pool.end(); });

test('remember-me sessions keep their 5-day window after being used', async () => {
  const token = await createSession('u-session', request(), true);
  assert.ok(await hoursLeft(token) > 119, 'starts with 5 days');
  assert.equal(await authenticateWith(token), 200);
  assert.equal(await authenticateWith(token), 200);
  assert.ok(await hoursLeft(token) > 119, 'still ~5 days after requests (was cut to 30 minutes before the fix)');
});

test('ordinary sessions keep the 30-minute idle timeout', async () => {
  const token = await createSession('u-session', request(), false);
  assert.equal(await authenticateWith(token), 200);
  const hours = await hoursLeft(token);
  assert.ok(hours > 0.45 && hours <= 0.5, `about 30 minutes left, got ${hours.toFixed(2)} h`);
});

test('expired, revoked and other-device sessions are rejected', async () => {
  const expired = await createSession('u-session', request(), true);
  const { tokenHash } = require('./sessions.cjs');
  await pool.query(`UPDATE auth_sessions SET idle_expires_at=now() - interval '1 minute' WHERE token_hash=$1`, [tokenHash(expired)]);
  assert.equal(await authenticateWith(expired), 401);
  const revoked = await createSession('u-session', request(), true);
  await pool.query(`UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1`, [tokenHash(revoked)]);
  assert.equal(await authenticateWith(revoked), 401);
  const stolen = await createSession('u-session', request(), true);
  assert.equal(await authenticateWith(stolen, 'SomeOtherBrowser/1.0'), 401, 'a copied token does not work from another device');
});
