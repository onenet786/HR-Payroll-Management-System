'use strict';
// Passive live check for the Multi-Face walk-through (no buttons, no head-turn challenge).
//
// The renderer measures, this module decides (in the main process, before a punch is saved):
//   1. Blink: the face's eye-blink score must go open -> closed -> open within a short time. A printed photo or a
//      still picture on a phone cannot blink.
//   2. Screen / photo around the face: an object detector looks at the area around the face. A phone, tablet, TV,
//      laptop or book/paper that encloses the face means the face is shown on a device or a print.
//   3. Body: a real face sits on a head with shoulders below it, at a matching size. A face held up in a hand has
//      no body of its own (the holder's head is elsewhere).
// All coordinates are pixels of the camera frame the renderer analysed.

const DEVICE_LABELS = new Set(['cell phone', 'tv', 'laptop', 'book']);
const MIN_DEVICE_SCORE = 0.35;
// A blink is a rise of the eye-blink score and a fall back, not fixed "open" / "closed" values: a smiling or squinting
// face already scores 0.25-0.35 with open eyes.
const BLINK_RISE = 0.25;      // closed must be at least this much above the open samples before and after
const BLINK_CLOSED = 0.45;    // and at least this high
const BLINK_MAX_MS = 1500;    // open -> closed -> open must fit in this time
const MIN_FACE_PX = 48;       // smaller faces are too small for any of these checks

const num = value => (Number.isFinite(Number(value)) ? Number(value) : NaN);
function box(value) {
  const b = { x: num(value?.x), y: num(value?.y), w: num(value?.w), h: num(value?.h) };
  return [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0 ? b : null;
}
function point(value) {
  const p = { x: num(value?.x), y: num(value?.y), v: num(value?.v) };
  return Number.isFinite(p.x) && Number.isFinite(p.y) ? { ...p, v: Number.isFinite(p.v) ? p.v : 0 } : null;
}
const area = b => b.w * b.h;
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** True when the samples [{t, s}] (time in ms, blink score 0..1) contain an open -> closed -> open blink. */
function blinkObserved(samples) {
  const list = (Array.isArray(samples) ? samples : [])
    .map(item => ({ t: num(item?.t), s: num(item?.s) }))
    .filter(item => Number.isFinite(item.t) && Number.isFinite(item.s) && item.s >= 0 && item.s <= 1)
    .slice(-120)
    .sort((a, b) => a.t - b.t);
  for (let j = 1; j < list.length - 1; j += 1) {
    const peak = list[j];
    if (peak.s < BLINK_CLOSED) continue;
    const before = list.slice(0, j).some(item => peak.t - item.t <= BLINK_MAX_MS && peak.s - item.s >= BLINK_RISE);
    const after = list.slice(j + 1).some(item => item.t - peak.t <= BLINK_MAX_MS && peak.s - item.s >= BLINK_RISE);
    if (before && after) return true;
  }
  return false;
}

/** The device (phone, screen, book) that shows this face, or null. */
function deviceAroundFace(face, devices, bodyMatched) {
  for (const raw of Array.isArray(devices) ? devices.slice(0, 20) : []) {
    const label = String(raw?.label || '').toLowerCase();
    const b = box(raw?.box);
    if (!b || !DEVICE_LABELS.has(label) || !(num(raw?.score) >= MIN_DEVICE_SCORE)) continue;
    if (overlap(face, b) / area(face) < 0.7) continue;   // the face is not inside this device
    // A phone or print held up is only a few times the size of the face it shows. A large TV behind a real person
    // (face in front of it, with a body) is not a spoof.
    if (area(b) <= 8 * area(face) || !bodyMatched) return { label, score: Math.round(num(raw.score) * 100) / 100 };
  }
  return null;
}

/** True when one of the bodies has its nose in this face and shoulders below it at a matching size. */
function bodyForFace(face, bodies) {
  const pad = 0.3;
  for (const raw of Array.isArray(bodies) ? bodies.slice(0, 10) : []) {
    const nose = point(raw?.nose), left = point(raw?.ls), right = point(raw?.rs);
    if (!nose || !left || !right) continue;
    if (nose.x < face.x - face.w * pad || nose.x > face.x + face.w * (1 + pad) || nose.y < face.y - face.h * pad || nose.y > face.y + face.h * (1 + pad)) continue;
    if (left.v < 0.5 || right.v < 0.5) continue;
    const shoulderWidth = Math.hypot(left.x - right.x, left.y - right.y);
    const shouldersY = (left.y + right.y) / 2;
    if (shouldersY < nose.y + face.h * 0.3) continue;              // shoulders must be below the face
    if (shoulderWidth < face.w * 1.2 || shoulderWidth > face.w * 5) continue;
    return true;
  }
  return false;
}

/**
 * Decides the passive live check from the renderer's measurements.
 * Returns { ok: true } or { ok: false, code, spoof, message }:
 *   code 'blink'   - no blink seen yet (not an attack; the person is asked to blink)
 *   code 'device'  - the face is shown on a phone / screen / print (spoof: HR is alerted)
 *   code 'no-body' - no head and shoulders belong to this face (refused, logged on the kiosk)
 *   code 'invalid' - measurements missing or unusable
 */
function evaluatePassiveLiveness(proof) {
  if (!proof || typeof proof !== 'object' || proof.v !== 1) return { ok: false, code: 'invalid', spoof: false, message: 'Live check data missing. Update the kiosk and try again.' };
  const scene = proof.scene || {};
  const face = box(scene.face);
  if (!face || Math.min(face.w, face.h) < MIN_FACE_PX) return { ok: false, code: 'invalid', spoof: false, message: 'Face too small. Come closer to the camera.' };
  const bodyCheckSkipped = scene.bodyRegionCut === true;
  const bodyMatched = !bodyCheckSkipped && bodyForFace(face, scene.bodies);
  const device = deviceAroundFace(face, scene.devices, bodyMatched || bodyCheckSkipped);
  if (device) return { ok: false, code: 'device', spoof: true, device, message: 'Please face the camera directly.' };
  if (!bodyCheckSkipped && !bodyMatched) return { ok: false, code: 'no-body', spoof: false, message: 'Please face the camera directly.' };
  if (!blinkObserved(proof.blink)) return { ok: false, code: 'blink', spoof: false, message: 'Blink to confirm' };
  return { ok: true, bodyCheckSkipped };
}

module.exports = { evaluatePassiveLiveness, blinkObserved, DEVICE_LABELS, MIN_FACE_PX };
