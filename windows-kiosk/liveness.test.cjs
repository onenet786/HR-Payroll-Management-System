'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createChallengeManager, isValidAttestation, validateSequence, MAX_OBSERVATIONS } = require('./liveness.cjs');

const frames = (values, start = 0) => values.flatMap((yaw, phase) => Array.from({ length: 3 }, (_, i) => ({ at: start + (phase * 3 + i) * 100, yaw, centerX: .5, centerY: .5, scale: .3 })));

test('challenge order validates deterministically', () => {
  assert.equal(validateSequence(frames([0, .35, 0, -.35, 0]), ['left', 'right']).ok, true);
  assert.equal(validateSequence(frames([0, .35, 0, -.35, 0]), ['right', 'left']).ok, false);
});
test('expired, reused, and boolean-only proofs fail', () => {
  let clock = 1000;
  const manager = createChallengeManager({ now: () => clock, randomBytes: size => Buffer.alloc(size, 1) });
  const challenge = manager.begin('t1');
  assert.equal(manager.validateAndConsume('t1', { liveness: true }).ok, false);
  clock = 3000;
  assert.equal(manager.validateAndConsume('t1', { challengeId: challenge.id, observations: frames([0, .35, 0, -.35, 0], 1100) }).ok, true);
  assert.equal(manager.validateAndConsume('t1', { challengeId: challenge.id, observations: frames([0, .35, 0, -.35, 0]) }).ok, false);
  const expired = manager.begin('t1'); clock = expired.expiresAt + 1;
  assert.equal(manager.validateAndConsume('t1', { challengeId: expired.id, observations: frames([0, .35, 0, -.35, 0]) }).ok, false);
});
test('five failures lock camera for thirty seconds and reset clears state', () => {
  let clock = 1000;
  let seed = 0;
  const manager = createChallengeManager({ now: () => clock, randomBytes: size => Buffer.alloc(size, ++seed) });
  for (let i = 0; i < 5; i += 1) assert.equal(manager.validateAndConsume('t1', {}).ok, false);
  assert.equal(manager.begin('t1').ok, false);
  assert.equal(manager.getFailureState('t1').lockedUntil, 31_000);
  manager.reset('t1');
  assert.equal(manager.begin('t1').ok, true);
});

test('challenge rejects and consumes pre-issuance, future, and non-monotonic timestamps', () => {
  let clock = 10_000;
  let seed = 20;
  const manager = createChallengeManager({ now: () => clock, randomBytes: size => Buffer.alloc(size, ++seed) });

  const before = manager.begin('t-before');
  const beforeOrder = before.order;
  const beforeFrames = frames([0, beforeOrder[0] === 'left' ? .35 : -.35, 0, beforeOrder[1] === 'left' ? .35 : -.35, 0], 1000);
  const beforeResult = manager.validateAndConsume('t-before', { challengeId: before.id, observations: beforeFrames });
  assert.equal(beforeResult.ok, false);
  assert.equal(manager.validateAndConsume('t-before', { challengeId: before.id, observations: beforeFrames }).ok, false);
  assert.equal(manager.getFailureState('t-before').count, 2);

  const future = manager.begin('t-future');
  const futureOrder = future.order;
  const futureFrames = frames([0, futureOrder[0] === 'left' ? .35 : -.35, 0, futureOrder[1] === 'left' ? .35 : -.35, 0], 20_000);
  const futureResult = manager.validateAndConsume('t-future', { challengeId: future.id, observations: futureFrames });
  assert.equal(futureResult.ok, false);
  assert.equal(manager.validateAndConsume('t-future', { challengeId: future.id, observations: frames([0, futureOrder[0] === 'left' ? .35 : -.35, 0, futureOrder[1] === 'left' ? .35 : -.35, 0], 10_000) }).ok, false);
  assert.equal(manager.getFailureState('t-future').count, 2);

  const nonMonotonic = manager.begin('t-non-monotonic');
  const observations = frames([0, nonMonotonic.order[0] === 'left' ? .35 : -.35, 0, nonMonotonic.order[1] === 'left' ? .35 : -.35, 0], 10_000);
  observations[8].at = observations[7].at - 1;
  const nonMonotonicResult = manager.validateAndConsume('t-non-monotonic', { challengeId: nonMonotonic.id, observations });
  assert.equal(nonMonotonicResult.ok, false);
  assert.equal(manager.validateAndConsume('t-non-monotonic', { challengeId: nonMonotonic.id, observations: frames([0, nonMonotonic.order[0] === 'left' ? .35 : -.35, 0, nonMonotonic.order[1] === 'left' ? .35 : -.35, 0], 10_000) }).ok, false);
  assert.equal(manager.getFailureState('t-non-monotonic').count, 2);
});

