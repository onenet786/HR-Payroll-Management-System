// Reports: history is read on the server, on demand, instead of being loaded into every browser.
// Browsers keep only the working set (active staff, the current and previous month of attendance); anything older
// or larger is a report: filtered, paged and exported here with SQL. Mounted at /api/reports behind authenticate and
// the licence gate.
//
//   GET /api/reports/catalog                       reports this user may run (with their filters)
//   GET /api/reports/run/:id?filters&page&pageSize  one page as JSON
//   GET /api/reports/run/:id?filters&format=csv     every row as CSV (Excel), recorded in the audit log
const express = require('express');
const { pool } = require('./db.cjs');

const PAGE_SIZE_MAX = 500;
const EXPORT_MAX = 200000;
const ID = /^[\w.:@-]{1,240}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

// ── who may see which group ──────────────────────────────────────────────────
const GROUPS = {
  employees: { title: 'Employees', permissions: ['manage_employees', 'manage_payroll', 'view_reports'] },
  attendance: { title: 'Attendance', permissions: ['manage_attendance', 'manage_payroll', 'view_reports'] },
  // Salaries are sensitive: "View reports" alone does not open these.
  payroll: { title: 'Payroll', permissions: ['manage_payroll'] },
  statutory: { title: 'Statutory', permissions: ['manage_payroll'] },
};
function groupAllowed(identity, group) {
  if (identity.roleId === 'role-admin') return true;
  return GROUPS[group].permissions.some(permission => identity.permissions?.has(permission));
}

// ── shared SQL pieces ────────────────────────────────────────────────────────
const EMPLOYEE_JOINS = `
  LEFT JOIN branches b ON b.id = e.data->>'branchId'
  LEFT JOIN departments d ON d.id = e.data->>'departmentId'
  LEFT JOIN designations g ON g.id = e.data->>'designationId'
  LEFT JOIN zones z ON z.id = e.data->>'zoneId'
  LEFT JOIN uc_towns u ON u.id = e.data->>'ucTownId'`;
const EMPLOYEE_COLUMNS = `
  e.id AS employee_id, e.data->>'employeeCode' AS code, e.data->>'fullName' AS name,
  COALESCE(g.data->>'title', '') AS designation, COALESCE(d.data->>'name', '') AS department, COALESCE(b.data->>'name', '') AS branch`;
const STATUS = `COALESCE(a.status, a.data->>'status')`;
/** A JSON field as a number; 0 when missing or not numeric (old records are not always clean). */
const num = expr => `(CASE WHEN (${expr}) ~ '^-?[0-9]+([.][0-9]+)?$' THEN (${expr})::numeric ELSE 0 END)`;
const OT = num(`a.data->>'overtimeMinutes'`);
const flag = key => `((a.data->>'${key}') = 'true')`;
const EMP_STATUS = `COALESCE(e.data->>'status', 'Active')`;

/** Adds the employee filters (branch, department, …) to a WHERE list. Values always go in as parameters. */
function employeeWhere(f, params, where) {
  const add = (column, value) => { params.push(value); where.push(`${column} = $${params.length}`); };
  if (f.branchId) add(`e.data->>'branchId'`, f.branchId);
  if (f.departmentId) add(`e.data->>'departmentId'`, f.departmentId);
  if (f.designationId) add(`e.data->>'designationId'`, f.designationId);
  if (f.zoneId) add(`e.data->>'zoneId'`, f.zoneId);
  if (f.ucTownId) add(`e.data->>'ucTownId'`, f.ucTownId);
  if (f.employeeId) add(`e.id`, f.employeeId);
  if (f.search) {
    params.push(`%${f.search}%`);
    const n = `$${params.length}`;
    where.push(`(e.data->>'fullName' ILIKE ${n} OR e.data->>'employeeCode' ILIKE ${n} OR e.data->>'cnic' ILIKE ${n})`);
  }
}
function statusWhere(f, params, where) {
  if (!f.employeeStatus || f.employeeStatus === 'all') return;
  if (f.employeeStatus === 'current') { where.push(`${EMP_STATUS} <> 'Terminated'`); return; }
  params.push(f.employeeStatus);
  where.push(`${EMP_STATUS} = $${params.length}`);
}
const whereSql = where => (where.length ? `WHERE ${where.join(' AND ')}` : '');
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
const bad = message => Object.assign(new Error(message), { status: 400 });
function requireRange(f, maxDays, label = 'date range') {
  if (!f.from || !f.to) throw bad('Choose the date range.');
  if (f.from > f.to) throw bad('The start date is after the end date.');
  if (maxDays && daysBetween(f.from, f.to) > maxDays) throw bad(`The ${label} can be at most ${maxDays} days. Choose one employee for a longer period.`);
}
const today = () => new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10); // Pakistan time

const C = (key, label, type = 'text') => ({ key, label, type });
const EMP_COLS = [C('code', 'Code'), C('name', 'Employee'), C('designation', 'Designation'), C('department', 'Department'), C('branch', 'Branch')];
const PLACE_FILTERS = ['branch', 'department', 'designation', 'zone', 'ucTown'];
const STD_FILTERS = [...PLACE_FILTERS, 'employee'];
const ATT_CODES = { Present: 'P', Late: 'L', 'Half Day': 'HD', Absent: 'A', 'On Leave': 'LV', Holiday: 'H' };
const ATTENDANCE_FROM = `FROM attendances a JOIN employees e ON e.id = a.employee_id ${EMPLOYEE_JOINS}`;
/**
 * Per-employee totals over attendance. Adds up per employee first (one pass over the attendance index, no joins),
 * then joins names onto the result: over 1.5 million days that is 1-2 s instead of 15 s.
 * aggregates: [[alias, SQL expression over a.*], …]; extraWhere: conditions on a.* besides the date range.
 */
function perEmployee(f, aggregates, extraWhere = []) {
  const params = [f.from, f.to];
  const inner = [`a.date BETWEEN $1::date AND $2::date`, ...extraWhere];
  if (f.employeeId) { params.push(f.employeeId); inner.push(`a.employee_id = $${params.length}`); }
  const outer = [];
  employeeWhere({ ...f, employeeId: undefined }, params, outer);
  return {
    params,
    sql: `SELECT ${EMPLOYEE_COLUMNS}, ${aggregates.map(([alias]) => `s.${alias}`).join(', ')}
          FROM (SELECT a.employee_id AS emp, ${aggregates.map(([alias, expr]) => `${expr} AS ${alias}`).join(', ')}
                FROM attendances a WHERE ${inner.join(' AND ')} GROUP BY a.employee_id) s
          JOIN employees e ON e.id = s.emp ${EMPLOYEE_JOINS} ${whereSql(outer)}`,
  };
}

