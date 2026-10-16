import type { Company, Employee, PayrollRun, Payslip, StatutoryConfig, WageType } from '../types';
import { resolveWageBasis } from './masterData';
import { complianceAlerts } from './complianceAlerts';

export interface CsvReport { filename: string; csv: string; rowCount: number; total: number }

const cell = (value: string | number | undefined) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const toCsv = (rows: Array<Array<string | number | undefined>>) => rows.map(row => row.map(cell).join(',')).join('\r\n');
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const money = (value: number) => Math.round(value).toLocaleString('en-PK');
const periodKey = (sheet: Payslip) => `${sheet.periodYear}-${String(sheet.periodMonth).padStart(2, '0')}`;

/** Tax year N runs from 1 July of N-1 to 30 June of N. */
export const taxYearOfPeriod = (month: number, year: number) => String(month >= 7 ? year + 1 : year);

// Only approved or disbursed, non-cancelled runs represent payroll that was actually processed.
export function processedPayslips(runs: PayrollRun[], payslips: Payslip[]): Payslip[] {
  const processed = new Set(runs.filter(run => run.status === 'Approved' || run.status === 'Disbursed').map(run => run.id));
  return payslips.filter(sheet => processed.has(sheet.payrollRunId) && sheet.periodMonth && sheet.periodYear);
}

export function providentFundLedger(runs: PayrollRun[], payslips: Payslip[], taxYear: string): CsvReport {
  const sheets = processedPayslips(runs, payslips)
    .filter(sheet => taxYearOfPeriod(sheet.periodMonth!, sheet.periodYear!) === taxYear && (sheet.providentFundDeduction || sheet.providentFundEmployerContribution))
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode) || periodKey(a).localeCompare(periodKey(b)));
  const balances = new Map<string, number>();
  const rows = sheets.map(sheet => {
    const contribution = sheet.providentFundDeduction + sheet.providentFundEmployerContribution;
    const balance = (balances.get(sheet.employeeId) || 0) + contribution;
    balances.set(sheet.employeeId, balance);
    return [periodKey(sheet), sheet.employeeCode, sheet.employeeName, sheet.basicEarnings, sheet.providentFundDeduction, sheet.providentFundEmployerContribution, contribution, balance];
  });
  const total = [...balances.values()].reduce((sum, value) => sum + value, 0);
  return {
    filename: `provident-fund-ledger-TY${taxYear}.csv`, rowCount: rows.length, total,
    csv: toCsv([['Period', 'Employee Code', 'Employee Name', 'Basic PKR', 'Employee Contribution PKR', 'Employer Contribution PKR', 'Month Total PKR', 'Tax-Year Balance PKR'], ...rows, ['TOTAL', '', '', '', '', '', '', total]]),
  };
}

export function gratuityProvision(employees: Employee[], asOf: string, config: Pick<StatutoryConfig, 'gratuityRateDaysPerYear'>, wageTypes: WageType[] = []): CsvReport {
  const asOfTime = Date.parse(`${asOf}T00:00:00Z`);
  const rows = employees
    .filter(employee => employee.gratuityOptIn && employee.status !== 'Terminated' && employee.dateOfJoining <= asOf)
    .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode))
    .map(employee => {
      const years = Math.max(0, (asOfTime - Date.parse(`${employee.dateOfJoining}T00:00:00Z`)) / (365.2425 * 86_400_000));
      const monthlyBasis = resolveWageBasis(employee, wageTypes) === 'Daily' ? employee.basicSalary * 26 : employee.basicSalary;
      // Accrual uses service to date; entitlement on exit uses completed years only.
      const accrued = Math.round((monthlyBasis / 30) * config.gratuityRateDaysPerYear * years);
      const vested = Math.round((monthlyBasis / 30) * config.gratuityRateDaysPerYear * Math.floor(years));
      return { employee, years, monthlyBasis, accrued, vested };
    });
  const total = rows.reduce((sum, row) => sum + row.accrued, 0);
  return {
    filename: `gratuity-provision-${asOf}.csv`, rowCount: rows.length, total,
    csv: toCsv([
      ['As Of', 'Employee Code', 'Employee Name', 'Date of Joining', 'Service Years', 'Monthly Salary Basis PKR', 'Days per Year', 'Accrued Provision PKR', 'Vested (completed years) PKR'],
      ...rows.map(row => [asOf, row.employee.employeeCode, row.employee.fullName, row.employee.dateOfJoining, row.years.toFixed(2), row.monthlyBasis, config.gratuityRateDaysPerYear, row.accrued, row.vested]),
      ['TOTAL', '', '', '', '', '', '', total, rows.reduce((sum, row) => sum + row.vested, 0)],
    ]),
  };
}

export interface TaxDepositLine { run: PayrollRun; deducted: number; deposited: number; variance: number; status: 'Deposited' | 'Short deposited' | 'Over deposited' | 'Not deposited' }

