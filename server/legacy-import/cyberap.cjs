// Import of a legacy CyberAP (SQL Server) database into this system.
//
// tools/cyberap-export/Export-CyberAP.ps1 turns CyberAP into one package (*.cyberap.gz: gzip JSON lines, see that
// script for the format). This module reads the package as a stream, so a 12-year history of 1.5 million attendance
// days never sits in memory, and:
//   analyzePackage  reads the whole package without writing anything and reports what an import would do;
//   importPackage   optionally wipes the current business data, then loads masters, employees, attendance days and
//                   an archive of every other legacy row (payroll history, users without passwords, settings).
//
// Re-running is safe: every imported document has a deterministic id and importSource 'cyberap'. Employees and
// masters that already exist are left as they are (HR may have edited them since), and an attendance day is never
// written over a record the new system made for the same employee and date.
const fs = require('node:fs');
const readline = require('node:readline');
const zlib = require('node:zlib');

const SOURCE = 'cyberap';
const PACKAGE_FORMAT = 'cyberap-export';

// Business data removed by "wipe": everything that belongs to employees and their history. Setup is kept: the company,
// users and roles (so the admin can still sign in), statutory tables, wage types, kiosk devices, the edition and the
// audit log (which is evidence and is never deleted).
const WIPE_TABLES = Object.freeze([
  'employees', 'biometric_templates', 'attendances', 'attendance_periods', 'mobile_duty_authorizations', 'leaves',
  'holidays', 'payroll_runs', 'payroll_payslips', 'payroll_adjustments', 'loan_advances', 'salary_revisions',
  'gratuity_settlements', 'performance_reviews', 'company_assets', 'job_postings', 'job_applications', 'notifications',
  'lifecycle_requests', 'employee_documents', 'payslip_deliveries', 'payslip_alert_deliveries',
  'branches', 'departments', 'designations', 'zones', 'uc_towns', 'hr_documents', 'legacy_records',
]);

