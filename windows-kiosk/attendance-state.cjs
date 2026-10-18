'use strict';

const RETURNABLE_OUT_REASONS = new Set([
  'Lunch Break',
  'Tea Break',
  'Official Duty',
  'Client Meeting',
  'Site Visit',
  'Personal Work',
  'Medical Appointment',
  'Prayer',
]);

function isReturnableOutReason(reason) {
  return RETURNABLE_OUT_REASONS.has(String(reason || '').trim());
}

function canReturnFromTemporaryExit(log) {
  return !!(log?.punchIn && log?.punchOut && isReturnableOutReason(log.outReason));
}

function resumeFromTemporaryExit(existingLog, { at, method, terminal, evidenceId }) {
  if (!canReturnFromTemporaryExit(existingLog)) {
    throw new Error('Attendance is not waiting for a return from a temporary exit.');
  }

  const breakReason = String(existingLog.outReason).trim();
  const completedBreak = {
    reason: breakReason,
    outAt: existingLog.punchOut,
    returnAt: at,
    outMethod: existingLog.method || '',
    returnMethod: method,
    terminalId: terminal.id,
    terminalLocation: terminal.location,
  };

  return {
    breakReason,
    log: {
      ...existingLog,
      punchOut: '',
      outReason: '',
      breaks: [...(Array.isArray(existingLog.breaks) ? existingLog.breaks : []), completedBreak],
      lastPunchAt: at,
      method,
      terminalId: terminal.id,
      terminalLocation: terminal.location,
      evidenceId: evidenceId || existingLog.evidenceId || '',
    },
  };
}

module.exports = {
  RETURNABLE_OUT_REASONS,
  isReturnableOutReason,
  canReturnFromTemporaryExit,
  resumeFromTemporaryExit,
};
