import assert from 'node:assert/strict';
import test from 'node:test';
import { computePayslipDetails, DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_EMPLOYEES, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS } from './defaults';
import type { AttendanceLog, LeaveRequest } from '../types';

const employee = { ...DEFAULT_EMPLOYEES[0], basicSalary: 120000, houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0 };

const calculate = (attendances: AttendanceLog[] = [], leaves: LeaveRequest[] = []) =>
  computePayslipDetails(employee, 7, 2026, attendances, leaves, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES);

test('applies Finance Act 2026 salaried slab progression', () => {
  const result = calculate();
  assert.equal(result.incomeTaxDeduction, 2700);
  assert.equal(result.calculationVersion, 'PK-PAYROLL-2.0');
});

test('counts only the payroll-period portion of cross-month unpaid leave', () => {
  const leave: LeaveRequest = {
    id: 'leave-cross-month', employeeId: employee.id, leaveType: 'Unpaid', startDate: '2026-06-29', endDate: '2026-07-03',
    totalDays: 5, reason: 'Test', status: 'Approved', appliedOn: '2026-06-20'
  };
  const result = calculate([], [leave]);
  assert.equal(result.unpaidLeaveDays, 3);
  assert.equal(result.explicitAbsentDays, 0);
});

test('does not double charge an absent attendance record covered by unpaid leave', () => {
  const attendance: AttendanceLog = { id: 'a1', employeeId: employee.id, date: '2026-07-02', method: 'Manual', status: 'Absent', overtimeMinutes: 0 };
  const leave: LeaveRequest = {
    id: 'l1', employeeId: employee.id, leaveType: 'Unpaid', startDate: '2026-07-02', endDate: '2026-07-02',
    totalDays: 1, reason: 'Test', status: 'Approved', appliedOn: '2026-07-01'
  };
  const result = calculate([attendance], [leave]);
  assert.equal(result.daysAbsent, 1);
});
