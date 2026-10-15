import type { AttendanceLocation, Branch } from '../types';

export type GeofenceResult = { configured: boolean; inside: boolean; distanceMeters?: number; reason?: string };

export function distanceMeters(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const deltaLatitude = radians(latitudeB - latitudeA);
  const deltaLongitude = radians(longitudeB - longitudeA);
  const value = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

export function validateLocationEvidence(location: AttendanceLocation, now = Date.now()): string | undefined {
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) return 'Invalid latitude.';
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) return 'Invalid longitude.';
  if (!Number.isFinite(location.accuracyMeters) || location.accuracyMeters <= 0 || location.accuracyMeters > 100) return 'GPS accuracy must be within 100 metres.';
  const captured = Date.parse(location.capturedAt);
  if (!Number.isFinite(captured)) return 'GPS capture time is invalid.';
  if (captured > now + 60_000) return 'GPS capture time is in the future.';
  if (now - captured > 5 * 60_000) return 'GPS evidence is older than five minutes.';
  return undefined;
}

export function evaluateBranchGeofence(branch: Branch | undefined, location: AttendanceLocation): GeofenceResult {
  if (!branch || !Number.isFinite(branch.geofenceLatitude) || !Number.isFinite(branch.geofenceLongitude) || !Number.isFinite(branch.geofenceRadiusMeters) || (branch.geofenceRadiusMeters || 0) < 25) {
    return { configured: false, inside: false, reason: 'Branch geofence is not configured.' };
  }
  const distance = distanceMeters(location.latitude, location.longitude, branch.geofenceLatitude!, branch.geofenceLongitude!);
  return { configured: true, inside: distance <= branch.geofenceRadiusMeters!, distanceMeters: distance };
}
