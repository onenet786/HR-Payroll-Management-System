import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttendancePeriod, findAttendanceLockIssues, isAttendancePeriodValid } from './attendancePeriod';
import type { AttendanceLog, Employee } from '../types';

const record = (overrides: Partial<AttendanceLog> = {}): AttendanceLog => ({
  id: 'a1', employeeId: 'e1', date: '2026-10-01', punchIn: '09:00:00', punchOut: '17:00:00',
  method: 'Biometric', status: 'Present', overtimeMinutes: 0, ...overrides,
});

test('period lock rejects pending manual records and missing punch-out', () => {
  const records = [record({ method: 'Manual', regularizationRequested: true }), record({ id: 'a2', punchOut: undefined })];
  assert.equal(findAttendanceLockIssues(records, 10, 2026).length, 3);
  assert.throws(() => createAttendancePeriod(records, [] as Employee[], 10, 2026, 'admin'), /cannot be locked/);
});

test('locked period becomes invalid when attendance evidence changes', () => {
  const records = [record()];
  const period = createAttendancePeriod(records, [] as Employee[], 10, 2026, 'admin', '2026-11-01T00:00:00.000Z');
  assert.equal(isAttendancePeriodValid(period, records), true);
  assert.equal(isAttendancePeriodValid(period, [record({ punchOut: '18:00:00' })]), false);
});