export function taxDepositLines(runs: PayrollRun[], payslips: Payslip[]): TaxDepositLine[] {
  return runs.filter(run => run.status === 'Approved' || run.status === 'Disbursed')
    .sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth)
    .map(run => {
      const deducted = payslips.filter(sheet => sheet.payrollRunId === run.id).reduce((sum, sheet) => sum + sheet.incomeTaxDeduction + (sheet.manualTaxAdjustment || 0), 0);
      const deposited = run.taxDeposit?.amount || 0;
      const variance = deposited - deducted;
      const status = !run.taxDeposit ? 'Not deposited' : Math.abs(variance) < 1 ? 'Deposited' : variance < 0 ? 'Short deposited' : 'Over deposited';
      return { run, deducted, deposited, variance, status };
    });
}

export function taxDepositReconciliation(runs: PayrollRun[], payslips: Payslip[]): CsvReport {
  const lines = taxDepositLines(runs, payslips);
  const total = lines.reduce((sum, line) => sum + line.deducted, 0);
  return {
    filename: 'fbr-tax-deposit-reconciliation.csv', rowCount: lines.length, total,
    csv: toCsv([
      ['Period', 'Payroll Run', 'Run Type', 'Tax Deducted PKR', 'Tax Deposited PKR', 'Variance PKR', 'CPR Number', 'Deposit Date', 'Status'],
      ...lines.map(line => [`${line.run.periodYear}-${String(line.run.periodMonth).padStart(2, '0')}`, line.run.title, line.run.runType || 'Regular', line.deducted, line.deposited, line.variance, line.run.taxDeposit?.cprNumber, line.run.taxDeposit?.depositedOn, line.status]),
      ['TOTAL', '', '', total, lines.reduce((sum, line) => sum + line.deposited, 0), lines.reduce((sum, line) => sum + line.variance, 0), '', '', ''],
    ]),
  };
}

export interface AnnualTaxSummary { employee: Employee; months: Payslip[]; gross: number; taxable: number; tax: number }

export function annualTaxSummaries(employees: Employee[], runs: PayrollRun[], payslips: Payslip[], taxYear: string): AnnualTaxSummary[] {
  const sheets = processedPayslips(runs, payslips).filter(sheet => taxYearOfPeriod(sheet.periodMonth!, sheet.periodYear!) === taxYear);
  return employees.map(employee => {
    const months = sheets.filter(sheet => sheet.employeeId === employee.id).sort((a, b) => periodKey(a).localeCompare(periodKey(b)));
    return {
      employee, months,
      gross: months.reduce((sum, sheet) => sum + sheet.grossSalary + (sheet.reimbursements || 0), 0),
      taxable: months.reduce((sum, sheet) => sum + (sheet.taxableIncomeThisPeriod ?? sheet.grossSalary), 0),
      tax: months.reduce((sum, sheet) => sum + sheet.incomeTaxDeduction + (sheet.manualTaxAdjustment || 0), 0),
    };
  }).filter(summary => summary.months.length > 0);
}

export function annualTaxCertificatesCsv(employees: Employee[], runs: PayrollRun[], payslips: Payslip[], taxYear: string): CsvReport {
  const summaries = annualTaxSummaries(employees, runs, payslips, taxYear);
  const total = summaries.reduce((sum, item) => sum + item.tax, 0);
  return {
    filename: `annual-salary-tax-certificates-TY${taxYear}.csv`, rowCount: summaries.length, total,
    csv: toCsv([
      ['Tax Year', 'Employee Code', 'Employee Name', 'CNIC', 'NTN', 'Months Paid', 'Gross Salary PKR', 'Taxable Salary PKR', 'Tax Deducted PKR', 'Prior Employer Income PKR', 'Prior Employer Tax PKR'],
      ...summaries.map(item => [taxYear, item.employee.employeeCode, item.employee.fullName, item.employee.cnic, item.employee.ntn, item.months.length, item.gross, item.taxable, item.tax, item.employee.priorEmployerTaxableIncome || 0, item.employee.priorEmployerTaxDeducted || 0]),
      ['TOTAL', '', '', '', '', '', '', '', total, '', ''],
    ]),
  };
}

