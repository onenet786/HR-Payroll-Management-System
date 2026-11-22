import test from 'node:test';
import assert from 'node:assert/strict';
import { planSalarySheet, salarySheetTemplate } from './salarySheet';
import type { Employee } from '../types';

const emp = (code: string, basicSalary: number, status: Employee['status'] = 'Active') =>
  ({ id: `e-${code}`, employeeCode: code, fullName: `Name ${code}`, basicSalary, status, branchId: 'b1' } as Employee);
const employees = [emp('C-1', 0), emp('C-2', 25000), emp('C-3', 0, 'Terminated'), emp('C-4', 1)];
const defaults = { effectiveDate: '2026-11-01', reason: 'Sheet' };

test('rows become revisions only when the code, amount and date are good', () => {
  const csv = [
    '﻿Employee Code,Employee Name,Branch,Current Basic Salary,Basic Salary (PKR),Effective Date,Reason',
    'c-1,Name,Mall,,"32,000",15/10/2026,From CyberAP',
    'C-2,Name,Mall,25000,25000,,',
    'C-3,Name,Mall,,18000,,',
    'C-9,Nobody,Mall,,18000,,',
    'C-4,Name,Mall,1,,,',
    'C-4,Name,Mall,1,abc,,',
    'C-1,Name,Mall,,40000,,',
  ].join('\r\n');
  const plan = planSalarySheet(csv, employees, defaults);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.usable.length, 1);
  assert.equal(plan.usable[0].employee?.id, 'e-C-1');
  assert.equal(plan.usable[0].newSalary, 32000);
  assert.equal(plan.usable[0].effectiveDate, '2026-10-15');
  assert.equal(plan.usable[0].reason, 'From CyberAP');
  const problem = (line: number) => plan.rows.find(r => r.line === line)?.problem;
  assert.equal(problem(3), 'Same as current salary');
  assert.equal(problem(4), 'Employee has left');
  assert.equal(problem(5), 'Employee code not found');
  assert.equal(problem(6), 'Salary left blank');
  assert.equal(problem(7), 'Code appears twice in the sheet');
  assert.equal(problem(8), 'Code appears twice in the sheet');
});

test('missing columns are reported', () => {
  assert.deepEqual(planSalarySheet('Name,Amount\nx,1', employees, defaults).errors, ['No "Employee Code" column found.', 'No "Basic Salary" column found.']);
});

test('the template lists current staff, those without a real salary first, and reads back', () => {
  const csv = salarySheetTemplate(employees, () => 'Mall');
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines.length, 4, 'header + 3 current staff (the leaver is left out)');
  assert.match(lines[1], /^"C-1"/);
  assert.match(lines[3], /^"C-2"/);
  assert.equal(planSalarySheet(csv, employees, defaults).errors.length, 0);
});