// ── payroll pieces ──
const PAYSLIP_FROM = `FROM payroll_payslips p JOIN payroll_runs r ON r.id = p.payroll_run_id LEFT JOIN employees e ON e.id = p.employee_id`;
/** First day of the run's month (guarded against bad values in old records). */
const PERIOD = `make_date(GREATEST(${num(`r.data->>'periodYear'`)}, 1)::int, LEAST(GREATEST(${num(`r.data->>'periodMonth'`)}, 1), 12)::int, 1)`;
const P = key => num(`p.data->>'${key}'`);
const personColumns = wrap => [
  `p.employee_id AS employee_id`,
  `${wrap(`COALESCE(NULLIF(p.data->>'employeeCode', ''), e.data->>'employeeCode', '')`)} AS code`,
  `${wrap(`COALESCE(NULLIF(p.data->>'employeeName', ''), e.data->>'fullName', '')`)} AS name`,
  `${wrap(`COALESCE(p.data->>'designationTitle', '')`)} AS designation`,
  `${wrap(`COALESCE(p.data->>'departmentName', '')`)} AS department`,
  `${wrap(`COALESCE(p.data->>'branchName', '')`)} AS branch`,
].join(', ');
// Payslips keep the name, code, department and branch as they were that month.
const PAYSLIP_PERSON = personColumns(expr => expr);
const PAYSLIP_PERSON_AGG = personColumns(expr => `max(${expr})`);
const RUN_STATUS = `COALESCE(r.status, r.data->>'status')`;
/** WHERE for payslip reports: period condition, run status (paid / approved+paid / all but cancelled), employee filters. */
function payslipWhere(f, periodCondition, initialParams) {
  const params = [...initialParams];
  const where = [periodCondition];
  if (f.runStatus === 'paid') where.push(`${RUN_STATUS} = 'Disbursed'`);
  else if (f.runStatus === 'all') where.push(`COALESCE(${RUN_STATUS}, '') <> 'Cancelled'`);
  else where.push(`${RUN_STATUS} IN ('Approved', 'Disbursed')`);
  employeeWhere(f, params, where);
  return { where, params };
}