// Printable certificate of salary paid and tax deducted (Income Tax Ordinance 2001, s.149 / Rule 42).
export function annualTaxCertificateHtml(employee: Employee, runs: PayrollRun[], payslips: Payslip[], taxYear: string, company?: Company): string {
  const summary = annualTaxSummaries([employee], runs, payslips, taxYear)[0];
  if (!summary) throw new Error(`No processed payroll for ${employee.fullName} in tax year ${taxYear}.`);
  const runById = new Map(runs.map(run => [run.id, run]));
  const rows = summary.months.map(sheet => {
    const run = runById.get(sheet.payrollRunId);
    return `<tr><td>${escapeHtml(periodKey(sheet))}</td><td>${escapeHtml(run?.runType || 'Regular')}</td><td class="n">${money(sheet.grossSalary)}</td><td class="n">${money(sheet.taxableIncomeThisPeriod ?? sheet.grossSalary)}</td><td class="n">${money(sheet.incomeTaxDeduction + (sheet.manualTaxAdjustment || 0))}</td><td>${escapeHtml(run?.taxDeposit?.cprNumber || 'Pending')}</td></tr>`;
  }).join('');
  const startYear = Number(taxYear) - 1;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Salary tax certificate TY${escapeHtml(taxYear)} — ${escapeHtml(employee.fullName)}</title>
<style>body{font-family:Arial,sans-serif;color:#0f172a;max-width:820px;margin:32px auto;font-size:13px}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}th{background:#f1f5f9}.n{text-align:right;font-family:monospace}.muted{color:#475569;font-size:11px}.sig{margin-top:56px;display:flex;justify-content:space-between}</style></head><body>
<h1>Certificate of Deduction of Income Tax on Salary</h1>
<p class="muted">Section 149 of the Income Tax Ordinance, 2001 · Tax Year ${escapeHtml(taxYear)} (1 July ${startYear} – 30 June ${taxYear})</p>
<p><strong>Employer:</strong> ${escapeHtml(company?.legalName || company?.name || 'Employer')}${company?.ntn ? ` · NTN ${escapeHtml(company.ntn)}` : ''}</p>
<p><strong>Employee:</strong> ${escapeHtml(employee.fullName)} (${escapeHtml(employee.employeeCode)}) · CNIC ${escapeHtml(employee.cnic)}${employee.ntn ? ` · NTN ${escapeHtml(employee.ntn)}` : ''}</p>
<table><thead><tr><th>Period</th><th>Run</th><th class="n">Gross PKR</th><th class="n">Taxable PKR</th><th class="n">Tax Deducted PKR</th><th>CPR No.</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><th colspan="2">Total</th><th class="n">${money(summary.gross)}</th><th class="n">${money(summary.taxable)}</th><th class="n">${money(summary.tax)}</th><th></th></tr></tfoot></table>
${employee.priorEmployerTaxableIncome ? `<p class="muted">Prior-employer income declared: PKR ${money(employee.priorEmployerTaxableIncome)}; tax deducted by prior employer: PKR ${money(employee.priorEmployerTaxDeducted || 0)}.</p>` : ''}
<p class="muted">Certified that the above tax was deducted from the employee's salary and deposited in the Government treasury against the CPR numbers shown. Rows marked "Pending" must be reconciled before issue.</p>
<div class="sig"><span>Prepared by: ____________________</span><span>Authorized signatory &amp; stamp: ____________________</span></div>
</body></html>`;
}

export function missingRegistrationReport(employees: Employee[]): CsvReport {
  const alerts = complianceAlerts({ employees, attendances: [] }).filter(item => ['Registration', 'Bank', 'Documents'].includes(item.category));
  return {
    filename: 'missing-registrations-exceptions.csv', rowCount: alerts.length, total: alerts.length,
    csv: toCsv([['Severity', 'Category', 'Employee', 'Issue'], ...alerts.map(item => [item.severity, item.category, item.employeeName, item.message])]),
  };
}

/**
 * Monthly reconciliation of each employee's tax deducted so far against the annual liability the
 * latest payslip projects, so under- or over-withholding is visible before year end.
 */
export function taxReconciliationReport(employees: Employee[], runs: PayrollRun[], payslips: Payslip[], taxYear: string): CsvReport {
  const rows = annualTaxSummaries(employees, runs, payslips, taxYear).map(summary => {
    const latest = summary.months[summary.months.length - 1];
    const monthsElapsed = latest.periodMonth! >= 7 ? latest.periodMonth! - 6 : latest.periodMonth! + 6;
    const priorTax = summary.employee.priorEmployerTaxDeducted || 0;
    const deducted = summary.tax + priorTax;
    const liability = latest.projectedAnnualTaxLiability || 0;
    const expectedToDate = Math.round(liability * monthsElapsed / 12);
    return [taxYear, summary.employee.employeeCode, summary.employee.fullName, `${latest.periodYear}-${String(latest.periodMonth).padStart(2, '0')}`, monthsElapsed,
      latest.projectedAnnualTaxableIncome || 0, liability, latest.surchargeAnnual || 0, deducted, expectedToDate, deducted - expectedToDate, Math.max(0, liability - deducted),
      Math.abs(deducted - expectedToDate) > Math.max(1000, liability * 0.05) ? 'Review' : 'On track'];
  });
  const total = rows.reduce((sum, row) => sum + Number(row[8]), 0);
  return {
    filename: `tax-reconciliation-TY${taxYear}.csv`, rowCount: rows.length, total,
    csv: toCsv([['Tax Year', 'Employee Code', 'Employee Name', 'Latest Period', 'Months Elapsed', 'Projected Annual Taxable PKR', 'Projected Annual Liability PKR', 'Surcharge PKR', 'Deducted YTD (incl. prior employer) PKR', 'Expected To Date PKR', 'Variance PKR', 'Remaining Liability PKR', 'Status'], ...rows]),
  };
}
