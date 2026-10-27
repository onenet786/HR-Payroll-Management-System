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
  assert.match(result.message, /snapshot \/ MJPEG camera URL/);
  assert.equal(f.calls(), 1);
});

test('an rtsp:// IP camera is live video and goes through the same liveness check as a webcam', () => {
  const f = fixture();
  const terminal = { ipCameraUrl: 'rtsp://192.168.1.45:554/Streaming/Channels/102' };
  const result = authorizeCameraAttempt({ payload: { code: 'EMP-1', livenessProof: {}, meta: { camera: 'ip-camera' } }, terminal, terminalId: 't1', ...f });
  assert.equal(result.ok, true);
  assert.equal(f.calls(), 1);
  const failing = fixture({ ok: false, message: 'Turn left was not observed.' });
  const refused = authorizeCameraAttempt({ payload: { code: 'EMP-1', livenessProof: {} }, terminal, terminalId: 't1', ...failing });
  assert.equal(refused.ok, false, 'liveness still required');
});

test('a payload claiming an IP camera is refused when the terminal has no live IP camera', () => {
  const f = fixture();
  const result = authorizeCameraAttempt({ payload: { code: 'EMP-1', livenessProof: {}, meta: { camera: 'ip-camera' } }, terminal: {}, terminalId: 't1', ...f });
  assert.equal(result.ok, false);
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

test('with an entrance and an exit camera the punch is tied to the camera id from the terminal settings', () => {
  const terminal = { cameraSource: 'ip', ipCameras: [{ url: 'rtsp://in/102', direction: 'in' }, { url: 'http://out/picture', direction: 'out' }] };
  const viaIn = authorizeCameraAttempt({ payload: { code: '', livenessProof: {}, meta: { camera: 'ip-camera', cameraId: 'cam1' } }, terminal, terminalId: 't1', ...fixture() });
  assert.equal(viaIn.ok, true);
  assert.equal(viaIn.camera.direction, 'in');
  const snapshotCamera = authorizeCameraAttempt({ payload: { code: '', livenessProof: {}, meta: { camera: 'ip-camera', cameraId: 'cam2' } }, terminal, terminalId: 't1', ...fixture() });
  assert.equal(snapshotCamera.ok, false, 'snapshot exit camera cannot prove liveness');
  const noId = authorizeCameraAttempt({ payload: { code: '', livenessProof: {}, meta: { camera: 'ip-camera' } }, terminal, terminalId: 't1', ...fixture() });
  assert.equal(noId.ok, false, 'two cameras: the camera must be named');
});
