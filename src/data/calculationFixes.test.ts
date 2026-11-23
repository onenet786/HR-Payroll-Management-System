import assert from 'node:assert/strict';
import test from 'node:test';
import {
  annualTaxLiability, calculateAnnualTax, calculateReconciledMonthlyTax, computePayslipDetails,
  DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_EMPLOYEES, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS,
} from './defaults';
import { buildAttendanceRegister, createAttendancePeriod, isAttendancePeriodValid } from './attendancePeriod';
import { gratuityEntitlement, gratuityServiceYears } from './lifecycle';
import { createPayrollJournal } from './accountingJournal';
import { computeFinalSettlementPayslip, retroRecalculationAdjustment } from './offCyclePayroll';
import { salaryRevisionArrears } from './approvalRules';
import { applyLoanRepayments } from './loanRecovery';
import { csvCell } from './csvSafe';
import { createStatutoryReport } from './statutoryReports';
import { renderExport, STARTER_EXPORT_TEMPLATES } from './exportTemplates';
import type { AttendanceLog, Employee, GratuitySettlement, LeaveRequest, LoanAdvance, PayrollAdjustment, PayrollRun, Payslip, StatutoryConfig } from '../types';

const C = DEFAULT_STATUTORY_CONFIG;
const base = {
  ...DEFAULT_EMPLOYEES[0], id: 'x', status: 'Active', dateOfJoining: '2020-01-01', wageType: 'Monthly', providentFundOptIn: false,
  shift: { ...(DEFAULT_EMPLOYEES[0].shift || {}), workingDays: [1, 2, 3, 4, 5, 6] },
} as Employee;
const slip = (employee: Employee, month: number, year: number, extra: {
  attendances?: AttendanceLog[]; leaves?: LeaveRequest[]; config?: StatutoryConfig; loans?: LoanAdvance[]; history?: Payslip[]; adjustments?: PayrollAdjustment[]; register?: boolean;
} = {}) => computePayslipDetails(employee, month, year, extra.attendances || [], extra.leaves || [], extra.config || C, DEFAULT_TAX_SLABS,
  DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES, extra.loans || [], [], [], extra.history || [], extra.adjustments || [],
  extra.register ? buildAttendanceRegister(extra.attendances || [], [employee], extra.leaves || [], [], month, year) : undefined);
const fullMonth = (employee: Employee, month: number, year: number, skip: number[] = []) => {
  const last = new Date(year, month, 0).getDate();
  return Array.from({ length: last }, (_, i) => i + 1)
    .filter(day => (employee.shift?.workingDays || [1, 2, 3, 4, 5, 6]).includes(new Date(year, month - 1, day).getDay()) && !skip.includes(day))
    .map(day => ({ id: `a${day}`, employeeId: employee.id, date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      punchIn: '09:00:00', punchOut: '17:00:00', method: 'Biometric', status: 'Present', overtimeMinutes: 0 }) as AttendanceLog);
};

test('1. retro recalculation with unchanged inputs gives no difference although itemised earnings were paid', () => {
  const employee = { ...base, basicSalary: 104000, houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0 };
  const adjustments = [{ id: 'f', employeeId: 'x', periodMonth: 10, periodYear: 2026, type: 'Fuel Allowance', amount: 5000, taxable: true, status: 'Approved' }] as PayrollAdjustment[];
  const original = slip(employee, 10, 2026, { attendances: fullMonth(employee, 10, 2026), adjustments });
  const recomputed = slip(employee, 10, 2026, { attendances: fullMonth(employee, 10, 2026) });
  const result = retroRecalculationAdjustment(original, recomputed, 'master data check only', { id: 'u', username: 'u' }, { month: 11, year: 2026 });
  assert.equal(result.difference, 0);
  assert.equal(result.adjustment, undefined);
  const raised = slip({ ...employee, basicSalary: 114000 }, 10, 2026, { attendances: fullMonth(employee, 10, 2026) });
  assert.equal(retroRecalculationAdjustment(original, raised, 'salary corrected upward', { id: 'u', username: 'u' }, { month: 11, year: 2026 }).difference, 10000);
});

