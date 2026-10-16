import assert from 'node:assert/strict';
import test from 'node:test';
import { computePayslipDetails, DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_EMPLOYEES, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS } from './defaults';
import { JURISDICTIONS, provincialPolicy } from './provincialCompliance';
import { complianceAlerts } from './complianceAlerts';
import { payrollPreflight } from './payrollPreflight';
import { retroRecalculationAdjustment } from './offCyclePayroll';
import { leaveBalanceError, leaveBalances } from './leavePolicy';
import { translateInterfaceText } from '../utils/urduInterface';
import type { AttendanceLog, Branch, Employee, LeaveRequest, Payslip } from '../types';

const ict: Branch = { id: 'b-isb', companyId: 'c', name: 'Islamabad', city: 'Islamabad', province: 'ICT', address: 'Blue Area', establishmentType: 'Shop / Commercial' };
const factory: Branch = { id: 'b-fac', companyId: 'c', name: 'Plant', city: 'Lahore', province: 'Punjab', address: 'Kot Lakhpat', establishmentType: 'Factory' };
const employee: Employee = { ...DEFAULT_EMPLOYEES[0], id: 'x1', status: 'Active', dateOfJoining: '2020-01-01', basicSalary: 100000, wageType: 'Monthly', wageTypeId: undefined,
  houseRentAllowance: 0, conveyanceAllowance: 0, medicalAllowance: 0, otherAllowances: 0, branchId: 'b-fac', cnic: '35202-1234567-1' };

test('Islamabad (ICT) is a jurisdiction with its own minimum wage and federal scheme', () => {
  assert.ok(JURISDICTIONS.includes('ICT'));
  const config = { ...DEFAULT_STATUTORY_CONFIG, provincialMinimumWages: { ...DEFAULT_STATUTORY_CONFIG.provincialMinimumWages, ICT: 40000 } };
  const policy = provincialPolicy(config, 'ICT');
  assert.equal(policy.scheme, 'Federal / ICT');
  assert.equal(policy.minimumWage, 40000);
  const sheet = { payrollRunId: 'r', netSalary: 38000 } as Payslip;
  const issues = payrollPreflight([{ ...employee, branchId: 'b-isb', basicSalary: 38000 }], [{ ...sheet, employeeId: 'x1' }], [], [ict], config);
  assert.ok(issues.some(item => item.code === 'BELOW_MINIMUM_WAGE' && /ICT/.test(item.message)));
});

test('factory and shop rules override overtime, limits and minimum wage per establishment', () => {
  const config = { ...DEFAULT_STATUTORY_CONFIG, overtimeMultiplier: 2, establishmentRules: { Factory: { overtimeMultiplier: 2.5, maxWeeklyOvertimeHours: 4, minimumWage: 45000 } } };
  const log: AttendanceLog = { id: 'a', employeeId: 'x1', date: '2026-07-02', punchIn: '09:00', punchOut: '19:00', method: 'Biometric', status: 'Present', overtimeMinutes: 300 };
  const atFactory = computePayslipDetails(employee, 7, 2026, [log], [], config, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, [factory]);
  const atShop = computePayslipDetails({ ...employee, branchId: 'b-isb' }, 7, 2026, [{ ...log }], [], config, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, [ict]);
  assert.ok(Math.abs(atFactory.overtimePay / atShop.overtimePay - 1.25) < 0.001, 'factory pays 2.5x vs global 2x');
  const alerts = complianceAlerts({ employees: [{ ...employee, basicSalary: 42000 }], attendances: [{ ...log, date: '2026-10-05' }], branches: [factory], statConfig: config, today: '2026-10-10' });
  assert.ok(alerts.some(alert => alert.category === 'Overtime' && /4 h limit/.test(alert.message)));
  assert.ok(alerts.some(alert => alert.category === 'Minimum wage' && /45,000/.test(alert.message)));
});

test('full recalculation of a paid month raises only the base-pay difference', () => {
  const original = computePayslipDetails(employee, 9, 2026, [], [], DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, [factory]);
  const corrected = computePayslipDetails({ ...employee, houseRentAllowance: 30000 }, 9, 2026, [], [], DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, [factory]);
  const result = retroRecalculationAdjustment({ ...original, id: 'p-sep', bonusEarnings: 5000, grossSalary: original.grossSalary + 5000 }, corrected, 'House rent omitted at onboarding', { id: 'u', username: 'u' }, { month: 10, year: 2026 });
  assert.equal(result.difference, 30000);
  assert.deepEqual(result.breakdown, [['House rent', 30000]]);
  assert.equal(result.adjustment?.type, 'Arrears');
  assert.equal(result.adjustment?.taxable, true);
  assert.equal(retroRecalculationAdjustment(original, original, 'Nothing changed at all', { id: 'u', username: 'u' }, { month: 10, year: 2026 }).adjustment, undefined);
});

test('leave balances pro-rate accruing leave and block requests beyond the balance', () => {
  const leaves = [
    { id: 'l1', employeeId: 'x1', leaveType: 'Casual', status: 'Approved', startDate: '2026-02-02', endDate: '2026-02-08', totalDays: 7 },
    { id: 'l2', employeeId: 'x1', leaveType: 'Casual', status: 'Pending', startDate: '2026-03-02', endDate: '2026-03-03', totalDays: 2 },
  ] as LeaveRequest[];
  const casual = leaveBalances(employee, leaves, 2026).find(item => item.type === 'Casual')!;
  assert.deepEqual([casual.entitled, casual.taken, casual.pending, casual.remaining], [10, 7, 2, 1]);
  assert.match(leaveBalanceError({ id: 'new', employeeId: 'x1', leaveType: 'Casual', startDate: '2026-04-01', endDate: '2026-04-02' }, employee, leaves) || '', /balance for 2026 is 1 day/);
  assert.equal(leaveBalanceError({ id: 'new', employeeId: 'x1', leaveType: 'Unpaid', startDate: '2026-04-01', endDate: '2026-04-30' }, employee, leaves), undefined);
  const joiner = leaveBalances({ ...employee, dateOfJoining: '2026-07-01' }, [], 2026, { leaveEntitlements: { Annual: 14 } });
  assert.equal(joiner.find(item => item.type === 'Annual')!.entitled, 7);
  assert.equal(joiner.find(item => item.type === 'Sick')!.entitled, 16, 'event-based leave is not pro-rated');
});

test('Urdu interface layer swaps only known interface strings and keeps spacing and colons', () => {
  assert.equal(translateInterfaceText('Approve'), 'منظور کریں');
  assert.equal(translateInterfaceText('  Department: '), '  شعبہ: ');
  assert.equal(translateInterfaceText('Ahmed Raza'), undefined, 'data values stay as entered');
  assert.equal(translateInterfaceText('PKR 85,000'), undefined);
});