const LEGACY_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS legacy_records (
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  employee_id VARCHAR(240),
  record_date DATE,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, kind, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_legacy_records_employee ON legacy_records(employee_id, kind);
CREATE TABLE IF NOT EXISTS legacy_import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  actor TEXT,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  report JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances(date);
`;

// ─── Package reading ──────────────────────────────────────────────────────────

/** Streams the package line by line. onBytes receives the compressed bytes read so far (for a progress bar). */
async function* readPackage(filePath, onBytes) {
  const file = fs.createReadStream(filePath, { highWaterMark: 1 << 20 });
  let bytes = 0;
  if (onBytes) file.on('data', chunk => { bytes += chunk.length; onBytes(bytes); });
  const gunzip = zlib.createGunzip();
  file.on('error', error => gunzip.destroy(error));
  const lines = readline.createInterface({ input: file.pipe(gunzip), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line) continue;
    let item;
    try { item = JSON.parse(line); } catch { throw new Error(`The package is damaged: line ${lineNumber} is not valid JSON.`); }
    if (lineNumber === 1 && (item.t !== 'header' || item.format !== PACKAGE_FORMAT)) {
      throw new Error('This file is not a CyberAP export package. Create it with tools/cyberap-export/Export-CyberAP.ps1.');
    }
    yield item;
  }
  if (lineNumber === 0) throw new Error('The package is empty.');
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const text = value => (value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim());
const num = value => (Number.isFinite(Number(value)) ? Number(value) : 0);
// CyberAP writes 2100-01-01 (and 1900-01-01) for "no date".
const ymd = value => (typeof value === 'string' && /^(19|20)\d{2}-\d{2}-\d{2}/.test(value) && !value.startsWith('1900-') ? value.slice(0, 10) : '');
const hms = value => (typeof value === 'string' && value.length >= 19 ? value.slice(11, 19) : '');
const minutesBetween = (a, b) => {
  const toMinutes = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  if (!a || !b) return 0;
  const diff = toMinutes(b) - toMinutes(a);
  return diff >= 0 ? diff : diff + 1440;
};
const compact = object => Object.fromEntries(Object.entries(object).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)));

/** CNIC as 12345-1234567-1, or '' when the legacy value is not a real CNIC. */
function normalizeCnic(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 13 || /^(\d)\1{12}$/.test(digits)) return '';
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

const pad2 = n => String(n).padStart(2, '0');
const shiftTime = (hour, minute) => `${pad2(num(hour) % 24)}:${pad2(num(minute))}`;

// ─── Mapping ──────────────────────────────────────────────────────────────────

const ids = {
  branch: id => `branch-cy-${id}`,
  department: id => `dept-cy-${id}`,
  designation: id => `desig-cy-${id}`,
  holiday: id => `hol-cy-${id}`,
  shift: id => `shift-cy-${id}`,
  employee: id => `emp-cy-${id}`,
  attendance: (employeeLegacyId, date) => `att-cy-${employeeLegacyId}-${date}`,
};

/** Lookup tables and per-employee data built from the "row" lines, which come before employees in the package. */
function createContext({ companyId }) {
  return {
    companyId,
    tables: new Map(), // table -> array of rows (small tables only)
    salaryByEmployee: new Map(),
    headName: new Map(),
    employees: new Map(), // legacy employee id -> { id, status, branchId }
    branchByName: new Map(),
  };
}

function addRow(ctx, table, row) {
  if (!ctx.tables.has(table)) ctx.tables.set(table, []);
  ctx.tables.get(table).push(row);
  if (table === 'salary') {
    const list = ctx.salaryByEmployee.get(row.employee_id) || [];
    list.push(row);
    ctx.salaryByEmployee.set(row.employee_id, list);
  }
  if (table === 'salary_sub_head') ctx.headName.set(row.salary_sub_head_id, text(row.salary_sub_head_name));
}

const lookup = (ctx, table, key, id) => (ctx.tables.get(table) || []).find(row => row[key] === id);

function shiftFor(ctx, shiftId) {
  const row = lookup(ctx, 'shift', 'shift_id', shiftId);
  if (!row) return undefined;
  return {
    id: ids.shift(row.shift_id),
    name: text(row.shift_name) || `Shift ${row.shift_id}`,
    startTime: shiftTime(row.shift_start_hour, row.shift_start_minute),
    endTime: shiftTime(row.shift_end_hour, row.shift_end_minute),
    graceMinutes: num(row.shift_relaxation_time),
    halfDayMinutes: 120,
    overtimeMultiplier: 1,
  };
}

function mapMasters(ctx) {
  const branches = (ctx.tables.get('branch') || []).map(row => {
    const shift = shiftFor(ctx, row.shift_id);
    const branch = {
      id: ids.branch(row.branch_id), companyId: ctx.companyId, code: `CY${row.branch_id}`,
      name: text(row.branch_name) || `Branch ${row.branch_id}`, city: '', province: 'Punjab', address: text(row.branch_description),
      ...(shift ? { openingTime: shift.startTime } : {}), importSource: SOURCE,
      legacy: compact({ branchId: row.branch_id, grade: text(row.branch_grade), salaryPaymentMode: text(lookup(ctx, 'salary_payment_mode', 'salary_payment_mode_id', row.salary_payment_mode_id)?.salary_payment_mode_name) }),
    };
    ctx.branchByName.set(text(row.branch_name).toLowerCase(), branch.id);
    return branch;
  });
  const departments = (ctx.tables.get('employee_group') || []).map(row => ({
    id: ids.department(row.employee_group_id), branchId: '', name: text(row.employee_group_name) || `Group ${row.employee_group_id}`,
    code: `CYG${row.employee_group_id}`, importSource: SOURCE, legacy: { employeeGroupId: row.employee_group_id },
  }));
  const designations = (ctx.tables.get('designation') || []).map(row => ({
    id: ids.designation(row.designation_id), departmentId: '', code: `CYD${row.designation_id}`,
    title: text(row.designation_name) || `Designation ${row.designation_id}`, grade: '', importSource: SOURCE,
    legacy: compact({ designationId: row.designation_id, allowedLunchMinutes: num(row.allowed_lunch_time) || undefined }),
  }));
  const holidays = (ctx.tables.get('holiday') || []).filter(row => ymd(row.holiday_date)).map(row => ({
    id: ids.holiday(row.holiday_id), name: text(row.holiday_name) || 'Holiday', date: ymd(row.holiday_date),
    type: 'Public', isRecurring: false, importSource: SOURCE,
  }));
  return { branches, departments, designations, holidays };
}

/** True when the employee still works for the company in CyberAP. */
const isActiveLegacy = row => num(row.is_active) === 1 && text(row.employment_status).toLowerCase() === 'employed';

function mapEmployee(ctx, item) {
  const row = item.r;
  const legacyId = row.employee_id;
  const active = isActiveLegacy(row);
  const subGroup = lookup(ctx, 'employee_sub_group', 'employee_sub_group_id', row.employee_sub_group_id);
  const salaries = ctx.salaryByEmployee.get(legacyId) || [];
  const basicRow = salaries.find(s => s.salary_sub_head_id === 1);
  const basic = num(basicRow?.amount);
  const salaryHeads = Object.fromEntries(salaries.filter(s => num(s.amount) !== 0).map(s => [ctx.headName.get(s.salary_sub_head_id) || `head ${s.salary_sub_head_id}`, num(s.amount)]));
  const genderName = text(lookup(ctx, 'gender', 'gender_id', row.gender_id)?.gender_name);
  const maritalName = text(lookup(ctx, 'marital_status', 'marital_status_id', row.marital_status_id)?.marital_status_name);
  const cnic = normalizeCnic(row.employee_cnic_number);
  const shift = shiftFor(ctx, row.shift_id);
  const status = active ? 'Active' : 'Terminated';

  const employee = {
    id: ids.employee(legacyId),
    companyId: ctx.companyId,
    branchId: row.branch_id ? ids.branch(row.branch_id) : '',
    departmentId: subGroup ? ids.department(subGroup.employee_group_id) : '',
    designationId: row.designation_id ? ids.designation(row.designation_id) : '',
    employeeCode: text(row.employee_code) || `CY-${legacyId}`,
    fullName: text(row.employee_name) || `Employee ${legacyId}`,
    email: '',
    contactNumber: text(row.employee_mobile_phone_number) || text(row.employee_telephone_number),
    cnic,
    gender: ['Male', 'Female'].includes(genderName) ? genderName : '',
    dateOfBirth: ymd(row.employee_birth_date),
    dateOfJoining: ymd(row.employee_joining_date),
    status,
    wageType: 'Salaried',
    basicSalary: basic > 1 ? basic : 0, // CyberAP holds 1.0 as a placeholder for most staff: payroll needs the real figure
    shiftId: shift?.id,
    shift,
    providentFundOptIn: false,
    providentFundRate: 0,
    gratuityOptIn: false,
    bankName: '', bankBranchName: '', bankAccountNumber: '', iban: '',
    pictureUrl: active && item.thumb ? item.thumb : '',
    maritalStatus: maritalName === 'Married' ? 'Married' : maritalName === 'Single' ? 'Single' : undefined,
    fingerprintTemplates: [],
    importSource: SOURCE,
    legacy: compact({
      employeeId: legacyId,
      fatherName: text(row.employee_father_name),
      barCode: text(row.employee_bar_code),
      presentAddress: text(row.employee_present_address),
      permanentAddress: text(row.employee_permanent_address),
      telephone: text(row.employee_telephone_number),
      cnicAsEntered: cnic ? undefined : text(row.employee_cnic_number),
      bloodGroup: text(row.employee_blood_group),
      religion: text(lookup(ctx, 'religion', 'religion_id', row.religion_id)?.religion_name),
      subGroup: text(subGroup?.employee_sub_group_name),
      employmentStatus: text(row.employment_status),
      leavingDate: ymd(row.employee_leaving_date),
      notes: text(row.employee_notes),
      salaryHeads,
      salaryPlaceholder: basic <= 1 ? true : undefined,
      fingerprintArchived: item.fp ? true : undefined,
      photoArchived: item.photo ? true : undefined,
    }),
  };
  if (!active) {
    employee.separationDate = ymd(row.employee_leaving_date) || undefined;
    employee.separationReason = `CyberAP: ${text(row.employment_status) || 'inactive'}`;
  }
  return JSON.parse(JSON.stringify(employee)); // drops undefined fields
}

/** CyberAP day codes: P present / A absent / H holiday / BD branch off day / ED extra day; LI late in; HD half day. */
function dayStatus(remarks) {
  const [r1, r2, , r4] = remarks;
  if (r1 === 'A' || r1 === '-' || r1 === '') return 'Absent';
  if (r1 === 'H' || r1 === 'BD') return 'Holiday';
  if (r4 === 'HD') return 'Half Day';
  if (r2 === 'LI') return 'Late';
  return 'Present';
}

const column = columns => {
  const index = new Map((columns || []).map((name, i) => [name, i]));
  return (rowValues, name) => (index.has(name) ? rowValues[index.get(name)] : undefined);
};

/** One CyberAP employee-day (processed day + punches + overtime + tracking) as an AttendanceLog, or null to skip it. */
function mapDay(ctx, header, item) {
  const employee = ctx.employees.get(item.e);
  if (!employee) return null;
  const cols = header.dayColumns || {};
  const P = column(cols.p); const O = column(cols.o); const A = column(cols.a); const T = column(cols.k); const R = column(cols.r);
  const processed = item.p?.[0];
  const overtime = item.o?.[0];
  const punches = item.a || [];
  if (!processed && punches.length === 0) return null;

  const remarks = processed ? ['remarks1', 'remarks2', 'remarks3', 'remarks4'].map(name => text(P(processed, name))) : ['P', '', '', ''];
  let status = dayStatus(remarks);

  let punchIn = ''; let punchOut = '';
  const breaks = [];
  let open = null;
  let unpaired = 0;
  for (const punch of punches) {
    const time = hms(A(punch, 'attendance_time'));
    const type = text(A(punch, 'attendance_type'));
    const reason = text(A(punch, 'attendance_reason'));
    if (!time) continue;
    if (type === 'In' && reason === 'Duty') { if (!punchIn) punchIn = time; continue; }
    if (type === 'Out' && reason === 'Duty Off') { punchOut = time; if (open) { breaks.push(open); open = null; unpaired += 1; } continue; }
    if (type === 'Out') { if (open) { breaks.push(open); unpaired += 1; } open = { reason: reason || 'Other', outAt: time, returnAt: '' }; continue; }
    if (type === 'In') {
      if (open) { open.returnAt = time; breaks.push(open); open = null; } else { unpaired += 1; }
      if (!punchIn) punchIn = time;
    }
  }
  if (open) breaks.push(open);
  // CyberAP pre-fills every day as "A" and overwrites it when the day is processed. A day still marked absent that has
  // a duty punch was never processed: its status comes from the punches (late when after shift start + grace).
  const dutyIn = punches.some(punch => text(A(punch, 'attendance_type')) === 'In' && text(A(punch, 'attendance_reason')) === 'Duty');
  const unprocessedDuty = dutyIn && punchIn && (!processed || status === 'Absent');
  const correctedFromAbsent = Boolean(processed && unprocessedDuty);
  if (unprocessedDuty) {
    const shift = employee.shift;
    const lateAfter = shift ? minutesBetween('00:00', shift.startTime) + num(shift.graceMinutes) : null;
    status = lateAfter !== null && minutesBetween('00:00', punchIn) > lateAfter ? 'Late' : 'Present';
  }
  if (!punchIn && processed) punchIn = hms(P(processed, 'in_date_time'));
  if (!punchOut && processed) punchOut = hms(P(processed, 'out_date_time'));

  const personalOutMinutes = breaks.filter(b => b.reason === 'Personal' && b.returnAt).reduce((sum, b) => sum + minutesBetween(b.outAt, b.returnAt), 0);
  const tracking = Array.isArray(item.k) ? item.k : [];
  const trackedBranches = [...new Set(tracking.map(row => T(row, 'branch_id')).filter(Boolean).map(ids.branch))];
  const terminalBranchId = trackedBranches[0] || ctx.branchByName.get(text(A(punches[0] || [], 'branch_name')).toLowerCase()) || '';
  const outReasons = {};
  for (const row of item.r || []) {
    const reasonRow = lookup(ctx, 'time_out_reason', 'time_out_reason_id', R(row, 'time_out_reason_id'));
    const name = text(reasonRow?.time_out_reason_name) || `reason ${R(row, 'time_out_reason_id')}`;
    outReasons[name] = (outReasons[name] || 0) + num(R(row, 'time_out_reason_duration'));
  }

  const log = {
    id: ids.attendance(item.e, item.d),
    employeeId: employee.id,
    date: item.d,
    punchIn: status === 'Absent' || status === 'Holiday' ? undefined : punchIn || undefined,
    punchOut: status === 'Absent' || status === 'Holiday' ? undefined : punchOut || undefined,
    breaks: breaks.length ? breaks : undefined,
    employeeBranchId: employee.branchId || undefined,
    terminalBranchId: terminalBranchId || undefined,
    crossBranch: terminalBranchId && employee.branchId && terminalBranchId !== employee.branchId ? true : undefined,
    method: 'Biometric',
    status,
    overtimeMinutes: num(overtime && O(overtime, 'total_over_time')),
    personalOutMinutes: personalOutMinutes || undefined,
    importSource: SOURCE,
    legacy: compact({
      day: processed ? remarks.join('/') : 'unprocessed',
      correctedFromAbsent: correctedFromAbsent || undefined,
      dayStatus: processed ? num(P(processed, 'day_status')) : undefined,
      shiftMinutes: processed ? num(P(processed, 'shift_duration')) || undefined : undefined,
      workedMinutes: processed ? num(P(processed, 'total_in_duration')) || undefined : undefined,
      outMinutes: processed ? num(P(processed, 'total_out_duration')) || undefined : undefined,
      allowedOutMinutes: processed ? num(P(processed, 'allowed_out_duration')) || undefined : undefined,
      overtime: overtime ? compact({
        earlyIn: num(O(overtime, 'early_in_over_time')) || undefined,
        lateOut: num(O(overtime, 'late_out_over_time')) || undefined,
        approvedEarlyIn: O(overtime, 'approved_early_in_over_time') ?? undefined,
        approvedLateOut: O(overtime, 'approved_late_out_over_time') ?? undefined,
        approvedExtraDay: O(overtime, 'approved_extra_day') ?? undefined,
        remarks: text(O(overtime, 'approval_remarks')),
      }) : undefined,
      outReasons: Object.keys(outReasons).length ? outReasons : undefined,
      branches: trackedBranches.length > 1 ? trackedBranches : undefined,
      punches: punches.length || undefined,
      unpairedPunches: unpaired || undefined,
    }),
  };
  if (log.legacy.overtime && Object.keys(log.legacy.overtime).length === 0) delete log.legacy.overtime;
  return JSON.parse(JSON.stringify(log));
}

// Former employees keep getting an "A" row every day in CyberAP after they leave. Absences after the last real
// working day of an employee who is no longer active are dropped; for active staff every absence is kept.
function createTrailingAbsentFilter() {
  let currentEmployee = null;
  let pending = [];
  return {
    /** Returns the logs that can be written now. */
    push(log, active, legacyEmployeeId) {
      const out = [];
      if (legacyEmployeeId !== currentEmployee) { pending = []; currentEmployee = legacyEmployeeId; }
      if (active || log.status !== 'Absent') { out.push(...pending, log); pending = []; } else { pending.push(log); }
      return out;
    },
    /** Absences held back for the current employee (they are dropped if no working day follows). */
    get held() { return pending.length; },
  };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

function emptyReport() {
  return {
    header: null, endCounts: null, integrity: 'unchecked', warnings: [],
    employees: { total: 0, active: 0, inactive: 0, withThumb: 0, withArchivePhoto: 0, withFingerprint: 0, invalidCnic: 0, placeholderSalary: 0, existingCodeConflicts: 0 },
    masters: { branches: 0, departments: 0, designations: 0, holidays: 0 },
    attendance: { packageDays: 0, imported: 0, skippedUnknownEmployee: 0, skippedEmpty: 0, droppedTrailingAbsences: 0, skippedExistingNewSystem: 0, first: null, last: null, byStatus: {}, openBreaks: 0 },
    archive: { rows: 0, byTable: {} },
  };
}

// Working days per employee, kept beside the report (not serialized) to find "active" staff who stopped coming.
const lastWorked = new WeakMap();
const activeCodes = new WeakMap();

function trackDay(report, log) {
  const a = report.attendance;
  a.byStatus[log.status] = (a.byStatus[log.status] || 0) + 1;
  if (!a.first || log.date < a.first) a.first = log.date;
  if (!a.last || log.date > a.last) a.last = log.date;
  a.openBreaks += (log.breaks || []).filter(b => !b.returnAt).length;
  if (log.legacy?.correctedFromAbsent) a.correctedFromAbsent = (a.correctedFromAbsent || 0) + 1;
  if (['Present', 'Late', 'Half Day'].includes(log.status)) {
    if (!lastWorked.has(report)) lastWorked.set(report, new Map());
    const map = lastWorked.get(report);
    if (!map.has(log.employeeId) || map.get(log.employeeId) < log.date) map.set(log.employeeId, log.date);
  }
}

function trackActive(report, employee) {
  if (employee.status !== 'Active') return;
  if (!activeCodes.has(report)) activeCodes.set(report, new Map());
  activeCodes.get(report).set(employee.id, employee.employeeCode);
}

/** Active employees with no working day in the last 30 days of the package: probably left without being deactivated. */
function finalizeStaleActive(report) {
  const last = report.attendance.last;
  const active = activeCodes.get(report);
  if (!last || !active) return;
  const cutoff = new Date(Date.parse(`${last}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const worked = lastWorked.get(report) || new Map();
  const stale = [...active].filter(([id]) => !worked.has(id) || worked.get(id) < cutoff).map(([id, code]) => ({ code, lastWorked: worked.get(id) || null }));
  stale.sort((a, b) => String(a.lastWorked || '').localeCompare(String(b.lastWorked || '')));
  report.employees.activeWithoutRecentAttendance = stale.length;
  report.employees.activeWithoutRecentAttendanceList = stale.slice(0, 1000);
  if (stale.length) report.warnings.push(`${stale.length} employees are active in CyberAP but have no working day since ${cutoff}. They are imported as Active; review the list and mark the ones who left as Terminated.`);
}

