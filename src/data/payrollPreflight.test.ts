import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_EMPLOYEES } from './defaults';
import { payrollPreflight } from './payrollPreflight';
import type { Payslip } from '../types';
import { DEFAULT_BRANCHES, DEFAULT_STATUTORY_CONFIG } from './defaults';

const employee = DEFAULT_EMPLOYEES[0];
const sheet = { employeeId: employee.id, employeeName: employee.fullName, payrollRunId: 'new', netSalary: 100000, periodMonth: 10, periodYear: 2026 } as Payslip;

test('blocks incomplete payment identity and bank details', () => {
  const issues = payrollPreflight([{ ...employee, cnic: 'bad', bankAccountNumber: '' }], [sheet], []);
  assert.deepEqual(issues.filter(item => item.severity === 'Critical').map(item => item.code), ['INVALID_CNIC', 'MISSING_BANK']);
});

test('enforces provincial configured minimum wage and flags undocumented statutory exclusions', () => {
  const issues = payrollPreflight([{ ...employee, basicSalary: 1000, eobiEnabled: false, eobiExemptionReason: '', socialSecurityNumber: '', socialSecurityExemptionReason: '' }], [sheet], [], DEFAULT_BRANCHES, DEFAULT_STATUTORY_CONFIG);
  assert.ok(issues.some(item => item.code === 'BELOW_MINIMUM_WAGE' && item.severity === 'Critical'));
  assert.ok(issues.some(item => item.code === 'MISSING_EOBI_REASON'));
  assert.ok(issues.some(item => item.code === 'MISSING_SOCIAL_SECURITY_REASON'));
});

test('flags a material net-pay variance without making it critical', () => {
  const prior = { ...sheet, payrollRunId: 'old', netSalary: 70000, periodMonth: 9 };
  const issues = payrollPreflight([employee], [sheet], [prior]);
  assert.equal(issues.find(item => item.code === 'NET_VARIANCE')?.severity, 'Warning');
});

test('flags missing NTN where FBR withholding is enabled', () => {
  const issues = payrollPreflight([{ ...employee, fbrEnabled: true, ntn: '' }], [sheet], []);
  assert.equal(issues.find(item => item.code === 'MISSING_NTN')?.severity, 'Warning');
});

test('blocks duplicate CNICs and makes shared payment accounts visible to payroll approvers', () => {
  const colleague = { ...employee, id: 'employee-duplicate', fullName: 'Duplicate Record', employeeCode: 'EMP-DUP' };
  const issues = payrollPreflight([employee, colleague], [sheet], []);
  assert.equal(issues.find(item => item.code === 'DUPLICATE_CNIC')?.severity, 'Critical');
  assert.equal(issues.find(item => item.code === 'DUPLICATE_BANK_ACCOUNT')?.severity, 'Warning');
});
