import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePayslipDetails, DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_EMPLOYEES,
  DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS,
} from './defaults';
import { buildAttendanceRegister, createAttendancePeriod, isAttendancePeriodValid, registerPayrollSummary, reopenAttendancePeriod } from './attendancePeriod';
import { isRegularizationOverdue, payrollCancellationError, payrollTransitionError, regularizationDueAt, salaryRevisionApprovalError, salaryRevisionArrears } from './approvalRules';
import { isDuplicatePunch } from './attendanceRules';
import { createPayrollJournal } from './accountingJournal';
import { createStatutoryReport } from './statutoryReports';
import { payrollPreflight } from './payrollPreflight';
import type { AttendanceLog, Employee, Holiday, LeaveRequest, PayrollRun, Payslip, SalaryRevision } from '../types';

// October 2026: the 1st is a Thursday. Mon–Sat roster, one holiday on the 12th.
const employee: Employee = {
  ...DEFAULT_EMPLOYEES[0], id: 'e2e-1', employeeCode: 'E2E-001', status: 'Active', dateOfJoining: '2025-01-01', wageType: 'Monthly',
  basicSalary: 100000, houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0,
  shift: { ...(DEFAULT_EMPLOYEES[0].shift || {}), workingDays: [1, 2, 3, 4, 5, 6] } as Employee['shift'],
};
const holidays = [{ id: 'h1', date: '2026-10-12', name: 'Test holiday' } as Holiday];
const pad = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
const workingDates = Array.from({ length: 31 }, (_, index) => index + 1)
  .filter(day => new Date(2026, 9, day).getDay() !== 0 && pad(day) !== '2026-10-12');
const punch = (day: number, overrides: Partial<AttendanceLog> = {}): AttendanceLog => ({
  id: `att-${day}`, employeeId: employee.id, date: pad(day), punchIn: '09:00:00', punchOut: '17:00:00',
  method: 'Biometric', status: 'Present', overtimeMinutes: 0, ...overrides,
});

// Two rostered days (the 5th and 6th) have no punch at all; one day is approved paid leave.
const leave: LeaveRequest = { id: 'l1', employeeId: employee.id, leaveType: 'Casual', startDate: pad(7), endDate: pad(7), totalDays: 1, reason: 'x', status: 'Approved', appliedOn: pad(1) } as LeaveRequest;
const attendances = workingDates.filter(day => ![5, 6, 7].includes(day)).map(day => punch(day));

const compute = (rows = undefined as Parameters<typeof computePayslipDetails>[15], config = DEFAULT_STATUTORY_CONFIG) =>
  computePayslipDetails(employee, 10, 2026, attendances, [leave], config, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES, [], [], holidays, [], [], rows);

test('end to end: attendance → certified register → payroll → bank, statutory and journal outputs', () => {
  const period = createAttendancePeriod(attendances, [employee], [leave], holidays, 10, 2026, 'hr.officer', '2026-11-01T00:00:00.000Z');
  assert.equal(period.registerVersion, 1);
  assert.equal(isAttendancePeriodValid(period, attendances, { employees: [employee], leaves: [leave], holidays }), true);

  const summary = registerPayrollSummary(period.registerRows!, employee.id);
  assert.equal(summary.absentDays, 2, 'rostered days without a punch are absences');
  assert.equal(summary.paidLeaveDays, 1);
  assert.equal(summary.holidayDays, 1);
  assert.equal(summary.weeklyOffDays, 4);

  // Raw logs cannot see the two silent absences; the certified register can.
  const fromLogs = compute();
  const fromRegister = compute(period.registerRows);
  assert.equal(fromLogs.unpaidLeaveDeduction, 0);
  assert.equal(fromRegister.attendanceSource, 'Certified Register');
  assert.equal(fromRegister.daysAbsent, 2);
  assert.equal(fromRegister.unpaidLeaveDeduction, Math.round(2 * 100000 / 31));

  const run: PayrollRun = {
    id: 'run-oct', title: 'Payroll - October 2026', periodMonth: 10, periodYear: 2026, startDate: pad(1), endDate: pad(31), status: 'Draft',
    createdAt: '2026-11-01', totalGrossPay: fromRegister.grossSalary, totalDeductions: fromRegister.totalDeductions, totalNetPay: fromRegister.netSalary,
    totalEobiEmployer: fromRegister.eobiEmployerContribution, totalSocialSecurityEmployer: fromRegister.pessiEmployerContribution,
    createdById: 'preparer', attendancePeriodId: period.id, attendanceIntegrityHash: period.integrityHash, attendanceRegisterHash: period.registerHash,
  };
  const sheet: Payslip = { ...fromRegister, id: 'run-oct-e2e-1', payrollRunId: run.id };
  assert.match(payrollTransitionError(run, 'Approved', 'preparer') || '', /preparer cannot approve/);
  assert.equal(payrollTransitionError(run, 'Approved', 'approver'), undefined);
  assert.throws(() => createPayrollJournal(run, [sheet]), /Approve payroll/);

  const approved: PayrollRun = { ...run, status: 'Approved', approvedById: 'approver' };
  const journal = createPayrollJournal(approved, [sheet]);
  assert.ok(Math.abs(journal.totalDebit - journal.totalCredit) < 0.01);
  const fbr = createStatutoryReport('FBR', approved, [sheet], [employee]);
  assert.equal(fbr.total, sheet.incomeTaxDeduction);
  const eobi = createStatutoryReport('EOBI', approved, [sheet], [employee]);
  assert.equal(eobi.total, sheet.eobiEmployeeDeduction + sheet.eobiEmployerContribution);
  assert.match(payrollTransitionError(approved, 'Disbursed', 'approver') || '', /approver cannot disburse/);
});