test('expired lockout starts a fresh five-attempt window', () => {
  let clock = 1000;
  let seed = 50;
  const manager = createChallengeManager({ now: () => clock, randomBytes: size => Buffer.alloc(size, ++seed) });
  for (let i = 0; i < 5; i += 1) manager.validateAndConsume('t1', {});
  assert.equal(manager.begin('t1').ok, false);
  clock = 31_001;
  assert.equal(manager.begin('t1').ok, true);
  const failure = manager.validateAndConsume('t1', {});
  assert.equal(failure.count, 1);
  assert.equal(failure.lockedUntil, 0);
});

test('stored v3 attestation requires a complete plausible five-phase summary', () => {
  const valid = { method: 'active-turn-v1', verifiedAt: new Date().toISOString(), summary: { order: ['left', 'right'], frameCounts: [3, 3, 3, 3, 3], durationMs: 1800, maxLeftYaw: .35, maxRightYaw: .34, maxCenterDrift: .02, maxScaleChange: .05 } };
  assert.equal(isValidAttestation(valid), true);
  for (const summary of [
    { ...valid.summary, frameCounts: [] },
    { ...valid.summary, frameCounts: [3, 3, 3, 3] },
    { ...valid.summary, frameCounts: [3, 3, 3, 3, 3, 3] },
    { ...valid.summary, order: ['left', 'left'] },
    { ...valid.summary, durationMs: 0 },
    { ...valid.summary, maxRightYaw: .1 },
    { ...valid.summary, maxCenterDrift: .2 },
  ]) assert.equal(isValidAttestation({ ...valid, summary }), false);
});

test('proof arrays, shapes, and numeric values are strictly bounded', () => {
  const valid = frames([0, .35, 0, -.35, 0], 1000);
  assert.equal(validateSequence(Array.from({ length: MAX_OBSERVATIONS + 1 }, (_, i) => ({ at: 1000 + i, yaw: 0, centerX: .5, centerY: .5, scale: .3 })), ['left', 'right']).ok, false);
  const extraKey = valid.map(item => ({ ...item })); extraKey[0].rawFrame = 'forbidden';
  assert.equal(validateSequence(extraKey, ['left', 'right']).ok, false);
  const outOfBounds = valid.map(item => ({ ...item })); outOfBounds[4].centerX = 10;
  assert.equal(validateSequence(outOfBounds, ['left', 'right']).ok, false);
});

test('cancel consumes an incomplete challenge and counts failure', () => {
  const manager = createChallengeManager({ now: () => 1000, randomBytes: size => Buffer.alloc(size, 90) });
  const challenge = manager.begin('t1');
  assert.equal(manager.cancel('t1', challenge.id).ok, true);
  assert.equal(manager.getFailureState('t1').count, 1);
  const challengeFrames = frames([0, challenge.order[0] === 'left' ? .35 : -.35, 0, challenge.order[1] === 'left' ? .35 : -.35, 0], 1000);
  assert.equal(manager.validateAndConsume('t1', { challengeId: challenge.id, observations: challengeFrames }).ok, false);
});
