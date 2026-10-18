import assert from 'node:assert/strict';
import test from 'node:test';
import { createPayrollJournal, createPayrollReversalJournal } from './accountingJournal';
import { attendanceReviewError, statutoryChangedFields, statutoryReviewError } from './approvalRules';
import { biometricMatchEvidence, complianceAlerts } from './complianceAlerts';
import { impossibleTravel } from './geofence';
import { annualTaxCertificateHtml, gratuityProvision, providentFundLedger, taxDepositLines } from './payrollLedgers';
import { computeFinalSettlementPayslip, computeSupplementaryPayslip } from './offCyclePayroll';
import { applyLifecycleRequest, lifecycleRequestError, lifecycleReviewError, onboardingStatus } from './lifecycle';
import { payslipPdfBytes } from './payslipPdf';
import { findAttendanceLockIssues } from './attendancePeriod';
import { DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS, DEFAULT_EMPLOYEES, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS } from './defaults';
import type { AttendanceLog, AttendanceLocation, Employee, GratuitySettlement, LifecycleRequest, PayrollAdjustment, PayrollRun, Payslip, StatutoryChangeRequest } from '../types';

const employee: Employee = { ...DEFAULT_EMPLOYEES[0], id: 'g1', employeeCode: 'G-001', fullName: 'Test Employee', status: 'Active', dateOfJoining: '2020-01-01', basicSalary: 120000, gratuityOptIn: true, cnic: '35202-1234567-1', wageType: 'Monthly', wageTypeId: undefined };
const directory = { departments: DEFAULT_DEPARTMENTS, designations: DEFAULT_DESIGNATIONS, branches: DEFAULT_BRANCHES };
const sheet = { id: 'p1', payrollRunId: 'run', employeeId: 'g1', employeeCode: 'G-001', employeeName: 'Test Employee', departmentName: 'Ops', periodMonth: 8, periodYear: 2026, grossSalary: 100000, reimbursements: 0, netSalary: 90000, totalDeductions: 10000, incomeTaxDeduction: 5000, manualTaxAdjustment: 0, eobiEmployeeDeduction: 500, pessiEmployeeDeduction: 0, providentFundDeduction: 4500, loanRepaymentDeduction: 0, otherAdjustmentsDeduction: 0, eobiEmployerContribution: 2500, pessiEmployerContribution: 3000, providentFundEmployerContribution: 4500, basicEarnings: 60000 } as Payslip;

test('journal uses the configured chart of accounts and reverses cancelled approved runs', () => {
  const run = { id: 'run', status: 'Approved', periodMonth: 8, periodYear: 2026 } as PayrollRun;
  const journal = createPayrollJournal(run, [sheet], { journalAccounts: { bankPayable: { code: '2201', name: 'HBL Salary Clearing' } } });
  assert.match(journal.csv, /2201/);
  assert.match(journal.csv, /HBL Salary Clearing/);
  const cancelled = { ...run, status: 'Cancelled', statusBeforeCancellation: 'Approved', cancellationReason: 'Wrong register' } as PayrollRun;
  assert.throws(() => createPayrollJournal(cancelled, [sheet]), /reversal/);
  const reversal = createPayrollReversalJournal(cancelled, [sheet]);
  const salary = reversal.lines.find(line => line.accountCode === '5000')!;
  assert.equal(salary.credit, 100000);
  assert.equal(salary.debit, 0);
  assert.ok(Math.abs(reversal.totalDebit - reversal.totalCredit) < 0.01);
  assert.throws(() => createPayrollReversalJournal({ ...cancelled, statusBeforeCancellation: 'Draft' }, [sheet]), /only needed/);
});

test('statutory changes are diffed and require an independent approver', () => {
  const proposed = { ...DEFAULT_STATUTORY_CONFIG, minimumWage: 40000, updatedAt: 'later' };
  const fields = statutoryChangedFields(DEFAULT_STATUTORY_CONFIG, proposed, DEFAULT_TAX_SLABS, DEFAULT_TAX_SLABS.slice(1));
  assert.deepEqual(fields, ['minimumWage', 'taxSlabs']);
  const request = { status: 'Pending', createdById: 'maker', changedFields: fields, proposedConfig: { ...proposed, sourceReference: 'Finance Act 2026' } } as StatutoryChangeRequest;
  assert.match(statutoryReviewError(request, 'maker') || '', /cannot approve/);
  assert.equal(statutoryReviewError(request, 'checker'), undefined);
  assert.match(statutoryReviewError({ ...request, proposedConfig: proposed }, 'checker') || '', /notification reference/);
  assert.match(statutoryReviewError({ ...request, changedFields: [] }, 'checker') || '', /does not change/);
});

