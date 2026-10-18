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

const LOW_CONFIDENCE_BIOMETRIC_PERCENT = 25;

// Face distances and DigitalPersona dissimilarity scores are both "lower is better" against an acceptance
// threshold, so strength is how far below the threshold the accepted match landed.
// `strongScore` is the distance that counts as a 100% match (face embeddings never reach 0).
function biometricMatchEvidence(kind, score, threshold, lowConfidencePercent = LOW_CONFIDENCE_BIOMETRIC_PERCENT, strongScore = 0) {
  if (!Number.isFinite(score) || !Number.isFinite(threshold) || threshold <= strongScore) return null;
  const strengthPercent = Math.max(0, Math.min(100, Math.round(((threshold - score) / (threshold - strongScore)) * 100)));
  return { kind, score, threshold, strengthPercent, lowConfidence: strengthPercent < lowConfidencePercent };
}

module.exports = { DEFAULT_SHIFT, LOW_CONFIDENCE_BIOMETRIC_PERCENT, biometricMatchEvidence, evaluateAttendanceTimes };
