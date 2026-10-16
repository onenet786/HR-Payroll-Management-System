import type { Branch, Department, Designation, Employee, GratuitySettlement, LoanAdvance, PayrollAdjustment, Payslip, StatutoryConfig, TaxSlab, WageType } from '../types';
import { annualTaxLiability, pakistanTaxYearForPeriod } from './defaults';
import { resolveWageBasis } from './masterData';

interface Directory { departments: Department[]; designations: Designation[]; branches: Branch[] }

function blankPayslip(employee: Employee, month: number, year: number, directory: Directory, statConfig: StatutoryConfig): Payslip {
  const branch = directory.branches.find(item => item.id === employee.branchId);
  return {
    id: '', payrollRunId: '', employeeId: employee.id, employeeName: employee.fullName, employeeCode: employee.employeeCode, cnic: employee.cnic,
    departmentName: directory.departments.find(item => item.id === employee.departmentId)?.name || 'Unknown Dept',
    designationTitle: directory.designations.find(item => item.id === employee.designationId)?.title || 'Unknown Title',
    branchName: branch?.name || 'Unknown Branch', bankName: employee.bankName, bankAccountNumber: employee.bankAccountNumber, iban: employee.iban,
    totalDaysInMonth: new Date(year, month, 0).getDate(), daysPresent: 0, daysAbsent: 0, daysLeave: 0, unpaidLeaveDays: 0, overtimeHours: 0, overtimePay: 0,
    basicEarnings: 0, houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0,
    bonusEarnings: 0, commissionEarnings: 0, arrearsEarnings: 0, reimbursements: 0, otherAdjustmentsDeduction: 0, manualTaxAdjustment: 0,
    grossSalary: 0, incomeTaxDeduction: 0, eobiEmployeeDeduction: 0, pessiEmployeeDeduction: 0, providentFundDeduction: 0, loanRepaymentDeduction: 0,
    unpaidLeaveDeduction: 0, totalDeductions: 0, netSalary: 0, eobiEmployerContribution: 0, pessiEmployerContribution: 0, providentFundEmployerContribution: 0,
    province: branch?.province, statutoryConfigId: statConfig.id, periodMonth: month, periodYear: year,
  } as Payslip;
}

/**
 * One-time payments after the regular run are taxed at the employee's marginal rate:
 * the extra annual liability created by adding the payment to the already-projected annual income.
 */
export function computeSupplementaryPayslip(
  employee: Employee, month: number, year: number, adjustments: PayrollAdjustment[], regularPayslip: Payslip | undefined,
  statConfig: StatutoryConfig, taxSlabs: TaxSlab[], directory: Directory,
): Payslip | undefined {
  const items = adjustments.filter(item => item.employeeId === employee.id && item.periodMonth === month && item.periodYear === year && item.status === 'Approved' && !item.payrollRunId);
  if (!items.length) return undefined;
  const total = (type: PayrollAdjustment['type']) => items.filter(item => item.type === type).reduce((sum, item) => sum + item.amount, 0);
  const sheet = blankPayslip(employee, month, year, directory, statConfig);
  sheet.bonusEarnings = total('Bonus');
  sheet.commissionEarnings = total('Commission');
  sheet.arrearsEarnings = total('Arrears');
  sheet.reimbursements = total('Reimbursement');
  sheet.otherAdjustmentsDeduction = total('Deduction');
  sheet.manualTaxAdjustment = total('Tax Adjustment');
  sheet.grossSalary = sheet.bonusEarnings + sheet.commissionEarnings + sheet.arrearsEarnings;
  const taxable = items.filter(item => item.taxable && !['Deduction', 'Tax Adjustment', 'Reimbursement'].includes(item.type)).reduce((sum, item) => sum + item.amount, 0);
  const projected = regularPayslip?.projectedAnnualTaxableIncome ?? 0;
  sheet.incomeTaxDeduction = employee.fbrEnabled === false || !taxable ? 0
    : Math.max(0, Math.round(annualTaxLiability(projected + taxable, taxSlabs, statConfig).tax - annualTaxLiability(projected, taxSlabs, statConfig).tax));
  sheet.taxableIncomeThisPeriod = taxable;
  sheet.taxYear = pakistanTaxYearForPeriod(month, year);
  sheet.projectedAnnualTaxableIncome = projected + taxable;
  sheet.totalDeductions = sheet.incomeTaxDeduction + sheet.manualTaxAdjustment + sheet.otherAdjustmentsDeduction;
  sheet.netSalary = Math.max(0, sheet.grossSalary + sheet.reimbursements - sheet.totalDeductions);
  sheet.payrollAdjustmentIds = items.map(item => item.id);
  sheet.runType = 'Supplementary';
  sheet.calculationVersion = 'PK-SUPPLEMENTARY-1.0';
  return sheet;
}

