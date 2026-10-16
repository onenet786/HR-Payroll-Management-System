import assert from 'node:assert/strict';
import test from 'node:test';
import { annualTaxLiability, calculateAnnualTax, computePayslipDetails, DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_EMPLOYEES, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS } from './defaults';
import { socialSecurityContribution } from './provincialCompliance';
import { annualLeaveBalance, gratuityEntitlement } from './lifecycle';
import { taxReconciliationReport } from './payrollLedgers';
import { retroAttendanceAdjustment } from './offCyclePayroll';
import type { Employee, LeaveRequest, PayrollRun, Payslip } from '../types';

const base: Employee = { ...DEFAULT_EMPLOYEES[0], id: 'c1', status: 'Active', dateOfJoining: '2020-01-01', basicSalary: 200000, wageType: 'Monthly', wageTypeId: undefined,
  houseRentAllowance: undefined, conveyanceAllowance: undefined, medicalAllowance: undefined, otherAllowances: undefined, fbrEnabled: true };
const compute = (employee: Employee, config = DEFAULT_STATUTORY_CONFIG) =>
  computePayslipDetails(employee, 7, 2026, [], [], config, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES);

test('medical allowance exemption and perquisites change taxable income, not cash pay', () => {
  const noExemption = compute(base, { ...DEFAULT_STATUTORY_CONFIG, medicalAllowanceExemptPercentOfBasic: 0 });
  const exempt = compute(base);
  assert.equal(exempt.exemptAllowance, 10000); // 10% of the 100,000 basic component; medical is 20,000
  assert.equal(exempt.taxableIncomeThisPeriod, noExemption.taxableIncomeThisPeriod! - 10000);
  assert.ok(exempt.incomeTaxDeduction < noExemption.incomeTaxDeduction);
  const withCar = compute({ ...base, perquisiteVehicleMonthly: 15000 });
  assert.equal(withCar.grossSalary, exempt.grossSalary, 'perquisites are not paid in cash');
  assert.equal(withCar.perquisitesValue, 15000);
  assert.ok(withCar.incomeTaxDeduction > exempt.incomeTaxDeduction);
});

test('surcharge applies only above the configured threshold', () => {
  const config = { surchargeRatePercent: 10, surchargeThresholdAnnual: 10_000_000 };
  assert.equal(annualTaxLiability(9_000_000, DEFAULT_TAX_SLABS, config).surcharge, 0);
  const high = annualTaxLiability(12_000_000, DEFAULT_TAX_SLABS, config);
  assert.equal(Math.round(high.surcharge), Math.round(calculateAnnualTax(12_000_000, DEFAULT_TAX_SLABS) * 0.1));
  const sheet = compute({ ...base, basicSalary: 1_200_000 }, { ...DEFAULT_STATUTORY_CONFIG, ...config });
  assert.ok((sheet.surchargeAnnual || 0) > 0);
});

test('provincial social security honours ceilings, eligibility mode and excluded categories', () => {
  const config = { ...DEFAULT_STATUTORY_CONFIG, provincialSocialSecurityCeilings: { Punjab: 30000 } };
  assert.equal(socialSecurityContribution(base, 'Punjab', config, 50000, false).amount, Math.round(30000 * 0.06));
  assert.equal(socialSecurityContribution(base, 'Punjab', { ...config, socialSecurityEligibility: 'Only employees within wage ceiling' }, 50000, false).amount, 0);
  assert.equal(socialSecurityContribution({ ...base, workerCategory: 'Managerial' }, 'Punjab', { ...config, socialSecurityExcludedCategories: ['Managerial'] }, 20000, false).amount, 0);
  assert.equal(socialSecurityContribution({ ...base, socialSecurityNumber: '' }, 'Punjab', config, 20000, true).amount, 0, 'unregistered daily wager');
  assert.equal(socialSecurityContribution({ ...base, socialSecurityNumber: 'SS-1' }, 'Punjab', config, 20000, true).amount, 1200, 'registered daily wager');
});

