import test from 'node:test';
import assert from 'node:assert/strict';
import { APMS_ATTENDANCE_POLICY, APMS_COMPANY_OPTIONS, evaluationContext, halfTimeCutoffFor, lateFineForLateDays, personalOutAllowanceFor, personalOutMinutes, policyShift } from './attendancePolicy';
import { evaluateAttendanceTimes } from './attendanceRules';
import type { Branch, Shift } from '../types';

const shift: Shift = { id: 's', name: 'Shop', startTime: '09:00', endTime: '18:00', graceMinutes: 15, halfDayMinutes: 120, overtimeMultiplier: 2, breakMinutes: 0, workingDays: [1, 2, 3, 4, 5, 6] };
const branch = { id: 'b', openingTime: '11:00', halfTimeCutoff: '17:30', personalOutAllowanceMinutes: 45 } as Branch;

test('late fine bands escalate with the number of late days in the month', () => {
  const bands = APMS_ATTENDANCE_POLICY.lateFineBands;
  assert.equal(lateFineForLateDays(bands, 0), 0);
  assert.equal(lateFineForLateDays(bands, 1), 100);
  assert.equal(lateFineForLateDays(bands, 5), 500);
  assert.equal(lateFineForLateDays(bands, 6), 650, 'sixth late day costs 150');
  assert.equal(lateFineForLateDays(bands, 11), 500 + 750 + 200);
  assert.equal(lateFineForLateDays(bands, 40), lateFineForLateDays(bands, 31) + 9 * 350, 'beyond the last band the last fine repeats');
  assert.equal(lateFineForLateDays(undefined, 10), 0, 'no bands, no fine');
});

test('branch opening time and policy minutes override the shift for late and half-day decisions', () => {
  const effective = policyShift(shift, branch, APMS_ATTENDANCE_POLICY)!;
  assert.equal(effective.startTime, '11:00');
  assert.equal(effective.graceMinutes, 10);
  assert.equal(effective.halfDayMinutes, 20);
  assert.equal(evaluateAttendanceTimes('11:10:00', undefined, effective).status, 'Present', '10th minute is still on time');
  assert.equal(evaluateAttendanceTimes('11:11:00', undefined, effective).status, 'Late', 'late from the 11th minute');
  assert.equal(evaluateAttendanceTimes('11:21:00', undefined, effective).status, 'Half Day', 'half day from the 21st minute');
  assert.equal(policyShift(shift, undefined, {}), shift, 'no policy and no branch timing keeps the shift untouched');
});

test('office work exits are not deducted from worked time while personal exits are', () => {
  const context = evaluationContext(APMS_ATTENDANCE_POLICY, branch, 'Duty Off', APMS_COMPANY_OPTIONS);
  assert.deepEqual(evaluationContext({}, undefined, 'Duty Off').excludedBreakReasons, undefined, 'option off: every exit is deducted as before');
  const breaks = [
    { reason: 'Office Work', outAt: '12:00:00', returnAt: '13:00:00' },
    { reason: 'Personal Out', outAt: '15:00:00', returnAt: '15:30:00' },
  ];
  const result = evaluateAttendanceTimes('11:00:00', '20:00:00', policyShift(shift, branch, APMS_ATTENDANCE_POLICY), breaks, undefined, context);
  assert.equal(result.status, 'Present');
  assert.equal(result.workedMinutes, 9 * 60 - 30, 'only the personal half hour is deducted');
  assert.equal(personalOutMinutes(breaks), 30);
  assert.equal(personalOutAllowanceFor(branch, APMS_ATTENDANCE_POLICY), 45);
  assert.equal(personalOutAllowanceFor(undefined, APMS_ATTENDANCE_POLICY), 50, 'policy default when the branch has none');
});

test('duty off before the branch half time turns the day into a leave with no fine or reward', () => {
  const effective = policyShift(shift, branch, APMS_ATTENDANCE_POLICY);
  const leave = evaluateAttendanceTimes('11:15:00', '17:00:00', effective, [], undefined, evaluationContext(APMS_ATTENDANCE_POLICY, branch, 'Duty Off'));
  assert.equal(leave.status, 'On Leave');
  assert.equal(leave.policyLeave, true);
  assert.equal(leave.overtimeMinutes, 0);
  const stayed = evaluateAttendanceTimes('11:15:00', '17:30:00', effective, [], undefined, evaluationContext(APMS_ATTENDANCE_POLICY, branch, 'Duty Off'));
  assert.equal(stayed.status, 'Late', 'leaving at the half time keeps the day');
  const personal = evaluateAttendanceTimes('11:15:00', '17:00:00', effective, [], undefined, evaluationContext(APMS_ATTENDANCE_POLICY, branch, 'Personal Out'));
  assert.equal(personal.status, 'Late', 'a temporary exit is not a duty off');
  assert.equal(halfTimeCutoffFor(undefined, APMS_ATTENDANCE_POLICY), '18:00', 'policy default half time');
  assert.equal(halfTimeCutoffFor(branch, {}), undefined, 'rule off: no cutoff');
});