// ── the reports ──────────────────────────────────────────────────────────────
// run(filters, db, page) returns { sql, params, order, columns, totals?, summarySql? } (paged by runReport) or
// { rows, total, columns } when it pages itself.
const REPORTS = [
  // Employees
  {
    id: 'employee-directory', group: 'employees', title: 'Employee directory',
    description: 'Every employee with job, place and contact details. Filter by status, branch, department, zone or name.',
    filters: ['employeeStatus', 'search', ...STD_FILTERS], defaults: { employeeStatus: 'current' },
    run(f) {
      const params = []; const where = [];
      employeeWhere(f, params, where); statusWhere(f, params, where);
      return {
        sql: `SELECT ${EMPLOYEE_COLUMNS}, e.data->>'cnic' AS cnic, COALESCE(z.data->>'name', e.data->>'zone', '') AS zone, COALESCE(u.data->>'name', e.data->>'ucTown', '') AS uc_town,
                e.data->>'dateOfJoining' AS joined, ${EMP_STATUS} AS status, e.data->>'contactNumber' AS contact, e.data->>'gender' AS gender
              FROM employees e ${EMPLOYEE_JOINS} ${whereSql(where)}`,
        params, order: 'name, code',
        columns: [...EMP_COLS, C('cnic', 'CNIC'), C('zone', 'Zone'), C('uc_town', 'UC / Town'), C('joined', 'Joined', 'date'), C('status', 'Status', 'badge'), C('contact', 'Contact'), C('gender', 'Gender')],
      };
    },
  },
  {
    id: 'headcount', group: 'employees', title: 'Headcount by group',
    description: 'Number of employees per branch, department, designation, zone, UC / town, supervisor or gender, split by status.',
    filters: ['groupBy', ...PLACE_FILTERS], defaults: { groupBy: 'branch' },
    run(f) {
      const groups = {
        branch: [`COALESCE(b.data->>'name', '(no branch)')`, 'Branch'],
        department: [`COALESCE(d.data->>'name', '(no department)')`, 'Department'],
        designation: [`COALESCE(g.data->>'title', '(no designation)')`, 'Designation'],
        zone: [`COALESCE(z.data->>'name', NULLIF(e.data->>'zone', ''), '(no zone)')`, 'Zone'],
        ucTown: [`COALESCE(u.data->>'name', NULLIF(e.data->>'ucTown', ''), '(no UC / town)')`, 'UC / Town'],
        supervisor: [`COALESCE(m.data->>'fullName', NULLIF(e.data->>'zoneInChargeName', ''), '(no supervisor)')`, 'Supervisor'],
        gender: [`COALESCE(NULLIF(e.data->>'gender', ''), '(not set)')`, 'Gender'],
      };
      const [expr, label] = groups[f.groupBy] || groups.branch;
      const params = []; const where = [];
      employeeWhere(f, params, where);
      const n = status => `count(*) FILTER (WHERE ${EMP_STATUS} = '${status}')::int`;
      return {
        sql: `SELECT ${expr} AS grp, ${n('Active')} AS active, ${n('On Leave')} AS on_leave, ${n('Suspended')} AS suspended, ${n('Terminated')} AS left_company, count(*)::int AS total
              FROM employees e ${EMPLOYEE_JOINS} LEFT JOIN employees m ON m.id = e.data->>'reportingManagerId' ${whereSql(where)} GROUP BY 1`,
        params, order: 'active DESC, grp',
        columns: [C('grp', label), C('active', 'Active', 'number'), C('on_leave', 'On leave', 'number'), C('suspended', 'Suspended', 'number'), C('left_company', 'Left', 'number'), C('total', 'Total', 'number')],
        totals: ['active', 'on_leave', 'suspended', 'left_company', 'total'],
      };
    },
  },
  {
    id: 'joiners-leavers', group: 'employees', title: 'Joiners and leavers',
    description: 'Employees who joined or left in a period, with the separation type and reason.',
    filters: ['dateRange', ...PLACE_FILTERS], defaults: { range: 'thisYear' },
    run(f) {
      requireRange(f);
      const params = [f.from, f.to]; const where = [];
      employeeWhere(f, params, where);
      const extra = where.length ? ` AND ${where.join(' AND ')}` : '';
      return {
        sql: `SELECT 'Joined' AS movement, e.data->>'dateOfJoining' AS on_date, ${EMPLOYEE_COLUMNS}, '' AS separation_type, '' AS reason
                FROM employees e ${EMPLOYEE_JOINS} WHERE e.data->>'dateOfJoining' BETWEEN $1 AND $2${extra}
              UNION ALL
              SELECT 'Left', e.data->>'separationDate', ${EMPLOYEE_COLUMNS}, COALESCE(e.data->>'separationType', ''), COALESCE(e.data->>'separationReason', '')
                FROM employees e ${EMPLOYEE_JOINS} WHERE e.data->>'separationDate' BETWEEN $1 AND $2${extra}`,
        params, order: 'on_date, name',
        columns: [C('movement', 'Movement', 'badge'), C('on_date', 'Date', 'date'), ...EMP_COLS, C('separation_type', 'Separation'), C('reason', 'Reason')],
      };
    },
  },
  {
    id: 'missing-data', group: 'employees', title: 'Missing or invalid data',
    description: 'Current employees with gaps that block payroll or statutory filing: CNIC, bank account, salary, date of birth, designation, contact.',
    filters: [...PLACE_FILTERS], defaults: {},
    run(f) {
      const params = []; const where = [`${EMP_STATUS} <> 'Terminated'`];
      employeeWhere(f, params, where);
      const checks = `array_remove(ARRAY[
        CASE WHEN COALESCE(e.data->>'cnic', '') !~ '^[0-9]{5}-[0-9]{7}-[0-9]$' THEN 'CNIC' END,
        CASE WHEN COALESCE(NULLIF(e.data->>'iban', ''), NULLIF(e.data->>'bankAccountNumber', '')) IS NULL THEN 'Bank account' END,
        CASE WHEN ${num(`e.data->>'basicSalary'`)} <= 1 THEN 'Salary' END,
        CASE WHEN COALESCE(e.data->>'dateOfBirth', '') = '' THEN 'Date of birth' END,
        CASE WHEN COALESCE(e.data->>'designationId', '') = '' THEN 'Designation' END,
        CASE WHEN COALESCE(e.data->>'contactNumber', '') = '' THEN 'Contact number' END
      ], NULL)`;
      return {
        sql: `SELECT * FROM (SELECT ${EMPLOYEE_COLUMNS}, array_to_string(${checks}, ', ') AS missing, cardinality(${checks}) AS gaps
              FROM employees e ${EMPLOYEE_JOINS} ${whereSql(where)}) x WHERE gaps > 0`,
        params, order: 'gaps DESC, name',
        columns: [...EMP_COLS, C('missing', 'Missing or invalid'), C('gaps', 'Gaps', 'number')],
      };
    },
  },
  {
    id: 'expiries', group: 'employees', title: 'Upcoming expiries',
    description: 'CNIC expiry, contract end and probation end dates that fall in a period (default: the next 60 days).',
    filters: ['dateRange', ...PLACE_FILTERS], defaults: { range: 'next60' },
    run(f) {
      requireRange(f);
      const params = [f.from, f.to]; const where = [`${EMP_STATUS} <> 'Terminated'`, `x.on_date BETWEEN $1 AND $2`];
      employeeWhere(f, params, where);
      return {
        sql: `SELECT x.kind, x.on_date, ${EMPLOYEE_COLUMNS} FROM employees e ${EMPLOYEE_JOINS}
              CROSS JOIN LATERAL (VALUES ('CNIC expiry', e.data->>'cnicExpiryDate'), ('Contract end', e.data->>'contractEndDate'),
                ('Probation end', CASE WHEN COALESCE(e.data->>'probationConfirmedAt', '') = '' THEN e.data->>'probationEndDate' END)) AS x(kind, on_date)
              ${whereSql(where)}`,
        params, order: 'on_date, name',
        columns: [C('kind', 'What', 'badge'), C('on_date', 'Date', 'date'), ...EMP_COLS],
      };
    },
  },

  // Attendance
  {
    id: 'daily-attendance', group: 'attendance', title: 'Daily attendance',
    description: 'Every current employee on one day: present, late, absent, on leave, or no record yet, with punch times.',
    filters: ['date', 'attendanceStatus', ...PLACE_FILTERS], defaults: { date: 'today' },
    run(f) {
      if (!f.date) throw bad('Choose the day.');
      const params = [f.date]; const where = [`(${EMP_STATUS} <> 'Terminated' OR a.id IS NOT NULL)`, `COALESCE(e.data->>'dateOfJoining', '') <= $1::text`];
      employeeWhere(f, params, where);
      if (f.attendanceStatus) { params.push(f.attendanceStatus); where.push(`COALESCE(${STATUS}, 'No record') = $${params.length}`); }
      const from = `FROM employees e ${EMPLOYEE_JOINS} LEFT JOIN attendances a ON a.employee_id = e.id AND a.date = $1::date ${whereSql(where)}`;
      return {
        sql: `SELECT ${EMPLOYEE_COLUMNS}, COALESCE(${STATUS}, 'No record') AS status, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out,
                a.data->>'method' AS method, ROUND(${OT} / 60, 2) AS ot_hours ${from}`,
        params, order: 'branch, name',
        columns: [...EMP_COLS, C('status', 'Status', 'badge'), C('punch_in', 'In', 'time'), C('punch_out', 'Out', 'time'), C('method', 'Method'), C('ot_hours', 'OT hours', 'number')],
        summarySql: `SELECT COALESCE(${STATUS}, 'No record') AS label, count(*)::int AS value ${from} GROUP BY 1 ORDER BY 2 DESC`,
      };
    },
  },
  {
    id: 'monthly-register', group: 'attendance', title: 'Monthly register (muster roll)',
    description: 'One line per employee, one column per day: P present, L late, HD half day, A absent, LV leave, H holiday; with monthly totals.',
    filters: ['month', ...STD_FILTERS], defaults: { month: 'thisMonth' },
    async run(f, db, page) {
      if (!f.month) throw bad('Choose the month.');
      const [year, month] = f.month.split('-').map(Number);
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const from = `${f.month}-01`;
      const to = `${f.month}-${String(days).padStart(2, '0')}`;
      const params = [from, to];
      const where = [`(${EMP_STATUS} <> 'Terminated' OR EXISTS (SELECT 1 FROM attendances x WHERE x.employee_id = e.id AND x.date BETWEEN $1::date AND $2::date))`, `COALESCE(e.data->>'dateOfJoining', '') <= $2::text`];
      employeeWhere(f, params, where);
      const base = `FROM employees e ${EMPLOYEE_JOINS} ${whereSql(where)}`;
      const total = Number((await db.query(`SELECT count(*)::int AS n ${base}`, params)).rows[0].n);
      const employees = (await db.query(`SELECT ${EMPLOYEE_COLUMNS} ${base} ORDER BY 6, 3, 2 LIMIT ${Number(page.limit)} OFFSET ${Number(page.offset)}`, params)).rows;
      const ids = employees.map(row => row.employee_id);
      const marks = ids.length ? (await db.query(`SELECT a.employee_id, EXTRACT(DAY FROM a.date)::int AS day, ${STATUS} AS status, ${OT} AS ot
        FROM attendances a WHERE a.employee_id = ANY($1) AND a.date BETWEEN $2::date AND $3::date`, [ids, from, to])).rows : [];
      const byEmployee = new Map(ids.map(id => [id, { days: {}, ot: 0 }]));
      for (const mark of marks) { const item = byEmployee.get(mark.employee_id); item.days[mark.day] = ATT_CODES[mark.status] || '?'; item.ot += Number(mark.ot); }
      const rows = employees.map(employee => {
        const item = byEmployee.get(employee.employee_id);
        const count = code => Object.values(item.days).filter(value => value === code).length;
        const row = { ...employee };
        for (let day = 1; day <= days; day += 1) row[`d${day}`] = item.days[day] || '';
        return Object.assign(row, { t_present: count('P') + count('L'), t_late: count('L'), t_half: count('HD'), t_absent: count('A'), t_leave: count('LV'), t_holiday: count('H'), t_ot: Math.round(item.ot / 6) / 10 });
      });
      const columns = [C('code', 'Code'), C('name', 'Employee'), ...Array.from({ length: days }, (_, index) => C(`d${index + 1}`, String(index + 1), 'mark')),
        C('t_present', 'Present', 'number'), C('t_late', 'Late', 'number'), C('t_half', 'Half', 'number'), C('t_absent', 'Absent', 'number'),
        C('t_leave', 'Leave', 'number'), C('t_holiday', 'Holiday', 'number'), C('t_ot', 'OT h', 'number')];
      return { rows, total, columns, wide: true };
    },
  },
  {
    id: 'attendance-summary', group: 'attendance', title: 'Attendance summary',
    description: 'Per employee for any period (week, month, year, or the whole CyberAP history): present, late, half days, absent, leave, holidays, overtime.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisMonth' },
    run(f) {
      requireRange(f, 7400);
      const n = status => `count(*) FILTER (WHERE ${STATUS} = '${status}')::int`;
      const { sql, params } = perEmployee(f, [
        ['present', `${n('Present')} + ${n('Late')}`], ['late', n('Late')], ['half_day', n('Half Day')], ['absent', n('Absent')],
        ['on_leave', n('On Leave')], ['holiday', n('Holiday')], ['days', 'count(*)::int'], ['ot_hours', `ROUND(sum(${OT}) / 60, 1)`],
      ]);
      return {
        sql, params, order: 'name, code',
        columns: [...EMP_COLS, C('present', 'Present', 'number'), C('late', 'Late', 'number'), C('half_day', 'Half day', 'number'), C('absent', 'Absent', 'number'),
          C('on_leave', 'Leave', 'number'), C('holiday', 'Holiday', 'number'), C('days', 'Days recorded', 'number'), C('ot_hours', 'OT hours', 'number')],
        totals: ['present', 'late', 'half_day', 'absent', 'on_leave', 'holiday', 'days', 'ot_hours'],
      };
    },
  },
  {
    id: 'late-arrivals', group: 'attendance', title: 'Late arrivals',
    description: 'Every day marked late in a period, with the punch-in time.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisMonth' },
    run(f) {
      requireRange(f, f.employeeId ? 7400 : 400);
      const params = [f.from, f.to]; const where = [`a.date BETWEEN $1::date AND $2::date`, `${STATUS} = 'Late'`];
      employeeWhere(f, params, where);
      return {
        sql: `SELECT a.date::text AS on_date, ${EMPLOYEE_COLUMNS}, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out, a.data->>'method' AS method
              ${ATTENDANCE_FROM} ${whereSql(where)}`,
        params, order: 'on_date DESC, punch_in DESC',
        columns: [C('on_date', 'Date', 'date'), ...EMP_COLS, C('punch_in', 'In', 'time'), C('punch_out', 'Out', 'time'), C('method', 'Method')],
      };
    },
  },
  {
    id: 'overtime', group: 'attendance', title: 'Overtime',
    description: 'Overtime hours per employee in a period, with the number of days on which overtime was worked.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisMonth' },
    run(f) {
      requireRange(f, 7400);
      const { sql, params } = perEmployee(f, [['ot_days', 'count(*)::int'], ['ot_hours', `ROUND(sum(${OT}) / 60, 1)`], ['last_day', 'max(a.date)::text']], [`${OT} > 0`]);
      return {
        sql, params, order: 'ot_hours DESC, name',
        columns: [...EMP_COLS, C('ot_days', 'Days with OT', 'number'), C('ot_hours', 'OT hours', 'number'), C('last_day', 'Last OT day', 'date')],
        totals: ['ot_days', 'ot_hours'],
      };
    },
  },
  {
    id: 'absentees', group: 'attendance', title: 'Absentees',
    description: 'Every absent day in a period. Use the summary report for counts per employee.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisMonth' },
    run(f) {
      requireRange(f, f.employeeId ? 7400 : 400);
      const params = [f.from, f.to]; const where = [`a.date BETWEEN $1::date AND $2::date`, `${STATUS} = 'Absent'`];
      employeeWhere(f, params, where);
      return {
        sql: `SELECT a.date::text AS on_date, ${EMPLOYEE_COLUMNS}, COALESCE(a.data->>'policyLeaveReason', a.data->>'reviewComment', '') AS note
              ${ATTENDANCE_FROM} ${whereSql(where)}`,
        params, order: 'on_date DESC, name',
        columns: [C('on_date', 'Date', 'date'), ...EMP_COLS, C('note', 'Note')],
      };
    },
  },
  {
    id: 'missing-punches', group: 'attendance', title: 'Missing punch-out',
    description: 'Past days with a punch-in but no punch-out, to correct before payroll.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisMonth' },
    run(f) {
      requireRange(f, 400);
      const params = [f.from, f.to, today()];
      const where = [`a.date BETWEEN $1::date AND $2::date`, `a.date < $3::date`, `COALESCE(a.data->>'punchIn', '') <> ''`, `COALESCE(a.data->>'punchOut', '') = ''`, `${STATUS} IN ('Present', 'Late', 'Half Day')`];
      employeeWhere(f, params, where);
      return {
        sql: `SELECT a.date::text AS on_date, ${EMPLOYEE_COLUMNS}, a.data->>'punchIn' AS punch_in, a.data->>'method' AS method,
                CASE WHEN ${flag('regularizationRequested')} THEN 'Requested' ELSE '' END AS correction
              ${ATTENDANCE_FROM} ${whereSql(where)}`,
        params, order: 'on_date DESC, name',
        columns: [C('on_date', 'Date', 'date'), ...EMP_COLS, C('punch_in', 'In', 'time'), C('method', 'Method'), C('correction', 'Correction', 'badge')],
      };
    },
  },
  {
    id: 'attendance-log', group: 'attendance', title: 'Attendance log (detailed)',
    description: 'Every attendance day with punches, method, terminal branch and review state. Choose one employee to see their full history, including CyberAP.',
    filters: ['dateRange', 'attendanceStatus', ...STD_FILTERS], defaults: { range: 'thisMonth' },
    run(f) {
      requireRange(f, f.employeeId ? 0 : 62, 'date range for all employees');
      const params = [f.from, f.to]; const where = [`a.date BETWEEN $1::date AND $2::date`];
      employeeWhere(f, params, where);
      if (f.attendanceStatus) { params.push(f.attendanceStatus); where.push(`${STATUS} = $${params.length}`); }
      return {
        sql: `SELECT a.date::text AS on_date, ${EMPLOYEE_COLUMNS}, ${STATUS} AS status, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out, a.data->>'method' AS method,
                COALESCE(tb.data->>'name', '') AS terminal_branch, ROUND(${OT} / 60, 2) AS ot_hours,
                CASE WHEN ${flag('regularizationApproved')} THEN 'Corrected' WHEN ${flag('regularizationRequested')} THEN 'Correction requested' ELSE '' END AS review,
                CASE WHEN a.data->>'importSource' = 'cyberap' THEN 'CyberAP' ELSE '' END AS source
              ${ATTENDANCE_FROM} LEFT JOIN branches tb ON tb.id = a.data->>'terminalBranchId' ${whereSql(where)}`,
        params, order: 'on_date DESC, name',
        columns: [C('on_date', 'Date', 'date'), ...EMP_COLS, C('status', 'Status', 'badge'), C('punch_in', 'In', 'time'), C('punch_out', 'Out', 'time'), C('method', 'Method'),
          C('terminal_branch', 'Terminal branch'), C('ot_hours', 'OT hours', 'number'), C('review', 'Review', 'badge'), C('source', 'Source')],
      };
    },
  },
  {
    id: 'mobile-duty', group: 'attendance', title: 'Mobile duty and field visits',
    description: 'Days punched from the mobile app or with field visits: location check, distance from the branch and number of visits.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisMonth' },
    run(f) {
      requireRange(f, f.employeeId ? 7400 : 400);
      const visits = `jsonb_array_length(CASE WHEN jsonb_typeof(a.data->'fieldVisits') = 'array' THEN a.data->'fieldVisits' ELSE '[]'::jsonb END)`;
      const params = [f.from, f.to]; const where = [`a.date BETWEEN $1::date AND $2::date`, `(a.data->>'method' IN ('Mobile GPS', 'Mobile Kiosk') OR ${visits} > 0)`];
      employeeWhere(f, params, where);
      return {
        sql: `SELECT a.date::text AS on_date, ${EMPLOYEE_COLUMNS}, a.data->>'method' AS method, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out,
                COALESCE(a.data->>'geofenceStatus', '') AS location_check, ROUND(${num(`a.data->>'geofenceDistanceMeters'`)}) AS distance_m,
                ${visits} AS visits, COALESCE(a.data->>'address', '') AS address
              ${ATTENDANCE_FROM} ${whereSql(where)}`,
        params, order: 'on_date DESC, name',
        columns: [C('on_date', 'Date', 'date'), ...EMP_COLS, C('method', 'Method'), C('punch_in', 'In', 'time'), C('punch_out', 'Out', 'time'), C('location_check', 'Location check', 'badge'),
          C('distance_m', 'Distance (m)', 'number'), C('visits', 'Field visits', 'number'), C('address', 'Address')],
      };
    },
  },

  // Payroll (payslips keep the name, code, department and branch as they were in that month)
  {
    id: 'payroll-register', group: 'payroll', title: 'Payroll register',
    description: 'Every payslip of a month: days paid, earnings, each deduction and net pay, with totals. Approved and paid runs by default.',
    filters: ['month', 'runStatus', ...STD_FILTERS], defaults: { month: 'thisMonth', runStatus: 'approved' },
    run(f) {
      if (!f.month) throw bad('Choose the month.');
      const { where, params } = payslipWhere(f, `${PERIOD} = $1::date`, [`${f.month}-01`]);
      return {
        sql: `SELECT r.data->>'title' AS run, ${PAYSLIP_PERSON}, ${P('paidDays')} AS paid_days, ${P('basicEarnings')} AS basic,
                ${P('houseRentAllowance')} + ${P('conveyanceAllowance')} + ${P('medicalAllowance')} + ${P('otherAllowances')} AS allowances, ${P('overtimePay')} AS overtime,
                ${P('grossSalary')} AS gross, ${P('incomeTaxDeduction')} AS income_tax, ${P('eobiEmployeeDeduction')} AS eobi, ${P('providentFundDeduction')} AS provident_fund,
                ${P('loanRepaymentDeduction')} AS loan, ${P('totalDeductions')} AS deductions, ${P('netSalary')} AS net
              ${PAYSLIP_FROM} ${whereSql(where)}`,
        params, order: 'branch, name',
        columns: [C('run', 'Run'), ...EMP_COLS, C('paid_days', 'Paid days', 'number'), C('basic', 'Basic', 'number'), C('allowances', 'Allowances', 'number'), C('overtime', 'Overtime', 'number'),
          C('gross', 'Gross', 'number'), C('income_tax', 'Income tax', 'number'), C('eobi', 'EOBI', 'number'), C('provident_fund', 'Provident fund', 'number'), C('loan', 'Loan', 'number'),
          C('deductions', 'Total deductions', 'number'), C('net', 'Net pay', 'number')],
        totals: ['basic', 'allowances', 'overtime', 'gross', 'income_tax', 'eobi', 'provident_fund', 'loan', 'deductions', 'net'],
      };
    },
  },
  {
    id: 'payslip-history', group: 'payroll', title: 'Payslip history',
    description: 'Payslips over a period: one employee\'s pay history, or everyone\'s. Gross, deductions, tax and net per month.',
    filters: ['dateRange', 'runStatus', ...STD_FILTERS], defaults: { range: 'thisYear', runStatus: 'approved' },
    run(f) {
      requireRange(f, 7400);
      const { where, params } = payslipWhere(f, `${PERIOD} BETWEEN date_trunc('month', $1::date) AND $2::date`, [f.from, f.to]);
      return {
        sql: `SELECT to_char(${PERIOD}, 'YYYY-MM') AS period, r.data->>'title' AS run, COALESCE(r.data->>'status', '') AS run_status, ${PAYSLIP_PERSON},
                ${P('grossSalary')} AS gross, ${P('incomeTaxDeduction')} AS income_tax, ${P('totalDeductions')} AS deductions, ${P('netSalary')} AS net
              ${PAYSLIP_FROM} ${whereSql(where)}`,
        params, order: 'period DESC, name',
        columns: [C('period', 'Month'), C('run', 'Run'), C('run_status', 'Status', 'badge'), ...EMP_COLS, C('gross', 'Gross', 'number'), C('income_tax', 'Income tax', 'number'),
          C('deductions', 'Total deductions', 'number'), C('net', 'Net pay', 'number')],
        totals: ['gross', 'income_tax', 'deductions', 'net'],
      };
    },
  },
  {
    id: 'bank-transfer', group: 'payroll', title: 'Bank transfer sheet',
    description: 'Net pay per employee with bank, account number and IBAN for a month. Rows without a bank account are marked for cash or cheque.',
    filters: ['month', 'runStatus', ...STD_FILTERS], defaults: { month: 'thisMonth', runStatus: 'approved' },
    run(f) {
      if (!f.month) throw bad('Choose the month.');
      const { where, params } = payslipWhere(f, `${PERIOD} = $1::date`, [`${f.month}-01`]);
      const iban = `COALESCE(NULLIF(p.data->>'iban', ''), NULLIF(e.data->>'iban', ''), '')`;
      const account = `COALESCE(NULLIF(p.data->>'bankAccountNumber', ''), NULLIF(e.data->>'bankAccountNumber', ''), '')`;
      return {
        sql: `SELECT ${PAYSLIP_PERSON}, COALESCE(NULLIF(p.data->>'bankName', ''), e.data->>'bankName', '') AS bank, ${account} AS account, ${iban} AS iban,
                ${P('netSalary')} AS net, CASE WHEN ${iban} = '' AND ${account} = '' THEN 'Cash / cheque' ELSE 'Bank' END AS pay_by
              ${PAYSLIP_FROM} ${whereSql(where)}`,
        params, order: 'pay_by, bank, name',
        columns: [...EMP_COLS, C('bank', 'Bank'), C('account', 'Account number'), C('iban', 'IBAN'), C('net', 'Net pay', 'number'), C('pay_by', 'Pay by', 'badge')],
        totals: ['net'],
      };
    },
  },
  {
    id: 'salary-by-group', group: 'payroll', title: 'Salary cost by group',
    description: 'Payroll cost per branch, department or designation over a period: employees paid, gross, tax, employer contributions and net.',
    filters: ['dateRange', 'payGroupBy', 'runStatus', ...PLACE_FILTERS], defaults: { range: 'thisMonth', payGroupBy: 'branch', runStatus: 'approved' },
    run(f) {
      requireRange(f, 7400);
      const groups = { branch: [`COALESCE(NULLIF(p.data->>'branchName', ''), '(no branch)')`, 'Branch'], department: [`COALESCE(NULLIF(p.data->>'departmentName', ''), '(no department)')`, 'Department'], designation: [`COALESCE(NULLIF(p.data->>'designationTitle', ''), '(no designation)')`, 'Designation'] };
      const [expr, label] = groups[f.payGroupBy] || groups.branch;
      const { where, params } = payslipWhere(f, `${PERIOD} BETWEEN date_trunc('month', $1::date) AND $2::date`, [f.from, f.to]);
      return {
        sql: `SELECT ${expr} AS grp, count(DISTINCT p.employee_id)::int AS employees, count(*)::int AS payslips, sum(${P('grossSalary')}) AS gross, sum(${P('incomeTaxDeduction')}) AS income_tax,
                sum(${P('eobiEmployerContribution')}) AS eobi_employer, sum(${P('pessiEmployerContribution')}) AS social_security_employer,
                sum(${P('providentFundEmployerContribution')}) AS pf_employer, sum(${P('netSalary')}) AS net,
                sum(${P('grossSalary')} + ${P('eobiEmployerContribution')} + ${P('pessiEmployerContribution')} + ${P('providentFundEmployerContribution')}) AS employer_cost
              ${PAYSLIP_FROM} ${whereSql(where)} GROUP BY 1`,
        params, order: 'employer_cost DESC, grp',
        columns: [C('grp', label), C('employees', 'Employees', 'number'), C('payslips', 'Payslips', 'number'), C('gross', 'Gross', 'number'), C('income_tax', 'Income tax', 'number'),
          C('eobi_employer', 'EOBI (employer)', 'number'), C('social_security_employer', 'Social security (employer)', 'number'), C('pf_employer', 'PF (employer)', 'number'),
          C('net', 'Net pay', 'number'), C('employer_cost', 'Total employer cost', 'number')],
        totals: ['payslips', 'gross', 'income_tax', 'eobi_employer', 'social_security_employer', 'pf_employer', 'net', 'employer_cost'],
      };
    },
  },
  {
    id: 'loans-advances', group: 'payroll', title: 'Loans and advances',
    description: 'Loans and advances with amount, monthly installment, repaid so far and balance. Open ones (pending, approved, active) by default.',
    filters: ['loanStatus', ...STD_FILTERS], defaults: { loanStatus: 'open' },
    run(f) {
      const params = []; const where = [];
      employeeWhere(f, params, where);
      const status = `COALESCE(l.status, l.data->>'status')`;
      if (!f.loanStatus || f.loanStatus === 'open') where.push(`${status} IN ('Pending', 'Approved', 'Active')`);
      else if (f.loanStatus !== 'all') { params.push(f.loanStatus); where.push(`${status} = $${params.length}`); }
      const L = key => num(`l.data->>'${key}'`);
      return {
        sql: `SELECT ${EMPLOYEE_COLUMNS}, l.data->>'type' AS type, ${status} AS status, l.data->>'disbursedDate' AS disbursed, ${L('approvedAmount')} AS approved,
                ${L('monthlyInstallment')} AS installment, ${L('totalInstallments')} AS installments, ${L('remainingInstallments')} AS remaining, ${L('totalRepaid')} AS repaid,
                GREATEST(${L('approvedAmount')} - ${L('totalRepaid')}, 0) AS balance
              FROM loan_advances l JOIN employees e ON e.id = l.employee_id ${EMPLOYEE_JOINS} ${whereSql(where)}`,
        params, order: 'balance DESC, name',
        columns: [...EMP_COLS, C('type', 'Type', 'badge'), C('status', 'Status', 'badge'), C('disbursed', 'Disbursed', 'date'), C('approved', 'Approved amount', 'number'),
          C('installment', 'Monthly installment', 'number'), C('installments', 'Installments', 'number'), C('remaining', 'Remaining', 'number'), C('repaid', 'Repaid', 'number'), C('balance', 'Balance', 'number')],
        totals: ['approved', 'repaid', 'balance'],
      };
    },
  },
  {
    id: 'salary-revisions', group: 'payroll', title: 'Salary revisions',
    description: 'Increments, promotions and adjustments effective in a period: old and new salary, amount, percentage and approver.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisYear' },
    run(f) {
      requireRange(f, 7400);
      const params = [f.from, f.to]; const where = [`s.data->>'effectiveDate' BETWEEN $1 AND $2`];
      employeeWhere(f, params, where);
      const S = key => num(`s.data->>'${key}'`);
      return {
        sql: `SELECT s.data->>'effectiveDate' AS effective, ${EMPLOYEE_COLUMNS}, s.data->>'type' AS type, ${S('previousSalary')} AS previous_salary, ${S('newSalary')} AS new_salary,
                ${S('incrementAmount')} AS increment, ${S('incrementPercentage')} AS percent, COALESCE(s.data->>'status', 'Approved') AS status, COALESCE(s.data->>'approvedBy', '') AS approved_by
              FROM salary_revisions s JOIN employees e ON e.id = s.employee_id ${EMPLOYEE_JOINS} ${whereSql(where)}`,
        params, order: 'effective DESC, name',
        columns: [C('effective', 'Effective', 'date'), ...EMP_COLS, C('type', 'Type', 'badge'), C('previous_salary', 'Previous', 'number'), C('new_salary', 'New', 'number'),
          C('increment', 'Increment', 'number'), C('percent', '%', 'number'), C('status', 'Status', 'badge'), C('approved_by', 'Approved by')],
        totals: ['increment'],
      };
    },
  },
  {
    id: 'settlements', group: 'payroll', title: 'Gratuity and final settlements',
    description: 'Final settlements by separation date: gratuity, leave encashment, notice pay, pending salary, total and payment status.',
    filters: ['dateRange', ...STD_FILTERS], defaults: { range: 'thisYear' },
    run(f) {
      requireRange(f, 7400);
      const params = [f.from, f.to]; const where = [`gs.data->>'separationDate' BETWEEN $1 AND $2`];
      employeeWhere(f, params, where);
      const G = key => num(`gs.data->>'${key}'`);
      return {
        sql: `SELECT gs.data->>'separationDate' AS separated, ${EMPLOYEE_COLUMNS}, gs.data->>'separationType' AS type, ${G('yearsOfService')} AS years, ${G('gratuityAmount')} AS gratuity,
                ${G('leaveEncashmentAmount')} AS leave_encashment, ${G('noticePayAmount')} AS notice_pay, ${G('pendingSalaryAmount')} AS pending_salary, ${G('totalSettlementAmount')} AS total,
                COALESCE(gs.status, gs.data->>'status') AS status, COALESCE(gs.data->>'paidDate', '') AS paid_on
              FROM gratuity_settlements gs JOIN employees e ON e.id = gs.employee_id ${EMPLOYEE_JOINS} ${whereSql(where)}`,
        params, order: 'separated DESC, name',
        columns: [C('separated', 'Separated', 'date'), ...EMP_COLS, C('type', 'Type', 'badge'), C('years', 'Years', 'number'), C('gratuity', 'Gratuity', 'number'),
          C('leave_encashment', 'Leave encashment', 'number'), C('notice_pay', 'Notice pay', 'number'), C('pending_salary', 'Pending salary', 'number'), C('total', 'Total', 'number'),
          C('status', 'Status', 'badge'), C('paid_on', 'Paid on', 'date')],
        totals: ['gratuity', 'leave_encashment', 'notice_pay', 'pending_salary', 'total'],
      };
    },
  },

  // Statutory (paid runs by default: what was actually deducted)
  {
    id: 'income-tax-employee', group: 'statutory', title: 'Income tax withheld per employee',
    description: 'Salary paid and income tax deducted per employee over a period (default: the current tax year, July to June). The basis for annual tax certificates.',
    filters: ['dateRange', 'runStatus', ...STD_FILTERS], defaults: { range: 'taxYear', runStatus: 'paid' },
    run(f) {
      requireRange(f, 7400);
      const { where, params } = payslipWhere(f, `${PERIOD} BETWEEN date_trunc('month', $1::date) AND $2::date`, [f.from, f.to]);
      return {
        sql: `SELECT ${PAYSLIP_PERSON_AGG}, max(COALESCE(p.data->>'cnic', e.data->>'cnic', '')) AS cnic, max(COALESCE(e.data->>'ntn', '')) AS ntn, count(*)::int AS months,
                sum(${P('grossSalary')}) AS gross, sum(${P('incomeTaxDeduction')}) AS income_tax
              ${PAYSLIP_FROM} ${whereSql(where)} GROUP BY p.employee_id`,
        params, order: 'name, code',
        columns: [...EMP_COLS, C('cnic', 'CNIC'), C('ntn', 'NTN'), C('months', 'Months', 'number'), C('gross', 'Salary paid', 'number'), C('income_tax', 'Tax deducted', 'number')],
        totals: ['gross', 'income_tax'],
      };
    },
  },
  {
    id: 'income-tax-monthly', group: 'statutory', title: 'Income tax withheld per month',
    description: 'Tax deducted per month across all employees, with the run status, to reconcile with the monthly withholding deposit.',
    filters: ['dateRange', 'runStatus', ...PLACE_FILTERS], defaults: { range: 'taxYear', runStatus: 'paid' },
    run(f) {
      requireRange(f, 7400);
      const { where, params } = payslipWhere(f, `${PERIOD} BETWEEN date_trunc('month', $1::date) AND $2::date`, [f.from, f.to]);
      return {
        sql: `SELECT to_char(${PERIOD}, 'YYYY-MM') AS period, count(DISTINCT p.employee_id)::int AS employees, count(*) FILTER (WHERE ${P('incomeTaxDeduction')} > 0)::int AS taxed,
                sum(${P('grossSalary')}) AS gross, sum(${P('incomeTaxDeduction')}) AS income_tax
              ${PAYSLIP_FROM} ${whereSql(where)} GROUP BY 1`,
        params, order: 'period',
        columns: [C('period', 'Month'), C('employees', 'Employees paid', 'number'), C('taxed', 'Employees taxed', 'number'), C('gross', 'Salary paid', 'number'), C('income_tax', 'Tax deducted', 'number')],
        totals: ['gross', 'income_tax'],
      };
    },
  },
  {
    id: 'eobi', group: 'statutory', title: 'EOBI contributions',
    description: 'Employee and employer EOBI contributions per employee over a period, with EOBI number and CNIC, for the monthly EOBI return.',
    filters: ['dateRange', 'runStatus', ...STD_FILTERS], defaults: { range: 'lastMonth', runStatus: 'paid' },
    run(f) {
      requireRange(f, 7400);
      const { where, params } = payslipWhere(f, `${PERIOD} BETWEEN date_trunc('month', $1::date) AND $2::date`, [f.from, f.to]);
      return {
        sql: `SELECT ${PAYSLIP_PERSON_AGG}, max(COALESCE(e.data->>'eobiNumber', '')) AS eobi_number, max(COALESCE(p.data->>'cnic', e.data->>'cnic', '')) AS cnic, count(*)::int AS months,
                sum(${P('eobiEmployeeDeduction')}) AS employee_share, sum(${P('eobiEmployerContribution')}) AS employer_share,
                sum(${P('eobiEmployeeDeduction')} + ${P('eobiEmployerContribution')}) AS total
              ${PAYSLIP_FROM} ${whereSql(where)} GROUP BY p.employee_id`,
        params, order: 'name, code',
        columns: [...EMP_COLS, C('eobi_number', 'EOBI number'), C('cnic', 'CNIC'), C('months', 'Months', 'number'), C('employee_share', 'Employee share', 'number'),
          C('employer_share', 'Employer share', 'number'), C('total', 'Total', 'number')],
        totals: ['employee_share', 'employer_share', 'total'],
      };
    },
  },
  {
    id: 'social-security', group: 'statutory', title: 'Social security contributions',
    description: 'Provincial social security (PESSI / SESSI) contributions per employee over a period, with social security number and province.',
    filters: ['dateRange', 'runStatus', ...STD_FILTERS], defaults: { range: 'lastMonth', runStatus: 'paid' },
    run(f) {
      requireRange(f, 7400);
      const { where, params } = payslipWhere(f, `${PERIOD} BETWEEN date_trunc('month', $1::date) AND $2::date`, [f.from, f.to]);
      return {
        sql: `SELECT ${PAYSLIP_PERSON_AGG}, max(COALESCE(e.data->>'socialSecurityNumber', '')) AS ss_number, max(COALESCE(p.data->>'province', '')) AS province, count(*)::int AS months,
                sum(${P('grossSalary')}) AS gross, sum(${P('pessiEmployeeDeduction')}) AS employee_share, sum(${P('pessiEmployerContribution')}) AS employer_share,
                sum(${P('pessiEmployeeDeduction')} + ${P('pessiEmployerContribution')}) AS total
              ${PAYSLIP_FROM} ${whereSql(where)} GROUP BY p.employee_id`,
        params, order: 'province, name',
        columns: [...EMP_COLS, C('ss_number', 'Social security number'), C('province', 'Province'), C('months', 'Months', 'number'), C('gross', 'Salary paid', 'number'),
          C('employee_share', 'Employee share', 'number'), C('employer_share', 'Employer share', 'number'), C('total', 'Total', 'number')],
        totals: ['gross', 'employee_share', 'employer_share', 'total'],
      };
    },
  },
];
const BY_ID = new Map(REPORTS.map(report => [report.id, report]));