test('one gratuity rule with configurable service, part-year and resignation policy', () => {
  const rules = { gratuityRateDaysPerYear: 30, settlementDailyRateDivisor: 30 };
  assert.deepEqual(gratuityEntitlement(90000, '2021-01-01', '2024-09-01', 'Resignation', rules), { years: 3, amount: 270000 });
  assert.equal(gratuityEntitlement(90000, '2021-01-01', '2024-09-01', 'Resignation', { ...rules, gratuityCountPartYearOverSixMonths: true }).years, 4);
  assert.equal(gratuityEntitlement(90000, '2021-01-01', '2024-09-01', 'Resignation', { ...rules, gratuityResignationUnderFiveYearsPercent: 50 }).amount, 135000);
  assert.equal(gratuityEntitlement(90000, '2021-01-01', '2024-09-01', 'Termination', { ...rules, gratuityResignationUnderFiveYearsPercent: 50 }).amount, 270000);
  assert.equal(gratuityEntitlement(90000, '2024-03-01', '2024-09-01', 'Termination', rules).amount, 0, 'below minimum service');
  assert.equal(gratuityEntitlement(90000, '2021-01-01', '2024-09-01', 'Termination', { ...rules, settlementDailyRateDivisor: 26 }).amount, Math.round(90000 / 26 * 30 * 3));
});

test('annual leave balance accrues pro-rata and deducts approved annual leave', () => {
  const leaves = [{ employeeId: 'c1', status: 'Approved', leaveType: 'Annual', startDate: '2026-03-01', totalDays: 4 }, { employeeId: 'c1', status: 'Approved', leaveType: 'Sick', startDate: '2026-04-01', totalDays: 2 }] as LeaveRequest[];
  assert.equal(annualLeaveBalance(base, leaves, '2026-07-01', { annualLeaveDaysPerYear: 14 }), 2); // 7 earned minus 4 taken, floored
  assert.equal(annualLeaveBalance({ ...base, dateOfJoining: '2026-06-01' }, [], '2026-12-01', { annualLeaveDaysPerYear: 12 }), 6);
});

test('tax reconciliation and retro attendance corrections', () => {
  const runs = [{ id: 'r', status: 'Disbursed', periodMonth: 9, periodYear: 2026 }] as PayrollRun[];
  const sheet = { id: 's', payrollRunId: 'r', employeeId: 'c1', employeeCode: 'C1', employeeName: 'C', periodMonth: 9, periodYear: 2026, grossSalary: 200000, incomeTaxDeduction: 20000, projectedAnnualTaxLiability: 300000, projectedAnnualTaxableIncome: 2_400_000, totalDaysInMonth: 30, scheduledWorkingDays: 26 } as Payslip;
  const report = taxReconciliationReport([base], runs, [sheet], '2027');
  assert.equal(report.rowCount, 1);
  assert.match(report.csv, /"Review"/); // 20,000 deducted vs 75,000 expected after 3 months
  const arrears = retroAttendanceAdjustment(sheet, base, 2, 'Late gate log from security', { id: 'u', username: 'u' }, { month: 10, year: 2026 }, DEFAULT_STATUTORY_CONFIG);
  assert.equal(arrears.type, 'Arrears');
  assert.equal(arrears.amount, Math.round(2 * 200000 / 30));
  assert.equal(arrears.status, 'Pending');
  const recovery = retroAttendanceAdjustment(sheet, base, -1, 'Duplicate punch credited', { id: 'u', username: 'u' }, { month: 10, year: 2026 }, { ...DEFAULT_STATUTORY_CONFIG, absenceDeductionBasis: 'Scheduled Working Days' });
  assert.equal(recovery.type, 'Deduction');
  assert.equal(recovery.amount, Math.round(200000 / 26));
  assert.throws(() => retroAttendanceAdjustment(sheet, base, 0, 'nothing to change here', { id: 'u', username: 'u' }, { month: 10, year: 2026 }, DEFAULT_STATUTORY_CONFIG), /days/);
});
