// node --test server/installation.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLicence, licenceState, normalizeDomains, encodeSetupCode, encodeMobileCode, originOf } = require('./installation.cjs');
const { parseSetupCode } = require('../windows-kiosk/setup-code.cjs');

const at = ymd => Date.parse(`${ymd}T12:00:00+05:00`);

test('no licence row means an unlimited active installation', () => {
  const licence = normalizeLicence(null);
  assert.equal(licence.status, 'active');
  assert.equal(licence.expiresAt, null);
  assert.equal(licence.staffLimit, null);
  assert.deepEqual(licenceState(licence, at('2026-11-07')).state, 'active');
});

test('licence states: expiring, grace, auto-suspended, manual suspension', () => {
  const licence = normalizeLicence({ expiresAt: '2026-11-30', graceDays: 7 });
  assert.equal(licenceState(licence, at('2026-11-01')).state, 'active');
  const expiring = licenceState(licence, at('2026-11-20'));
  assert.equal(expiring.state, 'expiring'); assert.equal(expiring.daysLeft, 10);
  const grace = licenceState(licence, at('2026-12-03'));
  assert.equal(grace.state, 'grace'); assert.equal(grace.graceDaysLeft, 4); assert.equal(grace.blocked, false);
  assert.equal(licenceState(licence, at('2026-12-08')).blocked, true, 'grace over → suspended');
  assert.equal(licenceState(normalizeLicence({ expiresAt: '2026-11-30', autoSuspend: false }), at('2027-02-01')).state, 'grace', 'manual-only suspension never blocks by date');
  assert.equal(licenceState(normalizeLicence({ status: 'suspended' }), at('2026-11-01')).blocked, true);
});

test('licence input is sanitised', () => {
  const licence = normalizeLicence({ status: 'weird', expiresAt: '30/11/2026', staffLimit: '-5', graceDays: 500, message: 'x'.repeat(400) });
  assert.equal(licence.status, 'active');
  assert.equal(licence.expiresAt, null);
  assert.equal(licence.staffLimit, null);
  assert.equal(licence.graceDays, 90);
  assert.equal(licence.message.length, 300);
});

test('domains keep only valid, unique origins', () => {
  const domains = normalizeDomains({ platformUrl: 'https://acme.binishaqsoft.com/', publicUrl: 'https://HR.Acme.com/login', allowedOrigins: ['https://hr.acme.com', 'https://hr.acme.com/', 'javascript:alert(1)', 'not a url', 'http://localhost:3000'] });
  assert.equal(domains.platformUrl, 'https://acme.binishaqsoft.com');
  assert.equal(domains.publicUrl, 'https://hr.acme.com');
  assert.deepEqual(domains.allowedOrigins, ['https://hr.acme.com', 'http://localhost:3000']);
  assert.equal(originOf('ftp://x.com'), null);
});

test('a kiosk setup code made by the server is read by the kiosk', () => {
  const code = encodeSetupCode({ clientName: 'Acme Traders', urls: ['https://acme.binishaqsoft.com/', 'https://hr.acme.com'], token: 'abcdefghijklmnopqrstuvwx' });
  assert.match(code, /^HRK1\./);
  const parsed = parseSetupCode(` ${code.slice(0, 20)}\n${code.slice(20)} `);
  assert.equal(parsed.clientName, 'Acme Traders');
  assert.deepEqual(parsed.urls, ['https://acme.binishaqsoft.com', 'https://hr.acme.com']);
  assert.equal(parsed.token, 'abcdefghijklmnopqrstuvwx');
  assert.throws(() => encodeSetupCode({ clientName: 'x', urls: ['nope'], token: 't' }));
});

test('mobile connection code carries addresses only', () => {
  const code = encodeMobileCode({ clientName: 'Acme', urls: ['https://acme.binishaqsoft.com'] });
  const payload = JSON.parse(Buffer.from(code.slice(5), 'base64url').toString('utf8'));
  assert.deepEqual(payload, { v: 1, n: 'Acme', u: ['https://acme.binishaqsoft.com'] });
});
