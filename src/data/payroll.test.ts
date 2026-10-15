import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePayslipDetails,
  DEFAULT_BRANCHES,
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_EMPLOYEES,
  DEFAULT_STATUTORY_CONFIG,
  DEFAULT_TAX_SLABS,
  calculateGrossFromTakeHome,
  calculateFbrSalarySplit
  ,calculateReconciledMonthlyTax
} from './defaults';
import type { AttendanceLog, LeaveRequest, PayrollAdjustment } from '../types';

const employee = { ...DEFAULT_EMPLOYEES[0], basicSalary: 120000, houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0 };

const calculate = (attendances: AttendanceLog[] = [], leaves: LeaveRequest[] = []) =>
  computePayslipDetails(employee, 7, 2026, attendances, leaves, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES);

test('applies Finance Act 2026 salaried slab progression', () => {
  const result = calculate();
  assert.equal(result.incomeTaxDeduction, 5500);
  assert.equal(result.calculationVersion, 'PK-PAYROLL-3.0-YTD');
});

test('reconciles tax year-to-date after a salary change', () => {
  const july = { ...calculate(), id: 'july', payrollRunId: 'run-july', periodMonth: 7, periodYear: 2026, grossSalary: 120000, incomeTaxDeduction: 5500 };
  const raisedEmployee = { ...employee, basicSalary: 240000 };
  const result = calculateReconciledMonthlyTax(raisedEmployee, 240000, 8, 2026, DEFAULT_TAX_SLABS, [july]);
  assert.equal(result.taxYear, '2027');
  assert.equal(result.taxableIncomeYtd, 360000);
  assert.equal(result.taxDeductedBeforeCurrentPeriod, 5500);
  assert.ok(result.incomeTaxDeduction > 5500);
  assert.ok(Math.abs((result.incomeTaxDeduction * 11 + 5500) - result.projectedAnnualTaxLiability) <= 6);
});

test('includes prior-employer declarations in annual tax reconciliation', () => {
  const transferred = { ...employee, priorEmployerTaxableIncome: 600000, priorEmployerTaxDeducted: 10000 };
  const result = calculateReconciledMonthlyTax(transferred, 120000, 10, 2026, DEFAULT_TAX_SLABS, []);
  assert.equal(result.taxableIncomeYtd, 720000);
  assert.equal(result.taxDeductedBeforeCurrentPeriod, 10000);
  assert.ok(result.projectedAnnualTaxableIncome > 600000);
});

test('counts only the payroll-period portion of cross-month unpaid leave', () => {
  const leave: LeaveRequest = {
    id: 'leave-cross-month', employeeId: employee.id, leaveType: 'Unpaid', startDate: '2026-06-29', endDate: '2026-07-03',
    totalDays: 5, reason: 'Test', status: 'Approved', appliedOn: '2026-06-20'
  };
  const result = calculate([], [leave]);
  assert.equal(result.unpaidLeaveDays, 3);
  assert.equal(result.explicitAbsentDays, 0);
});

test('does not double charge an absent attendance record covered by unpaid leave', () => {
  const attendance: AttendanceLog = { id: 'a1', employeeId: employee.id, date: '2026-07-02', method: 'Manual', status: 'Absent', overtimeMinutes: 0 };
  const leave: LeaveRequest = {
    id: 'l1', employeeId: employee.id, leaveType: 'Unpaid', startDate: '2026-07-02', endDate: '2026-07-02',
    totalDays: 1, reason: 'Test', status: 'Approved', appliedOn: '2026-07-01'
  };
  const result = calculate([attendance], [leave]);
  assert.equal(result.daysAbsent, 1);
});

test('applies only approved, unused adjustments for the selected employee and period', () => {
  const base = calculate();
  const adjustment = (id: string, type: PayrollAdjustment['type'], amount: number, overrides: Partial<PayrollAdjustment> = {}): PayrollAdjustment => ({
    id, employeeId: employee.id, periodMonth: 7, periodYear: 2026, type, amount,
    taxable: type === 'Bonus', reason: 'Approved payroll input', status: 'Approved',
    createdAt: '2026-07-20T10:00:00.000Z', createdById: 'maker', createdBy: 'Maker',
    reviewedAt: '2026-07-20T11:00:00.000Z', reviewedById: 'checker', reviewedBy: 'Checker', ...overrides,
  });
  const adjustments = [
    adjustment('bonus', 'Bonus', 10000),
    adjustment('refund', 'Reimbursement', 2500, { taxable: false }),
    adjustment('deduction', 'Deduction', 1000, { taxable: false }),
    adjustment('pending', 'Bonus', 99999, { status: 'Pending' }),
    adjustment('consumed', 'Bonus', 99999, { payrollRunId: 'old-run' }),
  ];
  const result = computePayslipDetails(employee, 7, 2026, [], [], DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES, [], [], [], [], adjustments);
  assert.equal(result.bonusEarnings, 10000);
  assert.equal(result.reimbursements, 2500);
  assert.equal(result.otherAdjustmentsDeduction, 1000);
  assert.deepEqual(result.payrollAdjustmentIds, ['bonus', 'refund', 'deduction']);
  assert.equal(result.grossSalary, base.grossSalary + 10000);
  assert.equal(result.netSalary, result.grossSalary + 2500 - result.totalDeductions);
});

test('reverse calculates gross salary to deliver target net take-home pay', () => {
  // Target Net 100,000 PKR
  const rev = calculateGrossFromTakeHome(100000, DEFAULT_TAX_SLABS, 37000);
  assert.ok(rev.gross >= 100000);
  // Verify net matches within 1 PKR
  assert.ok(Math.abs(rev.net - 100000) <= 1);

  // FBR segregation test for 100,000 PKR standard package
  const split = calculateFbrSalarySplit(100000, false, DEFAULT_TAX_SLABS, 37000);
  assert.equal(split.basicWage, 50000); // 50%
  assert.equal(split.houseRentAllowance, 30000); // 30%
  assert.equal(split.conveyanceAllowance, 10000); // 10%
  assert.equal(split.medicalAllowance, 10000); // 10%
  assert.equal(split.basicWage + split.houseRentAllowance + split.conveyanceAllowance + split.medicalAllowance, 100000);
});
