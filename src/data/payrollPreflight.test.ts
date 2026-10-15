import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_EMPLOYEES } from './defaults';
import { payrollPreflight } from './payrollPreflight';
import type { Payslip } from '../types';

const employee = DEFAULT_EMPLOYEES[0];
const sheet = { employeeId: employee.id, employeeName: employee.fullName, payrollRunId: 'new', netSalary: 100000, periodMonth: 10, periodYear: 2026 } as Payslip;

test('blocks incomplete payment identity and bank details', () => {
  const issues = payrollPreflight([{ ...employee, cnic: 'bad', bankAccountNumber: '' }], [sheet], []);
  assert.deepEqual(issues.filter(item => item.severity === 'Critical').map(item => item.code), ['INVALID_CNIC', 'MISSING_BANK']);
});

test('flags a material net-pay variance without making it critical', () => {
  const prior = { ...sheet, payrollRunId: 'old', netSalary: 70000, periodMonth: 9 };
  const issues = payrollPreflight([employee], [sheet], [prior]);
  assert.equal(issues.find(item => item.code === 'NET_VARIANCE')?.severity, 'Warning');
});