// ── filters from the query string (validated; only ever passed as SQL parameters) ──
function readFilters(query) {
  const f = {};
  for (const key of ['branchId', 'departmentId', 'designationId', 'zoneId', 'ucTownId', 'employeeId']) {
    const value = String(query[key] || '').trim();
    if (value) { if (!ID.test(value)) throw bad(`Invalid ${key}.`); f[key] = value; }
  }
  for (const key of ['from', 'to', 'date']) {
    const value = String(query[key] || '').trim();
    if (value) { if (!DATE.test(value)) throw bad(`${key} must be YYYY-MM-DD.`); f[key] = value; }
  }
  const month = String(query.month || '').trim();
  if (month) { if (!MONTH.test(month)) throw bad('month must be YYYY-MM.'); f.month = month; }
  const search = String(query.search || '').trim().slice(0, 80);
  if (search) f.search = search.replace(/[%_\\]/g, ch => `\\${ch}`);
  const pick = (key, allowed) => { const value = String(query[key] || '').trim(); if (value && allowed.includes(value)) f[key] = value; };
  pick('employeeStatus', ['all', 'current', 'Active', 'On Leave', 'Suspended', 'Terminated']);
  pick('attendanceStatus', ['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Holiday', 'No record']);
  pick('groupBy', ['branch', 'department', 'designation', 'zone', 'ucTown', 'supervisor', 'gender']);
  pick('payGroupBy', ['branch', 'department', 'designation']);
  pick('runStatus', ['paid', 'approved', 'all']);
  pick('loanStatus', ['open', 'all', 'Pending', 'Approved', 'Active', 'Closed', 'Rejected']);
  return f;
}

