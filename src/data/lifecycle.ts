import type { Company, Employee, GratuitySettlement, LeaveRequest, LifecycleRequest, OnboardingChecklistItem, SalaryRevision, StatutoryConfig, WageType } from '../types';
import { resolveWageBasis } from './masterData';
import { leaveEntitlementFor } from './leavePolicy';

export const ONBOARDING_ITEMS: Record<OnboardingChecklistItem, string> = {
  cnicCopy: 'CNIC copy on file', appointmentLetter: 'Signed appointment letter', bankVerified: 'Bank account verified',
  eobiRegistered: 'EOBI registered or exemption recorded', socialSecurityRegistered: 'Social security registered or exemption recorded',
  ntnCaptured: 'NTN captured (or FBR withholding disabled)', biometricEnrolled: 'Fingerprint or face enrolled', policyAcknowledged: 'HR policies acknowledged',
};

// Items the system can confirm from the employee record are derived, so the checklist cannot drift from the data.
export function onboardingStatus(employee: Employee): Record<OnboardingChecklistItem, boolean> {
  const manual = (item: OnboardingChecklistItem) => Boolean(employee.onboardingChecklist?.[item]?.done);
  return {
    cnicCopy: manual('cnicCopy'),
    appointmentLetter: manual('appointmentLetter'),
    bankVerified: Boolean(employee.bankVerifiedAt) || manual('bankVerified'),
    eobiRegistered: Boolean(employee.eobiNumber?.trim() || (employee.eobiEnabled === false && employee.eobiExemptionReason?.trim())),
    socialSecurityRegistered: Boolean(employee.socialSecurityNumber?.trim() || employee.socialSecurityExemptionReason?.trim()),
    ntnCaptured: Boolean(employee.ntn?.trim() || employee.fbrEnabled === false),
    biometricEnrolled: Boolean(employee.fingerprintTemplates?.length || employee.faceDescriptors?.length),
    policyAcknowledged: manual('policyAcknowledged'),
  };
}

export const MANUAL_ONBOARDING_ITEMS: OnboardingChecklistItem[] = ['cnicCopy', 'appointmentLetter', 'bankVerified', 'policyAcknowledged'];

export function lifecycleRequestError(request: Partial<LifecycleRequest>, employee: Employee | undefined): string | undefined {
  if (!employee) return 'Select an employee.';
  if (employee.status === 'Terminated') return 'This employee has already separated.';
  if (!request.effectiveDate || !/^\d{4}-\d{2}-\d{2}$/.test(request.effectiveDate)) return 'Enter a valid effective date.';
  if (!request.reason || request.reason.trim().length < 10) return 'Enter a reason of at least 10 characters.';
  if (request.type === 'Transfer' && !request.newBranchId && !request.newDepartmentId) return 'Choose the destination branch or department.';
  if (request.type === 'Transfer' && request.newDepartmentId && !request.newDesignationId) return 'Choose the designation in the destination department.';
  if (request.type === 'Promotion' && !request.newDesignationId) return 'Choose the new designation.';
  if (request.type === 'Promotion' && request.newBasicSalary !== undefined && request.newBasicSalary <= employee.basicSalary) return 'A promotion salary must be higher than the current salary (use a salary revision for other changes).';
  if (request.type === 'Probation Extension' && (!request.newProbationEndDate || request.newProbationEndDate <= (employee.probationEndDate || employee.dateOfJoining))) return 'Choose a new probation end date after the current one.';
  if (request.type === 'Probation Confirmation' && employee.probationConfirmedAt) return 'Probation is already confirmed.';
  if ((request.type === 'Resignation' || request.type === 'Termination') && request.effectiveDate < employee.dateOfJoining) return 'Separation date cannot be before the joining date.';
  return undefined;
}

export function lifecycleReviewError(request: LifecycleRequest, actorId: string): string | undefined {
  if (request.status !== 'Pending') return 'This request has already been decided.';
  if (request.createdById === actorId) return 'The user who raised a lifecycle request cannot approve it.';
  return undefined;
}

type GratuityRules = Pick<StatutoryConfig, 'gratuityRateDaysPerYear' | 'settlementDailyRateDivisor' | 'gratuityMinimumServiceYears' | 'gratuityCountPartYearOverSixMonths' | 'gratuityResignationUnderFiveYearsPercent'>;