function checkIntegrity(report, seen) {
  const end = report.endCounts;
  if (!end) { report.integrity = 'failed'; report.warnings.push('The package has no end marker: the export did not finish or the file was cut off. Export again.'); return; }
  const problems = [];
  if (end.employee !== undefined && end.employee !== seen.employee) problems.push(`employees ${seen.employee}/${end.employee}`);
  if (end.day !== undefined && end.day !== seen.day) problems.push(`attendance days ${seen.day}/${end.day}`);
  for (const [key, expected] of Object.entries(end)) {
    if (!key.startsWith('row:')) continue;
    const got = seen.rows[key.slice(4)] || 0;
    if (got !== expected) problems.push(`${key.slice(4)} ${got}/${expected}`);
  }
  report.integrity = problems.length ? 'failed' : 'ok';
  if (problems.length) report.warnings.push(`Row counts do not match the export: ${problems.join(', ')}.`);
}

function addEmployeeWarnings(report) {
  if (report.employees.invalidCnic) report.warnings.push(`${report.employees.invalidCnic} active employees have no valid CNIC in CyberAP; they are imported with the CNIC blank.`);
  if (report.employees.placeholderSalary) report.warnings.push(`${report.employees.placeholderSalary} active employees have no real basic salary in CyberAP (1.0 placeholder); they are imported with salary 0 and must be updated before the first payroll.`);
  if (report.employees.withFingerprint) report.warnings.push(`${report.employees.withFingerprint} fingerprints are DigitalPersona One Touch templates. The kiosk reads U.are.U ANSI templates, so they are archived and staff must be enrolled again at the kiosk.`);
  if (report.employees.existingCodeConflicts) report.warnings.push(`${report.employees.existingCodeConflicts} employee codes already exist in this system. Without "remove current data", those legacy employees are linked to the existing records instead of being created again.`);
}

