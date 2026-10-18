import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceReviewError, payrollTransitionError } from './approvalRules';
import type { AttendanceLog, PayrollRun } from '../types';

const run = { id:'r', title:'October', periodMonth:10, periodYear:2026, startDate:'2026-10-01', endDate:'2026-10-31', status:'Draft', createdAt:'', totalGrossPay:0, totalDeductions:0, totalNetPay:0, totalEobiEmployer:0, totalSocialSecurityEmployer:0, attendancePeriodId:'p', attendanceIntegrityHash:'h', createdById:'maker' } as PayrollRun;

test('payroll requires different maker, approver and disburser', () => {
  assert.match(payrollTransitionError(run, 'Approved', 'maker') || '', /preparer/);
  assert.equal(payrollTransitionError(run, 'Approved', 'checker'), undefined);
  const approved = { ...run, status:'Approved' as const, approvedById:'checker' };
  assert.match(payrollTransitionError(approved, 'Disbursed', 'checker') || '', /approver/);
  assert.equal(payrollTransitionError(approved, 'Disbursed', 'payer'), undefined);
});

test('attendance requester cannot review their own adjustment', () => {
  const attendance = { id:'a', employeeId:'e', date:'2026-10-01', method:'Manual', status:'Absent', overtimeMinutes:0, regularizationRequested:true, requestedById:'maker' } as AttendanceLog;
  assert.match(attendanceReviewError(attendance, 'maker') || '', /requester/);
  assert.equal(attendanceReviewError(attendance, 'checker'), undefined);
});
