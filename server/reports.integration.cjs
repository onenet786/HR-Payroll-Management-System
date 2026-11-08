// Reports API against a real PostgreSQL test database (TEST_DATABASE_URL, name must contain "test").
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url || !/test/i.test(new URL(url).pathname)) {
  test('integration database not configured', { skip: 'Set TEST_DATABASE_URL to a database whose name contains "test".' }, () => {});
  return;
}
process.env.DATABASE_URL = url;

const express = require('express');
const { pool } = require('./db.cjs');
const { router, REPORTS, csvCell } = require('./reports.cjs');

let server; let base;
const identities = {
  admin: { uid: 'rpt-admin', roleId: 'role-admin', permissions: new Set() },
  hr: { uid: 'rpt-hr', roleId: 'role-hr', permissions: new Set(['manage_employees']) },
  viewer: { uid: 'rpt-viewer', roleId: 'role-viewer', permissions: new Set(['view_reports']) },
  nobody: { uid: 'rpt-none', roleId: 'role-employee', permissions: new Set() },
};
const get = async (path, who = 'admin') => {
  const response = await fetch(`${base}${path}`, { headers: { 'x-who': who } });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, body: type.includes('json') ? await response.json() : await response.text() };
};
const thisMonth = new Date().toISOString().slice(0, 7);
const day = n => `${thisMonth}-${String(n).padStart(2, '0')}`;

