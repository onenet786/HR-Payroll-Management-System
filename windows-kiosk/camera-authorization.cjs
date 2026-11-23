'use strict';

const { normalizeCameraSettings, resolveCamera, cameraSupportsFaces } = require('./camera-config.cjs');

function authorizeCameraAttempt({ payload = {}, terminal = {}, terminalId, challengeManager, reasonAuthorizations, now = Date.now }) {
  const authorizationId = typeof payload.cameraAuthorization === 'string' ? payload.cameraAuthorization : '';
  const authorization = authorizationId ? reasonAuthorizations.get(authorizationId) : null;
  if (authorizationId) reasonAuthorizations.delete(authorizationId);

  const code = String(payload.code || '').trim();
  const authorizedReasonRetry = !!authorization &&
    authorization.terminalId === terminalId &&
    authorization.code === code &&
    authorization.expiresAt >= now() &&
    !!payload?.meta?.outReason;
  // Multi-Face walk-through has no liveness check at all (a photo of a colleague is recognised like a face), so it is
  // accepted only when an administrator enabled it on this terminal; the punch is then marked for HR review
  // (savePunch). Everything else needs a server-issued active liveness challenge validated here, in the main process.
  const isMultiFace = payload?.mode === 'multi-face';
  if (isMultiFace && !authorizedReasonRetry && terminal?.allowMultiFaceMode !== true) {
    return { ok: false, message: 'Multi-Face walk-through is turned off on this kiosk. Use the 1-on-1 live face check or fingerprint.', liveness: { ok: true, summary: {} }, multiFaceDisabled: true };
  }
  const liveness = authorizedReasonRetry
    ? { ok: true, summary: authorization.summary }
    : isMultiFace
    ? { ok: true, summary: { method: 'multi-face-walkthrough' } }
    : challengeManager.validateAndConsume(terminalId, payload.livenessProof);

  // Employee code is optional. Without it, identity is selected from all
  // securely enrolled local employees after liveness has been validated.
  // A webcam or an rtsp:// camera is live video and gives the landmark sequence liveness needs; snapshot / MJPEG URLs
  // cannot. The camera is looked up from the terminal's own settings by id, never taken from the payload, and a
  // payload claiming an IP camera on a webcam terminal is refused as well.
  const resolved = resolveCamera(normalizeCameraSettings(terminal), payload?.meta?.cameraId);
  if (!cameraSupportsFaces(resolved) || (payload?.meta?.camera === 'ip-camera' && resolved.source !== 'ip')) return { ok: false, message: 'A snapshot / MJPEG camera URL cannot provide the live landmark sequence required for photo replay protection. Use an rtsp:// camera URL, the local webcam or fingerprint.', liveness };
  if (!liveness.ok) return { ok: false, message: liveness.message, lockedUntil: liveness.lockedUntil, liveness };
  return { ok: true, code, liveness, camera: resolved.camera };
}

function requireSecureEnrollment(descriptorCount) {
  return Number.isInteger(descriptorCount) && descriptorCount > 0
    ? { ok: true }
    : { ok: false, message: 'Secure face re-enrollment required. Legacy camera profiles are disabled; ask HR to complete Active liveness enrollment.' };
}

module.exports = { authorizeCameraAttempt, requireSecureEnrollment };
