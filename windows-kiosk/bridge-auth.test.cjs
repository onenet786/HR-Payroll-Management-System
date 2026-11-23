'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { newBridgeSecret, clientHandshake, expectedProof, verifyBridgeProof, parseHttpResponseHead } = require('./bridge-auth.cjs');

test('the client proof and the bridge proof differ and depend on the secret and the nonce', () => {
  const secret = newBridgeSecret();
  assert.match(secret, /^[0-9a-f]{64}$/);
  const { nonce, headers } = clientHandshake(secret);
  assert.ok(nonce.length >= 16);
  assert.equal(headers['X-Bridge-Nonce'], nonce);
  // Same construction as Program.cs: HMAC-SHA256 over UTF-8 "kiosk-client:<nonce>" keyed with the secret's UTF-8 bytes.
  assert.equal(headers['X-Bridge-Auth'], crypto.createHmac('sha256', secret).update(`kiosk-client:${nonce}`).digest('hex'));
  assert.notEqual(headers['X-Bridge-Auth'], expectedProof(secret, nonce), 'a replayed client header is not a bridge proof');
  assert.equal(verifyBridgeProof(secret, nonce, expectedProof(secret, nonce)), true);
  assert.equal(verifyBridgeProof(secret, nonce, expectedProof(secret, nonce).toUpperCase()), true);
  assert.equal(verifyBridgeProof(secret, nonce, expectedProof(newBridgeSecret(), nonce)), false, 'other secret');
  assert.equal(verifyBridgeProof(secret, nonce, expectedProof(secret, `${nonce}x`)), false, 'other nonce');
  assert.equal(verifyBridgeProof(secret, nonce, ''), false, 'an old bridge sends no proof');
  assert.equal(verifyBridgeProof(secret, nonce, undefined), false);
});

test('response heads are parsed for the status and the proof header', () => {
  const head = parseHttpResponseHead('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nX-Bridge-Proof: abc\r\nSec-WebSocket-Accept: x=\r\n\r\n');
  assert.equal(head.status, 101);
  assert.equal(head.headers['x-bridge-proof'], 'abc');
  assert.equal(parseHttpResponseHead('HTTP/1.1 403 Forbidden\r\n\r\n').status, 403);
  assert.equal(parseHttpResponseHead('garbage').status, 0);
});
