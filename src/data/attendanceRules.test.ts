import test from 'node:test';
import assert from 'node:assert/strict';
import { countScheduledWorkingDays, effectiveShiftForDate, evaluateAttendanceTimes } from './attendanceRules';
import type { Shift } from '../types';

const day: Shift = { id: 'd', name: 'Day', startTime: '09:00', endTime: '17:00', graceMinutes: 15, halfDayMinutes: 120, overtimeMultiplier: 2, breakMinutes: 60, workingDays: [1,2,3,4,5,6] };

test('shift grace, half day, breaks and overtime are calculated consistently', () => {
  assert.equal(evaluateAttendanceTimes('09:15:00', undefined, day).status, 'Present');
  assert.equal(evaluateAttendanceTimes('09:16:00', undefined, day).status, 'Late');
  assert.equal(evaluateAttendanceTimes('11:00:00', undefined, day).status, 'Half Day');
  const result = evaluateAttendanceTimes('09:00:00', '19:00:00', day, [{ reason: 'Lunch', outAt: '13:00:00', returnAt: '14:00:00' }]);
  assert.equal(result.workedMinutes, 540);
  assert.equal(result.overtimeMinutes, 120);
});

test('overnight shifts cross midnight without producing negative time', () => {
  const night = { ...day, startTime: '20:00', endTime: '04:00', breakMinutes: 0 };
  const result = evaluateAttendanceTimes('20:00:00', '05:00:00', night);
  assert.equal(result.workedMinutes, 540);
  assert.equal(result.overtimeMinutes, 60);
});

test('scheduled days exclude weekly rest days and holidays', () => {
  const total = countScheduledWorkingDays(2026, 10, day, [{ id: 'h', name: 'Holiday', date: '2026-10-03', type: 'Public', isRecurring: false }]);
  assert.equal(total, 26);
});

test('uses configured Ramadan hours only inside the configured date range', () => {
  const ramadan = { ...day, ramadanStartDate: '2026-02-18', ramadanEndDate: '2026-03-19', ramadanStartTime: '08:30', ramadanEndTime: '15:30' };
  assert.equal(effectiveShiftForDate(ramadan, '2026-03-01').startTime, '08:30');
  assert.equal(effectiveShiftForDate(ramadan, '2026-04-01').startTime, '09:00');
  assert.equal(evaluateAttendanceTimes('09:10:00', undefined, ramadan, [], '2026-03-01').status, 'Late');
  assert.equal(evaluateAttendanceTimes('09:10:00', undefined, ramadan, [], '2026-04-01').status, 'Present');
});

test('uses a Friday shift override without changing weekday or Ramadan schedules', () => {
  const friday = { ...day, fridayStartTime: '10:00', fridayEndTime: '16:00' };
  assert.equal(effectiveShiftForDate(friday, '2026-10-16').startTime, '10:00');
  assert.equal(effectiveShiftForDate(friday, '2026-10-15').startTime, '09:00');
});
