'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isReturnableOutReason,
  canReturnFromTemporaryExit,
  resumeFromTemporaryExit,
} = require('./attendance-state.cjs');

const terminal = { id: 'KIOSK-1', location: 'Main Gate' };

test('temporary exits are returnable but shift-closing exits are not', () => {
  assert.equal(isReturnableOutReason('Tea Break'), true);
  assert.equal(isReturnableOutReason('Lunch Break'), true);
  assert.equal(isReturnableOutReason('Prayer'), true);
  assert.equal(isReturnableOutReason('Official Duty'), true);
  assert.equal(isReturnableOutReason('Client Meeting'), true);
  assert.equal(isReturnableOutReason('Site Visit'), true);
  assert.equal(isReturnableOutReason('Personal Work'), true);
  assert.equal(isReturnableOutReason('Medical Appointment'), true);
  assert.equal(isReturnableOutReason('End of Shift'), false);
  assert.equal(isReturnableOutReason('Emergency Leave'), false);
  assert.equal(isReturnableOutReason('Half-Day Leave'), false);
  assert.equal(isReturnableOutReason('Sick Leave'), false);
});

test('returning from tea preserves the break and reopens the daily attendance', () => {
  const existing = {
    id: 'att-1',
    punchIn: '16:14:36',
    punchOut: '19:24:18',
    outReason: 'Tea Break',
    method: 'Camera',
  };

  assert.equal(canReturnFromTemporaryExit(existing), true);
  const resumed = resumeFromTemporaryExit(existing, {
    at: '19:35:00',
    method: 'Biometric',
    terminal,
    evidenceId: 'evidence-return',
  });

  assert.equal(resumed.breakReason, 'Tea Break');
  assert.equal(resumed.log.punchIn, '16:14:36');
  assert.equal(resumed.log.punchOut, '');
  assert.equal(resumed.log.outReason, '');
  assert.equal(resumed.log.lastPunchAt, '19:35:00');
  assert.deepEqual(resumed.log.breaks, [{
    reason: 'Tea Break',
    outAt: '19:24:18',
    returnAt: '19:35:00',
    outMethod: 'Camera',
    returnMethod: 'Biometric',
    terminalId: 'KIOSK-1',
    terminalLocation: 'Main Gate',
  }]);
});

test('multiple temporary exits append to break history', () => {
  const existing = {
    id: 'att-1',
    punchIn: '09:00:00',
    punchOut: '15:00:00',
    outReason: 'Prayer',
    method: 'Biometric',
    breaks: [{ reason: 'Tea Break', outAt: '11:00:00', returnAt: '11:12:00' }],
  };
  const resumed = resumeFromTemporaryExit(existing, {
    at: '15:15:00',
    method: 'Camera',
    terminal,
    evidenceId: '',
  });
  assert.equal(resumed.log.breaks.length, 2);
  assert.equal(resumed.log.breaks[1].reason, 'Prayer');
});
