import assert from 'node:assert/strict';
import test from 'node:test';
import { createStatutoryReport } from './statutoryReports';
import type { Employee, PayrollRun, Payslip } from '../types';

const run = { id: 'run', status: 'Approved', periodMonth: 9, periodYear: 2026 } as PayrollRun;
const employee = { id: 'e1', eobiNumber: 'E-1', socialSecurityNumber: 'SS-1' } as Employee;
const sheet = { id: 'p1', payrollRunId: 'run', employeeId: 'e1', employeeCode: '=RISK', employeeName: 'Test', cnic: '42101-1234567-3', taxYear: '2027', grossSalary: 100000, basicEarnings: 50000, incomeTaxDeduction: 1000, eobiEmployeeDeduction: 370, eobiEmployerContribution: 1850, pessiEmployerContribution: 3000, province: 'Sindh' } as Payslip;

test('statutory reports reconcile totals and neutralize spreadsheet formulas', () => {
  const report = createStatutoryReport('FBR', run, [sheet], [employee]);
  assert.equal(report.total, 1000);
  assert.equal(report.employeeCount, 1);
  assert.match(report.csv, /'=RISK/);
});

test('draft payroll cannot produce a statutory filing pack', () => {
  assert.throws(() => createStatutoryReport('EOBI', { ...run, status: 'Draft' }, [sheet], [employee]), /Approve payroll/);
});
