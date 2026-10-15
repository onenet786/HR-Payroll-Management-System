import type { Employee, PayrollRun, Payslip } from '../types';

export type StatutoryReportKind = 'FBR' | 'EOBI' | 'SOCIAL_SECURITY';

export interface StatutoryReport {
  filename: string;
  csv: string;
  employeeCount: number;
  total: number;
  warnings: string[];
}

const safeCsvCell = (value: string | number | undefined) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const row = (values: Array<string | number | undefined>) => values.map(safeCsvCell).join(',');

export function createStatutoryReport(kind: StatutoryReportKind, run: PayrollRun, payslips: Payslip[], employees: Employee[]): StatutoryReport {
  if (run.status === 'Draft') throw new Error('Approve payroll before generating statutory returns.');
  const sheets = payslips.filter(item => item.payrollRunId === run.id).sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
  if (!sheets.length) throw new Error('No payslips are available for this payroll run.');
  const employee = (id: string) => employees.find(item => item.id === id);
  const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
  const warnings: string[] = [];
  let headers: Array<string | number>;
  let rows: Array<Array<string | number | undefined>>;
  let total: number;

  if (kind === 'FBR') {
    headers = ['Period', 'Employee Code', 'Employee Name', 'CNIC', 'Tax Year', 'Taxable Gross PKR', 'Tax Withheld PKR'];
    rows = sheets.map(sheet => [period, sheet.employeeCode, sheet.employeeName, sheet.cnic, sheet.taxYear, sheet.grossSalary, sheet.incomeTaxDeduction]);
    total = sheets.reduce((sum, sheet) => sum + sheet.incomeTaxDeduction, 0);
    sheets.forEach(sheet => { if (!/^\d{5}-\d{7}-\d$/.test(sheet.cnic)) warnings.push(`${sheet.employeeCode}: invalid CNIC`); });
  } else if (kind === 'EOBI') {
    headers = ['Period', 'Employee Code', 'Employee Name', 'CNIC', 'EOBI Number', 'Insurable Wage PKR', 'Employee Contribution PKR', 'Employer Contribution PKR', 'Total PKR'];
    rows = sheets.map(sheet => {
      const person = employee(sheet.employeeId);
      if (person?.eobiEnabled !== false && !person?.eobiNumber) warnings.push(`${sheet.employeeCode}: EOBI number missing`);
      return [period, sheet.employeeCode, sheet.employeeName, sheet.cnic, person?.eobiNumber, sheet.basicEarnings, sheet.eobiEmployeeDeduction, sheet.eobiEmployerContribution, sheet.eobiEmployeeDeduction + sheet.eobiEmployerContribution];
    });
    total = sheets.reduce((sum, sheet) => sum + sheet.eobiEmployeeDeduction + sheet.eobiEmployerContribution, 0);
  } else {
    headers = ['Period', 'Province', 'Employee Code', 'Employee Name', 'CNIC', 'Social Security Number', 'Contributory Wage PKR', 'Employer Contribution PKR'];
    rows = sheets.map(sheet => {
      const person = employee(sheet.employeeId);
      if (sheet.pessiEmployerContribution > 0 && !person?.socialSecurityNumber) warnings.push(`${sheet.employeeCode}: social-security number missing`);
      return [period, sheet.province, sheet.employeeCode, sheet.employeeName, sheet.cnic, person?.socialSecurityNumber, sheet.basicEarnings, sheet.pessiEmployerContribution];
    });
    total = sheets.reduce((sum, sheet) => sum + sheet.pessiEmployerContribution, 0);
  }
  const totalRow: Array<string | number> = Array(headers.length).fill('');
  totalRow[0] = 'TOTAL';
  totalRow[totalRow.length - 1] = total;
  const csv = [row(headers), ...rows.map(row), row(totalRow)].join('\r\n');
  return { filename: `${kind.toLowerCase()}-return-${period}.csv`, csv, employeeCount: sheets.length, total, warnings };
}
