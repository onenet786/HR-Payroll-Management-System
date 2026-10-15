const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');

test('session token hashing is deterministic without storing bearer secrets', () => {
  const { tokenHash } = require('./sessions.cjs');
  const token = crypto.randomBytes(32).toString('base64url');
  assert.equal(tokenHash(token), tokenHash(token));
  assert.notEqual(tokenHash(token), token);
  assert.match(tokenHash(token), /^[a-f0-9]{64}$/);
});