test('2. gratuity service counts the last working day', () => {
  assert.deepEqual(gratuityEntitlement(100000, '2021-03-01', '2026-02-28', 'Termination', C), { years: 5, amount: 500000 });
  assert.deepEqual(gratuityEntitlement(100000, '2025-03-01', '2026-02-28', 'Termination', C), { years: 1, amount: 100000 });
  assert.equal(gratuityEntitlement(100000, '2025-03-02', '2026-02-28', 'Termination', C).amount, 0, 'one day short of a year');
  const halfForResigners = { ...C, gratuityResignationUnderFiveYearsPercent: 50 };
  assert.equal(gratuityEntitlement(100000, '2021-03-01', '2026-02-28', 'Resignation', halfForResigners).amount, 500000, 'five full years: no reduction');
  assert.equal(gratuityEntitlement(100000, '2021-03-02', '2026-02-28', 'Resignation', halfForResigners).amount, 200000, 'just under five years: 4 years at 50%');
  assert.equal(gratuityServiceYears('2020-01-15', '2026-08-31', { ...C, gratuityCountPartYearOverSixMonths: true }), 7);
});

test('3. arrears count each employee-month once and only from regular runs', () => {
  const runs = [{ id: 'reg', status: 'Disbursed', runType: 'Regular' }, { id: 'supp', status: 'Approved', runType: 'Supplementary' }, { id: 'old', status: 'Disbursed' }] as PayrollRun[];
  const sheets = [
    { employeeId: 'x', payrollRunId: 'reg', periodMonth: 8, periodYear: 2026, daysAbsent: 0, notJoinedDays: 0, runType: 'Regular' },
    { employeeId: 'x', payrollRunId: 'supp', periodMonth: 8, periodYear: 2026, daysAbsent: 0, runType: 'Supplementary' },
    { employeeId: 'x', payrollRunId: 'old', periodMonth: 9, periodYear: 2026, daysAbsent: 0 },
  ] as Payslip[];
  assert.deepEqual(salaryRevisionArrears({ employeeId: 'x', previousSalary: 100000, newSalary: 120000, effectiveDate: '2026-08-01' } as never, sheets, runs),
    { amount: 40000, months: ['2026-08', '2026-09'] });
});

test('4. absence and pre-joining days pro-rate custom allowances as well as basic', () => {
  const joiner = { ...base, dateOfJoining: '2026-10-16', basicSalary: 60000, houseRentAllowance: 27000, conveyanceAllowance: 6000, medicalAllowance: 6000, otherAllowances: 0 };
  const attendances = fullMonth(joiner, 10, 2026).filter(item => item.date >= '2026-10-16');
  const sheet = slip(joiner, 10, 2026, { attendances, register: true });
  assert.equal(sheet.notJoinedDays, 15);
  assert.equal(sheet.unpaidLeaveDeduction, Math.round(15 * 99000 / 31));
  assert.equal(sheet.grossSalary, 99000 - Math.round(15 * 99000 / 31));
  // The default 50/30/10/10 split already treats basicSalary as the package: same result for the same package.
  const split = slip({ ...joiner, basicSalary: 99000, houseRentAllowance: undefined, conveyanceAllowance: undefined, medicalAllowance: undefined, otherAllowances: undefined }, 10, 2026, { attendances, register: true });
  assert.equal(split.unpaidLeaveDeduction, sheet.unpaidLeaveDeduction);
  assert.equal(split.grossSalary, sheet.grossSalary);
});