export function outstandingLoanBalance(employeeId: string, loans: LoanAdvance[]): number {
  return loans.filter(loan => loan.employeeId === employeeId && loan.status === 'Active' && loan.remainingInstallments > 0)
    .reduce((sum, loan) => sum + (loan.approvedAmount > 0 ? Math.max(0, loan.approvedAmount - loan.totalRepaid) : loan.monthlyInstallment * loan.remainingInstallments), 0);
}

/**
 * Final settlement reconciles tax on actual tax-year income (no projection: employment has ended),
 * then recovers outstanding loans from what remains.
 */
export function computeFinalSettlementPayslip(
  employee: Employee, settlement: GratuitySettlement, loans: LoanAdvance[], historicalPayslips: Payslip[],
  statConfig: StatutoryConfig, taxSlabs: TaxSlab[], directory: Directory,
): Payslip {
  if (settlement.status !== 'Processed') throw new Error('Only a processed (independently approved) settlement can be paid through payroll.');
  const [year, month] = settlement.separationDate.split('-').map(Number);
  const sheet = blankPayslip(employee, month, year, directory, statConfig);
  sheet.settlementGratuity = settlement.gratuityAmount;
  sheet.settlementLeaveEncashment = settlement.leaveEncashmentAmount;
  sheet.settlementNoticePay = settlement.noticePayAmount;
  sheet.settlementPendingSalary = settlement.pendingSalaryAmount;
  sheet.basicEarnings = settlement.pendingSalaryAmount;
  sheet.otherAllowances = settlement.leaveEncashmentAmount + settlement.noticePayAmount + settlement.gratuityAmount;
  sheet.grossSalary = settlement.pendingSalaryAmount + sheet.otherAllowances;
  const exemptGratuity = Math.min(settlement.gratuityAmount, Math.max(0, statConfig.gratuityTaxExemptAmount || 0));
  const taxable = sheet.grossSalary - exemptGratuity;
  const taxYear = pakistanTaxYearForPeriod(month, year);
  const yearStart = `${Number(taxYear) - 1}-07`;
  const earlier = historicalPayslips.filter(item => item.employeeId === employee.id && item.periodMonth && item.periodYear
    && `${item.periodYear}-${String(item.periodMonth).padStart(2, '0')}` >= yearStart && `${item.periodYear}-${String(item.periodMonth).padStart(2, '0')}` <= `${year}-${String(month).padStart(2, '0')}`);
  const incomeBefore = (employee.priorEmployerTaxableIncome || 0) + earlier.reduce((sum, item) => sum + (item.taxableIncomeThisPeriod ?? item.grossSalary), 0);
  const taxBefore = (employee.priorEmployerTaxDeducted || 0) + earlier.reduce((sum, item) => sum + item.incomeTaxDeduction + (item.manualTaxAdjustment || 0), 0);
  const liability = annualTaxLiability(incomeBefore + taxable, taxSlabs, statConfig);
  sheet.incomeTaxDeduction = employee.fbrEnabled === false ? 0 : Math.max(0, Math.round(liability.tax - taxBefore));
  sheet.taxYear = taxYear;
  sheet.taxableIncomeYtd = incomeBefore + taxable;
  sheet.taxDeductedBeforeCurrentPeriod = taxBefore;
  sheet.projectedAnnualTaxableIncome = incomeBefore + taxable;
  sheet.projectedAnnualTaxLiability = liability.tax;
  sheet.surchargeAnnual = Math.round(liability.surcharge);
  sheet.taxableIncomeThisPeriod = taxable;
  sheet.loanRepaymentDeduction = Math.min(outstandingLoanBalance(employee.id, loans), Math.max(0, sheet.grossSalary - sheet.incomeTaxDeduction));
  sheet.totalDeductions = sheet.incomeTaxDeduction + sheet.loanRepaymentDeduction;
  sheet.netSalary = Math.max(0, sheet.grossSalary - sheet.totalDeductions);
  sheet.runType = 'Final Settlement';
  sheet.calculationVersion = 'PK-FINAL-SETTLEMENT-1.0';
  return sheet;
}

