const test = require('node:test');
const assert = require('node:assert/strict');
const edition = require('./edition.cjs');

test('the vendor console uses the server own password; the old date password no longer works', () => {
  const saved = { ...process.env };
  try {
    delete process.env.VENDOR_CONSOLE_PASSWORD;
    assert.equal(edition.vendorConsoleEnabled(), false, 'no password configured: console off');
    assert.equal(edition.vendorCredentialsValid('onenet', 'OneNet19Oct2026'), false, 'date password refused');
    process.env.VENDOR_CONSOLE_PASSWORD = 'short';
    assert.equal(edition.vendorConsoleEnabled(), false, 'a weak password keeps the console off');
    process.env.VENDOR_CONSOLE_PASSWORD = 'k8Q2-vN4p-Zr7s-Lm3x';
    assert.equal(edition.vendorConsoleEnabled(), true);
    assert.equal(edition.vendorCredentialsValid('onenet', 'k8Q2-vN4p-Zr7s-Lm3x'), true);
    assert.equal(edition.vendorCredentialsValid('OneNet', 'k8Q2-vN4p-Zr7s-Lm3x'), true, 'login name is case-insensitive');
    assert.equal(edition.vendorCredentialsValid('onenet', 'k8Q2-vN4p-Zr7s-Lm3X'), false, 'password is case-sensitive');
    assert.equal(edition.vendorCredentialsValid('admin', 'k8Q2-vN4p-Zr7s-Lm3x'), false);
    assert.equal(edition.vendorCredentialsValid('onenet', ''), false);
    process.env.VENDOR_CONSOLE_DISABLED = 'true';
    assert.equal(edition.vendorCredentialsValid('onenet', 'k8Q2-vN4p-Zr7s-Lm3x'), false, 'can still be switched off');
  } finally {
    for (const key of ['VENDOR_CONSOLE_PASSWORD', 'VENDOR_CONSOLE_DISABLED']) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});

test('vendor tokens expire', () => {
  const now = Date.now();
  const session = edition.issueVendorToken(now);
  assert.equal(edition.vendorTokenValid(session.token, now), true);
  assert.equal(edition.vendorTokenValid(session.token, now + 31 * 60_000), false);
  assert.equal(edition.vendorTokenValid('nope', now), false);
});

test('any stored value normalizes to a complete edition; unknown input is the full edition', () => {
  assert.deepEqual(edition.normalizeEdition(null).features, edition.EDITION_PRESETS.full);
  assert.equal(edition.normalizeEdition({ id: 'enterprise' }).id, 'full');
  const lite = edition.normalizeEdition({ id: 'lite', features: { loans: false, incomeTax: 'yes', bogus: true }, note: '  shop  ' });
  assert.equal(lite.id, 'lite');
  assert.equal(lite.features.loans, false, 'boolean overrides apply');
  assert.equal(lite.features.incomeTax, false, 'non-boolean overrides are ignored');
  assert.equal('bogus' in lite.features, false);
  assert.equal(lite.note, 'shop');
  for (const key of edition.EDITION_FEATURE_KEYS) assert.equal(typeof lite.features[key], 'boolean');
});