test('5. the income tax surcharge comes only from the configuration, once', () => {
  const slabOnly = Math.round(1_424_000 + (12_000_000 - 7_000_000) * 0.35);
  assert.equal(calculateAnnualTax(12_000_000, DEFAULT_TAX_SLABS), slabOnly);
  assert.equal(annualTaxLiability(12_000_000, DEFAULT_TAX_SLABS, { surchargeRatePercent: 0, surchargeThresholdAnnual: 10_000_000 }).tax, slabOnly);
  const configured = annualTaxLiability(12_000_000, DEFAULT_TAX_SLABS, { surchargeRatePercent: 9, surchargeThresholdAnnual: 10_000_000 });
  assert.equal(Math.round(configured.tax), Math.round(slabOnly * 1.09));
  assert.equal(Math.round(configured.surcharge), Math.round(slabOnly * 0.09));
});

test('7. a register locked with "no punch = Unpaid Leave" stays valid for payroll', () => {
  const employee = { ...base, basicSalary: 104000 };
  const attendances = fullMonth(employee, 10, 2026, [5]);
  const inputs = { employees: [employee], leaves: [], holidays: [] };
  const period = createAttendancePeriod(attendances, [employee], [], [], 10, 2026, 'hr', '2026-11-02T00:00:00Z', undefined, { noPunchDayStatus: 'Unpaid Leave' });
  assert.equal(period.registerRows?.find(row => row.date === '2026-10-05')?.status, 'Unpaid Leave');
  assert.deepEqual(period.registerOptions, { noPunchDayStatus: 'Unpaid Leave', holidayRules: 2 });
  assert.equal(isAttendancePeriodValid(period, attendances, inputs), true);
  // Periods locked before the options were stored keep validating with the default register.
  const legacy = createAttendancePeriod(attendances, [employee], [], [], 10, 2026, 'hr', '2026-11-02T00:00:00Z');
  delete (legacy as { registerOptions?: unknown }).registerOptions;
  assert.equal(isAttendancePeriodValid(legacy, attendances, inputs), true);
});

test('registers locked under the old holiday rules still validate after the update (optional + recurring holidays)', () => {
  const employee = { ...base, basicSalary: 104000 };
  const attendances = fullMonth(employee, 10, 2026, [5]);
  const holidays = [
    { id: 'h-opt', name: 'Optional day', date: '2026-10-07', type: 'Optional' as const, isRecurring: false },
    { id: 'h-rec', name: 'Old recurring', date: '2025-10-20', type: 'Public' as const, isRecurring: true },
  ];
  const inputs = { employees: [employee], leaves: [], holidays };
  // What an install locked before the update holds: built with every holiday's own date, no options recorded.
  const locked = createAttendancePeriod(attendances, [employee], [], holidays, 10, 2026, 'hr', '2026-11-02T00:00:00Z', undefined, { legacyHolidayDates: true });
  delete (locked as { registerOptions?: unknown }).registerOptions;
  assert.equal(isAttendancePeriodValid(locked, attendances, inputs), true, 'payroll must not be refused for a month locked before the update');
  // A register locked now uses the new rules and validates with them.
  const fresh = createAttendancePeriod(attendances, [employee], [], holidays, 10, 2026, 'hr', '2026-11-02T00:00:00Z');
  assert.equal(isAttendancePeriodValid(fresh, attendances, inputs), true);
  assert.equal(fresh.registerRows?.find(row => row.date === '2026-10-20')?.status !== undefined, true);
});

