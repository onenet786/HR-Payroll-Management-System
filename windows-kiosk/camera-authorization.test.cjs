'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeCameraAttempt, requireSecureEnrollment } = require('./camera-authorization.cjs');

function fixture(result = { ok: true, summary: {} }) {
  let calls = 0;
  return {
    challengeManager: { validateAndConsume() { calls += 1; return result; } },
    reasonAuthorizations: new Map(),
    calls: () => calls,
  };
}

test('missing code is allowed after a valid liveness challenge', () => {
  const f = fixture();
  const result = authorizeCameraAttempt({ payload: { livenessProof: { challengeId: 'x' } }, terminal: {}, terminalId: 't1', ...f });
  assert.equal(result.ok, true);
  assert.equal(result.code, '');
  assert.equal(f.calls(), 1);
});

test('IP camera attempt consumes challenge and is blocked', () => {
  const f = fixture();
  const result = authorizeCameraAttempt({ payload: { code: 'EMP-1', livenessProof: {} }, terminal: { ipCameraUrl: 'https://camera/still.jpg' }, terminalId: 't1', ...f });
  assert.equal(result.ok, false);
  assert.match(result.message, /IP camera/);
  assert.equal(f.calls(), 1);
});

test('missing or invalid challenge fails before authorization', () => {
  for (const proof of [undefined, { challengeId: 'invalid' }]) {
    const f = fixture({ ok: false, message: 'A privileged active liveness challenge is required.' });
    const result = authorizeCameraAttempt({ payload: { code: 'EMP-1', livenessProof: proof }, terminal: {}, terminalId: 't1', ...f });
    assert.equal(result.ok, false);
    assert.match(result.message, /privileged active liveness/);
    assert.equal(f.calls(), 1);
  }
});

test('legacy or absent secure enrollment is blocked before comparison or save', () => {
  let compared = 0;
  let saved = 0;
  const gate = requireSecureEnrollment(0);
  if (gate.ok) { compared += 1; saved += 1; }
  assert.equal(gate.ok, false);
  assert.match(gate.message, /re-enrollment required/);
  assert.equal(compared, 0);
  assert.equal(saved, 0);
});

test('reason authorization is one-time even when retry request is incomplete', () => {
  const f = fixture({ ok: false, message: 'should not be called' });
  f.reasonAuthorizations.set('token', { terminalId: 't1', code: 'EMP-1', expiresAt: 2000, summary: {} });
  const result = authorizeCameraAttempt({ payload: { cameraAuthorization: 'token', code: '', meta: { outReason: 'Tea Break' } }, terminal: {}, terminalId: 't1', now: () => 1000, ...f });
  assert.equal(result.ok, false);
  assert.equal(f.reasonAuthorizations.has('token'), false);
});
