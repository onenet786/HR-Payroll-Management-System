// Integration test for server-side workflow controls against a real PostgreSQL database.
// Run: TEST_DATABASE_URL=postgresql://.../hr_payroll_test npm run test:integration
// The target database is wiped table-by-table, so never point this at a database holding real data.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  test('integration database not configured', { skip: 'Set TEST_DATABASE_URL to a database whose name contains "test".' }, () => {});
  return;
}
process.env.DATABASE_URL = url;
const express = require('express');
const { pool } = require('./db.cjs');
const documentRoutes = require('./documents.cjs');

const TABLES = ['leaves', 'roles', 'users', 'companies', 'employees', 'branches', 'attendances', 'attendance_periods', 'payroll_runs', 'payroll_payslips', 'payroll_adjustments',
  'stat_config', 'tax_slabs', 'statutory_change_requests', 'lifecycle_requests', 'salary_revisions', 'gratuity_settlements', 'hr_audit_log'];
const PERIOD = { month: 9, year: 2026, prefix: '2026-09', days: 30 };
let server;
let base;

// Test-only identity: the production `authenticate` middleware resolves the same shape from a session.
async function identityFor(uid) {
  const user = (await pool.query(`SELECT data FROM users WHERE id=$1`, [uid])).rows[0]?.data;
  const role = (await pool.query(`SELECT data FROM roles WHERE id=$1`, [user.roleId])).rows[0]?.data;
  return { uid, roleId: user.roleId, employeeId: user.employeeId || null, permissions: new Set(role?.permissions || []) };
}

