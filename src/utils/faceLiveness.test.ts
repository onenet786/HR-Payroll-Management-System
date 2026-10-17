import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLivenessSequence } from './faceLiveness';

const frames = (values: number[], drift = 0, scale = 0.3) => values.flatMap((yaw, phase) =>
  Array.from({ length: 3 }, (_, i) => ({ at: (phase * 3 + i) * 120, yaw, centerX: 0.5 + drift, centerY: 0.5, scale }))
);

test('accepts center-left-center-right-center', () => {
  assert.equal(validateLivenessSequence(frames([0, 0.35, 0, -0.35, 0]), ['left', 'right']).ok, true);
  const handheld = frames([0, 0.35, 0, -0.35, 0]);
  handheld.forEach((frame, index) => { frame.centerX += index % 2 ? 0.12 : -0.1; });
  assert.equal(validateLivenessSequence(handheld, ['left', 'right']).ok, true);
});
test('rejects wrong direction and insufficient yaw', () => {
  assert.equal(validateLivenessSequence(frames([0, -0.35, 0, 0.35, 0]), ['left', 'right']).ok, false);
  assert.equal(validateLivenessSequence(frames([0, 0.1, 0, -0.1, 0]), ['left', 'right']).ok, false);
});
test('rejects translated flat-photo motion and scale change', () => {
  const translated = frames([0, 0.35, 0, -0.35, 0]); translated[6].centerX = 0.85;
  const scaled = frames([0, 0.35, 0, -0.35, 0]); scaled[7].scale = 0.5;
  assert.equal(validateLivenessSequence(translated, ['left', 'right']).ok, false);
  assert.equal(validateLivenessSequence(scaled, ['left', 'right']).ok, false);
});
test('rejects insufficient frames and timeout', () => {
  assert.equal(validateLivenessSequence(frames([0, 0.35, 0, -0.35, 0]).slice(0, 14), ['left', 'right']).ok, false);
  const timed = frames([0, 0.35, 0, -0.35, 0]); timed.at(-1)!.at = 30_000;
  assert.equal(validateLivenessSequence(timed, ['left', 'right']).ok, false);
});
test('turns are measured from the person\'s own resting pose (camera off to one side)', () => {
  // Resting yaw 0.28: the old fixed "centre within 0.20" rule could never start.
  const offset = frames([0.28, 0.6, 0.28, -0.02, 0.28]);
  const result = validateLivenessSequence(offset, ['left', 'right']);
  assert.equal(result.ok, true);
  assert.ok(result.summary!.maxLeftYaw >= 0.27 && result.summary!.maxRightYaw >= 0.27, 'turn sizes are relative to the resting pose');
  assert.equal(validateLivenessSequence(frames([-0.3, -0.02, -0.3, -0.6, -0.3]), ['left', 'right']).ok, true);
});
test('a still photo or small wobble still fails from an offset pose', () => {
  assert.equal(validateLivenessSequence(frames([0.28, 0.28, 0.28, 0.28, 0.28]), ['left', 'right']).ok, false);
  assert.equal(validateLivenessSequence(frames([0.28, 0.4, 0.28, 0.15, 0.28]), ['left', 'right']).ok, false);
  assert.equal(validateLivenessSequence(frames([0.5, 0.9, 0.5, 0.1, 0.5]), ['left', 'right']).ok, false, 'near-profile start is not accepted');
});