test('8. loan recovery is capped at the balance, skips future loans and is applied per loan at disbursement', () => {
  const employee = { ...base, basicSalary: 104000 };
  const loans = [
    { id: 'L1', employeeId: 'x', type: 'Loan', principalAmount: 50000, approvedAmount: 50000, disbursedDate: '2026-01-10', totalInstallments: 5, remainingInstallments: 1, monthlyInstallment: 10000, totalRepaid: 46000, status: 'Active' },
    { id: 'L2', employeeId: 'x', type: 'Advance', principalAmount: 20000, approvedAmount: 20000, disbursedDate: '2026-09-01', totalInstallments: 4, remainingInstallments: 4, monthlyInstallment: 5000, totalRepaid: 0, status: 'Active' },
    { id: 'L3', employeeId: 'x', type: 'Loan', principalAmount: 30000, approvedAmount: 30000, disbursedDate: '2026-11-05', totalInstallments: 3, remainingInstallments: 3, monthlyInstallment: 10000, totalRepaid: 0, status: 'Active' },
  ] as LoanAdvance[];
  const sheet = slip(employee, 10, 2026, { attendances: fullMonth(employee, 10, 2026), loans });
  assert.deepEqual(sheet.loanDeductions, [{ loanId: 'L1', amount: 4000 }, { loanId: 'L2', amount: 5000 }]);
  assert.equal(sheet.loanRepaymentDeduction, 9000);
  const { loans: after, changedLoanIds } = applyLoanRepayments(loans, [sheet]);
  assert.deepEqual([...changedLoanIds].sort(), ['L1', 'L2']);
  assert.deepEqual(after.map(loan => [loan.id, loan.totalRepaid, loan.remainingInstallments, loan.status]),
    [['L1', 50000, 0, 'Closed'], ['L2', 5000, 3, 'Active'], ['L3', 0, 3, 'Active']]);
  // A final settlement recovers every balance and closes the loans it paid off.
  const settlement = { employeeId: 'x', separationType: 'Resignation', separationDate: '2026-10-31', status: 'Processed', gratuityAmount: 0, leaveEncashmentAmount: 0, noticePayAmount: 0, pendingSalaryAmount: 100000 } as GratuitySettlement;
  const fs = computeFinalSettlementPayslip(employee, settlement, loans, [], C, DEFAULT_TAX_SLABS, { departments: DEFAULT_DEPARTMENTS, designations: DEFAULT_DESIGNATIONS, branches: DEFAULT_BRANCHES });
  const settled = applyLoanRepayments(loans, [fs]).loans;
  assert.ok(settled.every(loan => loan.status === 'Closed'));
});

test('9. a weekly off inside unpaid leave is not deducted under the scheduled-working-days basis', () => {
  const employee = { ...base, basicSalary: 104000, houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0 };
  const attendances = fullMonth(employee, 10, 2026, [10, 12]); // 11 October 2026 is a Sunday
  const leaves = [{ id: 'l', employeeId: 'x', leaveType: 'Unpaid', startDate: '2026-10-10', endDate: '2026-10-12', totalDays: 3, status: 'Approved' }] as LeaveRequest[];
  const config = { ...C, absenceDeductionBasis: 'Scheduled Working Days' } as StatutoryConfig;
  const fromLogs = slip(employee, 10, 2026, { attendances, leaves, config });
  assert.equal(fromLogs.unpaidLeaveDays, 2);
  assert.equal(fromLogs.unpaidLeaveDeduction, Math.round(2 * 104000 / 27));
  const fromOldRegister = slip(employee, 10, 2026, { attendances, leaves, config, register: true });
  assert.equal(fromOldRegister.unpaidLeaveDays, 2);
  const rows = buildAttendanceRegister(attendances, [employee], leaves, [], 10, 2026, { offDaysBeforeLeave: true });
  assert.equal(rows.find(row => row.date === '2026-10-11')?.status, 'Weekly Off');
  // Calendar-day basis keeps the leave over the weekly off (the divisor is calendar days).
  assert.equal(slip(employee, 10, 2026, { attendances, leaves }).unpaidLeaveDays, 3);
});