/** Runs a report: one page (limit/offset), or every row for an export. */
async function runReport(report, f, { limit, offset }, db = pool) {
  const spec = await report.run(f, db, { limit, offset });
  if (spec.rows) return { columns: spec.columns, rows: spec.rows, total: spec.total ?? spec.rows.length, totals: null, summary: null, wide: Boolean(spec.wide) };
  const params = [...spec.params, limit, offset];
  // Row count and column totals come from window functions over the same result: one pass over the data.
  const sums = (spec.totals || []).map(key => `, COALESCE(sum(${key}) OVER (), 0) AS __t_${key}`).join('');
  const result = await db.query(`SELECT q.*, count(*) OVER () AS __total${sums} FROM (${spec.sql}) q ORDER BY ${spec.order} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const first = result.rows[0];
  let total = first ? Number(first.__total) : 0;
  let totals = spec.totals && first ? Object.fromEntries(spec.totals.map(key => [key, first[`__t_${key}`]])) : null;
  if (!first && offset) {
    // A page past the end: count (and total) without rows.
    const again = (await db.query(`SELECT count(*)::int AS n${(spec.totals || []).map(key => `, COALESCE(sum(${key}), 0) AS ${key}`).join('')} FROM (${spec.sql}) q`, spec.params)).rows[0];
    total = Number(again.n);
    if (spec.totals) totals = Object.fromEntries(spec.totals.map(key => [key, again[key]]));
  }
  const rows = result.rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('__'))));
  const summary = spec.summarySql ? (await db.query(spec.summarySql, spec.params)).rows : null;
  return { columns: spec.columns, rows, total, totals, summary, wide: Boolean(spec.wide) };
}

/** One CSV cell; cells that Excel would run as a formula (=, +, -, @) are prefixed with an apostrophe. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (/^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const router = express.Router();

router.get('/catalog', (req, res) => {
  const groups = Object.entries(GROUPS).filter(([key]) => groupAllowed(req.identity, key)).map(([key, group]) => ({
    id: key, title: group.title,
    reports: REPORTS.filter(report => report.group === key).map(({ id, title, description, filters, defaults }) => ({ id, title, description, filters, defaults })),
  }));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ groups, today: today() });
});

// Employee picker for report filters: searches every employee, including former staff (the browser only holds the
// working set). Returns at most 20 matches.
router.get('/employees', async (req, res, next) => {
  try {
    if (!Object.keys(GROUPS).some(group => groupAllowed(req.identity, group))) return res.status(403).json({ error: 'You do not have access to reports.' });
    const search = String(req.query.search || '').trim().slice(0, 80).replace(/[%_\\]/g, ch => `\\${ch}`);
    const params = [];
    let where = '';
    if (search) { params.push(`%${search}%`); where = `WHERE e.data->>'fullName' ILIKE $1 OR e.data->>'employeeCode' ILIKE $1 OR e.data->>'cnic' ILIKE $1`; }
    const rows = (await pool.query(`SELECT e.id, e.data->>'employeeCode' AS code, e.data->>'fullName' AS name, ${EMP_STATUS} AS status
      FROM employees e ${where} ORDER BY (${EMP_STATUS} = 'Terminated'), e.data->>'fullName' LIMIT 20`, params)).rows;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ employees: rows });
  } catch (error) { next(error); }
});

router.get('/run/:id', async (req, res, next) => {
  try {
    const report = BY_ID.get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Unknown report.' });
    if (!groupAllowed(req.identity, report.group)) return res.status(403).json({ error: 'You do not have access to this report.' });
    const f = readFilters(req.query);
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.format === 'csv') {
      const result = await runReport(report, f, { limit: EXPORT_MAX, offset: 0 });
      await pool.query(`INSERT INTO hr_audit_log(actor_uid, actor_role_id, action, collection_name, document_id, new_data, correlation_id, source_ip) VALUES($1,$2,'report_export','reports',$3,$4::jsonb,$5,$6)`,
        [req.identity.uid, req.identity.roleId, report.id, JSON.stringify({ filters: f, rows: result.rows.length }), req.correlationId, req.ip]).catch(() => undefined);
      const lines = [result.columns.map(column => csvCell(column.label)).join(',')];
      for (const row of result.rows) lines.push(result.columns.map(column => csvCell(row[column.key])).join(','));
      if (result.totals) lines.push(result.columns.map((column, index) => csvCell(index === 0 ? 'Total' : result.totals[column.key] ?? '')).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${report.id}-${today()}.csv"`);
      return res.send(`﻿${lines.join('\r\n')}\r\n`); // BOM: Excel shows Urdu names correctly
    }
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(10, Number(req.query.pageSize) || 100));
    const page = Math.max(1, Number(req.query.page) || 1);
    const started = Date.now();
    const result = await runReport(report, f, { limit: pageSize, offset: (page - 1) * pageSize });
    res.json({ ...result, page, pageSize, ms: Date.now() - started });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message, correlationId: req.correlationId });
    next(error);
  }
});

module.exports = { router, REPORTS, GROUPS, readFilters, runReport, groupAllowed, csvCell };
