'use strict';
// Mutual check between the kiosk and the fingerprint bridge it starts (tools/uru4500-bridge/Program.cs).
//
// The kiosk starts URU4500Bridge.exe with a random per-session secret in URU4500_BRIDGE_SECRET. On every WebSocket
// handshake it sends a fresh nonce and HMAC-SHA256(secret, "kiosk-client:" + nonce); the bridge refuses clients
// without it and answers with HMAC-SHA256(secret, "bridge-server:" + nonce), which the kiosk checks before it sends
// a fingerprint gallery or trusts a match. A web page cannot set these headers, and a program squatting on the port
// cannot produce the proof. Pure functions, so they run under `node --test`.
const crypto = require('crypto');

const hmacHex = (secret, message) => crypto.createHmac('sha256', Buffer.from(String(secret), 'utf8')).update(message, 'utf8').digest('hex');

function newBridgeSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function clientHandshake(secret, nonce = crypto.randomBytes(18).toString('base64url')) {
  return { nonce, headers: { 'X-Bridge-Nonce': nonce, 'X-Bridge-Auth': hmacHex(secret, `kiosk-client:${nonce}`) } };
}

function expectedProof(secret, nonce) {
  return hmacHex(secret, `bridge-server:${nonce}`);
}

function verifyBridgeProof(secret, nonce, proof) {
  if (!secret || !nonce || typeof proof !== 'string' || !/^[0-9a-f]{64}$/i.test(proof)) return false;
  return crypto.timingSafeEqual(Buffer.from(proof.toLowerCase(), 'utf8'), Buffer.from(expectedProof(secret, nonce), 'utf8'));
}

// Header block of an HTTP response ("HTTP/1.1 101 ...\r\nName: value\r\n...") as { status, headers } (names lower-case).
function parseHttpResponseHead(text) {
  const lines = String(text || '').split('\r\n');
  const status = Number((/^HTTP\/1\.[01] (\d{3})/.exec(lines[0] || '') || [])[1]) || 0;
  const headers = {};
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status, headers };
}

module.exports = { newBridgeSecret, clientHandshake, expectedProof, verifyBridgeProof, parseHttpResponseHead };
