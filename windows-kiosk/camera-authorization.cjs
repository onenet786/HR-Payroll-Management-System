'use strict';

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
  const isMultiFace = payload?.mode === 'multi-face';
  const liveness = authorizedReasonRetry
    ? { ok: true, summary: authorization.summary }
    : isMultiFace
    ? { ok: true, summary: { method: 'multi-face-walkthrough' } }
    : challengeManager.validateAndConsume(terminalId, payload.livenessProof);

  // Employee code is optional. Without it, identity is selected from all
  // securely enrolled local employees after liveness has been validated.
  if (terminal.ipCameraUrl || payload?.meta?.camera === 'ip-camera') return { ok: false, message: 'IP camera attendance is blocked: it cannot provide the live landmark sequence required for photo replay protection. Use the local webcam or fingerprint.', liveness };
  if (!liveness.ok) return { ok: false, message: liveness.message, lockedUntil: liveness.lockedUntil, liveness };
  return { ok: true, code, liveness };
}

function requireSecureEnrollment(descriptorCount) {
  return Number.isInteger(descriptorCount) && descriptorCount > 0
    ? { ok: true }
    : { ok: false, message: 'Secure face re-enrollment required. Legacy camera profiles are disabled; ask HR to complete Active liveness enrollment.' };
}

module.exports = { authorizeCameraAttempt, requireSecureEnrollment };
