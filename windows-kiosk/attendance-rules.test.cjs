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
