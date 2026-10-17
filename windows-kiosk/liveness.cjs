'use strict';
const crypto = require('crypto');

const MIN_FRAMES = 3;
const MAX_DURATION_MS = 25_000;
const CLOCK_TOLERANCE_MS = 250;
const MAX_OBSERVATIONS = 240;
// Head movement allowed during the check, as a fraction of the camera frame (same limit as the web portal).
const MAX_CENTER_DRIFT = 0.15;
const MAX_SCALE_CHANGE = 0.22;
const midpoint = values => (Math.min(...values) + Math.max(...values)) / 2;

// Turns are measured from the person's own resting pose (first steady, roughly frontal frames), so an off-centre
// webcam or someone looking slightly down still passes; a photo still fails because two real turns are required.
const FRONTAL_YAW = 0.35;
const stepMatches = (target, yaw, base) => base === null
  ? Math.abs(yaw) <= FRONTAL_YAW
  : target === 'center' ? Math.abs(yaw - base) <= 0.20 : target === 'left' ? yaw - base >= 0.27 : yaw - base <= -0.27;
function isValidAttestation(value) {
  const summary = value?.summary;
  const order = summary?.order;
  const counts = summary?.frameCounts;
  const verifiedAt = Date.parse(value?.verifiedAt || '');
  return value?.method === 'active-turn-v1' &&
    Number.isFinite(verifiedAt) && verifiedAt <= Date.now() + 300_000 &&
    Array.isArray(order) && order.length === 2 && order.every(item => item === 'left' || item === 'right') && order[0] !== order[1] &&
    Array.isArray(counts) && counts.length === 5 && counts.every(count => Number.isInteger(count) && count >= MIN_FRAMES && count <= 80) &&
    Number.isFinite(summary.durationMs) && summary.durationMs > 0 && summary.durationMs <= MAX_DURATION_MS &&
    Number.isFinite(summary.maxLeftYaw) && summary.maxLeftYaw >= .27 && summary.maxLeftYaw <= 2 &&
    Number.isFinite(summary.maxRightYaw) && summary.maxRightYaw >= .27 && summary.maxRightYaw <= 2 &&
    Number.isFinite(summary.maxCenterDrift) && summary.maxCenterDrift >= 0 && summary.maxCenterDrift <= MAX_CENTER_DRIFT &&
    Number.isFinite(summary.maxScaleChange) && summary.maxScaleChange >= 0 && summary.maxScaleChange <= .22;
}

function validateSequence(observations, order, maxDurationMs = MAX_DURATION_MS) {
  if (!Array.isArray(observations) || observations.length < MIN_FRAMES * 5) return { ok: false, message: 'Not enough live face frames were captured.' };
  if (observations.length > MAX_OBSERVATIONS) return { ok: false, message: 'Liveness proof contains too many observations.' };
  if (!Array.isArray(order) || order.length !== 2 || order[0] === order[1] || !order.every(value => value === 'left' || value === 'right')) return { ok: false, message: 'Invalid liveness challenge order.' };
  const durationMs = Number(observations.at(-1)?.at) - Number(observations[0]?.at);
  if (!(durationMs > 0) || durationMs > maxDurationMs) return { ok: false, message: 'Active liveness challenge expired. Start again.' };
  // Movement is measured from the middle of the range the face moved over, not from the first frames, which are
  // often taken while the person is still settling into the oval. Head turns barely move the face box; a flat photo
  // cannot fake the yaw turns at all, so this only rejects someone walking or swinging the camera.
  const baseX = midpoint(observations.map(item => Number(item?.centerX)));
  const baseY = midpoint(observations.map(item => Number(item?.centerY)));
  const baseScale = midpoint(observations.map(item => Number(item?.scale)));
  if (![baseX, baseY, baseScale].every(Number.isFinite) || baseScale <= 0) return { ok: false, message: 'Invalid face geometry.' };
  let maxCenterDrift = 0;
  let maxScaleChange = 0;
  let previousAt = Number.NEGATIVE_INFINITY;
  for (const item of observations) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['at', 'yaw', 'centerX', 'centerY', 'scale'].includes(key))) return { ok: false, message: 'Liveness observation shape is invalid.' };
    const values = ['at', 'yaw', 'centerX', 'centerY', 'scale'].map(key => Number(item?.[key]));
    if (!values.every(Number.isFinite)) return { ok: false, message: 'Invalid liveness observation.' };
    if (!Number.isSafeInteger(values[0]) || Math.abs(values[1]) > 2 || values[2] < 0 || values[2] > 1 || values[3] < 0 || values[3] > 1 || values[4] < .05 || values[4] > 1) return { ok: false, message: 'Liveness observation values are outside allowed bounds.' };
    if (values[0] < previousAt) return { ok: false, message: 'Liveness observation timestamps are not monotonic.' };
    previousAt = values[0];
    maxCenterDrift = Math.max(maxCenterDrift, Math.hypot(values[2] - baseX, values[3] - baseY));
    maxScaleChange = Math.max(maxScaleChange, Math.abs(values[4] / baseScale - 1));
  }
  if (maxCenterDrift > MAX_CENTER_DRIFT) return { ok: false, message: 'You moved too far during the check. Stand still and turn only your head.' };
  if (maxScaleChange > MAX_SCALE_CHANGE) return { ok: false, message: 'Face size changed too much. Keep the same distance from the camera.' };
  const targets = ['center', order[0], 'center', order[1], 'center'];
  const counts = [0, 0, 0, 0, 0];
  let phase = 0;
  let base = null;
  let resting = [];
  let maxLeftYaw = 0;
  let maxRightYaw = 0;
  for (const item of observations) {
    const yaw = Number(item.yaw);
    if (stepMatches(targets[phase], yaw, base)) {
      counts[phase] += 1;
      if (base === null) resting.push(yaw);
      if (counts[phase] >= MIN_FRAMES && phase < 4) {
        if (base === null) base = resting.slice(-MIN_FRAMES).reduce((sum, value) => sum + value, 0) / MIN_FRAMES;
        phase += 1;
      }
    } else if (counts[phase] < MIN_FRAMES) {
      counts[phase] = 0;
      if (base === null) resting = [];
    }
    if (base !== null) {
      maxLeftYaw = Math.max(maxLeftYaw, yaw - base);
      maxRightYaw = Math.max(maxRightYaw, base - yaw);
    }
  }
  if (phase !== 4 || counts[4] < MIN_FRAMES) return { ok: false, message: 'Required center and head-turn sequence was not completed.' };
  return { ok: true, summary: { order, frameCounts: counts, durationMs, maxLeftYaw, maxRightYaw, maxCenterDrift, maxScaleChange } };
}

