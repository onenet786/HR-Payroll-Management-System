// Database health and optimisation API against the PostgreSQL test database.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  test('integration database not configured', { skip: 'Set TEST_DATABASE_URL to a database whose name contains "test".' }, () => {});
  return;
}
process.env.DATABASE_URL = url;

const crypto = require('node:crypto');
const express = require('express');
const { pool } = require('./db.cjs');
const { router } = require('./db-maintenance.cjs');

let server; let base;
const identities = {
  admin: { uid: 'dbm-admin', roleId: 'role-admin', permissions: new Set() },
  clerk: { uid: 'dbm-clerk', roleId: 'role-hr', permissions: new Set(['manage_employees']) },
};
const call = async (path, who = 'admin', init = {}) => {
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'x-who': who, 'content-type': 'application/json', ...(init.headers || {}) } });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.identity = identities[req.get('x-who')]; req.correlationId = crypto.randomUUID(); next(); });
  app.use(router);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });

test('health shows size, largest tables and memory settings; only administrators', async () => {
  const health = await call('/');
  assert.equal(health.status, 200);
  assert.ok(health.body.bytes > 0);
  assert.ok(health.body.tables.length > 0 && health.body.tables[0].name);
  assert.ok(health.body.settings.shared_buffers);
  assert.equal((await call('/', 'clerk')).status, 403);
});

test('quick optimisation runs as a background job and is recorded', async () => {
  const started = await call('/optimize', 'admin', { method: 'POST', body: JSON.stringify({ mode: 'quick' }) });
  assert.equal(started.status, 202);
  let job;
  for (let i = 0; i < 120; i += 1) {
    job = (await call('/')).body.job;
    if (job.state !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(job.state, 'done', job.error || '');
  assert.ok(job.sizeAfter > 0);
  const history = (await call('/')).body.history;
  assert.equal(history[0].mode, 'quick');
  const deepWithoutBackup = await call('/optimize', 'admin', { method: 'POST', body: JSON.stringify({ mode: 'deep' }) });
  if (!process.env.BACKUP_ENCRYPTION_KEY) assert.equal(deepWithoutBackup.status, 409, 'deep needs a backup (or an explicit confirmation)');
});