async function seed(table, id, data, extra = {}) {
  const columns = ['id', 'data', ...Object.keys(extra)];
  await pool.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT (id) DO NOTHING`, [id, JSON.stringify({ ...data, id }), ...Object.values(extra)]);
}
async function cleanup() {
  for (const table of ['payroll_payslips', 'payroll_runs', 'loan_advances', 'salary_revisions', 'gratuity_settlements']) await pool.query(`DELETE FROM ${table} WHERE id LIKE 'rpt-%'`);
  await pool.query(`DELETE FROM attendances WHERE id LIKE 'rpt-%'`);
  await pool.query(`DELETE FROM employees WHERE id LIKE 'rpt-%'`);
  for (const table of ['branches', 'departments', 'designations']) await pool.query(`DELETE FROM ${table} WHERE id LIKE 'rpt-%'`);
}

test.before(async () => {
  await cleanup();
  await seed('branches', 'rpt-b1', { name: 'Report HQ' });
  await seed('branches', 'rpt-b2', { name: 'Report Plant' });
  await seed('departments', 'rpt-d1', { name: 'Report Ops' });
  await seed('designations', 'rpt-g1', { title: 'Report Operator' });
  const employee = (id, extra) => seed('employees', id, { employeeCode: id.toUpperCase(), fullName: `Name ${id}`, branchId: 'rpt-b1', departmentId: 'rpt-d1', designationId: 'rpt-g1', status: 'Active', dateOfJoining: '2020-01-01', cnic: '35202-1234567-1', iban: 'PK36SCBL0000001123456702', basicSalary: 50000, dateOfBirth: '1990-01-01', contactNumber: '0300', ...extra });
  await employee('rpt-e1', {});
  await employee('rpt-e2', { branchId: 'rpt-b2', cnic: 'bad', basicSalary: 1 });
  await employee('rpt-e3', { status: 'Terminated', separationDate: day(2), separationType: 'Resignation' });
  const att = (id, employeeId, date, status, data = {}) => seed('attendances', id, { employeeId, date, status, punchIn: '09:00:00', punchOut: '17:00:00', method: 'Biometric', overtimeMinutes: 0, ...data }, { employee_id: employeeId, date, status });
  await att('rpt-a1', 'rpt-e1', day(1), 'Present', { overtimeMinutes: 90 });
  await att('rpt-a2', 'rpt-e1', day(2), 'Late', { punchIn: '09:40:00' });
  await att('rpt-a3', 'rpt-e2', day(1), 'Absent', { punchIn: '', punchOut: '' });
  await att('rpt-a4', 'rpt-e2', day(2), 'Present', { punchOut: '' }); // missing punch-out
  await att('rpt-a5', 'rpt-e3', day(1), 'Present', { overtimeMinutes: 'not-a-number' }); // unclean legacy value
  // Payroll: a paid run and a cancelled run for this month
  const [year, month] = thisMonth.split('-').map(Number);
  await seed('payroll_runs', 'rpt-run-paid', { title: 'Report run', periodYear: year, periodMonth: month, status: 'Disbursed' }, { status: 'Disbursed' });
  await seed('payroll_runs', 'rpt-run-cancelled', { title: 'Cancelled run', periodYear: year, periodMonth: month, status: 'Cancelled' }, { status: 'Cancelled' });
  const payslip = (id, runId, employeeId, extra) => seed('payroll_payslips', id, { payrollRunId: runId, employeeId, employeeName: `Payslip ${employeeId}`, employeeCode: employeeId.toUpperCase(), branchName: 'Report HQ', departmentName: 'Report Ops', grossSalary: 60000, incomeTaxDeduction: 1000, eobiEmployeeDeduction: 370, eobiEmployerContribution: 1850, pessiEmployerContribution: 1200, totalDeductions: 1370, netSalary: 58630, paidDays: 30, ...extra }, { payroll_run_id: runId, employee_id: employeeId });
  await payslip('rpt-ps-1', 'rpt-run-paid', 'rpt-e1', { iban: 'PK36SCBL0000001123456702', bankName: 'HBL' });
  await payslip('rpt-ps-2', 'rpt-run-paid', 'rpt-e2', { iban: '', bankAccountNumber: '', incomeTaxDeduction: 0 });
  await payslip('rpt-ps-3', 'rpt-run-cancelled', 'rpt-e1', { grossSalary: 999999 });
  await seed('loan_advances', 'rpt-loan', { employeeId: 'rpt-e1', type: 'Loan', approvedAmount: 50000, totalRepaid: 20000, monthlyInstallment: 5000, totalInstallments: 10, remainingInstallments: 6, status: 'Active' }, { employee_id: 'rpt-e1', status: 'Active' });
  await seed('salary_revisions', 'rpt-rev', { employeeId: 'rpt-e1', previousSalary: 50000, newSalary: 55000, incrementAmount: 5000, incrementPercentage: 10, effectiveDate: day(1), type: 'Annual Increment', status: 'Approved' }, { employee_id: 'rpt-e1' });
  await seed('gratuity_settlements', 'rpt-grat', { employeeId: 'rpt-e3', separationType: 'Resignation', separationDate: day(2), gratuityAmount: 100000, totalSettlementAmount: 150000, status: 'Pending' }, { employee_id: 'rpt-e3', status: 'Pending' });
  const app = express();
  app.use((req, _res, next) => { req.identity = identities[req.get('x-who')] || identities.nobody; req.correlationId = require('node:crypto').randomUUID(); next(); });
  app.use(router);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await cleanup();
  await new Promise(resolve => server.close(resolve));
  await pool.end();
});

test('catalog follows permissions', async () => {
  assert.deepEqual((await get('/catalog')).body.groups.map(group => group.id), ['employees', 'attendance', 'payroll', 'statutory']);
  assert.deepEqual((await get('/catalog', 'hr')).body.groups.map(group => group.id), ['employees'], 'HR without attendance permission sees employee reports only');
  assert.equal((await get('/catalog', 'viewer')).body.groups.length, 2, 'View reports opens both groups');
  assert.equal((await get('/catalog', 'nobody')).body.groups.length, 0);
  assert.equal((await get(`/run/daily-attendance?date=${day(1)}`, 'hr')).status, 403, 'a report outside the user\'s groups is refused');
});

test('every report runs with its default filters', async () => {
  for (const report of REPORTS) {
    const params = new URLSearchParams({ from: `${thisMonth}-01`, to: day(28), date: day(1), month: thisMonth, branchId: '' });
    const { status, body } = await get(`/run/${report.id}?${params}`);
    assert.equal(status, 200, `${report.id}: ${body.error || ''}`);
    assert.ok(Array.isArray(body.rows) && Array.isArray(body.columns), report.id);
  }
});

test('attendance numbers are right', async () => {
  const range = `from=${thisMonth}-01&to=${day(28)}&branchId=`;
  const summary = (await get(`/run/attendance-summary?${range}`)).body;
  const e1 = summary.rows.find(row => row.employee_id === 'rpt-e1');
  assert.equal(e1.present, 2, 'late counts as present'); assert.equal(e1.late, 1); assert.equal(Number(e1.ot_hours), 1.5);
  assert.equal(summary.rows.find(row => row.employee_id === 'rpt-e3').ot_hours, '0.0', 'a non-numeric overtime value counts as 0');

  const daily = (await get(`/run/daily-attendance?date=${day(1)}`)).body;
  const statuses = Object.fromEntries(daily.rows.filter(row => row.employee_id.startsWith('rpt-')).map(row => [row.employee_id, row.status]));
  assert.deepEqual(statuses, { 'rpt-e1': 'Present', 'rpt-e2': 'Absent', 'rpt-e3': 'Present' }, 'a former employee with a record that day is listed');
  assert.ok(daily.summary.some(item => item.label === 'Absent'));

  const register = (await get(`/run/monthly-register?month=${thisMonth}&employeeId=rpt-e1`)).body;
  assert.equal(register.rows[0].d1, 'P'); assert.equal(register.rows[0].d2, 'L'); assert.equal(register.rows[0].t_present, 2);

  const missing = (await get(`/run/missing-punches?${range}`)).body;
  assert.deepEqual(missing.rows.map(row => row.employee_id), ['rpt-e2']);
  assert.equal((await get(`/run/late-arrivals?${range}`)).body.rows.filter(row => row.employee_id.startsWith('rpt-')).length, 1);
  assert.equal((await get(`/run/overtime?${range}`)).body.totals.ot_days >= 1, true);
});

test('employee reports and filters', async () => {
  const directory = (await get('/run/employee-directory?employeeStatus=current&search=Name%20rpt')).body;
  assert.deepEqual(directory.rows.map(row => row.employee_id).sort(), ['rpt-e1', 'rpt-e2'], 'current staff only, search by name');
  const plant = (await get('/run/employee-directory?employeeStatus=all&branchId=rpt-b2')).body;
  assert.deepEqual(plant.rows.map(row => row.employee_id), ['rpt-e2']);
  const gaps = (await get('/run/missing-data')).body.rows.find(row => row.employee_id === 'rpt-e2');
  assert.match(gaps.missing, /CNIC/); assert.match(gaps.missing, /Salary/);
  const movers = (await get(`/run/joiners-leavers?from=${thisMonth}-01&to=${day(28)}`)).body;
  assert.ok(movers.rows.some(row => row.employee_id === 'rpt-e3' && row.movement === 'Left'));
  const head = (await get('/run/headcount?groupBy=branch')).body;
  assert.ok(head.rows.some(row => row.grp === 'Report HQ' && row.left_company === 1));
});

test('paging, CSV export and input checks', async () => {
  const page = (await get(`/run/attendance-log?from=${thisMonth}-01&to=${day(28)}&pageSize=10`)).body;
  assert.equal(page.pageSize, 10);
  const csv = await get(`/run/attendance-summary?from=${thisMonth}-01&to=${day(28)}&format=csv`);
  assert.equal(csv.status, 200);
  assert.ok(csv.body.replace(/^﻿/, '').startsWith('Code,Employee'), 'CSV starts with the column labels');
  const raw = Buffer.from(await (await fetch(`${base}/run/attendance-summary?from=${thisMonth}-01&to=${day(28)}&format=csv`, { headers: { 'x-who': 'admin' } })).arrayBuffer());
  assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'CSV starts with a UTF-8 BOM so Excel shows Urdu names');
  assert.match(csv.body, /Total/);
  const audit = (await pool.query(`SELECT new_data FROM hr_audit_log WHERE action='report_export' AND actor_uid='rpt-admin' ORDER BY id DESC LIMIT 1`)).rows[0];
  assert.ok(audit, 'every CSV export is recorded in the audit log');
  assert.equal(audit.new_data.filters.from, `${thisMonth}-01`);
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"', 'formula-looking cells are neutralised');
  assert.equal(csvCell('-12.5'), '-12.5', 'negative numbers stay numbers');
  assert.equal((await get('/run/attendance-log?from=2020-01-01&to=2026-01-01')).status, 400, 'a long all-employee log is refused');
  assert.equal((await get('/run/attendance-log?from=2020-01-01&to=2026-01-01&employeeId=rpt-e1')).status, 200, 'one employee may span years');
  assert.equal((await get("/run/employee-directory?branchId=x';drop")).status, 400, 'ids are validated');
  assert.equal((await get('/run/nope')).status, 404);
  const picker = (await get('/employees?search=rpt-e3')).body;
  assert.equal(picker.employees[0].status, 'Terminated', 'the employee picker finds former staff');
});

test('payroll and statutory reports: permissions and numbers', async () => {
  assert.deepEqual((await get('/catalog', 'viewer')).body.groups.map(group => group.id), ['employees', 'attendance'], 'View reports does not open salaries');
  assert.equal((await get(`/run/payroll-register?month=${thisMonth}`, 'viewer')).status, 403);
  assert.deepEqual((await get('/catalog')).body.groups.map(group => group.id), ['employees', 'attendance', 'payroll', 'statutory']);

  const register = (await get(`/run/payroll-register?month=${thisMonth}&runStatus=all`)).body;
  const mine = register.rows.filter(row => row.employee_id.startsWith('rpt-'));
  assert.equal(mine.length, 2, 'the cancelled run is left out');
  assert.equal(mine.find(row => row.employee_id === 'rpt-e1').name, 'Payslip rpt-e1', 'payslips keep the name of that month');

  const bank = (await get(`/run/bank-transfer?month=${thisMonth}&runStatus=paid`)).body.rows.filter(row => row.employee_id.startsWith('rpt-'));
  assert.equal(bank.find(row => row.employee_id === 'rpt-e2').iban, 'PK36SCBL0000001123456702', 'an empty IBAN on the payslip falls back to the employee record');
  assert.equal(bank.find(row => row.employee_id === 'rpt-e1').iban, 'PK36SCBL0000001123456702');

  const range = `from=${thisMonth}-01&to=${day(28)}&runStatus=paid`;
  const tax = (await get(`/run/income-tax-employee?${range}`)).body.rows.find(row => row.employee_id === 'rpt-e1');
  assert.equal(Number(tax.gross), 60000); assert.equal(Number(tax.income_tax), 1000); assert.equal(tax.months, 1);
  const eobi = (await get(`/run/eobi?${range}`)).body.rows.find(row => row.employee_id === 'rpt-e1');
  assert.equal(Number(eobi.total), 2220);
  assert.ok((await get(`/run/social-security?${range}`)).body.rows.some(row => row.employee_id === 'rpt-e2'));
  const monthly = (await get(`/run/income-tax-monthly?${range}`)).body;
  assert.equal(monthly.rows.find(row => row.period === thisMonth).taxed >= 1, true);
  const cost = (await get(`/run/salary-by-group?${range}&payGroupBy=branch`)).body.rows.find(row => row.grp === 'Report HQ');
  assert.equal(cost.employees, 2);

  const loan = (await get('/run/loans-advances')).body.rows.find(row => row.employee_id === 'rpt-e1');
  assert.equal(Number(loan.balance), 30000);
  assert.ok((await get(`/run/salary-revisions?from=${thisMonth}-01&to=${day(28)}`)).body.rows.some(row => row.employee_id === 'rpt-e1'));
  assert.ok((await get(`/run/settlements?from=${thisMonth}-01&to=${day(28)}`)).body.rows.some(row => row.employee_id === 'rpt-e3'));
  assert.ok((await get(`/run/payslip-history?from=${thisMonth}-01&to=${day(28)}&employeeId=rpt-e1`)).body.rows.length >= 1);
});
