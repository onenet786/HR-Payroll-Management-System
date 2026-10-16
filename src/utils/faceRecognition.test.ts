import test from 'node:test';
import assert from 'node:assert/strict';
import type { Employee } from '../types';
import { compareFaceDescriptors, findBestFaceMatch, getFaceDescriptors, type FaceDescriptor } from './faceRecognition';

const vector = Array.from({ length: 128 }, () => 0);
const employee = (faceDescriptors: Employee['faceDescriptors'], id = 'e1'): Employee => ({ id, fullName: `Employee ${id}`, employeeCode: id, status: 'Active', faceDescriptors } as Employee);
const validLiveness = () => ({ method: 'active-turn-v1' as const, verifiedAt: new Date().toISOString(), summary: { order: ['left', 'right'] as ['left', 'right'], durationMs: 1800, frameCounts: [3, 3, 3, 3, 3] as [number, number, number, number, number], maxLeftYaw: .35, maxRightYaw: .36, maxCenterDrift: .02, maxScaleChange: .05 } });
const face = (values: number[]): FaceDescriptor => ({ version: 4, vector: values, capturedAt: new Date().toISOString(), liveness: validLiveness() });
// A person is a direction in 128-d space; each axis value spreads the face out by ~0.9 total distance.
const personAt = (axis: number, offset = 0) => vector.map((_, i) => (i === axis ? 0.8 : 0) + (i === axis + 1 ? offset : 0));

test('old pixel descriptors (v1-v3, 1280 numbers) are no longer used for matching', () => {
  const old = Array.from({ length: 1280 }, () => 0);
  assert.equal(getFaceDescriptors(employee([
    { version: 2, vector: old, capturedAt: new Date().toISOString() },
    { version: 3, vector: old, capturedAt: new Date().toISOString(), liveness: validLiveness() },
  ])).length, 0);
});

test('missing or forged liveness attestation is excluded', () => {
  assert.equal(getFaceDescriptors(employee([{ version: 4, vector, capturedAt: new Date().toISOString() }])).length, 0);
  assert.equal(getFaceDescriptors(employee([{ version: 4, vector, capturedAt: new Date().toISOString(), liveness: { ...validLiveness(), verifiedAt: 'invalid' } }])).length, 0);
});

test('valid attested v4 embedding is accepted', () => {
  assert.equal(getFaceDescriptors(employee([face(vector)])).length, 1);
});

test('incomplete and implausible attestations are excluded', () => {
  const invalidSummaries = [
    { ...validLiveness().summary, frameCounts: [] },
    { ...validLiveness().summary, frameCounts: [3, 3, 3, 3] },
    { ...validLiveness().summary, order: ['left', 'left'] },
    { ...validLiveness().summary, durationMs: 25_001 },
    { ...validLiveness().summary, maxCenterDrift: .2 },
  ];
  for (const summary of invalidSummaries) {
    const record = { version: 4, vector, capturedAt: new Date().toISOString(), liveness: { ...validLiveness(), summary } } as any;
    assert.equal(getFaceDescriptors(employee([record])).length, 0);
  }
});

test('embeddings are compared by Euclidean distance', () => {
  assert.equal(compareFaceDescriptors(face(personAt(0)), face(personAt(0))), 0);
  assert.ok(Math.abs(compareFaceDescriptors(face(personAt(0)), face(personAt(10))) - Math.SQRT2 * 0.8) < 1e-9);
});

test('matching picks the right person, rejects strangers, look-alikes and faces already claimed', () => {
  const staff = [employee([face(personAt(0))], 'a'), employee([face(personAt(10))], 'b')];
  assert.equal(findBestFaceMatch(staff, face(personAt(10, 0.1)))?.employee.id, 'b');
  assert.equal(findBestFaceMatch(staff, face(personAt(40))), null, 'stranger');
  const lookAlike = employee([face(personAt(0, 0.05))], 'a2');
  assert.equal(findBestFaceMatch([...staff, lookAlike], face(personAt(0, 0.02))), null, 'too close to call');
  assert.equal(findBestFaceMatch(staff, face(personAt(0)), undefined, { excludeEmployeeIds: ['a'] }), null, 'already matched to another face');
});
