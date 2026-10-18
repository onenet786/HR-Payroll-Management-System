import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, evaluateBranchGeofence, validateLocationEvidence } from './geofence';

test('distance and branch-radius decisions are deterministic', () => {
  assert.equal(distanceMeters(24.8607, 67.0011, 24.8607, 67.0011), 0);
  const result = evaluateBranchGeofence({ id:'b', companyId:'c', name:'HQ', city:'Karachi', province:'Sindh', address:'', geofenceLatitude:24.8607, geofenceLongitude:67.0011, geofenceRadiusMeters:100 }, { latitude:24.8607, longitude:67.0011, accuracyMeters:10, capturedAt:'2026-10-15T00:00:00Z', source:'device-gps' });
  assert.equal(result.inside, true);
});

test('stale, inaccurate and future location evidence is rejected', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const base = { latitude:24.86, longitude:67.0, accuracyMeters:20, capturedAt:'2026-10-15T11:59:00Z', source:'device-gps' as const };
  assert.equal(validateLocationEvidence(base, now), undefined);
  assert.match(validateLocationEvidence({ ...base, accuracyMeters:101 }, now) || '', /accuracy/);
  assert.match(validateLocationEvidence({ ...base, capturedAt:'2026-10-15T11:50:00Z' }, now) || '', /older/);
  assert.match(validateLocationEvidence({ ...base, capturedAt:'2026-10-15T12:02:00Z' }, now) || '', /future/);
});