/** Service years that earn gratuity: completed years, optionally counting a final part-year over six months as a full year. */
export function gratuityServiceYears(dateOfJoining: string, separationDate: string, rules: GratuityRules): number {
  const months = Math.max(0, (Date.parse(`${separationDate}T00:00:00Z`) - Date.parse(`${dateOfJoining}T00:00:00Z`)) / (30.436875 * 86_400_000));
  const completed = Math.floor(months / 12);
  return completed + (rules.gratuityCountPartYearOverSixMonths && months - completed * 12 > 6 ? 1 : 0);
}

// One rule for every settlement path (Gratuity module, offboarding and lifecycle approvals).
export function gratuityEntitlement(monthlyBasis: number, dateOfJoining: string, separationDate: string, separationType: GratuitySettlement['separationType'], rules: GratuityRules) {
  const years = gratuityServiceYears(dateOfJoining, separationDate, rules);
  const exactYears = Math.max(0, (Date.parse(`${separationDate}T00:00:00Z`) - Date.parse(`${dateOfJoining}T00:00:00Z`)) / (365.2425 * 86_400_000));
  if (exactYears < (rules.gratuityMinimumServiceYears ?? 1)) return { years, amount: 0 };
  const daily = monthlyBasis / (rules.settlementDailyRateDivisor || 30);
  const resignationPercent = separationType === 'Resignation' && exactYears < 5 ? (rules.gratuityResignationUnderFiveYearsPercent ?? 100) : 100;
  return { years, amount: Math.round(daily * rules.gratuityRateDaysPerYear * years * resignationPercent / 100) };
}

