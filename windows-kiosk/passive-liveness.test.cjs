'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluatePassiveLiveness, blinkObserved } = require('./passive-liveness.cjs');

const blink = [0.1, 0.12, 0.6, 0.15, 0.1].map((s, i) => ({ t: i * 100, s }));
const face = { x: 400, y: 100, w: 80, h: 100 };
const body = { nose: { x: 440, y: 160, v: 0.99 }, ls: { x: 520, y: 260, v: 0.9 }, rs: { x: 360, y: 260, v: 0.9 } };
const proof = (scene = {}, samples = blink) => ({ v: 1, blink: samples, scene: { face, devices: [], bodies: [body], ...scene } });

test('a blinking face on a body passes', () => {
  assert.deepEqual(evaluatePassiveLiveness(proof()), { ok: true, bodyCheckSkipped: false });
});

test('blink must go open, closed, open in time', () => {
  assert.equal(blinkObserved(blink), true);
  assert.equal(blinkObserved([0.1, 0.1, 0.12, 0.1].map((s, i) => ({ t: i * 100, s }))), false, 'eyes never closed (photo)');
  assert.equal(blinkObserved([0.1, 0.6, 0.6].map((s, i) => ({ t: i * 100, s }))), false, 'eyes never reopened');
  assert.equal(blinkObserved([{ t: 0, s: 0.1 }, { t: 1600, s: 0.7 }, { t: 3200, s: 0.1 }]), false, 'too slow to be a blink');
  assert.equal(blinkObserved([0.34, 0.36, 0.72, 0.38, 0.35].map((s, i) => ({ t: i * 100, s }))), true, 'smiling / squinting face that blinks');
  assert.equal(blinkObserved([0.34, 0.4, 0.48, 0.42, 0.36].map((s, i) => ({ t: i * 100, s }))), false, 'small flicker is not a blink');
  const result = evaluatePassiveLiveness(proof({}, blink.map(item => ({ ...item, s: 0.1 }))));
  assert.equal(result.code, 'blink');
  assert.equal(result.spoof, false);
});

test('a face inside a phone is a spoof even when the holder has a body', () => {
  const phone = { label: 'cell phone', score: 0.62, box: { x: 380, y: 80, w: 130, h: 150 } };
  const result = evaluatePassiveLiveness(proof({ devices: [phone] }));
  assert.equal(result.code, 'device');
  assert.equal(result.spoof, true);
  assert.equal(result.device.label, 'cell phone');
});

test('a large TV behind a real person is not a spoof, but a TV face without a body is', () => {
  const tv = { label: 'tv', score: 0.8, box: { x: 200, y: 0, w: 600, h: 400 } };
  assert.equal(evaluatePassiveLiveness(proof({ devices: [tv] })).ok, true);
  assert.equal(evaluatePassiveLiveness(proof({ devices: [tv], bodies: [] })).code, 'device');
});

test('weak or unrelated detections are ignored', () => {
  const weak = { label: 'cell phone', score: 0.2, box: { x: 380, y: 80, w: 130, h: 150 } };
  const cup = { label: 'cup', score: 0.9, box: { x: 380, y: 80, w: 130, h: 150 } };
  const aside = { label: 'cell phone', score: 0.9, box: { x: 10, y: 10, w: 60, h: 100 } };
  assert.equal(evaluatePassiveLiveness(proof({ devices: [weak, cup, aside] })).ok, true);
});

test('a face with no head and shoulders of its own is refused, unless the body is out of the frame', () => {
  const holderElsewhere = { nose: { x: 700, y: 120, v: 0.99 }, ls: { x: 780, y: 220, v: 0.9 }, rs: { x: 620, y: 220, v: 0.9 } };
  const result = evaluatePassiveLiveness(proof({ bodies: [holderElsewhere] }));
  assert.equal(result.code, 'no-body');
  assert.equal(result.spoof, false);
  assert.equal(evaluatePassiveLiveness(proof({ bodies: [], bodyRegionCut: true })).ok, true);
  const shouldersAbove = { ...body, ls: { x: 520, y: 120, v: 0.9 }, rs: { x: 360, y: 120, v: 0.9 } };
  assert.equal(evaluatePassiveLiveness(proof({ bodies: [shouldersAbove] })).code, 'no-body');
  const hiddenShoulders = { ...body, ls: { ...body.ls, v: 0.2 } };
  assert.equal(evaluatePassiveLiveness(proof({ bodies: [hiddenShoulders] })).code, 'no-body');
});

test('missing or tiny data is refused without counting as an attack', () => {
  assert.equal(evaluatePassiveLiveness(null).code, 'invalid');
  assert.equal(evaluatePassiveLiveness({ v: 2 }).code, 'invalid');
  assert.equal(evaluatePassiveLiveness(proof({ face: { x: 1, y: 1, w: 20, h: 25 } })).code, 'invalid');
});
