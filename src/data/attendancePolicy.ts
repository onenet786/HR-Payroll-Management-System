import type { AttendanceBreak, AttendancePolicy, Branch, CompanyOptions, LateFineBand, Shift, StatutoryConfig } from '../types';
import { DEFAULT_SHIFT, completedBreakMinutes, type AttendanceEvaluationContext } from './attendanceRules';

/**
 * Company attendance policy ("APMS rules"): late fines by escalating bands, half day from a fixed minute,
 * absent days costing more than a day, leave marked first and absences decided by HR, duty-off before half
 * time counted as leave, and a personal-out allowance per day. Everything is optional: with no policy the
 * shift rules and one-day absences apply exactly as before.
 *
 * windows-kiosk/attendance-rules.cjs mirrors the parts the kiosk needs (opening time, grace, half day, cutoff).
 */

/** Exit reasons shown on the kiosk: the first two are temporary exits, "Duty Off" ends the day. */
export const KIOSK_OUT_REASONS = ['Duty Off', 'Personal Out', 'Office Work'] as const;
/** Exits on company business never count against the personal allowance or the worked time. */
export const OFFICIAL_BREAK_REASONS = ['Office Work', 'Official Duty', 'Client Meeting', 'Site Visit'];

export const APMS_ATTENDANCE_POLICY: AttendancePolicy = {
  lateGraceMinutes: 10,
  halfDayAfterMinutes: 20,
  lateFineBands: [
    { uptoLateDays: 5, finePerDay: 100 }, { uptoLateDays: 10, finePerDay: 150 }, { uptoLateDays: 15, finePerDay: 200 },
    { uptoLateDays: 20, finePerDay: 250 }, { uptoLateDays: 25, finePerDay: 300 }, { uptoLateDays: 31, finePerDay: 350 },
  ],
  absentDeductionDays: 1.5,
  noPunchDayStatus: 'Unpaid Leave',
  dutyOffBeforeHalfTimeIsLeave: true,
  defaultHalfTimeCutoff: '18:00',
  defaultPersonalOutAllowanceMinutes: 50,
  earlyComingRewardPerDay: 0,
  earlyComingMinutes: 0,
};

/** The company preset switches every optional feature on; a fresh installation has them all off. */
export const APMS_COMPANY_OPTIONS: CompanyOptions = {
  kioskThreeExitButtons: true,
  officialExitsNotDeducted: true,
  salaryPaymentRegister: true,
  extendedPayComponents: true,
  registerShowsPosition: true,
};

export const attendancePolicyOf = (config?: Pick<StatutoryConfig, 'attendancePolicy'> | null): AttendancePolicy => config?.attendancePolicy || {};
export const companyOptionsOf = (config?: Pick<StatutoryConfig, 'companyOptions'> | null): CompanyOptions => config?.companyOptions || {};

/** Total fine for `lateDays` late days: day k pays the band whose `uptoLateDays` is the first ≥ k; beyond the last band the last fine repeats. */
export function lateFineForLateDays(bands: LateFineBand[] | undefined, lateDays: number): number {
  const sorted = (bands || []).filter(band => band.uptoLateDays > 0 && band.finePerDay >= 0).slice().sort((a, b) => a.uptoLateDays - b.uptoLateDays);
  if (!sorted.length || lateDays <= 0) return 0;
  let total = 0;
  for (let day = 1; day <= lateDays; day += 1) {
    const band = sorted.find(item => day <= item.uptoLateDays) || sorted[sorted.length - 1];
    total += band.finePerDay;
  }
  return Math.round(total);
}

/** The shift payroll and the kiosk evaluate against: branch opening time plus policy grace / half-day minutes. */
export function policyShift(shift: Shift | undefined, branch: Pick<Branch, 'openingTime'> | undefined, policy: AttendancePolicy): Shift | undefined {
  const overrides = {
    ...(branch?.openingTime && { startTime: branch.openingTime }),
    ...(policy.lateGraceMinutes !== undefined && { graceMinutes: policy.lateGraceMinutes }),
    ...(policy.halfDayAfterMinutes !== undefined && { halfDayMinutes: policy.halfDayAfterMinutes }),
  };
  if (!Object.keys(overrides).length) return shift;
  return { ...(shift || DEFAULT_SHIFT), ...overrides };
}

export function halfTimeCutoffFor(branch: Pick<Branch, 'halfTimeCutoff'> | undefined, policy: AttendancePolicy): string | undefined {
  if (!policy.dutyOffBeforeHalfTimeIsLeave) return undefined;
  return branch?.halfTimeCutoff || policy.defaultHalfTimeCutoff || undefined;
}

export function personalOutAllowanceFor(branch: Pick<Branch, 'personalOutAllowanceMinutes'> | undefined, policy: AttendancePolicy): number | undefined {
  const minutes = branch?.personalOutAllowanceMinutes ?? policy.defaultPersonalOutAllowanceMinutes;
  return Number.isFinite(minutes) && (minutes as number) > 0 ? minutes : undefined;
}

export const isOfficialBreak = (reason?: string) => OFFICIAL_BREAK_REASONS.some(item => item.toLowerCase() === String(reason || '').trim().toLowerCase());

/** Completed personal (non-official) exit minutes of the day. */
export function personalOutMinutes(breaks: AttendanceBreak[] = []): number {
  return completedBreakMinutes(breaks.filter(item => !isOfficialBreak(item.reason)));
}

/** What evaluateAttendanceTimes needs to apply the policy to one record. Without options and policy it is empty (old behaviour). */
export function evaluationContext(policy: AttendancePolicy, branch: Branch | undefined, outReason?: string, options: CompanyOptions = {}): AttendanceEvaluationContext {
  const finalExit = String(outReason || '').trim().toLowerCase() === 'duty off';
  return {
    ...(options.officialExitsNotDeducted && { excludedBreakReasons: OFFICIAL_BREAK_REASONS }),
    leaveIfOutBefore: finalExit ? halfTimeCutoffFor(branch, policy) : undefined,
  };
}
