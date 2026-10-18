import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttendanceRegister, createAttendancePeriod, findAttendanceLockIssues, isAttendancePeriodValid } from './attendancePeriod';
import type { AttendanceLog, Employee } from '../types';

const record = (overrides: Partial<AttendanceLog> = {}): AttendanceLog => ({
  id: 'a1', employeeId: 'e1', date: '2026-10-01', punchIn: '09:00:00', punchOut: '17:00:00',
  method: 'Biometric', status: 'Present', overtimeMinutes: 0, ...overrides,
});

test('period lock rejects pending manual records and missing punch-out', () => {
  const records = [record({ method: 'Manual', regularizationRequested: true }), record({ id: 'a2', punchOut: undefined })];
  assert.equal(findAttendanceLockIssues(records, 10, 2026).length, 3);
  assert.throws(() => createAttendancePeriod(records, [] as Employee[], [], [], 10, 2026, 'admin'), /cannot be locked/);
});

test('locked period becomes invalid when attendance evidence changes', () => {
  const records = [record()];
  const period = createAttendancePeriod(records, [] as Employee[], [], [], 10, 2026, 'admin', '2026-11-01T00:00:00.000Z');
  assert.equal(isAttendancePeriodValid(period, records), true);
  assert.equal(isAttendancePeriodValid(period, [record({ punchOut: '18:00:00' })]), false);
});

test('certified register creates explicit employee-day statuses', () => {
  const employee = { id: 'e1', status: 'Active', dateOfJoining: '2026-01-01', shift: { workingDays: [1, 2, 3, 4, 5, 6] } } as Employee;
  const rows = buildAttendanceRegister([record()], [employee], [{ employeeId: 'e1', status: 'Approved', leaveType: 'Casual', startDate: '2026-10-02', endDate: '2026-10-02' } as any], [{ date: '2026-10-03' } as any], 10, 2026);
  assert.equal(rows.find(row => row.date === '2026-10-01')?.status, 'Present');
  assert.equal(rows.find(row => row.date === '2026-10-02')?.status, 'Paid Leave');
  assert.equal(rows.find(row => row.date === '2026-10-03')?.status, 'Holiday');
  assert.equal(rows.find(row => row.date === '2026-10-04')?.status, 'Weekly Off');
});

test('an "On Leave" entry on approved unpaid leave stays unpaid in the register', () => {
  const employee = { id: 'e1', status: 'Active', dateOfJoining: '2025-01-01' } as Employee;
  const onLeave = record({ id: 'att-auto-leave-l1-2026-10-05', date: '2026-10-05', punchIn: undefined, punchOut: undefined, method: 'Manual', status: 'On Leave', regularizationApproved: true, leaveRequestId: 'l1' });
  const leave = (leaveType: 'Unpaid' | 'Casual') => [{ id: 'l1', employeeId: 'e1', leaveType, startDate: '2026-10-05', endDate: '2026-10-05', totalDays: 1, reason: 'x', status: 'Approved', appliedOn: '2026-10-01' }] as never;
  const statusOn = (leaveType: 'Unpaid' | 'Casual') => buildAttendanceRegister([onLeave], [employee], leave(leaveType), [], 10, 2026).find(row => row.date === '2026-10-05')!.status;
  assert.equal(statusOn('Unpaid'), 'Unpaid Leave');
  assert.equal(statusOn('Casual'), 'Paid Leave');
  assert.equal(findAttendanceLockIssues([onLeave], 10, 2026).length, 0, 'an approved leave day does not block the lock');
});

test('a day whose missing punch-out was reviewed and rejected no longer blocks the lock', () => {
  const employee = { id: 'e1', status: 'Active', dateOfJoining: '2025-01-01' } as Employee;
  const open = record({ id: 'm1', date: '2026-10-06', punchOut: undefined });
  assert.equal(findAttendanceLockIssues([open], 10, 2026).length, 1);
  const rejected = { ...open, regularizationRequested: true, regularizationApproved: false, status: 'Absent' as const };
  assert.equal(findAttendanceLockIssues([rejected], 10, 2026).length, 0);
  assert.equal(buildAttendanceRegister([rejected], [employee], [], [], 10, 2026).find(row => row.date === '2026-10-06')!.status, 'Absent');
});

test('a month still in progress cannot be locked', () => {
  const records = [record()];
  assert.throws(() => createAttendancePeriod(records, [] as Employee[], [], [], 10, 2026, 'admin', '2026-10-31T12:00:00.000Z'), /only after the month ends \(from 2026-11-01\)/);
  assert.throws(() => createAttendancePeriod(records, [] as Employee[], [], [], 10, 2026, 'admin', '2026-10-31T18:30:00.000Z'), /only after the month ends/, 'still 31 Oct 23:30 in Pakistan');
  assert.equal(createAttendancePeriod(records, [] as Employee[], [], [], 10, 2026, 'admin', '2026-10-31T19:30:00.000Z').status, 'Locked', '1 Nov 00:30 in Pakistan');
});
