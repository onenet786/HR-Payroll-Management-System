import assert from 'node:assert/strict';
import test from 'node:test';
import { compareParallelRun, parallelRunCsv, parseLegacyPayrollCsv } from './parallelRun';
import { goLiveReadiness } from './goLiveReadiness';
import { DEFAULT_STATUTORY_CONFIG, DEFAULT_EMPLOYEES } from './defaults';
import type { Branch, Employee, PayrollRun, Payslip, Role, UserAccount } from '../types';

const sheet = (code: string, cnic: string, net: number, tax = 5000) => ({ id: `p-${code}`, payrollRunId: 'r', employeeCode: code, employeeName: `Name ${code}`, cnic, grossSalary: net + tax, incomeTaxDeduction: tax, netSalary: net } as Payslip);

test('legacy payroll CSV is parsed with flexible headers, delimiters, totals rows and bracketed negatives', () => {
  const csv = '﻿Emp Code;CNIC No;Gross Pay (PKR);Income Tax;Net Payable\nE1;35202-1234567-1;"100,000";5,000;95000\nE2;;60000;(500);60500\nTOTAL;;160000;4500;155500\n';
  const parsed = parseLegacyPayrollCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.matchedFields, ['grossSalary', 'incomeTaxDeduction', 'netSalary']);
  assert.equal(parsed.rows.length, 2, 'totals row skipped');
  assert.deepEqual(parsed.rows[0], { code: 'E1', cnic: '3520212345671', values: { grossSalary: 100000, incomeTaxDeduction: 5000, netSalary: 95000 } });
  assert.equal(parsed.rows[1].values.incomeTaxDeduction, -500);
  assert.match(parseLegacyPayrollCsv('Name,Amount\nA,1').errors.join(' '), /employee code or CNIC/);
});

test('parallel run matches by code or CNIC and reports differences within tolerance', () => {
  const parsed = parseLegacyPayrollCsv('CNIC,Net,Tax\n35202-1234567-1,95000,5000\n35202-7654321-2,60000.6,4000\n99999-9999999-9,1000,0\n');
  const result = compareParallelRun(parsed, [sheet('E1', '35202-1234567-1', 95000), sheet('E2', '35202-7654321-2', 61000, 3000), sheet('E3', '35202-1111111-1', 50000)]);
  assert.equal(result.matched, 1);
  assert.equal(result.differing, 1);
  assert.equal(result.onlyLegacy, 1);
  assert.equal(result.onlySystem, 1);
  assert.equal(result.netDelta, 999);
  const e2 = result.lines.find(line => line.employeeCode === 'E2')!;
  assert.deepEqual(e2.differences.map(item => [item.field, item.delta]), [['Income tax', -1000], ['Net', 999]]);
  assert.match(parallelRunCsv(result), /"E2","Name E2","Difference","Income tax",4000,3000,-1000/);
});

test('go-live readiness turns ready as each control is completed', () => {
  const branch: Branch = { id: 'b', companyId: 'c', name: 'HQ', city: 'Lahore', province: 'Punjab', address: 'x' };
  const employee: Employee = { ...DEFAULT_EMPLOYEES[0], status: 'Active', cnic: '35202-1234567-1', basicSalary: 90000, iban: 'PK36SCBL0000001123456702', bankAccountNumber: '1', branchId: 'b' };
  const roles: Role[] = [{ id: 'role-payroll', name: 'Payroll', description: '', permissions: ['manage_payroll'] }];
  const user = (id: string, mfa = true) => ({ id, username: id, email: '', roleId: 'role-payroll', status: 'Active', mfaEnabled: mfa } as UserAccount);
  const base = { employees: [employee], branches: [branch], roles, payrollRuns: [] as PayrollRun[], today: '2026-10-16' };
  const before = goLiveReadiness({ ...base, statConfig: { ...DEFAULT_STATUTORY_CONFIG, leaveEntitlements: undefined }, users: [user('a', false)] });
  const status = (items: ReturnType<typeof goLiveReadiness>, id: string) => items.find(item => item.id === id)?.status;
  for (const id of ['statutory-approved', 'statutory-source', 'branches', 'bank-file', 'segregation', 'mfa', 'parallel-run', 'policy-defaults']) assert.equal(status(before, id), 'Action needed', id);
  assert.equal(status(before, 'tax-year'), 'Ready');
  assert.equal(status(before, 'employee-data'), 'Ready');

  const config = {
    ...DEFAULT_STATUTORY_CONFIG, changeRequestId: 'chg-1', sourceReference: 'Finance Act 2026', sourceDocuments: [{ id: 'd', name: 'ratecard.pdf', uploadedAt: '' }],
    leaveEntitlements: { Annual: 14 }, exportTemplates: [{ id: 't', name: 'HBL', kind: 'Bank Advice' as const, bank: 'HBL', format: 'Delimited' as const, columns: [{ title: 'IBAN', value: '{iban}' }], verified: true }],
  };
  const after = goLiveReadiness({
    ...base, statConfig: config, users: [user('a'), user('b'), user('c')],
    branches: [{ ...branch, establishmentType: 'Factory', geofenceLatitude: 31.5, geofenceLongitude: 74.3, geofenceRadiusMeters: 100 }],
    payrollRuns: [{ id: 'r', status: 'Disbursed', periodMonth: 9, periodYear: 2026, parallelRun: { comparedAt: '', comparedById: 'a', comparedBy: 'a', legacyFileName: 'f.csv', matched: 1, differing: 0, onlyLegacy: 0, onlySystem: 0, netDelta: 0 } } as PayrollRun],
  });
  assert.deepEqual(after.filter(item => item.status === 'Action needed').map(item => item.id), []);
});