test('statutory approval rejects a mistyped tax year or an effective date outside it', () => {
  const request = { status: 'Pending', createdById: 'maker', changedFields: ['taxYear'], proposedConfig: { ...DEFAULT_STATUTORY_CONFIG, sourceReference: 'Finance Act 2026' } } as StatutoryChangeRequest;
  assert.equal(statutoryReviewError(request, 'checker'), undefined);
  const typo = { ...request, proposedConfig: { ...request.proposedConfig, taxYear: '1927', effectiveFrom: '2027-07-01' } };
  assert.match(statutoryReviewError(typo, 'checker') || '', /Effective from 2027-07-01 is outside Tax Year 1927/);
  assert.match(statutoryReviewError({ ...request, proposedConfig: { ...request.proposedConfig, taxYear: '2026-27' } }, 'checker') || '', /four-digit/);
  assert.match(statutoryReviewError({ ...request, proposedConfig: { ...request.proposedConfig, effectiveFrom: '2027-07-01' } }, 'checker') || '', /outside Tax Year 2027/);
});

const point = (latitude: number, longitude: number, capturedAt: string): AttendanceLocation => ({ latitude, longitude, accuracyMeters: 10, capturedAt, source: 'device-gps' });

test('impossible travel flags teleporting GPS but not a normal commute', () => {
  assert.equal(impossibleTravel([point(24.86, 67.0, '2026-10-01T09:00:00Z'), point(24.9, 67.05, '2026-10-01T10:00:00Z')]), undefined);
  assert.match(impossibleTravel([point(24.86, 67.0, '2026-10-01T09:00:00Z'), point(31.52, 74.35, '2026-10-01T09:30:00Z')]) || '', /spoofed/);
});

