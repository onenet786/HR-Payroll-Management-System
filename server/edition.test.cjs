const test = require('node:test');
const assert = require('node:assert/strict');
const edition = require('./edition.cjs');

test('console password is OneNet + DDMonYYYY on Pakistan time', () => {
  const noon = Date.parse('2026-10-19T07:00:00Z'); // 12:00 in Karachi
  assert.equal(edition.vendorPasswordFor(noon), 'OneNet19Oct2026');
  assert.equal(edition.vendorPasswordFor(Date.parse('2026-10-19T20:30:00Z')), 'OneNet20Oct2026', 'after midnight in Karachi the day rolls over');
  assert.equal(edition.vendorPasswordFor(Date.parse('2026-01-05T07:00:00Z')), 'OneNet05Jan2026', 'day is zero padded');
});

test('vendor credentials accept only the login name with the current password (+/-1 day)', () => {
  const now = Date.parse('2026-10-19T07:00:00Z');
  assert.equal(edition.vendorCredentialsValid('onenet', 'OneNet19Oct2026', now), true);
  assert.equal(edition.vendorCredentialsValid('OneNet', 'OneNet19Oct2026', now), true, 'login name is case-insensitive');
  assert.equal(edition.vendorCredentialsValid('onenet', 'OneNet18Oct2026', now), true, 'yesterday still works');
  assert.equal(edition.vendorCredentialsValid('onenet', 'OneNet20Oct2026', now), true, 'tomorrow still works');
  assert.equal(edition.vendorCredentialsValid('onenet', 'OneNet17Oct2026', now), false);
  assert.equal(edition.vendorCredentialsValid('onenet', 'onenet19oct2026', now), false, 'password is case-sensitive');
  assert.equal(edition.vendorCredentialsValid('admin', 'OneNet19Oct2026', now), false);
  assert.equal(edition.vendorCredentialsValid('onenet', '', now), false);
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
