const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAttendanceTimes } = require('./attendance-rules.cjs');

test('kiosk rules support employee grace and overnight overtime', () => {
  const shift = { startTime: '20:00', endTime: '04:00', graceMinutes: 10, halfDayMinutes: 120, breakMinutes: 0 };
  assert.equal(evaluateAttendanceTimes('20:11:00', undefined, shift).status, 'Late');
  const result = evaluateAttendanceTimes('20:00:00', '05:00:00', shift);
  assert.equal(result.workedMinutes, 540);
  assert.equal(result.overtimeMinutes, 60);
});

test('biometric match evidence reports strength below the acceptance threshold', () => {
  const { biometricMatchEvidence } = require('./attendance-rules.cjs');
  assert.deepEqual(biometricMatchEvidence('face', 0.2, 0.25), { kind: 'face', score: 0.2, threshold: 0.25, strengthPercent: 20, lowConfidence: true });
  assert.equal(biometricMatchEvidence('fingerprint', 100, 2147).lowConfidence, false);
  assert.equal(biometricMatchEvidence('face', Number.NaN, 0.25), null);
});

test('an 85% review cutoff reproduces the workflow diagram rule', () => {
  const { biometricMatchEvidence } = require('./attendance-rules.cjs');
  assert.equal(biometricMatchEvidence('face', 0.03, 0.23, 85).lowConfidence, false, '87% strength is accepted outright');
  assert.equal(biometricMatchEvidence('face', 0.06, 0.23, 85).lowConfidence, true, '74% strength goes to supervisor review');
});

test('company policy: opening time, office-work exits and duty-off cutoff are applied at the kiosk', () => {
  const { policyShift, halfTimeCutoffFor, OFFICIAL_BREAK_REASONS, KIOSK_OUT_REASONS, personalOutMinutes } = require('./attendance-rules.cjs');
  const policy = { lateGraceMinutes: 10, halfDayAfterMinutes: 20, dutyOffBeforeHalfTimeIsLeave: true, defaultHalfTimeCutoff: '18:00' };
  const branch = { openingTime: '11:00', halfTimeCutoff: '17:30' };
  const shift = policyShift({ startTime: '09:00', endTime: '18:00', graceMinutes: 15, halfDayMinutes: 120 }, branch, policy);
  assert.deepEqual(KIOSK_OUT_REASONS, ['Duty Off', 'Personal Out', 'Office Work']);
  assert.equal(evaluateAttendanceTimes('11:10:00', undefined, shift).status, 'Present');
  assert.equal(evaluateAttendanceTimes('11:11:00', undefined, shift).status, 'Late');
  assert.equal(evaluateAttendanceTimes('11:21:00', undefined, shift).status, 'Half Day');
  const breaks = [{ reason: 'Office Work', outAt: '12:00:00', returnAt: '13:00:00' }, { reason: 'Personal Out', outAt: '15:00:00', returnAt: '15:20:00' }];
  const worked = evaluateAttendanceTimes('11:00:00', '19:00:00', shift, breaks, { excludedBreakReasons: OFFICIAL_BREAK_REASONS });
  assert.equal(worked.workedMinutes, 8 * 60 - 20, 'office work is not deducted');
  assert.equal(personalOutMinutes(breaks), 20);
  const early = evaluateAttendanceTimes('11:00:00', '17:00:00', shift, [], { leaveIfOutBefore: halfTimeCutoffFor(branch, policy) });
  assert.equal(early.status, 'On Leave');
  assert.equal(early.policyLeave, true);
  assert.equal(evaluateAttendanceTimes('11:00:00', '17:30:00', shift, [], { leaveIfOutBefore: halfTimeCutoffFor(branch, policy) }).status, 'Present');
});
