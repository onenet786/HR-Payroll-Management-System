const DEFAULT_SHIFT = Object.freeze({ startTime: '09:00', endTime: '17:00', graceMinutes: 15, halfDayMinutes: 120, breakMinutes: 0, overtimeAfterMinutes: 480 });

function timeMinutes(value) {
  if (!value || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return undefined;
  const [hours, minutes] = value.split(':').map(Number);
  return hours > 23 || minutes > 59 ? undefined : hours * 60 + minutes;
}
const elapsed = (start, end) => end >= start ? end - start : end + 1440 - start;

function completedBreakMinutes(breaks = []) {
  return breaks.reduce((total, item) => {
    const start = timeMinutes(item.outAt);
    const end = timeMinutes(item.returnAt);
    return start === undefined || end === undefined ? total : total + elapsed(start, end);
  }, 0);
}

function evaluateAttendanceTimes(punchIn, punchOut, configuredShift, breaks = []) {
  const shift = { ...DEFAULT_SHIFT, ...(configuredShift || {}) };
  const start = timeMinutes(shift.startTime);
  const end = timeMinutes(shift.endTime);
  const input = timeMinutes(punchIn);
  const output = timeMinutes(punchOut);
  if (input === undefined) return { status: 'Absent', overtimeMinutes: 0, workedMinutes: 0 };
  const lateBy = elapsed(start, input);
  const status = lateBy > 720 || lateBy <= shift.graceMinutes ? 'Present' : lateBy >= shift.halfDayMinutes ? 'Half Day' : 'Late';
  if (output === undefined) return { status, overtimeMinutes: 0, workedMinutes: 0 };
  const breakDeduction = Math.max(completedBreakMinutes(breaks), shift.breakMinutes || 0);
  const workedMinutes = Math.max(0, elapsed(input, output) - breakDeduction);
  const scheduledMinutes = elapsed(start, end) - (shift.breakMinutes || 0);
  return { status, workedMinutes, overtimeMinutes: Math.max(0, workedMinutes - (shift.overtimeAfterMinutes ?? scheduledMinutes)) };
}

module.exports = { DEFAULT_SHIFT, evaluateAttendanceTimes };
