const test = require('node:test');
const assert = require('node:assert/strict');
const { identifyFace, normalizeFaceDescriptor, faceDistance, FACE_IDENTIFY_THRESHOLD } = require('./face-match.cjs');

// Deterministic 128-number "faces": each person is a fixed random direction; samples add small noise.
function person(seed) {
  let state = seed;
  const next = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648 - 0.5; };
  return Array.from({ length: 128 }, () => next() * 0.18);
}
const sample = (base, noise, seed) => {
  const jitter = person(seed);
  return { version: 4, vector: base.map((value, i) => value + jitter[i] * noise) };
};
const alice = person(11), bob = person(29), carol = person(47);
const employee = (id, base) => ({ id, faceDescriptors: [sample(base, 0.15, 101), sample(base, 0.15, 202)] });
const getDescriptors = item => item.faceDescriptors.map(normalizeFaceDescriptor).filter(Boolean);
const staff = [employee('alice', alice), employee('bob', bob), employee('carol', carol)];

test('only 128-number version 4 embeddings are accepted', () => {
  assert.equal(normalizeFaceDescriptor({ version: 3, vector: new Array(1280).fill(0) }), null, 'old pixel descriptor');
  assert.equal(normalizeFaceDescriptor({ version: 4, vector: new Array(127).fill(0) }), null);
  assert.equal(normalizeFaceDescriptor({ version: 4, vector: [...new Array(127).fill(0), Number.NaN] }), null);
  assert.ok(normalizeFaceDescriptor({ version: 4, vector: new Array(128).fill(0) }));
});

test('the right person is identified and different people are far apart', () => {
  assert.ok(faceDistance({ vector: alice }, { vector: bob }) > FACE_IDENTIFY_THRESHOLD + 0.2);
  const result = identifyFace(staff, sample(bob, 0.15, 303), { getDescriptors });
  assert.equal(result.ok, true);
  assert.equal(result.employee.id, 'bob');
});

test('an unknown face is rejected rather than given the closest employee', () => {
  const stranger = person(999);
  const result = identifyFace(staff, { version: 4, vector: stranger }, { getDescriptors });
  assert.equal(result.ok, false);
  assert.match(result.message, /not recognized/);
});

test('a face too close to two employees is refused as ambiguous', () => {
  const twin = { id: 'alice-twin', faceDescriptors: [sample(alice, 0.15, 404)] };
  const result = identifyFace([...staff, twin], sample(alice, 0.15, 505), { getDescriptors });
  assert.equal(result.ok, false);
  assert.equal(result.ambiguous, true);
});

test('an employee already identified on another face in view cannot be matched again', () => {
  const result = identifyFace(staff, sample(alice, 0.15, 606), { getDescriptors, excludeEmployeeIds: ['alice'] });
  assert.equal(result.ok, false);
  assert.equal(result.duplicate, true);
});
