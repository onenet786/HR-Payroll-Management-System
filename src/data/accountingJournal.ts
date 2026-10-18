import type { JournalAccount, JournalAccountKey, PayrollRun, Payslip, StatutoryConfig } from '../types';

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

export const DEFAULT_JOURNAL_ACCOUNTS: Record<JournalAccountKey, JournalAccount> = {
  salaryExpense: { code: '5000', name: 'Salaries and Wages Expense' },
  reimbursementExpense: { code: '5030', name: 'Employee Reimbursement Expense' },
  eobiExpense: { code: '5010', name: 'Employer EOBI Expense' },
  socialSecurityExpense: { code: '5011', name: 'Employer Social Security Expense' },
  providentFundExpense: { code: '5020', name: 'Employer Provident Fund Expense' },
  incomeTaxPayable: { code: '2100', name: 'FBR Income Tax Payable' },
  eobiPayable: { code: '2110', name: 'EOBI Payable' },
  socialSecurityPayable: { code: '2120', name: 'Provincial Social Security Payable' },
  providentFundPayable: { code: '2130', name: 'Provident Fund Payable' },
  loanRecovery: { code: '2140', name: 'Employee Loan Recovery' },
  otherDeductions: { code: '2190', name: 'Other Payroll Deductions' },
  bankPayable: { code: '2200', name: 'Payroll Bank Payable' },
};

export const JOURNAL_ACCOUNT_LABELS: Record<JournalAccountKey, string> = {
  salaryExpense: 'Gross salary, allowances and overtime', reimbursementExpense: 'Reimbursements', eobiExpense: 'Employer EOBI',
  socialSecurityExpense: 'Employer social security', providentFundExpense: 'Employer provident fund', incomeTaxPayable: 'Income tax withheld',
  eobiPayable: 'EOBI payable', socialSecurityPayable: 'Social security payable', providentFundPayable: 'Provident fund payable',
  loanRecovery: 'Loan and advance recovery', otherDeductions: 'Other deductions', bankPayable: 'Net salary / bank clearing',
};

export function resolveJournalAccounts(config?: Pick<StatutoryConfig, 'journalAccounts'>): Record<JournalAccountKey, JournalAccount> {
  const resolved = { ...DEFAULT_JOURNAL_ACCOUNTS };
  for (const [key, account] of Object.entries(config?.journalAccounts || {}) as [JournalAccountKey, JournalAccount | undefined][]) {
    if (account?.code?.trim() && account.name?.trim()) resolved[key] = { code: account.code.trim(), name: account.name.trim() };
  }
  return resolved;
}

