import type { AttendanceLog, Employee, PayrollRun, Payslip, Role, SalaryRevision, StatutoryChangeRequest, StatutoryConfig, TaxSlab, UserAccount } from '../types';

export function payrollTransitionError(run: PayrollRun, nextStatus: 'Approved' | 'Disbursed', actorId: string): string | undefined {
  if (nextStatus === 'Approved') {
    if (run.status !== 'Draft') return 'Only a draft payroll can be approved.';
    if (run.createdById === actorId) return 'The payroll preparer cannot approve the same payroll run.';
  } else {
    if (run.status !== 'Approved') return 'Only an approved payroll can be disbursed.';
    if (run.approvedById === actorId) return 'The payroll approver cannot disburse the same payroll run.';
  }
  return undefined;
}

export interface AttendanceReviewContext {
  actorEmployeeId?: string;
  employee?: Pick<Employee, 'id' | 'reportingManagerId'>;
  users?: Pick<UserAccount, 'id' | 'employeeId' | 'roleId' | 'status' | 'username'>[];
  roles?: Pick<Role, 'id' | 'permissions'>[];
  now?: number;
}

/** The active line manager who can decide attendance corrections, when one is configured. */
export function lineManagerReviewer(context: AttendanceReviewContext) {
  const managerId = context.employee?.reportingManagerId;
  if (!managerId || managerId === context.employee?.id) return undefined;
  return context.users?.find(user => user.employeeId === managerId && user.status === 'Active'
    && (user.roleId === 'role-admin' || context.roles?.find(role => role.id === user.roleId)?.permissions.includes('manage_attendance')));
}

export function attendanceReviewError(attendance: AttendanceLog, actorId: string, context: AttendanceReviewContext = {}): string | undefined {
  if (!attendance.regularizationRequested || attendance.regularizationApproved !== undefined) return 'This attendance item is not awaiting review.';
  if (attendance.requestedById === actorId) return 'The requester cannot review their own attendance adjustment.';
  if (context.employee && context.actorEmployeeId === context.employee.id) return 'Employees cannot review their own attendance.';
  const manager = lineManagerReviewer(context);
  if (manager && manager.id !== actorId && !isRegularizationOverdue(attendance, context.now)) {
    return `Awaiting line manager ${manager.username}. HR can decide after the ${REGULARIZATION_DEADLINE_WORKING_DAYS}-working-day review deadline passes.`;
  }
  return undefined;
}

export function payrollCancellationError(run: PayrollRun, reason: string): string | undefined {
  if (run.status === 'Disbursed') return 'A disbursed payroll cannot be cancelled. Record corrections as adjustments in the next period.';
  if (run.status === 'Cancelled') return 'This payroll run is already cancelled.';
  if (reason.trim().length < 10) return 'Enter a cancellation reason of at least 10 characters.';
  return undefined;
}

export const REGULARIZATION_DEADLINE_WORKING_DAYS = 3;

// Sundays are excluded; the deadline is a review SLA, not a roster calculation.
export function regularizationDueAt(requestedAt: string, workingDays = REGULARIZATION_DEADLINE_WORKING_DAYS): string | undefined {
  const start = new Date(requestedAt);
  if (!Number.isFinite(start.getTime())) return undefined;
  const due = new Date(start);
  let remaining = workingDays;
  while (remaining > 0) {
    due.setDate(due.getDate() + 1);
    if (due.getDay() !== 0) remaining -= 1;
  }
  return due.toISOString();
}

export function isRegularizationOverdue(attendance: AttendanceLog, now = Date.now()): boolean {
  if (!attendance.regularizationRequested || attendance.regularizationApproved !== undefined) return false;
  // Older requests have no timestamp; the attendance date is the earliest point they could have been raised.
  const due = regularizationDueAt(attendance.requestedAt || `${attendance.date}T00:00:00`);
  return Boolean(due && Date.parse(due) < now);
}

export function salaryRevisionApprovalError(revision: SalaryRevision, actorId: string): string | undefined {
  if (revision.status === 'Approved') return 'This salary revision is already approved.';
  if (revision.createdById && revision.createdById === actorId) return 'The user who prepared a salary revision cannot approve it.';
  return undefined;
}

// Arrears cover payroll months that were already processed at the old salary on or after the effective date.
export function salaryRevisionArrears(revision: SalaryRevision, payslips: Payslip[], runs: PayrollRun[]): { amount: number; months: string[] } {
  const difference = revision.newSalary - revision.previousSalary;
  if (difference <= 0) return { amount: 0, months: [] };
  const activeRunIds = new Set(runs.filter(run => run.status === 'Approved' || run.status === 'Disbursed').map(run => run.id));
  const effective = revision.effectiveDate;
  let amount = 0;
  const months: string[] = [];
  for (const sheet of payslips) {
    if (sheet.employeeId !== revision.employeeId || !activeRunIds.has(sheet.payrollRunId) || !sheet.periodMonth || !sheet.periodYear) continue;
    const prefix = `${sheet.periodYear}-${String(sheet.periodMonth).padStart(2, '0')}`;
    const lastDay = new Date(sheet.periodYear, sheet.periodMonth, 0).getDate();
    const periodEnd = `${prefix}-${String(lastDay).padStart(2, '0')}`;
    if (periodEnd < effective) continue;
    const firstDay = effective > `${prefix}-01` ? Number(effective.slice(8, 10)) : 1;
    amount += difference * (lastDay - firstDay + 1) / lastDay;
    months.push(prefix);
  }
  return { amount: Math.round(amount), months: months.sort() };
}

const comparableConfig = (config: StatutoryConfig) => {
  const { updatedAt: _updatedAt, changeRequestId: _changeRequestId, ...rest } = config;
  return rest as Record<string, unknown>;
};

export function statutoryChangedFields(live: StatutoryConfig, proposed: StatutoryConfig, liveSlabs: TaxSlab[], proposedSlabs: TaxSlab[]): string[] {
  const before = comparableConfig(live);
  const after = comparableConfig(proposed);
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).sort();
  const slabKey = (slabs: TaxSlab[]) => JSON.stringify(slabs.slice().sort((a, b) => a.minIncome - b.minIncome).map(({ id, minIncome, maxIncome, baseTax, percentage }) => [id, minIncome, maxIncome, baseTax, percentage]));
  if (slabKey(liveSlabs) !== slabKey(proposedSlabs)) fields.push('taxSlabs');
  return fields;
}

export function statutoryReviewError(request: StatutoryChangeRequest, actorId: string): string | undefined {
  if (request.status !== 'Pending') return 'This statutory change request has already been decided.';
  if (request.createdById === actorId) return 'The user who proposed a statutory rate change cannot approve it.';
  if (!request.changedFields.length) return 'The request does not change any statutory value.';
  if (!request.proposedConfig.sourceReference?.trim()) return 'Record the official FBR / EOBI / provincial notification reference before approval.';
  return undefined;
}
