// Mirror of src/data/attendanceRules.ts (evaluation) and the kiosk-relevant parts of src/data/attendancePolicy.ts.
const DEFAULT_SHIFT = Object.freeze({ startTime: '09:00', endTime: '17:00', graceMinutes: 15, halfDayMinutes: 120, breakMinutes: 0, overtimeAfterMinutes: 480 });

// Exit reasons offered on the kiosk; the first two are temporary exits, "Duty Off" ends the day.
const KIOSK_OUT_REASONS = Object.freeze(['Duty Off', 'Personal Out', 'Office Work']);
// Exits on company business are not deducted from worked time and do not use the personal allowance.
const OFFICIAL_BREAK_REASONS = Object.freeze(['Office Work', 'Official Duty', 'Client Meeting', 'Site Visit']);
const isOfficialBreak = reason => OFFICIAL_BREAK_REASONS.some(item => item.toLowerCase() === String(reason || '').trim().toLowerCase());

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

function personalOutMinutes(breaks = []) {
  return completedBreakMinutes((breaks || []).filter(item => !isOfficialBreak(item.reason)));
}

/** The shift the kiosk evaluates against: branch opening time plus policy grace / half-day minutes. */
function policyShift(shift, branch, policy) {
  const overrides = {};
  if (branch && branch.openingTime) overrides.startTime = branch.openingTime;
  if (policy && Number.isFinite(policy.lateGraceMinutes)) overrides.graceMinutes = policy.lateGraceMinutes;
  if (policy && Number.isFinite(policy.halfDayAfterMinutes)) overrides.halfDayMinutes = policy.halfDayAfterMinutes;
  return { ...DEFAULT_SHIFT, ...(shift || {}), ...overrides };
}

function halfTimeCutoffFor(branch, policy) {
  if (!policy || !policy.dutyOffBeforeHalfTimeIsLeave) return undefined;
  return (branch && branch.halfTimeCutoff) || policy.defaultHalfTimeCutoff || undefined;
}

function personalOutAllowanceFor(branch, policy) {
  const minutes = branch && Number.isFinite(branch.personalOutAllowanceMinutes) ? branch.personalOutAllowanceMinutes : policy && policy.defaultPersonalOutAllowanceMinutes;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : undefined;
}

function evaluateAttendanceTimes(punchIn, punchOut, configuredShift, breaks = [], context = {}) {
  const shift = { ...DEFAULT_SHIFT, ...(configuredShift || {}) };
  const start = timeMinutes(shift.startTime);
  const end = timeMinutes(shift.endTime);
  const input = timeMinutes(punchIn);
  const output = timeMinutes(punchOut);
  if (input === undefined) return { status: 'Absent', overtimeMinutes: 0, workedMinutes: 0 };
  const lateBy = elapsed(start, input);
  const isPlausiblyEarly = lateBy > 720;
  const status = isPlausiblyEarly || lateBy <= shift.graceMinutes ? 'Present' : lateBy >= shift.halfDayMinutes ? 'Half Day' : 'Late';
  if (output === undefined) return { status, overtimeMinutes: 0, workedMinutes: 0 };
  const excluded = new Set((context.excludedBreakReasons || []).map(reason => reason.toLowerCase()));
  const recordedBreaks = completedBreakMinutes((breaks || []).filter(item => !excluded.has(String(item.reason || '').trim().toLowerCase())));
  const breakDeduction = Math.max(recordedBreaks, shift.breakMinutes || 0);
  const workedMinutes = Math.max(0, elapsed(input, output) - breakDeduction);
  const scheduledMinutes = elapsed(start, end) - (shift.breakMinutes || 0);
  const cutoff = timeMinutes(context.leaveIfOutBefore);
  // Leaving for the day before the branch half time is a leave, not a worked day (company policy).
  if (cutoff !== undefined && output < cutoff && !isPlausiblyEarly) return { status: 'On Leave', workedMinutes, overtimeMinutes: 0, policyLeave: true };
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

module.exports = {
  DEFAULT_SHIFT, KIOSK_OUT_REASONS, OFFICIAL_BREAK_REASONS, LOW_CONFIDENCE_BIOMETRIC_PERCENT,
  biometricMatchEvidence, evaluateAttendanceTimes, completedBreakMinutes, personalOutMinutes, isOfficialBreak,
  policyShift, halfTimeCutoffFor, personalOutAllowanceFor,
};
