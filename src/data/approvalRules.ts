import type { AttendanceLog, PayrollRun } from '../types';

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

export function attendanceReviewError(attendance: AttendanceLog, actorId: string): string | undefined {
  if (!attendance.regularizationRequested || attendance.regularizationApproved !== undefined) return 'This attendance item is not awaiting review.';
  if (attendance.requestedById === actorId) return 'The requester cannot review their own attendance adjustment.';
  return undefined;
}
