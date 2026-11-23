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

/** Friday and Ramadan timings for one work date (YYYY-MM-DD); mirror of effectiveShiftForDate in src/data/attendanceRules.ts. */
function effectiveShiftForDate(shift, workDate) {
  const base = { ...DEFAULT_SHIFT, ...(shift || {}) };
  if (!workDate) return base;
  const inRamadan = !!(base.ramadanStartDate && base.ramadanEndDate && workDate >= base.ramadanStartDate && workDate <= base.ramadanEndDate);
  const dated = inRamadan ? { ...base, startTime: base.ramadanStartTime || base.startTime, endTime: base.ramadanEndTime || base.endTime } : base;
  const isFriday = new Date(`${workDate}T00:00:00`).getDay() === 5;
  return isFriday ? { ...dated, startTime: base.fridayStartTime || dated.startTime, endTime: base.fridayEndTime || dated.endTime } : dated;
}

/** Calendar date (YYYY-MM-DD) in the kiosk's own time zone; toISOString() is UTC and lags Pakistan by 5 hours. */
function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function previousDateString(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return localDateString(new Date(year, month - 1, day - 1));
}

/** A shift whose end is before its start (e.g. 20:00-04:00) ends on the next calendar day. */
function crossesMidnight(shift) {
  const start = timeMinutes(shift && shift.startTime);
  const end = timeMinutes(shift && shift.endTime);
  return start !== undefined && end !== undefined && end < start;
}

/**
 * The attendance record a punch belongs to: today's record, or - for a night shift that crosses midnight - the
 * still-open record of yesterday's shift when the punch comes before today's shift begins. "Open" means punched in
 * and not out, or out on a temporary exit (isAwayOnBreak). Anything else starts today's record as before.
 */
function findAttendanceLogForPunch(logs, employeeId, today, at, shift, isAwayOnBreak = () => false) {
  const mine = (logs || []).filter(log => log && log.employeeId === employeeId);
  const todayLog = mine.find(log => log.date === today);
  if (todayLog) return todayLog;
  const yesterday = previousDateString(today);
  const yesterdayShift = effectiveShiftForDate(shift, yesterday);
  if (!crossesMidnight(yesterdayShift)) return undefined;
  const now = timeMinutes(at);
  const todayStart = timeMinutes(effectiveShiftForDate(shift, today).startTime);
  if (now === undefined || todayStart === undefined || now >= todayStart) return undefined;
  const yesterdayStart = timeMinutes(yesterdayShift.startTime);
  // A record closed after midnight is also returned, so a repeat scan is refused instead of opening a new day.
  const closedAfterMidnight = log => { const out = timeMinutes(log.punchOut); return out !== undefined && out < yesterdayStart; };
  return mine.find(log => log.date === yesterday && log.punchIn && (!log.punchOut || isAwayOnBreak(log) || closedAfterMidnight(log))) || undefined;
}

function evaluateAttendanceTimes(punchIn, punchOut, configuredShift, breaks = [], context = {}) {
  // context.workDate applies the Friday / Ramadan timings of that date.
  const shift = effectiveShiftForDate(configuredShift, context.workDate);
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
  effectiveShiftForDate, localDateString, previousDateString, crossesMidnight, findAttendanceLogForPunch,
};