async function put(uid, collection, id, body) {
  const response = await fetch(`${base}/${collection}/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-user': uid }, body: JSON.stringify(body) });
  return response.status;
}
async function del(uid, collection, id) {
  return (await fetch(`${base}/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-test-user': uid } })).status;
}
async function seed(table, id, data, extra = {}) {
  const columns = ['id', 'data', ...Object.keys(extra)];
  const values = [id, JSON.stringify({ ...data, id }), ...Object.values(extra)];
  await pool.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_, index) => `$${index + 1}`).join(',')})`, values);
}
async function current(table, id) {
  return (await pool.query(`SELECT data FROM ${table} WHERE id=$1`, [id])).rows[0]?.data;
}

const fnv = text => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
const attendanceHash = records => fnv(records.slice().sort((a, b) => a.id.localeCompare(b.id))
  .map(item => [item.id, item.employeeId, item.date, item.punchIn || '', item.punchOut || '', item.status, item.method, item.overtimeMinutes, item.regularizationApproved ?? ''].join('|')).join('\n'));
const registerHash = rows => fnv(rows.slice().sort((a, b) => `${a.employeeId}|${a.date}`.localeCompare(`${b.employeeId}|${b.date}`))
  .map(row => [row.employeeId, row.date, row.status, row.attendanceId || '', row.source || ''].join('|')).join('\n'));
const bankHash = sheets => crypto.createHash('sha256').update(JSON.stringify(sheets.slice().sort((a, b) => a.id.localeCompare(b.id)).map(item => ({
  id: item.id, employeeId: item.employeeId, employeeCode: item.employeeCode, bankName: item.bankName,
  iban: String(item.iban || '').replace(/\s/g, '').toUpperCase(), bankAccountNumber: item.bankAccountNumber, netSalary: item.netSalary,
})))).digest('hex');

const employees = ['e1', 'e-mgr'];
const attendance = { id: 'att-sep-1', employeeId: 'e1', date: `${PERIOD.prefix}-01`, punchIn: '09:00', punchOut: '17:00', method: 'Biometric', status: 'Present', overtimeMinutes: 0 };
const registerRows = employees.flatMap(employeeId => Array.from({ length: PERIOD.days }, (_, offset) => {
  const date = `${PERIOD.prefix}-${String(offset + 1).padStart(2, '0')}`;
  return employeeId === 'e1' && date === attendance.date ? { employeeId, date, status: 'Present', attendanceId: attendance.id, source: 'Biometric' } : { employeeId, date, status: 'Absent', source: 'Roster' };
}));
const lockedPeriod = (version, history) => ({
  id: `attendance-period-${PERIOD.prefix}`, periodMonth: PERIOD.month, periodYear: PERIOD.year, status: 'Locked', lockedAt: new Date().toISOString(), lockedBy: 'hr',
  attendanceCount: 1, employeeCount: 2, integrityHash: attendanceHash([attendance]), exceptionCount: 0,
  registerVersion: version, registerRows, registerHash: registerHash(registerRows), history,
});
const run = (id, overrides = {}) => ({
  id, title: `Run ${id}`, periodMonth: PERIOD.month, periodYear: PERIOD.year, startDate: `${PERIOD.prefix}-01`, endDate: `${PERIOD.prefix}-30`, status: 'Draft',
  createdAt: '2026-10-01', totalGrossPay: 100000, totalDeductions: 10000, totalNetPay: 90000, totalEobiEmployer: 0, totalSocialSecurityEmployer: 0, employeeCount: 1,
  createdById: 'u-maker', attendancePeriodId: `attendance-period-${PERIOD.prefix}`, attendanceIntegrityHash: attendanceHash([attendance]),
  attendanceRegisterHash: registerHash(registerRows), preflightCriticalCount: 0, ...overrides,
});
const payslip = runId => ({ id: `${runId}-e1`, payrollRunId: runId, employeeId: 'e1', employeeCode: 'E1', employeeName: 'Employee One', bankName: 'HBL', bankAccountNumber: '12345678', iban: 'PK36SCBL0000001123456702', grossSalary: 100000, totalDeductions: 10000, netSalary: 90000, incomeTaxDeduction: 5000, periodMonth: PERIOD.month, periodYear: PERIOD.year });

test.before(async () => {
  for (const table of TABLES) await pool.query(`DELETE FROM ${table}`);
  const roles = { 'role-hr': ['manage_employees', 'manage_attendance'], 'role-payroll': ['manage_payroll'], 'role-settings': ['manage_settings', 'manage_employees', 'manage_payroll', 'manage_attendance'], 'role-employee': [] };
  for (const [id, permissions] of Object.entries(roles)) await seed('roles', id, { name: id, permissions });
  const users = { 'u-maker': 'role-settings', 'u-checker': 'role-settings', 'u-third': 'role-settings', 'u-hr': 'role-hr', 'u-mgr': 'role-hr', 'u-emp': 'role-employee' };
  for (const [id, roleId] of Object.entries(users)) await seed('users', id, { username: id, roleId, status: 'Active', ...(id === 'u-mgr' && { employeeId: 'e-mgr' }), ...(id === 'u-emp' && { employeeId: 'e1' }) });
  await seed('branches', 'b1', { name: 'HQ', province: 'Punjab' });
  for (const id of employees) {
    await seed('employees', id, { fullName: id, status: 'Active', dateOfJoining: '2025-01-01', branchId: 'b1', cnic: id === 'e1' ? '35202-1234567-1' : '35202-7654321-1', bankName: 'HBL', bankAccountNumber: '12345678', iban: 'PK36SCBL0000001123456702', reportingManagerId: id === 'e1' ? 'e-mgr' : undefined, basicSalary: 100000 });
  }
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(async (req, _res, next) => { req.identity = await identityFor(req.get('x-test-user')); req.correlationId = crypto.randomUUID(); next(); });
  app.use(documentRoutes);
  app.use((error, _req, res, _next) => { if (!error.status) console.error('[integration] server error:', error.message); res.status(error.status || 500).json({ error: error.message }); });
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('statutory rates change only through an independently approved proposal', async () => {
  const config = { minimumWage: 37000, taxYear: '2027' };
  assert.equal(await put('u-maker', 'statConfig', 'stat-1', config), 200, 'first-time setup is allowed');
  assert.equal(await put('u-maker', 'statConfig', 'stat-1', { ...config, minimumWage: 40000 }), 403, 'direct edits are blocked');
  const proposal = { status: 'Pending', proposedConfig: { ...config, id: 'stat-1', minimumWage: 40000 }, proposedTaxSlabs: [], changedFields: ['minimumWage'], createdAt: new Date().toISOString(), createdById: 'u-maker', createdBy: 'u-maker' };
  assert.equal(await put('u-maker', 'statutoryChangeRequests', 'chg-1', proposal), 200);
  assert.equal(await put('u-checker', 'statutoryChangeRequests', 'chg-2', { ...proposal, createdById: 'u-checker' }), 500, 'only one pending proposal (unique index)');
  assert.equal(await put('u-maker', 'statutoryChangeRequests', 'chg-1', { ...proposal, status: 'Approved', reviewedById: 'u-maker', reviewedAt: new Date().toISOString() }), 403, 'maker cannot approve');
  assert.equal(await put('u-checker', 'statutoryChangeRequests', 'chg-1', { ...proposal, proposedConfig: { ...proposal.proposedConfig, minimumWage: 99999 }, status: 'Approved', reviewedById: 'u-checker', reviewedAt: new Date().toISOString() }), 403, 'approval cannot alter the proposal');
  assert.equal(await put('u-checker', 'statutoryChangeRequests', 'chg-1', { ...proposal, status: 'Approved', reviewedById: 'u-checker', reviewedAt: new Date().toISOString() }), 200);
  assert.equal(await put('u-maker', 'statConfig', 'stat-1', { ...config, minimumWage: 40000, changeRequestId: 'chg-1' }), 403, 'only the approver applies it');
  assert.equal(await put('u-checker', 'statConfig', 'stat-1', { ...config, minimumWage: 45000, changeRequestId: 'chg-1' }), 403, 'applied values must match');
  assert.equal(await put('u-checker', 'statConfig', 'stat-1', { ...config, minimumWage: 40000, changeRequestId: 'chg-1', updatedAt: 'now' }), 200);
  assert.equal(await del('u-checker', 'statConfig', 'stat-1'), 403);
});

test('attendance corrections route to the line manager until the deadline', async () => {
  const pending = { employeeId: 'e1', date: '2026-10-14', method: 'Manual', status: 'Absent', overtimeMinutes: 0, regularizationRequested: true, regularizationReason: 'Card reader fault', requestedAt: new Date().toISOString() };
  assert.equal(await put('u-emp', 'attendances', 'reg-1', pending), 200);
  const decision = reviewer => ({ ...pending, status: 'Present', regularizationApproved: true, reviewedById: reviewer, reviewedAt: new Date().toISOString(), reviewComment: 'Gate log checked' });
  assert.equal(await put('u-hr', 'attendances', 'reg-1', decision('u-hr')), 403, 'HR waits for the line manager');
  assert.equal(await put('u-mgr', 'attendances', 'reg-1', { ...decision('u-mgr'), reviewComment: '' }), 403, 'comment is required');
  assert.equal(await put('u-mgr', 'attendances', 'reg-1', decision('u-mgr')), 200);
  const stale = { ...pending, requestedAt: '2026-09-01T08:00:00Z', date: '2026-10-01' };
  assert.equal(await put('u-emp', 'attendances', 'reg-2', stale), 200);
  assert.equal(await put('u-hr', 'attendances', 'reg-2', { ...stale, regularizationApproved: false, reviewedById: 'u-hr', reviewedAt: new Date().toISOString(), reviewComment: 'No evidence supplied' }), 200, 'HR decides after escalation');
});

test('register lock, reopen with reason, versioned relock, and locked-month edits', async () => {
  assert.equal(await put('u-hr', 'attendances', attendance.id, attendance), 200);
  const id = `attendance-period-${PERIOD.prefix}`;
  const first = lockedPeriod(1, [{ action: 'Locked', at: 'x', by: 'hr', registerVersion: 1 }]);
  assert.equal(await put('u-hr', 'attendancePeriods', id, first), 200);
  assert.equal(await put('u-hr', 'attendances', attendance.id, { ...attendance, punchOut: '18:00' }), 403, 'locked month is read-only');
  const reopened = { ...first, status: 'Reopened', reopenedById: 'u-hr', reopenedAt: new Date().toISOString(), reopenReason: 'Late gate log received', history: [...first.history, { action: 'Reopened' }] };
  assert.equal(await put('u-hr', 'attendancePeriods', id, { ...reopened, reopenReason: 'short' }), 403);
  assert.equal(await put('u-hr', 'attendancePeriods', id, reopened), 200);
  assert.equal(await put('u-hr', 'attendancePeriods', id, lockedPeriod(1, [...reopened.history, { action: 'Locked' }])), 403, 'relock must bump the version');
  assert.equal(await put('u-hr', 'attendancePeriods', id, lockedPeriod(2, [...reopened.history, { action: 'Locked' }])), 200);
  assert.equal(await del('u-hr', 'attendancePeriods', id), 403);
});

test('payroll runs: regular uniqueness, supplementary, cancellation, approval, payment exceptions and tax deposit', async () => {
  assert.equal(await put('u-maker', 'payrollRuns', 'run-a', run('run-a')), 200);
  assert.equal(await put('u-maker', 'payrollRuns', 'run-b', run('run-b')), 403, 'one active regular run per period');
  assert.equal(await put('u-maker', 'payrollRuns', 'run-supp', run('run-supp', { runType: 'Supplementary' })), 200, 'supplementary shares the period');
  assert.equal(await put('u-maker', 'payrollPayslips', 'run-a-e1', payslip('run-a')), 200);
  const reopenBlocked = { ...(await current('attendance_periods', `attendance-period-${PERIOD.prefix}`)) };
  assert.equal(await put('u-hr', 'attendancePeriods', reopenBlocked.id, { ...reopenBlocked, status: 'Reopened', reopenedById: 'u-hr', reopenedAt: 'now', reopenReason: 'Correction needed after run', history: [...reopenBlocked.history, {}] }), 403, 'live payroll blocks reopening');

  const cancelled = { ...run('run-a'), status: 'Cancelled', statusBeforeCancellation: 'Draft', cancelledById: 'u-checker', cancelledAt: new Date().toISOString(), cancellationReason: 'Wrong statutory version' };
  assert.equal(await put('u-checker', 'payrollRuns', 'run-a', { ...cancelled, totalNetPay: 1 }), 403, 'cancellation cannot alter totals');
  assert.equal(await put('u-checker', 'payrollRuns', 'run-a', cancelled), 200);
  assert.equal(await put('u-maker', 'payrollRuns', 'run-c', run('run-c')), 200, 'replacement run after cancellation');
  assert.equal(await del('u-maker', 'payrollRuns', 'run-a'), 403);

  assert.equal(await put('u-maker', 'payrollPayslips', 'run-c-e1', payslip('run-c')), 200);
  assert.equal(await put('u-maker', 'payrollRuns', 'run-c', { ...run('run-c'), status: 'Approved', approvedById: 'u-maker', approvedAt: 'now' }), 403, 'preparer cannot approve');
  assert.equal(await put('u-checker', 'payrollRuns', 'run-c', { ...run('run-c'), status: 'Approved', approvedById: 'u-checker', approvedAt: 'now' }), 200);
  assert.equal(await put('u-maker', 'payrollPayslips', 'run-c-e1', { ...payslip('run-c'), netSalary: 95000 }), 403, 'approved payslips are immutable');
  const approved = await current('payroll_runs', 'run-c');
  const sheets = [await current('payroll_payslips', 'run-c-e1')];
  const advised = { ...approved, bankAdviceChecksum: bankHash(sheets), bankAdviceGeneratedAt: 'now', bankAdviceGeneratedById: 'u-maker', bankAdviceEmployeeCount: 1, bankAdviceTotal: 90000 };
  assert.equal(await put('u-maker', 'payrollRuns', 'run-c', advised), 200);
  assert.equal(await put('u-checker', 'payrollRuns', 'run-c', { ...advised, status: 'Disbursed', disbursedById: 'u-checker', disbursedAt: 'now', disbursementReference: 'FT-2026-001' }), 403, 'approver cannot disburse');
  const disbursed = { ...advised, status: 'Disbursed', disbursedById: 'u-third', disbursedAt: 'now', disbursementReference: 'FT-2026-001' };
  assert.equal(await put('u-third', 'payrollRuns', 'run-c', disbursed), 200);

  const failed = { ...sheets[0], paymentStatus: 'Failed', paymentFailureReason: 'Account closed', paymentFailedById: 'u-maker', paymentFailedAt: 'now' };
  assert.equal(await put('u-maker', 'payrollPayslips', 'run-c-e1', { ...failed, paymentStatus: 'Retried' }), 403, 'retry needs a prior failure');
  assert.equal(await put('u-maker', 'payrollPayslips', 'run-c-e1', failed), 200);
  assert.equal(await put('u-maker', 'payrollPayslips', 'run-c-e1', { ...failed, paymentStatus: 'Retried', paymentRetryReference: 'FT-RETRY-8', paymentRetriedById: 'u-maker', paymentRetriedAt: 'now' }), 403, 'whoever recorded the bank return cannot release the retry');
  assert.equal(await put('u-checker', 'payrollPayslips', 'run-c-e1', { ...failed, paymentStatus: 'Retried', paymentRetryReference: 'FT-RETRY-9', paymentRetriedById: 'u-checker', paymentRetriedAt: 'now' }), 200);

  const deposit = { cprNumber: 'CPR-2026-0001', amount: 5000, depositedOn: '2026-10-15', recordedAt: new Date().toISOString(), recordedById: 'u-maker', recordedBy: 'u-maker' };
  assert.equal(await put('u-maker', 'payrollRuns', 'run-c', { ...disbursed, taxDeposit: deposit, title: 'renamed' }), 403, 'deposit cannot piggyback other edits');
  assert.equal(await put('u-maker', 'payrollRuns', 'run-c', { ...disbursed, taxDeposit: deposit }), 200);
});

test('lifecycle requests and salary revisions require a second user', async () => {
  const request = { employeeId: 'e1', type: 'Transfer', effectiveDate: '2026-11-01', reason: 'Branch expansion staffing', status: 'Pending', newBranchId: 'b1', createdAt: 'now', createdById: 'u-maker', createdBy: 'u-maker' };
  assert.equal(await put('u-maker', 'lifecycleRequests', 'life-1', { ...request, reason: 'short' }), 403);
  assert.equal(await put('u-maker', 'lifecycleRequests', 'life-1', request), 200);
  assert.equal(await put('u-maker', 'lifecycleRequests', 'life-1', { ...request, status: 'Approved', reviewedById: 'u-maker', reviewedAt: 'now' }), 403);
  assert.equal(await put('u-checker', 'lifecycleRequests', 'life-1', { ...request, newBranchId: 'b2', status: 'Approved', reviewedById: 'u-checker', reviewedAt: 'now' }), 403, 'approval cannot alter the request');
  assert.equal(await put('u-checker', 'lifecycleRequests', 'life-1', { ...request, status: 'Approved', reviewedById: 'u-checker', reviewedAt: 'now' }), 200);
  assert.equal(await put('u-checker', 'lifecycleRequests', 'life-1', { ...request, status: 'Rejected', reviewedById: 'u-checker', reviewedAt: 'now' }), 403, 'decisions are final');

  const revision = { employeeId: 'e1', previousSalary: 100000, newSalary: 110000, effectiveDate: '2026-10-01', status: 'Draft', createdById: 'u-maker' };
  assert.equal(await put('u-maker', 'salaryRevisions', 'rev-0', { ...revision, status: 'Approved' }), 403, 'cannot create pre-approved');
  assert.equal(await put('u-maker', 'salaryRevisions', 'rev-1', revision), 200);
  assert.equal(await put('u-maker', 'salaryRevisions', 'rev-1', { ...revision, status: 'Approved', approvedById: 'u-maker' }), 403);
  assert.equal(await put('u-checker', 'salaryRevisions', 'rev-1', { ...revision, status: 'Approved', approvedById: 'u-checker' }), 200);
});

test('a disbursed run accepts a parallel-run result from the recording user and nothing else', async () => {
  const disbursed = await current('payroll_runs', 'run-c');
  const result = { comparedAt: new Date().toISOString(), comparedById: 'u-third', comparedBy: 'u-third', legacyFileName: 'legacy-sep.csv', matched: 1, differing: 0, onlyLegacy: 0, onlySystem: 0, netDelta: 0 };
  assert.equal(await put('u-maker', 'payrollRuns', 'run-c', { ...disbursed, parallelRun: result }), 403, 'recorder must be the acting user');
  assert.equal(await put('u-third', 'payrollRuns', 'run-c', { ...disbursed, parallelRun: { ...result, matched: -1 } }), 403, 'counts are validated');
  assert.equal(await put('u-third', 'payrollRuns', 'run-c', { ...disbursed, parallelRun: result, totalNetPay: 1 }), 403, 'cannot piggyback financial edits');
  assert.equal(await put('u-third', 'payrollRuns', 'run-c', { ...disbursed, parallelRun: result }), 200);
});

test('employee codes must start with the company prefix (OneNet Solutions -> ONS-)', async () => {
  await seed('companies', 'co-ons', { name: 'OneNet Solutions', legalName: 'OneNet Solutions (Pvt) Ltd' });
  const employee = code => ({ fullName: 'New Hire', status: 'Active', companyId: 'co-ons', employeeCode: code, dateOfJoining: '2026-10-17' });
  assert.equal(await put('u-hr', 'employees', 'emp-new-1', employee('ONENET-PRD-00001')), 403, 'old-style prefix refused');
  assert.equal(await put('u-hr', 'employees', 'emp-new-1', employee('ONS-PRD-00001')), 200);
  assert.equal(await put('u-hr', 'employees', 'emp-new-2', employee('ons-prd-00001')), 403, 'duplicate code (case-insensitive) refused');
  await seed('employees', 'emp-legacy', { fullName: 'Legacy Staff', status: 'Active', companyId: 'co-ons', employeeCode: 'ONENET-HR-00007' });
  assert.equal(await put('u-hr', 'employees', 'emp-legacy', { fullName: 'Legacy Staff (renamed)', status: 'Active', companyId: 'co-ons', employeeCode: 'ONENET-HR-00007' }), 200, 'existing codes stay editable');
  assert.equal(await put('u-hr', 'employees', 'emp-legacy', { fullName: 'Legacy Staff', status: 'Active', companyId: 'co-ons', employeeCode: 'XYZ-HR-00007' }), 403, 'a changed code must follow the rule');
});

test('employees see their payslips only once salary is disbursed', async () => {
  await seed('payroll_runs', 'vis-paid', { ...run('vis-paid'), periodMonth: 5, status: 'Disbursed' }, { status: 'Disbursed' });
  await seed('payroll_runs', 'vis-draft', { ...run('vis-draft'), periodMonth: 6 }, { status: 'Draft' });
  for (const runId of ['vis-paid', 'vis-draft']) await seed('payroll_payslips', `${runId}-e1`, payslip(runId), { payroll_run_id: runId, employee_id: 'e1' });
  const read = async (uid, path) => {
    const response = await fetch(`${base}/${path}`, { headers: { 'x-test-user': uid } });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  };
  const own = (await read('u-emp', 'payrollPayslips')).body.documents.map(row => row.document_id).filter(id => id.startsWith('vis-'));
  assert.deepEqual(own, ['vis-paid-e1'], 'draft and approved payslips stay hidden from the employee');
  assert.equal((await read('u-emp', 'payrollPayslips/vis-paid-e1')).status, 200);
  assert.equal((await read('u-emp', 'payrollPayslips/vis-draft-e1')).status, 404, 'a draft payslip cannot be opened directly');
  const payroll = (await read('u-maker', 'payrollPayslips')).body.documents.map(row => row.document_id).filter(id => id.startsWith('vis-'));
  assert.deepEqual(payroll.sort(), ['vis-draft-e1', 'vis-paid-e1'], 'payroll users still see every payslip');
});

test('a day of an approved leave is recorded as reviewed; a made-up leave day still needs review', async () => {
  await seed('leaves', 'lv-ok', { employeeId: 'e1', leaveType: 'Unpaid', startDate: '2026-11-02', endDate: '2026-11-03', totalDays: 2, status: 'Approved' }, { employee_id: 'e1', status: 'Approved' });
  await seed('leaves', 'lv-pending', { employeeId: 'e1', leaveType: 'Casual', startDate: '2026-11-10', endDate: '2026-11-10', totalDays: 1, status: 'Pending' }, { employee_id: 'e1', status: 'Pending' });
  const day = (id, leaveRequestId, date) => ({ id, employeeId: 'e1', date, method: 'Manual', status: 'On Leave', overtimeMinutes: 0, leaveRequestId, regularizationApproved: true });
  assert.equal(await put('u-hr', 'attendances', 'att-auto-leave-lv-ok-2026-11-02', day('att-auto-leave-lv-ok-2026-11-02', 'lv-ok', '2026-11-02')), 200);
  const approved = await current('attendances', 'att-auto-leave-lv-ok-2026-11-02');
  assert.equal(approved.regularizationApproved, true);
  assert.equal(approved.regularizationRequested, undefined, 'not queued for regularization');
  assert.match(approved.reviewComment, /Approved Unpaid leave lv-ok/);
  for (const [id, leaveId, date] of [['fake-1', 'lv-pending', '2026-11-10'], ['fake-2', 'lv-ok', '2026-11-20'], ['fake-3', 'lv-missing', '2026-11-02']]) {
    assert.equal(await put('u-hr', 'attendances', id, day(id, leaveId, date)), 200);
    const stored = await current('attendances', id);
    assert.equal(stored.regularizationRequested, true, `${id} must be reviewed`);
    assert.equal(stored.regularizationApproved, undefined, `${id} cannot approve itself`);
  }
});