test('11-12. manual tax adjustments count as tax paid and one-off bonuses are not projected as recurring', () => {
  const employee = { ...base, basicSalary: 200000, houseRentAllowance: undefined, conveyanceAllowance: undefined, medicalAllowance: undefined, otherAllowances: undefined };
  const bonus = [{ id: 'b', employeeId: 'x', periodMonth: 7, periodYear: 2026, type: 'Bonus', amount: 600000, taxable: true, status: 'Approved' }] as PayrollAdjustment[];
  const normal = slip(employee, 7, 2026);
  const july = slip(employee, 7, 2026, { adjustments: bonus });
  const recurring = normal.taxableIncomeThisPeriod! * 12;
  assert.equal(july.projectedAnnualTaxableIncome, recurring + 600000);
  const marginal = calculateAnnualTax(recurring + 600000, DEFAULT_TAX_SLABS) - calculateAnnualTax(recurring, DEFAULT_TAX_SLABS);
  assert.equal(july.incomeTaxDeduction, Math.round(normal.incomeTaxDeduction + marginal));
  const august = slip(employee, 8, 2026, { history: [{ ...july, payrollRunId: 'r' }] });
  assert.equal(august.incomeTaxDeduction, normal.incomeTaxDeduction);

  const withManual = { ...normal, payrollRunId: 'r', manualTaxAdjustment: 11000 };
  const next = calculateReconciledMonthlyTax(employee, normal.taxableIncomeThisPeriod!, 8, 2026, DEFAULT_TAX_SLABS, [withManual], C);
  assert.equal(next.taxDeductedBeforeCurrentPeriod, normal.incomeTaxDeduction + 11000);
  assert.equal(next.incomeTaxDeduction, Math.round((normal.projectedAnnualTaxLiability! - normal.incomeTaxDeduction - 11000) / 11));
});

test('13. the payroll journal balances with late fines', () => {
  const employee = { ...base, basicSalary: 104000 };
  const config = { ...C, attendancePolicy: { lateFineBands: [{ uptoLateDays: 31, finePerDay: 100 }] } } as StatutoryConfig;
  const attendances = fullMonth(employee, 10, 2026).map(item => item.date === '2026-10-03' ? { ...item, status: 'Late' as const } : item);
  const sheet = slip(employee, 10, 2026, { attendances, config, register: true });
  assert.equal(sheet.lateFineDeduction, 100);
  const journal = createPayrollJournal({ id: 'r', status: 'Approved', periodMonth: 10, periodYear: 2026 } as PayrollRun, [{ ...sheet, payrollRunId: 'r' }]);
  assert.equal(journal.totalDebit, journal.totalCredit);
});

test('14. CSV guard keeps negative numbers numeric and neutralises formulas, tabs and CRs', () => {
  assert.equal(csvCell(-1500), '"-1500"');
  assert.equal(csvCell('-1500.00'), '"-1500.00"');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('-1+2'), '"\'-1+2"');
  assert.equal(csvCell('\t=1+1'), '"\'\t=1+1"');
  assert.equal(csvCell('\r=1'), '"\'\r=1"');
  const run = { id: 'r', status: 'Approved', periodMonth: 10, periodYear: 2026, title: 'Oct' } as PayrollRun;
  const sheet = { ...slip({ ...base, basicSalary: 104000 }, 10, 2026, { attendances: fullMonth(base, 10, 2026) }), payrollRunId: 'r', employeeName: 'Khan, "Ali"\nJr', iban: 'PK36SCBL0000001123456702', netSalary: 100000 } as Payslip;
  const hbl = STARTER_EXPORT_TEMPLATES.find(item => item.bank === 'HBL')!;
  const file = renderExport({ ...hbl, debitAccount: '123' }, [sheet], { run, companyName: 'Co', valueDate: '2026-11-01', batchReference: 'B1', employees: [] });
  const dataLine = file.content.split('\r\n')[1];
  assert.equal(dataLine.split(',').length, hbl.columns.length);
  assert.match(dataLine, /KHAN ALI JR/);
  assert.ok(!file.errors.some(error => error.includes('delimiter')));
});

test('15. FBR return "Taxable Gross" is the period taxable income', () => {
  const run = { id: 'r', status: 'Approved', periodMonth: 10, periodYear: 2026 } as PayrollRun;
  const sheet = { ...slip({ ...base, basicSalary: 200000 }, 10, 2026), payrollRunId: 'r', cnic: '35202-1234567-1' } as Payslip;
  assert.notEqual(sheet.taxableIncomeThisPeriod, sheet.grossSalary);
  const report = createStatutoryReport('FBR', run, [sheet], []);
  assert.equal(report.csv.split('\r\n')[1].split(',')[5], `"${sheet.taxableIncomeThisPeriod}"`);
});
