import type { AttendanceLog, Branch, Employee, StatutoryConfig, WageType } from '../types';
import { attendanceLocations, impossibleTravel } from './geofence';
import { employeeProvince, establishmentRule, provincialPolicy } from './provincialCompliance';
import { resolveWageBasis } from './masterData';

export type ComplianceSeverity = 'Critical' | 'Warning' | 'Info';
export type ComplianceCategory = 'Overtime' | 'Weekly rest' | 'Location' | 'Biometric' | 'Manual attendance' | 'Documents' | 'Registration' | 'Bank' | 'Minimum wage';

export interface ComplianceAlert {
  id: string;
  severity: ComplianceSeverity;
  category: ComplianceCategory;
  employeeId: string;
  employeeName: string;
  message: string;
  date?: string;
}

export const DEFAULT_MAX_WEEKLY_OVERTIME_HOURS = 12;
export const DEFAULT_MAX_CONSECUTIVE_WORK_DAYS = 6;
export const DEFAULT_LOW_CONFIDENCE_BIOMETRIC_PERCENT = 25;

const dayMs = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.ceil((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

// ISO-style week key (Monday start) so weekly limits do not depend on the payroll month boundary.
const weekKey = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  const monday = new Date(value.getTime() - ((value.getUTCDay() + 6) % 7) * dayMs);
  return isoDay(monday);
};

export interface ComplianceInputs {
  employees: Employee[];
  attendances: AttendanceLog[];
  branches?: Branch[];
  wageTypes?: WageType[];
  statConfig?: StatutoryConfig;
  today?: string;
  /** Only attendance on or after this date is scanned (defaults to 45 days before today). */
  sinceDate?: string;
}

export function complianceAlerts(inputs: ComplianceInputs): ComplianceAlert[] {
  const today = inputs.today || isoDay(new Date());
  const since = inputs.sinceDate || isoDay(new Date(Date.parse(`${today}T00:00:00Z`) - 45 * dayMs));
  const config = inputs.statConfig;
  const defaultMaxWeeklyOvertime = config?.maxWeeklyOvertimeHours ?? DEFAULT_MAX_WEEKLY_OVERTIME_HOURS;
  const defaultMaxConsecutive = config?.maxConsecutiveWorkDays ?? DEFAULT_MAX_CONSECUTIVE_WORK_DAYS;
  const lowConfidence = config?.lowConfidenceBiometricPercent ?? DEFAULT_LOW_CONFIDENCE_BIOMETRIC_PERCENT;
  const alerts: ComplianceAlert[] = [];
  const active = inputs.employees.filter(employee => employee.status !== 'Terminated');
  const byEmployee = new Map<string, AttendanceLog[]>();
  for (const log of inputs.attendances) {
    if (log.date < since || log.date > today) continue;
    byEmployee.set(log.employeeId, [...(byEmployee.get(log.employeeId) || []), log]);
  }

  for (const employee of active) {
    const add = (severity: ComplianceSeverity, category: ComplianceCategory, key: string, message: string, date?: string) =>
      alerts.push({ id: `${category}-${employee.id}-${key}`, severity, category, employeeId: employee.id, employeeName: employee.fullName, message, date });
    const logs = (byEmployee.get(employee.id) || []).slice().sort((left, right) => left.date.localeCompare(right.date));
    const site = inputs.branches?.find(branch => branch.id === employee.branchId);
    const rule = establishmentRule(config, site?.establishmentType);
    const maxWeeklyOvertime = rule.maxWeeklyOvertimeHours ?? defaultMaxWeeklyOvertime;
    const maxConsecutive = rule.maxConsecutiveWorkDays ?? defaultMaxConsecutive;

    const weeklyOvertime = new Map<string, number>();
    for (const log of logs) weeklyOvertime.set(weekKey(log.date), (weeklyOvertime.get(weekKey(log.date)) || 0) + (log.overtimeMinutes || 0));
    for (const [week, minutes] of weeklyOvertime) {
      if (minutes / 60 > maxWeeklyOvertime) add('Warning', 'Overtime', week, `Overtime of ${(minutes / 60).toFixed(1)} h in the week of ${week} exceeds the ${maxWeeklyOvertime} h limit.`, week);
    }

    const workedDates = [...new Set(logs.filter(log => log.punchIn && !['Absent', 'On Leave', 'Holiday'].includes(log.status)).map(log => log.date))].sort();
    let streakStart = workedDates[0];
    for (let index = 1; index <= workedDates.length; index += 1) {
      const continues = index < workedDates.length && daysBetween(workedDates[index - 1], workedDates[index]) === 1;
      if (continues) continue;
      const streakEnd = workedDates[index - 1];
      const length = streakStart ? daysBetween(streakStart, streakEnd) + 1 : 0;
      if (length > maxConsecutive) add('Warning', 'Weekly rest', streakStart, `Worked ${length} consecutive days (${streakStart} to ${streakEnd}) without a weekly rest day.`, streakEnd);
      streakStart = workedDates[index];
    }

    const fixedPoints = new Map<string, Set<string>>();
    for (const log of logs) {
      const travel = impossibleTravel(attendanceLocations(log));
      if (travel) add('Critical', 'Location', log.id, travel, log.date);
      for (const point of attendanceLocations(log)) {
        const key = `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
        fixedPoints.set(key, (fixedPoints.get(key) || new Set()).add(log.date));
      }
      if (log.biometricMatch && (log.biometricMatch.lowConfidence || log.biometricMatch.strengthPercent < lowConfidence) && log.regularizationApproved !== true) {
        add('Warning', 'Biometric', log.id, `Low-confidence ${log.biometricMatch.kind} match (${log.biometricMatch.strengthPercent}% strength) needs review.`, log.date);
      }
      if (log.method === 'Manual' && log.regularizationApproved !== true) add('Warning', 'Manual attendance', log.id, 'Manual attendance is not approved.', log.date);
    }
    // Real GPS jitters; the exact same 6-decimal coordinate on several different days is a spoofing signature.
    for (const [point, dates] of fixedPoints) {
      if (dates.size >= 3) add('Warning', 'Location', point, `Identical GPS coordinates (${point}) reported on ${dates.size} different days; verify the device is not using mock location.`);
    }

    const documents: [string, string | undefined][] = [
      ['CNIC', employee.cnicExpiryDate], ['Contract', employee.contractEndDate],
      ['Probation review', employee.probationConfirmedAt ? undefined : employee.probationEndDate],
      ['Driving licence', employee.drivingLicenceExpiryDate], ['Professional certification', employee.professionalCertificationExpiryDate],
      ['Work permit / visa', employee.workPermitExpiryDate],
    ];
    for (const [label, due] of documents) {
      if (!due) continue;
      const days = daysBetween(today, due);
      const isReview = label === 'Probation review';
      if (days < 0) add('Critical', 'Documents', label, isReview ? `Probation review was due on ${due} and has no recorded decision.` : `${label} expired on ${due}.`, due);
      else if (days <= 60) add('Warning', 'Documents', label, isReview ? `Probation review is due in ${days} day(s) on ${due}.` : `${label} expires in ${days} day(s) on ${due}.`, due);
    }
    if (!employee.cnicExpiryDate) add('Info', 'Documents', 'cnic-expiry-missing', 'CNIC expiry date is not recorded.');

    if (!/^\d{5}-\d{7}-\d$/.test(employee.cnic || '')) add('Critical', 'Registration', 'cnic', 'CNIC is missing or not in 00000-0000000-0 format.');
    if (employee.fbrEnabled !== false && !employee.ntn?.trim()) add('Info', 'Registration', 'ntn', 'NTN is not recorded for an FBR-withholding employee.');
    if (employee.eobiEnabled !== false && !employee.eobiNumber?.trim()) add('Warning', 'Registration', 'eobi', 'EOBI registration number is missing.');
    if (employee.eobiEnabled === false && !employee.eobiExemptionReason?.trim()) add('Warning', 'Registration', 'eobi-reason', 'EOBI is disabled without a documented exemption reason.');
    if (!employee.socialSecurityNumber?.trim() && !employee.socialSecurityExemptionReason?.trim()) add('Warning', 'Registration', 'social-security', 'Provincial social-security registration is missing without a documented exemption reason.');

    const iban = (employee.iban || '').replace(/\s/g, '');
    if (!employee.bankAccountNumber?.trim() && !iban) add('Critical', 'Bank', 'missing', 'Bank account is missing.');
    else if (iban && !/^PK\d{2}[A-Z0-9]{20}$/i.test(iban)) add('Critical', 'Bank', 'iban', 'IBAN is not a valid 24-character Pakistan IBAN.');
    if ((employee.bankAccountNumber || iban) && !employee.bankVerifiedAt) add('Info', 'Bank', 'unverified', 'Bank account has not been verified against a cheque or bank letter.');

    if (config && inputs.branches) {
      const policy = provincialPolicy(config, employeeProvince(employee, inputs.branches), site?.establishmentType);
      const monthly = resolveWageBasis(employee, inputs.wageTypes) === 'Daily' ? employee.basicSalary * 26 : employee.basicSalary;
      if (monthly < policy.minimumWage) add('Critical', 'Minimum wage', 'minimum-wage', `Wage of PKR ${monthly.toLocaleString()} is below the ${policy.province} minimum of PKR ${policy.minimumWage.toLocaleString()}.`);
    }
  }
  const rank: Record<ComplianceSeverity, number> = { Critical: 0, Warning: 1, Info: 2 };
  return alerts.sort((left, right) => rank[left.severity] - rank[right.severity] || left.employeeName.localeCompare(right.employeeName));
}

export function biometricMatchEvidence(kind: 'face' | 'fingerprint', score: number, threshold: number, lowConfidencePercent = DEFAULT_LOW_CONFIDENCE_BIOMETRIC_PERCENT) {
  const strengthPercent = Math.max(0, Math.min(100, Math.round(((threshold - score) / threshold) * 100)));
  return { kind, score, threshold, strengthPercent, lowConfidence: strengthPercent < lowConfidencePercent };
}