/** Earned annual leave in the current calendar year (pro-rata for joiners) less approved annual leave taken. */
export function annualLeaveBalance(employee: Employee, leaves: LeaveRequest[], asOf: string, config: Pick<StatutoryConfig, 'annualLeaveDaysPerYear' | 'leaveEntitlements'>): number {
  const year = asOf.slice(0, 4);
  const from = employee.dateOfJoining > `${year}-01-01` ? employee.dateOfJoining : `${year}-01-01`;
  if (from > asOf) return 0;
  const monthsWorked = Math.min(12, (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (30.436875 * 86_400_000));
  const earned = leaveEntitlementFor(config, 'Annual') * monthsWorked / 12;
  const taken = leaves.filter(item => item.employeeId === employee.id && item.status === 'Approved' && item.leaveType === 'Annual' && item.startDate.startsWith(year))
    .reduce((sum, item) => sum + (item.totalDays || 0), 0);
  return Math.max(0, Math.floor(earned - taken));
}

export function calculateFinalSettlement(
  employee: Employee, separationType: GratuitySettlement['separationType'], separationDate: string, leaveEncashDays: number, noticeDays: number,
  statConfig: GratuityRules, wageTypes: WageType[] = [],
): Omit<GratuitySettlement, 'id' | 'status' | 'createdAt' | 'createdById'> {
  const monthlyBasis = resolveWageBasis(employee, wageTypes) === 'Daily' ? employee.basicSalary * 26 : employee.basicSalary;
  const daily = monthlyBasis / (statConfig.settlementDailyRateDivisor || 30);
  const entitlement = gratuityEntitlement(monthlyBasis, employee.dateOfJoining, separationDate, separationType, statConfig);
  const completedYears = entitlement.years;
  const gratuityAmount = employee.gratuityOptIn ? entitlement.amount : 0;
  const leaveEncashmentAmount = Math.round(daily * Math.max(0, leaveEncashDays));
  const noticePayAmount = Math.round(daily * Math.max(0, noticeDays));
  return {
    employeeId: employee.id, separationType, lastWorkingDate: separationDate, separationDate, yearsOfService: completedYears,
    basicSalaryAtSeparation: monthlyBasis, gratuityAmount, encashableLeaveDays: Math.max(0, leaveEncashDays), leaveEncashmentAmount,
    noticePayDays: Math.max(0, noticeDays), noticePayAmount, pendingSalaryDays: 0, pendingSalaryAmount: 0,
    totalSettlementAmount: gratuityAmount + leaveEncashmentAmount + noticePayAmount,
  };
}

export interface LifecycleOutcome { employee: Employee; settlement?: GratuitySettlement; salaryRevision?: SalaryRevision }

export function applyLifecycleRequest(
  request: LifecycleRequest, employee: Employee, approver: { id: string; username: string }, now: string,
  statConfig: GratuityRules, wageTypes: WageType[] = [],
): LifecycleOutcome {
  switch (request.type) {
    case 'Probation Confirmation':
      return { employee: { ...employee, probationConfirmedAt: now } };
    case 'Probation Extension':
      return { employee: { ...employee, probationEndDate: request.newProbationEndDate } };
    case 'Transfer':
      return { employee: { ...employee, branchId: request.newBranchId || employee.branchId, departmentId: request.newDepartmentId || employee.departmentId, designationId: request.newDesignationId || employee.designationId } };
    case 'Promotion': {
      const updated = { ...employee, designationId: request.newDesignationId || employee.designationId };
      // Pay changes keep their own maker-checker: the promotion raises a draft revision for independent approval.
      const salaryRevision: SalaryRevision | undefined = request.newBasicSalary && request.newBasicSalary > employee.basicSalary ? {
        id: `rev-promotion-${request.id}`, employeeId: employee.id, previousSalary: employee.basicSalary, newSalary: request.newBasicSalary,
        incrementAmount: request.newBasicSalary - employee.basicSalary,
        incrementPercentage: Number((((request.newBasicSalary - employee.basicSalary) / Math.max(1, employee.basicSalary)) * 100).toFixed(2)),
        effectiveDate: request.effectiveDate, reason: `Promotion: ${request.reason}`.slice(0, 500), approvedBy: '', approvedOn: '',
        type: 'Promotion', status: 'Draft', createdById: approver.id, createdBy: approver.username,
      } : undefined;
      return { employee: updated, salaryRevision };
    }
    case 'Resignation':
    case 'Termination': {
      const settlement: GratuitySettlement = {
        ...calculateFinalSettlement(employee, request.type, request.effectiveDate, request.leaveEncashDays || 0, request.noticeDays || 0, statConfig, wageTypes),
        id: `settlement-${employee.id}-${request.id}`, status: 'Pending', notes: request.reason, createdAt: now, createdById: approver.id,
      };
      return {
        employee: { ...employee, status: 'Terminated', separationType: request.type, separationDate: request.effectiveDate, separationReason: request.reason },
        settlement,
      };
    }
  }
}

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const longDate = (value?: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export function experienceLetterHtml(employee: Employee, designationTitle: string, departmentName: string, company?: Company, issuedOn = new Date().toISOString().slice(0, 10)): string {
  const companyName = company?.legalName || company?.name || 'the Company';
  const separated = employee.status === 'Terminated' && employee.separationDate;
  const body = separated
    ? `This is to certify that <strong>${escapeHtml(employee.fullName)}</strong> (CNIC ${escapeHtml(employee.cnic)}) was employed with ${escapeHtml(companyName)} as <strong>${escapeHtml(designationTitle)}</strong> in the ${escapeHtml(departmentName)} department from ${escapeHtml(longDate(employee.dateOfJoining))} to ${escapeHtml(longDate(employee.separationDate))}.`
    : `This is to certify that <strong>${escapeHtml(employee.fullName)}</strong> (CNIC ${escapeHtml(employee.cnic)}) has been employed with ${escapeHtml(companyName)} since ${escapeHtml(longDate(employee.dateOfJoining))} and is currently working as <strong>${escapeHtml(designationTitle)}</strong> in the ${escapeHtml(departmentName)} department.`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${separated ? 'Experience' : 'Employment'} letter — ${escapeHtml(employee.fullName)}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:56px auto;color:#0f172a;line-height:1.7;font-size:15px}h1{font-size:20px;text-align:center;letter-spacing:.08em}.meta{display:flex;justify-content:space-between;font-size:13px;color:#475569}.sig{margin-top:72px}</style></head><body>
<div class="meta"><span>${escapeHtml(companyName)}</span><span>Ref: HR/${escapeHtml(employee.employeeCode)}/${escapeHtml(issuedOn.slice(0, 4))} · ${escapeHtml(longDate(issuedOn))}</span></div>
<h1>${separated ? 'EXPERIENCE CERTIFICATE' : 'TO WHOM IT MAY CONCERN'}</h1>
<p>${body}</p>
<p>${separated ? 'We wish them success in their future endeavours.' : 'This letter is issued on the employee’s request without any liability on the part of the Company.'}</p>
<div class="sig">____________________________<br>Authorized signatory, Human Resources<br>${escapeHtml(companyName)}</div>
</body></html>`;
}

export function openPrintableHtml(html: string) {
  const view = window.open('', '_blank');
  if (!view) throw new Error('Allow pop-ups to open the printable document.');
  view.document.open();
  view.document.write(html);
  view.document.close();
  view.focus();
}
