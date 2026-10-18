import assert from 'node:assert/strict';
import test from 'node:test';
import { createPayrollJournal } from './accountingJournal';
import type { PayrollRun, Payslip } from '../types';

const run = { id: 'run', status: 'Approved', periodMonth: 10, periodYear: 2026 } as PayrollRun;
const sheet = { id: 'p1', payrollRunId: 'run', departmentName: 'Operations', grossSalary: 100000, reimbursements: 2000, netSalary: 90000, totalDeductions: 12000, incomeTaxDeduction: 5000, manualTaxAdjustment: 0, eobiEmployeeDeduction: 500, pessiEmployeeDeduction: 0, providentFundDeduction: 5000, loanRepaymentDeduction: 1000, otherAdjustmentsDeduction: 500, eobiEmployerContribution: 2500, pessiEmployerContribution: 3000, providentFundEmployerContribution: 5000 } as Payslip;

test('creates a balanced Pakistan payroll journal', () => {
  const journal = createPayrollJournal(run, [sheet]);
  assert.equal(journal.totalDebit, 112500);
  assert.equal(journal.totalCredit, 112500);
  assert.match(journal.csv, /FBR Income Tax Payable/);
  assert.match(journal.csv, /Payroll Bank Payable/);
});

test('draft payroll cannot be posted to accounting', () => {
  assert.throws(() => createPayrollJournal({ ...run, status: 'Draft' }, [sheet]), /Approve payroll/);
});