const csvCell = (value: string | number) => {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

function buildLines(sheets: Payslip[], period: string, accounts: Record<JournalAccountKey, JournalAccount>, narration: string): JournalLine[] {
  const lines: JournalLine[] = [];
  const add = (key: JournalAccountKey, costCenter: string, debit: number, credit: number) => {
    if (Math.abs(debit) < 0.005 && Math.abs(credit) < 0.005) return;
    lines.push({ accountCode: accounts[key].code, accountName: accounts[key].name, costCenter, debit, credit, narration: `${narration} ${period}` });
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
    add('salaryExpense', department, amount.gross, 0);
    add('reimbursementExpense', department, amount.reimbursements, 0);
  }
  const sum = (value: (sheet: Payslip) => number) => sheets.reduce((total, sheet) => total + value(sheet), 0);
  const employerEobi = sum(sheet => sheet.eobiEmployerContribution);
  const employerSocial = sum(sheet => sheet.pessiEmployerContribution);
  const employerPf = sum(sheet => sheet.providentFundEmployerContribution);
  add('eobiExpense', 'Corporate', employerEobi, 0);
  add('socialSecurityExpense', 'Corporate', employerSocial, 0);
  add('providentFundExpense', 'Corporate', employerPf, 0);
  add('incomeTaxPayable', 'Corporate', 0, sum(sheet => sheet.incomeTaxDeduction + (sheet.manualTaxAdjustment || 0)));
  add('eobiPayable', 'Corporate', 0, sum(sheet => sheet.eobiEmployeeDeduction) + employerEobi);
  add('socialSecurityPayable', 'Corporate', 0, sum(sheet => sheet.pessiEmployeeDeduction) + employerSocial);
  add('providentFundPayable', 'Corporate', 0, sum(sheet => sheet.providentFundDeduction) + employerPf);
  add('loanRecovery', 'Corporate', 0, sum(sheet => sheet.loanRepaymentDeduction));
  add('otherDeductions', 'Corporate', 0, sum(sheet => sheet.otherAdjustmentsDeduction || 0));
  add('bankPayable', 'Corporate', 0, sum(sheet => sheet.netSalary));
  return lines;
}

function toJournal(lines: JournalLine[], period: string, filename: string, footer: string): PayrollJournal {
  const totalDebit = lines.reduce((total, line) => total + line.debit, 0);
  const totalCredit = lines.reduce((total, line) => total + line.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`Payroll journal is out of balance by PKR ${Math.abs(totalDebit - totalCredit).toFixed(2)}.`);
  const headers = ['Period', 'Account Code', 'Account Name', 'Cost Center', 'Debit PKR', 'Credit PKR', 'Narration'];
  const rows = lines.map(line => [period, line.accountCode, line.accountName, line.costCenter, line.debit.toFixed(2), line.credit.toFixed(2), line.narration]);
  const csv = [headers, ...rows, ['', '', 'TOTAL', '', totalDebit.toFixed(2), totalCredit.toFixed(2), footer]]
    .map(row => row.map(csvCell).join(',')).join('\r\n');
  return { lines, totalDebit, totalCredit, csv, filename };
}

const runSheets = (run: PayrollRun, payslips: Payslip[]) => {
  const sheets = payslips.filter(item => item.payrollRunId === run.id);
  if (!sheets.length) throw new Error('No payslips are available for this payroll run.');
  return sheets;
};
const runPeriod = (run: PayrollRun) => `${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`;
const runLabel = (run: PayrollRun) => run.runType && run.runType !== 'Regular' ? `${run.runType} payroll` : 'Payroll';

export function createPayrollJournal(run: PayrollRun, payslips: Payslip[], config?: Pick<StatutoryConfig, 'journalAccounts'>): PayrollJournal {
  if (run.status === 'Draft') throw new Error('Approve payroll before exporting the accounting journal.');
  if (run.status === 'Cancelled') throw new Error('This payroll run was cancelled. Export its reversal journal instead.');
  const period = runPeriod(run);
  const lines = buildLines(runSheets(run, payslips), period, resolveJournalAccounts(config), runLabel(run));
  const suffix = run.runType && run.runType !== 'Regular' ? `-${run.runType.toLowerCase().replace(/\s+/g, '-')}-${run.id.slice(-6)}` : '';
  return toJournal(lines, period, `payroll-journal-${period}${suffix}.csv`, 'Balanced payroll journal');
}

// Reverses a journal that may already have been posted for an approved run that was later cancelled.
export function createPayrollReversalJournal(run: PayrollRun, payslips: Payslip[], config?: Pick<StatutoryConfig, 'journalAccounts'>): PayrollJournal {
  if (run.status !== 'Cancelled' || run.statusBeforeCancellation !== 'Approved') throw new Error('A reversal journal is only needed for an approved payroll run that was cancelled.');
  const period = runPeriod(run);
  const lines = buildLines(runSheets(run, payslips), period, resolveJournalAccounts(config), `Reversal of ${runLabel(run).toLowerCase()}`)
    .map(line => ({ ...line, debit: line.credit, credit: line.debit }));
  return toJournal(lines, period, `payroll-reversal-journal-${period}-${run.id.slice(-6)}.csv`, `Reversal: ${run.cancellationReason || 'payroll cancelled'}`);
}