/**
 * A disbursed month cannot be recalculated, so attendance corrections found later (for example a late
 * gate log) become an arrears or deduction adjustment in an open period, priced on the original payslip's basis.
 */
export function retroAttendanceAdjustment(original: Payslip, employee: Employee, daysDelta: number, reason: string, actor: { id: string; username: string }, target: { month: number; year: number }, statConfig: StatutoryConfig, wageTypes: WageType[] = []): PayrollAdjustment {
  if (!Number.isFinite(daysDelta) || daysDelta === 0 || Math.abs(daysDelta) > (original.totalDaysInMonth || 31)) throw new Error('Enter the number of days to add (positive) or recover (negative).');
  if (reason.trim().length < 10) throw new Error('Explain the correction in at least 10 characters.');
  const isDaily = resolveWageBasis(employee, wageTypes) === 'Daily';
  const basis = statConfig.absenceDeductionBasis || 'Calendar Days';
  const divisor = basis === 'Scheduled Working Days' ? Math.max(1, original.scheduledWorkingDays || 26) : basis === 'Fixed 30 Days' ? 30 : (original.totalDaysInMonth || 30);
  const dayRate = isDaily ? employee.basicSalary : employee.basicSalary / divisor;
  const amount = Math.round(Math.abs(daysDelta) * dayRate);
  const period = `${original.periodYear}-${String(original.periodMonth).padStart(2, '0')}`;
  return {
    id: `adj-retro-${original.id}-${Date.now()}`, employeeId: employee.id, periodMonth: target.month, periodYear: target.year,
    type: daysDelta > 0 ? 'Arrears' : 'Deduction', amount, taxable: daysDelta > 0,
    reason: `Retro attendance correction for ${period}: ${daysDelta > 0 ? '+' : ''}${daysDelta} day(s). ${reason.trim()}`.slice(0, 500),
    status: 'Pending', createdAt: new Date().toISOString(), createdById: actor.id, createdBy: actor.username,
  };
}

const basePay = (sheet: Payslip) => sheet.grossSalary - (sheet.bonusEarnings || 0) - (sheet.commissionEarnings || 0) - (sheet.arrearsEarnings || 0);

/**
 * Full recalculation of a paid month: the original payslip is recomputed against its locked register with
 * corrected master data (salary, allowances, wage type, shift), and the change in base pay is settled in an
 * open period. Tax follows automatically because the adjustment is taxable and reconciled year-to-date.
 */
export function retroRecalculationAdjustment(original: Payslip, recomputed: Payslip, reason: string, actor: { id: string; username: string }, target: { month: number; year: number }): { adjustment?: PayrollAdjustment; difference: number; breakdown: Array<[string, number]> } {
  if (reason.trim().length < 10) throw new Error('Explain what was corrected in at least 10 characters.');
  const fields: Array<[string, keyof Payslip]> = [['Basic', 'basicEarnings'], ['House rent', 'houseRentAllowance'], ['Conveyance', 'conveyanceAllowance'], ['Medical', 'medicalAllowance'], ['Other allowances', 'otherAllowances'], ['Overtime', 'overtimePay'], ['Absence deduction', 'unpaidLeaveDeduction']];
  const breakdown = fields.map(([label, key]) => [label, Math.round(Number(recomputed[key] || 0) - Number(original[key] || 0)) * (key === 'unpaidLeaveDeduction' ? -1 : 1)] as [string, number])
    .filter(([, delta]) => delta !== 0);
  const difference = Math.round(basePay(recomputed) - basePay(original));
  if (difference === 0) return { difference, breakdown };
  const period = `${original.periodYear}-${String(original.periodMonth).padStart(2, '0')}`;
  return {
    difference, breakdown,
    adjustment: {
      id: `adj-recalc-${original.id}-${Date.now()}`, employeeId: original.employeeId, periodMonth: target.month, periodYear: target.year,
      type: difference > 0 ? 'Arrears' : 'Deduction', amount: Math.abs(difference), taxable: difference > 0,
      reason: `Recalculation of ${period}: ${breakdown.map(([label, delta]) => `${label} ${delta > 0 ? '+' : ''}${delta}`).join(', ')}. ${reason.trim()}`.slice(0, 500),
      status: 'Pending', createdAt: new Date().toISOString(), createdById: actor.id, createdBy: actor.username,
    },
  };
}
