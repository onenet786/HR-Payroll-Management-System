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