test('compliance alerts cover overtime, weekly rest, spoofing, biometrics, documents and minimum wage', () => {
  const days = Array.from({ length: 8 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
  const fixed = point(24.861234, 67.001234, '2026-10-01T09:00:00Z');
  const attendances: AttendanceLog[] = days.map((date, index) => ({
    id: `a${index}`, employeeId: 'g1', date, punchIn: '09:00', punchOut: '21:00', method: index < 3 ? 'Mobile GPS' : 'Biometric', status: 'Present', overtimeMinutes: 240,
    ...(index < 3 && { punchInLocation: { ...fixed, capturedAt: `${date}T09:00:00Z` } }),
    ...(index === 4 && { biometricMatch: { kind: 'fingerprint', score: 1900, threshold: 2147, strengthPercent: 12, lowConfidence: true } }),
  } as AttendanceLog));
  const alerts = complianceAlerts({
    employees: [{ ...employee, cnicExpiryDate: '2026-10-20', drivingLicenceExpiryDate: '2026-09-01', basicSalary: 30000 }],
    attendances, branches: DEFAULT_BRANCHES, statConfig: DEFAULT_STATUTORY_CONFIG, today: '2026-10-10',
  });
  const categories = new Set(alerts.map(alert => alert.category));
  for (const category of ['Overtime', 'Weekly rest', 'Location', 'Biometric', 'Documents', 'Minimum wage'] as const) assert.ok(categories.has(category), category);
  assert.ok(alerts.some(alert => alert.message.includes('Driving licence expired')));
  assert.equal(alerts[0].severity, 'Critical');
});

test('biometric strength is distance below threshold and low matches block the register until reviewed', () => {
  assert.deepEqual(biometricMatchEvidence('face', 0.115, 0.23), { kind: 'face', score: 0.115, threshold: 0.23, strengthPercent: 50, lowConfidence: false });
  assert.equal(biometricMatchEvidence('fingerprint', 2000, 2147).lowConfidence, true);
  const log = { id: 'b1', employeeId: 'g1', date: '2026-10-02', punchIn: '09:00', punchOut: '17:00', method: 'Biometric', status: 'Present', overtimeMinutes: 0, biometricMatch: biometricMatchEvidence('fingerprint', 2000, 2147) } as AttendanceLog;
  assert.ok(findAttendanceLockIssues([log], 10, 2026).some(issue => /Low-confidence/.test(issue.reason)));
  assert.equal(findAttendanceLockIssues([{ ...log, regularizationRequested: true, regularizationApproved: true }], 10, 2026).length, 0);
});

test('line manager decides first; HR may decide after the deadline', () => {
  const pending = { id: 'r', employeeId: 'g1', date: '2026-10-14', regularizationRequested: true, requestedById: 'emp-user', requestedAt: '2026-10-14T08:00:00Z', method: 'Manual', status: 'Absent', overtimeMinutes: 0 } as AttendanceLog;
  const context = {
    employee: { id: 'g1', reportingManagerId: 'mgr' },
    users: [{ id: 'mgr-user', employeeId: 'mgr', roleId: 'role-hr', status: 'Active' as const, username: 'manager' }],
    roles: [{ id: 'role-hr', permissions: ['manage_attendance'] }],
  };
  assert.match(attendanceReviewError(pending, 'hr-user', { ...context, now: Date.parse('2026-10-15T00:00:00Z') }) || '', /Awaiting line manager manager/);
  assert.equal(attendanceReviewError(pending, 'mgr-user', { ...context, now: Date.parse('2026-10-15T00:00:00Z') }), undefined);
  assert.equal(attendanceReviewError(pending, 'hr-user', { ...context, now: Date.parse('2026-10-20T00:00:00Z') }), undefined);
  assert.match(attendanceReviewError(pending, 'mgr-user', { ...context, actorEmployeeId: 'g1' }) || '', /own attendance/);
});

test('PF ledger, gratuity provision and tax deposit reconciliation', () => {
  const runs = [{ id: 'run', status: 'Disbursed', periodMonth: 8, periodYear: 2026, title: 'Aug', taxDeposit: { cprNumber: 'CPR-123456', amount: 4000, depositedOn: '2026-09-10' } }, { id: 'void', status: 'Cancelled', periodMonth: 8, periodYear: 2026, title: 'Void' }] as PayrollRun[];
  const ledger = providentFundLedger(runs, [sheet, { ...sheet, id: 'p2', payrollRunId: 'void' }], '2027');
  assert.equal(ledger.rowCount, 1);
  assert.equal(ledger.total, 9000);
  const provision = gratuityProvision([employee], '2026-01-01', DEFAULT_STATUTORY_CONFIG);
  assert.equal(provision.rowCount, 1);
  assert.ok(Math.abs(provision.total - 120000 * 6) < 1500, `${provision.total}`); // ~6 years × 30 days of monthly salary
  const [line] = taxDepositLines(runs, [sheet]);
  assert.equal(line.status, 'Short deposited');
  assert.equal(line.variance, -1000);
  const html = annualTaxCertificateHtml({ ...employee, fullName: '<script>' }, runs, [sheet], '2027');
  assert.match(html, /CPR-123456/);
  assert.doesNotMatch(html, /<script>/);
});

test('supplementary payslip taxes one-time pay at the marginal rate', () => {
  const adjustment = { id: 'b', employeeId: 'g1', periodMonth: 8, periodYear: 2026, type: 'Bonus', amount: 200000, taxable: true, reason: 'Eid bonus', status: 'Approved' } as PayrollAdjustment;
  const regular = { ...sheet, projectedAnnualTaxableIncome: 1_440_000 } as Payslip;
  const supplementary = computeSupplementaryPayslip(employee, 8, 2026, [adjustment, { ...adjustment, id: 'used', payrollRunId: 'x' }], regular, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, directory)!;
  assert.equal(supplementary.grossSalary, 200000);
  assert.deepEqual(supplementary.payrollAdjustmentIds, ['b']);
  assert.ok(supplementary.incomeTaxDeduction > 0 && supplementary.incomeTaxDeduction < 200000);
  assert.equal(supplementary.netSalary, 200000 - supplementary.incomeTaxDeduction);
  assert.equal(computeSupplementaryPayslip(employee, 9, 2026, [adjustment], regular, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, directory), undefined);
});

test('final settlement reconciles actual tax and recovers loans', () => {
  const settlement = { id: 's', employeeId: 'g1', separationType: 'Resignation', separationDate: '2026-09-30', lastWorkingDate: '2026-09-30', gratuityAmount: 600000, leaveEncashmentAmount: 40000, noticePayAmount: 0, pendingSalaryAmount: 0, totalSettlementAmount: 640000, status: 'Processed' } as GratuitySettlement;
  const loan = { id: 'l', employeeId: 'g1', status: 'Active', remainingInstallments: 5, monthlyInstallment: 10000, approvedAmount: 100000, totalRepaid: 50000 } as any;
  const result = computeFinalSettlementPayslip(employee, settlement, [loan], [], { ...DEFAULT_STATUTORY_CONFIG, gratuityTaxExemptAmount: 600000 }, DEFAULT_TAX_SLABS, directory);
  assert.equal(result.grossSalary, 640000);
  assert.equal(result.taxableIncomeThisPeriod, 40000);
  assert.equal(result.incomeTaxDeduction, 0); // 40,000 is below the zero-tax band
  assert.equal(result.loanRepaymentDeduction, 50000);
  assert.equal(result.netSalary, 590000);
  assert.throws(() => computeFinalSettlementPayslip(employee, { ...settlement, status: 'Pending' }, [], [], DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, directory), /processed/);
});

test('lifecycle requests are validated, maker-checker reviewed and applied', () => {
  assert.match(lifecycleRequestError({ type: 'Promotion', effectiveDate: '2026-10-01', reason: 'Strong performance this year' }, employee) || '', /new designation/);
  const request = { id: 'q', employeeId: 'g1', type: 'Promotion', effectiveDate: '2026-10-01', reason: 'Strong performance', status: 'Pending', newDesignationId: 'des-new', newBasicSalary: 150000, createdById: 'maker' } as LifecycleRequest;
  assert.match(lifecycleReviewError(request, 'maker') || '', /cannot approve/);
  const promotion = applyLifecycleRequest(request, employee, { id: 'checker', username: 'checker' }, '2026-10-02T00:00:00Z', DEFAULT_STATUTORY_CONFIG);
  assert.equal(promotion.employee.designationId, 'des-new');
  assert.equal(promotion.employee.basicSalary, 120000, 'salary changes through its own approval');
  assert.equal(promotion.salaryRevision?.status, 'Draft');
  const exit = applyLifecycleRequest({ ...request, type: 'Resignation', effectiveDate: '2026-06-30', noticeDays: 30, leaveEncashDays: 10 }, employee, { id: 'checker', username: 'checker' }, '2026-10-02T00:00:00Z', DEFAULT_STATUTORY_CONFIG);
  assert.equal(exit.employee.status, 'Terminated');
  assert.equal(exit.settlement?.yearsOfService, 6);
  assert.equal(exit.settlement?.gratuityAmount, 120000 * 6);
  assert.equal(exit.settlement?.noticePayAmount, 120000);
  assert.equal(exit.settlement?.createdById, 'checker');
  const status = onboardingStatus({ ...employee, ntn: '1234567-8', bankVerifiedAt: '2026-01-01', onboardingChecklist: { cnicCopy: { done: true } } });
  assert.equal(status.cnicCopy && status.bankVerified && status.ntnCaptured, true);
  assert.equal(status.appointmentLetter, false);
});

test('payslip PDF is a well-formed single-page document with masked bank details', () => {
  const text = new TextDecoder().decode(payslipPdfBytes({ ...sheet, iban: 'PK36SCBL0000001123456702', bankName: 'SCB' }, 'Acme (Pvt) Ltd'));
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /NET SALARY/);
  assert.match(text, /\*\*\*\*6702/);
  assert.doesNotMatch(text, /PK36SCBL0000001123456702/);
  const xref = Number(text.match(/startxref\n(\d+)/)![1]);
  assert.equal(text.slice(xref, xref + 4), 'xref');
});
