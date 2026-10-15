import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePayslipDetails,
  DEFAULT_BRANCHES,
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_EMPLOYEES,
  DEFAULT_STATUTORY_CONFIG,
  DEFAULT_TAX_SLABS,
  calculateGrossFromTakeHome,
  calculateFbrSalarySplit
} from './defaults';
import type { AttendanceLog, LeaveRequest } from '../types';

const employee = { ...DEFAULT_EMPLOYEES[0], basicSalary: 120000, houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0 };

const calculate = (attendances: AttendanceLog[] = [], leaves: LeaveRequest[] = []) =>
  computePayslipDetails(employee, 7, 2026, attendances, leaves, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_BRANCHES);

test('applies Finance Act 2026 salaried slab progression', () => {
  const result = calculate();
  assert.equal(result.incomeTaxDeduction, 5500);
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

test('reverse calculates gross salary to deliver target net take-home pay', () => {
  // Target Net 100,000 PKR
  const rev = calculateGrossFromTakeHome(100000, DEFAULT_TAX_SLABS, 37000);
  assert.ok(rev.gross >= 100000);
  // Verify net matches within 1 PKR
  assert.ok(Math.abs(rev.net - 100000) <= 1);

  // FBR segregation test for 100,000 PKR standard package
  const split = calculateFbrSalarySplit(100000, false, DEFAULT_TAX_SLABS, 37000);
  assert.equal(split.basicWage, 50000); // 50%
  assert.equal(split.houseRentAllowance, 30000); // 30%
  assert.equal(split.conveyanceAllowance, 10000); // 10%
  assert.equal(split.medicalAllowance, 10000); // 10%
  assert.equal(split.basicWage + split.houseRentAllowance + split.conveyanceAllowance + split.medicalAllowance, 100000);
});