function createChallengeManager({ now = Date.now, randomBytes = crypto.randomBytes } = {}) {
  const challenges = new Map();
  const failures = new Map();
  const begin = terminalId => {
    const failure = failures.get(terminalId);
    if (failure?.lockedUntil > now()) return { ok: false, lockedUntil: failure.lockedUntil, message: `Camera locked after repeated failures. Try again in ${Math.ceil((failure.lockedUntil - now()) / 1000)} seconds or use fingerprint.` };
    if (failure?.lockedUntil && failure.lockedUntil <= now()) failures.delete(terminalId);
    const id = randomBytes(24).toString('hex');
    const order = randomBytes(1)[0] % 2 ? ['left', 'right'] : ['right', 'left'];
    const issuedAt = now();
    const challenge = { id, terminalId, order, issuedAt, expiresAt: issuedAt + MAX_DURATION_MS, used: false };
    challenges.set(id, challenge);
    return { ok: true, id, order, issuedAt, expiresAt: challenge.expiresAt };
  };
  const fail = terminalId => {
    const stored = failures.get(terminalId);
    const previous = stored?.lockedUntil && stored.lockedUntil <= now()
      ? { count: 0, lockedUntil: 0 }
      : stored || { count: 0, lockedUntil: 0 };
    const count = previous.count + 1;
    const lockedUntil = count >= 5 ? now() + 30_000 : 0;
    failures.set(terminalId, { count, lockedUntil });
    return { count, lockedUntil };
  };
  const validateAndConsume = (terminalId, proof) => {
    if (!proof || typeof proof !== 'object' || typeof proof.challengeId !== 'string' || !/^[a-f0-9]{48}$/.test(proof.challengeId) || !Array.isArray(proof.observations)) {
      const state = fail(terminalId); return { ok: false, ...state, message: 'A privileged active liveness challenge is required.' };
    }
    const challenge = challenges.get(proof.challengeId);
    if (!challenge || challenge.terminalId !== terminalId || challenge.used) {
      const state = fail(terminalId); return { ok: false, ...state, message: 'Liveness challenge is invalid or was already used.' };
    }
    challenge.used = true;
    if (now() > challenge.expiresAt) {
      const state = fail(terminalId); return { ok: false, ...state, message: 'Liveness challenge expired.' };
    }
    const firstAt = Number(proof.observations[0]?.at);
    const lastAt = Number(proof.observations.at(-1)?.at);
    if (!Number.isFinite(firstAt) || !Number.isFinite(lastAt) || firstAt < challenge.issuedAt - CLOCK_TOLERANCE_MS || lastAt > challenge.expiresAt || lastAt > now() + CLOCK_TOLERANCE_MS) {
      const state = fail(terminalId); return { ok: false, ...state, message: 'Liveness observations fall outside the issued challenge window.' };
    }
    const result = validateSequence(proof.observations, challenge.order, challenge.expiresAt - challenge.issuedAt);
    if (!result.ok) return { ...result, ...fail(terminalId) };
    return { ok: true, summary: result.summary };
  };
  const cancel = (terminalId, challengeId) => {
    const challenge = challenges.get(challengeId);
    if (!challenge || challenge.terminalId !== terminalId || challenge.used) return { ok: false };
    challenge.used = true;
    return { ok: true, ...fail(terminalId) };
  };
  const reset = terminalId => failures.delete(terminalId);
  const getFailureState = terminalId => failures.get(terminalId) || { count: 0, lockedUntil: 0 };
  return { begin, validateAndConsume, cancel, recordFailure: fail, reset, getFailureState };
}

module.exports = { MIN_FRAMES, MAX_DURATION_MS, CLOCK_TOLERANCE_MS, MAX_OBSERVATIONS, isValidAttestation, validateSequence, createChallengeManager };
