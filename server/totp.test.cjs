const assert = require('node:assert/strict');
const test = require('node:test');

test('TOTP accepts current window only and encryption round-trips', () => {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const { verifyTotp, encryptSecret, decryptSecret } = require('./totp.cjs');
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const knownTime = 59_000;
  assert.equal(verifyTotp(secret, '287082', knownTime), true);
  assert.equal(verifyTotp(secret, '287083', knownTime), false);
  assert.equal(decryptSecret(encryptSecret(secret)), secret);
});