test('register invalidates when leave or holiday inputs change after locking', () => {
  const period = createAttendancePeriod(attendances, [employee], [leave], holidays, 10, 2026, 'hr', '2026-11-01T00:00:00.000Z');
  assert.equal(isAttendancePeriodValid(period, attendances, { employees: [employee], leaves: [], holidays }), false);
  assert.equal(isAttendancePeriodValid(period, attendances, { employees: [employee], leaves: [leave], holidays: [] }), false);
});

test('reopening requires a reason, is blocked by live payroll, and relocking bumps the version', () => {
  const period = createAttendancePeriod(attendances, [employee], [leave], holidays, 10, 2026, 'hr', '2026-11-01T00:00:00.000Z');
  const liveRun = { id: 'r', title: 'Oct', status: 'Approved', attendancePeriodId: period.id } as PayrollRun;
  assert.throws(() => reopenAttendancePeriod(period, 'short', 'hr', 'u1', []), /at least 10/);
  assert.throws(() => reopenAttendancePeriod(period, 'Late gate log received', 'hr', 'u1', [liveRun]), /Cancel payroll run/);
  assert.throws(() => reopenAttendancePeriod(period, 'Late gate log received', 'hr', 'u1', [{ ...liveRun, status: 'Disbursed' }]), /disbursed/);
  const reopened = reopenAttendancePeriod(period, 'Late gate log received', 'hr', 'u1', [{ ...liveRun, status: 'Cancelled' }]);
  assert.equal(reopened.status, 'Reopened');
  assert.equal(isAttendancePeriodValid(reopened, attendances), false);
  assert.throws(() => createAttendancePeriod(attendances, [employee], [leave], holidays, 10, 2026, 'hr', undefined, period), /already locked/);
  const relocked = createAttendancePeriod(attendances, [employee], [leave], holidays, 10, 2026, 'hr', '2026-11-02T00:00:00.000Z', reopened);
  assert.equal(relocked.registerVersion, 2);
  assert.deepEqual(relocked.history?.map(item => item.action), ['Locked', 'Reopened', 'Locked']);
});

test('mid-month joiners are prorated through Not Joined register days', () => {
  const joiner = { ...employee, id: 'joiner', dateOfJoining: pad(16) };
  const rows = buildAttendanceRegister([], [joiner], [], [], 10, 2026);
  assert.equal(rows.filter(row => row.status === 'Not Joined').length, 15);
  const sheet = computePayslipDetails(joiner, 10, 2026, [], [], DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES, [], [], [], [], [], rows);
  assert.equal(sheet.notJoinedDays, 15);
  assert.ok(sheet.unpaidLeaveDeduction >= Math.round(15 * 100000 / 31));
});