// ─── Database helpers ─────────────────────────────────────────────────────────

async function ensureLegacyTables(db) { await db.query(LEGACY_TABLES_SQL); }

async function tableExists(db, table) {
  return Boolean((await db.query(`SELECT to_regclass($1) AS t`, [`public.${table}`])).rows[0].t);
}

/** Row counts of the tables a wipe would empty (only the ones that exist). */
async function currentDataCounts(db) {
  const counts = {};
  for (const table of WIPE_TABLES) {
    if (!(await tableExists(db, table))) continue;
    counts[table] = Number((await db.query(`SELECT count(*)::bigint AS n FROM ${table}`)).rows[0].n);
  }
  return counts;
}

/** Empties every business table in one transaction and unlinks users from the deleted employees. */
async function wipeBusinessData(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tables = [];
    for (const table of WIPE_TABLES) if (await tableExists(client, table)) tables.push(table);
    const before = {};
    for (const table of tables) before[table] = Number((await client.query(`SELECT count(*)::bigint AS n FROM ${table}`)).rows[0].n);
    if (tables.length) await client.query(`TRUNCATE ${tables.join(', ')}`);
    const unlinked = await client.query(`UPDATE users SET data = data - 'employeeId', version = version + 1, updated_at = now() WHERE data ? 'employeeId' AND COALESCE(data->>'employeeId','') <> ''`);
    await client.query('COMMIT');
    return { removed: before, usersUnlinked: unlinked.rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Inserts documents into an id/employee_id/status/data table; existing ids are left untouched. */
async function insertDocuments(db, table, documents, { employeeIdOf = () => null } = {}) {
  if (!documents.length) return 0;
  const rows = documents.map(doc => ({ id: doc.id, employee_id: employeeIdOf(doc), status: typeof doc.status === 'string' ? doc.status : null, data: doc }));
  const result = await db.query(
    `INSERT INTO ${table}(id, employee_id, status, data, version, updated_at)
     SELECT x.id, x.employee_id, x.status, x.data, 1, now() FROM jsonb_to_recordset($1::jsonb) AS x(id text, employee_id text, status text, data jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(rows)],
  );
  return result.rowCount;
}

/** Writes attendance days. A day is skipped when the new system already has its own record for that employee and date. */
async function insertAttendances(db, logs) {
  if (!logs.length) return 0;
  const rows = logs.map(log => ({ id: log.id, employee_id: log.employeeId, date: log.date, status: log.status, data: log }));
  const result = await db.query(
    `INSERT INTO attendances(id, employee_id, date, status, data, version, updated_at)
     SELECT x.id, x.employee_id, x.date::date, x.status, x.data, 1, now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, employee_id text, date text, status text, data jsonb)
      WHERE NOT EXISTS (SELECT 1 FROM attendances a WHERE a.employee_id = x.employee_id AND a.date = x.date::date AND a.id <> x.id)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, status = EXCLUDED.status, date = EXCLUDED.date, updated_at = now()
      WHERE attendances.version = 1 AND attendances.data->>'importSource' = '${SOURCE}'`,
    [JSON.stringify(rows)],
  );
  return result.rowCount;
}

async function insertLegacyRecords(db, records) {
  if (!records.length) return 0;
  const result = await db.query(
    `INSERT INTO legacy_records(source, kind, legacy_id, employee_id, record_date, data)
     SELECT '${SOURCE}', x.kind, x.legacy_id, x.employee_id, NULLIF(x.record_date,'')::date, x.data
       FROM jsonb_to_recordset($1::jsonb) AS x(kind text, legacy_id text, employee_id text, record_date text, data jsonb)
     ON CONFLICT (source, kind, legacy_id) DO UPDATE SET data = EXCLUDED.data, employee_id = EXCLUDED.employee_id, record_date = EXCLUDED.record_date, imported_at = now()`,
    [JSON.stringify(records)],
  );
  return result.rowCount;
}

function legacyRecordForRow(table, row, index, ctx) {
  const keys = Object.keys(row);
  const firstKey = keys[0];
  const legacyId = row[firstKey] !== null && row[firstKey] !== undefined ? String(row[firstKey]) : `row-${index}`;
  const employeeLegacyId = row.employee_id;
  const year = num(row.salary_year || row.attendance_year || row.loan_year || row.sale_year);
  const month = num(row.salary_month || row.attendance_month || row.loan_month || row.sale_month);
  const date = Object.entries(row).find(([key, value]) => /date/.test(key) && ymd(value))?.[1];
  return {
    kind: table,
    legacy_id: legacyId,
    employee_id: employeeLegacyId !== undefined && employeeLegacyId !== null ? (ctx.employees.get(employeeLegacyId)?.id || ids.employee(employeeLegacyId)) : null,
    record_date: ymd(date) || (year && month ? `${year}-${pad2(month)}-01` : ''),
    data: row,
  };
}

async function resolveCompany(db, companyName) {
  if (await tableExists(db, 'companies')) {
    const existing = (await db.query(`SELECT id FROM companies ORDER BY id LIMIT 1`)).rows[0];
    if (existing) return { companyId: existing.id, created: false };
    const company = { id: 'company-main', name: companyName || 'Company', industry: 'Retail', taxRegistrationNumber: '', eobiRegistrationNumber: '', socialSecurityRegion: '', importSource: SOURCE };
    await insertDocuments(db, 'companies', [company]);
    return { companyId: company.id, created: true };
  }
  return { companyId: 'company-main', created: false };
}

// ─── The two entry points ─────────────────────────────────────────────────────

/**
 * Reads the whole package (and, with a database, the current data) and reports what an import would do.
 * Nothing is written.
 */
async function analyzePackage(filePath, { db = null, onProgress = () => {}, signal } = {}) {
  const size = fs.statSync(filePath).size;
  const report = emptyReport();
  const ctx = createContext({ companyId: 'company' });
  const seen = { employee: 0, day: 0, rows: {} };
  const filter = createTrailingAbsentFilter();
  let existingCodes = new Set();
  if (db) {
    report.currentData = await currentDataCounts(db);
    if (await tableExists(db, 'employees')) {
      existingCodes = new Set((await db.query(`SELECT lower(data->>'employeeCode') AS code FROM employees WHERE COALESCE(data->>'importSource','') <> $1`, [SOURCE])).rows.map(r => r.code));
    }
  }
  let header = null;
  let mastersCounted = false;
  for await (const item of readPackage(filePath, bytes => onProgress({ phase: 'analyzing', bytes, size, report }))) {
    if (signal?.aborted) throw new Error('Cancelled.');
    if (item.t === 'header') { header = item; report.header = { ...item, dayColumns: undefined }; continue; }
    if (item.t === 'row') {
      seen.rows[item.table] = (seen.rows[item.table] || 0) + 1;
      addRow(ctx, item.table, item.r);
      report.archive.rows += 1;
      report.archive.byTable[item.table] = (report.archive.byTable[item.table] || 0) + 1;
      continue;
    }
    if (!mastersCounted && (item.t === 'employee' || item.t === 'day')) {
      const masters = mapMasters(ctx);
      report.masters = { branches: masters.branches.length, departments: masters.departments.length, designations: masters.designations.length, holidays: masters.holidays.length };
      mastersCounted = true;
    }
    if (item.t === 'employee') {
      seen.employee += 1;
      const employee = mapEmployee(ctx, item);
      ctx.employees.set(item.r.employee_id, { id: employee.id, status: employee.status, branchId: employee.branchId, shift: employee.shift });
      const e = report.employees;
      e.total += 1;
      if (employee.status === 'Active') e.active += 1; else e.inactive += 1;
      trackActive(report, employee);
      if (item.thumb) e.withThumb += 1;
      if (item.photo) e.withArchivePhoto += 1;
      if (item.fp) e.withFingerprint += 1;
      if (employee.status === 'Active' && !employee.cnic) e.invalidCnic += 1;
      if (employee.status === 'Active' && !employee.basicSalary) e.placeholderSalary += 1;
      if (existingCodes.has(employee.employeeCode.toLowerCase())) e.existingCodeConflicts += 1;
      continue;
    }
    if (item.t === 'day') {
      seen.day += 1;
      report.attendance.packageDays += 1;
      const employee = ctx.employees.get(item.e);
      if (!employee) { report.attendance.skippedUnknownEmployee += 1; continue; }
      const log = mapDay(ctx, header, item);
      if (!log) { report.attendance.skippedEmpty += 1; continue; }
      for (const day of filter.push(log, employee.status === 'Active', item.e)) { trackDay(report, day); report.attendance.imported += 1; }
      continue;
    }
    if (item.t === 'end') report.endCounts = item.counts || {};
  }
  report.attendance.droppedTrailingAbsences = report.attendance.packageDays - report.attendance.imported - report.attendance.skippedUnknownEmployee - report.attendance.skippedEmpty;
  checkIntegrity(report, seen);
  finalizeStaleActive(report);
  addEmployeeWarnings(report);
  onProgress({ phase: 'analyzed', bytes: size, size, report });
  return report;
}

/**
 * Imports the package. options.wipe empties the current business data first (see WIPE_TABLES).
 * onProgress receives { phase, bytes, size, report } as the import advances.
 */
async function importPackage(pool, filePath, { wipe = false, companyName = '', actor = 'cli', onProgress = () => {}, signal, batchSize = 1000 } = {}) {
  const size = fs.statSync(filePath).size;
  const report = emptyReport();
  const runId = `cyberap-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const seen = { employee: 0, day: 0, rows: {} };
  await ensureLegacyTables(pool);
  await pool.query(`INSERT INTO legacy_import_runs(id, source, status, actor, options) VALUES($1,$2,'running',$3,$4::jsonb)`, [runId, SOURCE, actor, JSON.stringify({ wipe, companyName, file: require('node:path').basename(filePath), size })]);
  const progress = (phase, bytes) => onProgress({ phase, bytes, size, report, runId });

  try {
    if (wipe) {
      progress('wiping', 0);
      report.wipe = await wipeBusinessData(pool);
    }
    const { companyId, created } = await resolveCompany(pool, companyName);
    report.company = { id: companyId, created };
    const ctx = createContext({ companyId });

    // Employees already in this system (not from CyberAP), by code: legacy employees with the same code link to them.
    const existingByCode = new Map((await pool.query(`SELECT id, lower(data->>'employeeCode') AS code, data->>'status' AS status, data->>'branchId' AS branch FROM employees WHERE COALESCE(data->>'importSource','') <> $1`, [SOURCE])).rows.map(r => [r.code, r]));

    let header = null;
    let mastersWritten = false;
    let archiveBatch = [];
    let employeeBatch = [];
    let dayBatch = [];
    const filter = createTrailingAbsentFilter();
    let bytesRead = 0;

    const flushArchive = async () => { if (archiveBatch.length) { await insertLegacyRecords(pool, archiveBatch); archiveBatch = []; } };
    const flushEmployees = async () => { if (employeeBatch.length) { await insertDocuments(pool, 'employees', employeeBatch, { employeeIdOf: e => e.id }); employeeBatch = []; } };
    const flushDays = async () => {
      if (!dayBatch.length) return;
      const written = await insertAttendances(pool, dayBatch);
      report.attendance.skippedExistingNewSystem += dayBatch.length - written;
      report.attendance.imported += written;
      dayBatch = [];
    };

    const writeMasters = async () => {
      await flushArchive();
      const masters = mapMasters(ctx);
      report.masters = {
        branches: await insertDocuments(pool, 'branches', masters.branches),
        departments: await insertDocuments(pool, 'departments', masters.departments),
        designations: await insertDocuments(pool, 'designations', masters.designations),
        holidays: await insertDocuments(pool, 'holidays', masters.holidays),
      };
      mastersWritten = true;
      progress('employees', bytesRead);
    };

    for await (const item of readPackage(filePath, bytes => { bytesRead = bytes; })) {
      if (signal?.aborted) throw new Error('Cancelled by the vendor console.');
      if (item.t === 'header') { header = item; report.header = { ...item, dayColumns: undefined }; progress('archive', bytesRead); continue; }
      if (item.t === 'row') {
        seen.rows[item.table] = (seen.rows[item.table] || 0) + 1;
        addRow(ctx, item.table, item.r);
        archiveBatch.push(legacyRecordForRow(item.table, item.r, seen.rows[item.table], ctx));
        report.archive.rows += 1;
        report.archive.byTable[item.table] = (report.archive.byTable[item.table] || 0) + 1;
        if (archiveBatch.length >= batchSize) await flushArchive();
        continue;
      }
      if (!mastersWritten && (item.t === 'employee' || item.t === 'day')) await writeMasters();

      if (item.t === 'employee') {
        seen.employee += 1;
        const employee = mapEmployee(ctx, item);
        const e = report.employees;
        e.total += 1;
        if (employee.status === 'Active') e.active += 1; else e.inactive += 1;
      trackActive(report, employee);
        if (item.thumb) e.withThumb += 1;
        if (item.fp) e.withFingerprint += 1;
        if (item.photo) e.withArchivePhoto += 1;
        if (employee.status === 'Active' && !employee.cnic) e.invalidCnic += 1;
        if (employee.status === 'Active' && !employee.basicSalary) e.placeholderSalary += 1;
        const existing = existingByCode.get(employee.employeeCode.toLowerCase());
        if (existing) {
          e.existingCodeConflicts += 1;
          ctx.employees.set(item.r.employee_id, { id: existing.id, status: existing.status, branchId: existing.branch || '' });
        } else {
          ctx.employees.set(item.r.employee_id, { id: employee.id, status: employee.status, branchId: employee.branchId, shift: employee.shift });
          employeeBatch.push(employee);
        }
        const owner = ctx.employees.get(item.r.employee_id).id;
        archiveBatch.push({ kind: 'employee', legacy_id: String(item.r.employee_id), employee_id: owner, record_date: ymd(item.r.employee_joining_date), data: compact({ ...item.r, fingerprintTemplate: item.fp, fingerprintFormat: item.fp ? 'digitalpersona-onetouch' : undefined }) });
        if (item.photo) archiveBatch.push({ kind: 'employee_photo', legacy_id: String(item.r.employee_id), employee_id: owner, record_date: '', data: { photo: item.photo } });
        if (employeeBatch.length >= 200) { await flushEmployees(); await flushArchive(); progress('employees', bytesRead); }
        if (archiveBatch.length >= 100) await flushArchive();
        continue;
      }

      if (item.t === 'day') {
        if (employeeBatch.length || archiveBatch.length) { await flushEmployees(); await flushArchive(); }
        seen.day += 1;
        report.attendance.packageDays += 1;
        const employee = ctx.employees.get(item.e);
        if (!employee) { report.attendance.skippedUnknownEmployee += 1; continue; }
        const log = mapDay(ctx, header, item);
        if (!log) { report.attendance.skippedEmpty += 1; continue; }
        for (const day of filter.push(log, employee.status === 'Active', item.e)) { trackDay(report, day); dayBatch.push(day); }
        if (dayBatch.length >= batchSize) { await flushDays(); progress('attendance', bytesRead); }
        continue;
      }
      if (item.t === 'end') report.endCounts = item.counts || {};
    }
    if (!mastersWritten) await writeMasters();
    await flushEmployees();
    await flushArchive();
    await flushDays();
    const tracked = Object.values(report.attendance.byStatus).reduce((a, b) => a + b, 0);
    report.attendance.droppedTrailingAbsences = report.attendance.packageDays - tracked - report.attendance.skippedUnknownEmployee - report.attendance.skippedEmpty;
    checkIntegrity(report, seen);
    finalizeStaleActive(report);
    addEmployeeWarnings(report);

    progress('finishing', size);
    await pool.query('ANALYZE attendances');
    // Attendance is loaded by browsers as one collection: after a large history import the API serves recent months
    // only (newest first). See loadDataLimits in server/documents.cjs.
    const total = Number((await pool.query(`SELECT count(*)::bigint AS n FROM attendances`)).rows[0].n);
    if (total > 10000) {
      await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'), version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      await pool.query(
        `INSERT INTO app_settings(key, data) VALUES('dataLimits', $1::jsonb)
         ON CONFLICT (key) DO UPDATE SET data = app_settings.data || EXCLUDED.data, version = app_settings.version + 1, updated_at = now()`,
        [JSON.stringify({ attendanceReadMonths: 1, attendanceReadLimit: 100000, setBy: `legacy-import:${runId}` })],
      );
      report.dataLimits = { attendanceReadMonths: 1, attendanceReadLimit: 100000, attendanceTotal: total };
    }
    await pool.query(
      `INSERT INTO hr_audit_log(actor_uid, actor_role_id, action, collection_name, document_id, new_data) VALUES($1,'vendor','legacy_import','legacyImport',$2,$3::jsonb)`,
      [actor, runId, JSON.stringify({ wipe, employees: report.employees, masters: report.masters, attendance: { ...report.attendance, byStatus: report.attendance.byStatus }, removed: report.wipe?.removed })],
    ).catch(() => undefined);
    await pool.query(`UPDATE legacy_import_runs SET status=$2, finished_at=now(), report=$3::jsonb WHERE id=$1`, [runId, report.integrity === 'failed' ? 'completed-with-warnings' : 'completed', JSON.stringify(report)]);
    progress('done', size);
    return report;
  } catch (error) {
    report.error = error.message;
    await pool.query(`UPDATE legacy_import_runs SET status='failed', finished_at=now(), report=$2::jsonb WHERE id=$1`, [runId, JSON.stringify(report)]).catch(() => undefined);
    throw Object.assign(error, { report });
  }
}

module.exports = {
  SOURCE, WIPE_TABLES, LEGACY_TABLES_SQL,
  readPackage, analyzePackage, importPackage, wipeBusinessData, currentDataCounts, ensureLegacyTables,
  // exported for tests
  normalizeCnic, dayStatus, mapDay, mapEmployee, mapMasters, createContext, addRow, createTrailingAbsentFilter, ids,
};
