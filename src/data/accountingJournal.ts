import type { PayrollRun, Payslip } from '../types';

export interface JournalLine {
  accountCode: string;
  accountName: string;
  costCenter: string;
  debit: number;
  credit: number;
  narration: string;
}

export interface PayrollJournal {
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  csv: string;
  filename: string;
}

const csvCell = (value: string | number) => {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function createPayrollJournal(run: PayrollRun, payslips: Payslip[]): PayrollJournal {
  if (run.status === 'Draft') throw new Error('Approve payroll before exporting the accounting journal.');
  const sheets = payslips.filter(item => item.payrollRunId === run.id);
  if (!sheets.length) throw new Error('No payslips are available for this payroll run.');
  const period = `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
  const lines: JournalLine[] = [];
  const add = (accountCode: string, accountName: string, costCenter: string, debit: number, credit: number) => {
    if (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005) return;
    lines.push({ accountCode, accountName, costCenter, debit, credit, narration: `Payroll ${period}` });
  };
  const byDepartment = new Map<string, { gross: number; reimbursements: number }>();
  sheets.forEach(sheet => {
    const key = sheet.departmentName || 'Unassigned';
    const current = byDepartment.get(key) || { gross: 0, reimbursements: 0 };
    current.gross += sheet.grossSalary;
    current.reimbursements += sheet.reimbursements || 0;
    byDepartment.set(key, current);
  });
  for (const [department, amount] of byDepartment) {
    add('5000', 'Salaries and Wages Expense', department, amount.gross, 0);
    add('5030', 'Employee Reimbursement Expense', department, amount.reimbursements, 0);
  }
  const sum = (value: (sheet: Payslip) => number) => sheets.reduce((total, sheet) => total + value(sheet), 0);
  const employerEobi = sum(sheet => sheet.eobiEmployerContribution);
  const employerSocial = sum(sheet => sheet.pessiEmployerContribution);
  const employerPf = sum(sheet => sheet.providentFundEmployerContribution);
  add('5010', 'Employer EOBI Expense', 'Corporate', employerEobi, 0);
  add('5011', 'Employer Social Security Expense', 'Corporate', employerSocial, 0);
  add('5020', 'Employer Provident Fund Expense', 'Corporate', employerPf, 0);
  add('2100', 'FBR Income Tax Payable', 'Corporate', 0, sum(sheet => sheet.incomeTaxDeduction + (sheet.manualTaxAdjustment || 0)));
  add('2110', 'EOBI Payable', 'Corporate', 0, sum(sheet => sheet.eobiEmployeeDeduction) + employerEobi);
  add('2120', 'Provincial Social Security Payable', 'Corporate', 0, sum(sheet => sheet.pessiEmployeeDeduction) + employerSocial);
  add('2130', 'Provident Fund Payable', 'Corporate', 0, sum(sheet => sheet.providentFundDeduction) + employerPf);
  add('2140', 'Employee Loan Recovery', 'Corporate', 0, sum(sheet => sheet.loanRepaymentDeduction));
  add('2190', 'Other Payroll Deductions', 'Corporate', 0, sum(sheet => sheet.otherAdjustmentsDeduction || 0));
  add('2200', 'Payroll Bank Payable', 'Corporate', 0, sum(sheet => sheet.netSalary));
  const totalDebit = lines.reduce((total, line) => total + line.debit, 0);
  const totalCredit = lines.reduce((total, line) => total + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`Payroll journal is out of balance by PKR ${Math.abs(totalDebit - totalCredit).toFixed(2)}.`);
  const headers = ['Period', 'Account Code', 'Account Name', 'Cost Center', 'Debit PKR', 'Credit PKR', 'Narration'];
  const rows = lines.map(line => [period, line.accountCode, line.accountName, line.costCenter, line.debit.toFixed(2), line.credit.toFixed(2), line.narration]);
  const csv = [headers, ...rows, ['', '', 'TOTAL', '', totalDebit.toFixed(2), totalCredit.toFixed(2), 'Balanced payroll journal']]
    .map(row => row.map(csvCell).join(',')).join('\r\n');
  return { lines, totalDebit, totalCredit, csv, filename: `payroll-journal-${period}.csv` };
}