test('absence deduction basis and daily-wager overtime come from configuration', () => {
  const period = createAttendancePeriod(attendances, [employee], [leave], holidays, 10, 2026, 'hr', '2026-11-01T00:00:00.000Z');
  const working = compute(period.registerRows, { ...DEFAULT_STATUTORY_CONFIG, absenceDeductionBasis: 'Scheduled Working Days' });
  assert.equal(working.unpaidLeaveDeduction, Math.round(2 * 100000 / working.scheduledWorkingDays!));
  const fixed = compute(period.registerRows, { ...DEFAULT_STATUTORY_CONFIG, absenceDeductionBasis: 'Fixed 30 Days' });
  assert.equal(fixed.unpaidLeaveDeduction, Math.round(2 * 100000 / 30));

  const wager = { ...employee, id: 'wager', wageType: 'Daily Wager', basicSalary: 2000 };
  const otLog = [{ ...punch(1), employeeId: 'wager', overtimeMinutes: 120 }];
  const calc = (multiplier: number) => computePayslipDetails(wager, 10, 2026, otLog, [], { ...DEFAULT_STATUTORY_CONFIG, dailyWagerOvertimeMultiplier: multiplier }, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES);
  assert.equal(calc(2).overtimePay, 2 * (2000 / 8) * 2);
  assert.equal(calc(1.5).overtimePay, 2 * (2000 / 8) * 1.5);
});

test('preflight compares a daily wager against the minimum wage on a 26-day basis', () => {
  const wager = { ...employee, id: 'wager-min', wageType: 'Daily Wager', basicSalary: 1500, cnic: '35202-1234567-1', bankName: 'HBL', bankAccountNumber: '1' };
  const sheet = { ...compute(), employeeId: wager.id, netSalary: 39000 };
  const issues = payrollPreflight([wager], [sheet], [], DEFAULT_BRANCHES, DEFAULT_STATUTORY_CONFIG);
  assert.equal(issues.some(item => item.code === 'BELOW_MINIMUM_WAGE'), false);
});

test('payroll cancellation, salary-revision maker-checker and arrears', () => {
  assert.match(payrollCancellationError({ status: 'Disbursed' } as PayrollRun, 'Bank file was rejected') || '', /cannot be cancelled/);
  assert.match(payrollCancellationError({ status: 'Approved' } as PayrollRun, 'short') || '', /at least 10/);
  assert.equal(payrollCancellationError({ status: 'Approved' } as PayrollRun, 'Wrong attendance register used'), undefined);

  const revision = { id: 'rev', employeeId: employee.id, previousSalary: 100000, newSalary: 110000, effectiveDate: '2026-09-16', status: 'Draft', createdById: 'maker' } as SalaryRevision;
  assert.match(salaryRevisionApprovalError(revision, 'maker') || '', /cannot approve/);
  assert.equal(salaryRevisionApprovalError(revision, 'checker'), undefined);
  const runs = [{ id: 'sep', status: 'Disbursed' }, { id: 'oct', status: 'Approved' }, { id: 'aug', status: 'Disbursed' }, { id: 'void', status: 'Cancelled' }] as PayrollRun[];
  const slip = (runId: string, month: number) => ({ employeeId: employee.id, payrollRunId: runId, periodMonth: month, periodYear: 2026 } as Payslip);
  const arrears = salaryRevisionArrears(revision, [slip('aug', 8), slip('sep', 9), slip('oct', 10), slip('void', 10)], runs);
  assert.deepEqual(arrears.months, ['2026-09', '2026-10']);
  assert.equal(arrears.amount, Math.round(10000 * 15 / 30 + 10000));
});

test('regularization deadline and two-minute duplicate punch window', () => {
  assert.equal(regularizationDueAt('2026-10-16T10:00:00.000Z')?.slice(0, 10), '2026-10-20'); // Fri → skips Sunday
  const pending = { regularizationRequested: true, requestedAt: '2026-10-01T10:00:00.000Z' } as AttendanceLog;
  assert.equal(isRegularizationOverdue(pending, Date.parse('2026-10-10T00:00:00.000Z')), true);
  assert.equal(isRegularizationOverdue({ ...pending, regularizationApproved: true }, Date.parse('2026-10-10T00:00:00.000Z')), false);
  const last = '2026-10-16T09:00:00.000Z';
  assert.equal(isDuplicatePunch(last, Date.parse('2026-10-16T09:01:30.000Z')), true);
  assert.equal(isDuplicatePunch(last, Date.parse('2026-10-16T09:02:01.000Z')), false);
  assert.equal(isDuplicatePunch(undefined), false);
});
