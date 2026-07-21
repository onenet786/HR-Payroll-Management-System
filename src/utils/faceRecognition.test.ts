import test from 'node:test';
import assert from 'node:assert/strict';
import type { Employee } from '../types';
import { getFaceDescriptors } from './faceRecognition';

const vector = Array.from({ length: 1280 }, () => 0);
const employee = (faceDescriptors: Employee['faceDescriptors']): Employee => ({ id: 'e1', fullName: 'Test Employee', employeeCode: 'E-1', status: 'Active', faceDescriptors } as Employee);
const validLiveness = () => ({ method: 'active-turn-v1' as const, verifiedAt: new Date().toISOString(), summary: { order: ['left', 'right'] as ['left', 'right'], durationMs: 1800, frameCounts: [3, 3, 3, 3, 3] as [number, number, number, number, number], maxLeftYaw: .35, maxRightYaw: .36, maxCenterDrift: .02, maxScaleChange: .05 } });

test('legacy v1 and v2 descriptors are excluded from authentication', () => {
  assert.equal(getFaceDescriptors(employee([
    { version: 1, vector, capturedAt: new Date().toISOString() },
    { version: 2, vector, capturedAt: new Date().toISOString() },
  ])).length, 0);
});

test('missing or forged liveness attestation is excluded', () => {
  assert.equal(getFaceDescriptors(employee([{ version: 3, vector, capturedAt: new Date().toISOString() }])).length, 0);
  assert.equal(getFaceDescriptors(employee([{ version: 3, vector, capturedAt: new Date().toISOString(), liveness: { ...validLiveness(), verifiedAt: 'invalid' } }])).length, 0);
});

test('valid attested v3 descriptor is accepted', () => {
  assert.equal(getFaceDescriptors(employee([{ version: 3, vector, capturedAt: new Date().toISOString(), liveness: validLiveness() }])).length, 1);
});

test('incomplete and implausible v3 attestations are excluded', () => {
  const invalidSummaries = [
    { ...validLiveness().summary, frameCounts: [] },
    { ...validLiveness().summary, frameCounts: [3, 3, 3, 3] },
    { ...validLiveness().summary, frameCounts: [3, 3, 3, 3, 3, 3] },
    { ...validLiveness().summary, order: ['left', 'left'] },
    { ...validLiveness().summary, order: ['up', 'right'] },
    { ...validLiveness().summary, durationMs: 0 },
    { ...validLiveness().summary, durationMs: 25_001 },
    { ...validLiveness().summary, maxLeftYaw: .1 },
    { ...validLiveness().summary, maxCenterDrift: .2 },
    { ...validLiveness().summary, maxScaleChange: .5 },
  ];
  for (const summary of invalidSummaries) {
    const record = { version: 3, vector, capturedAt: new Date().toISOString(), liveness: { ...validLiveness(), summary } } as any;
    assert.equal(getFaceDescriptors(employee([record])).length, 0);
  }
});
