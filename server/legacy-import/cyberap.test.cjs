// node --test server/legacy-import/cyberap.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCnic, dayStatus, mapDay, mapEmployee, createContext, addRow, createTrailingAbsentFilter } = require('./cyberap.cjs');

const header = {
  dayColumns: {
    p: ['remarks1', 'remarks2', 'remarks3', 'remarks4', 'in_date_time', 'out_date_time', 'in_duration', 'out_duration', 'total_in_duration', 'total_out_duration', 'day_status', 'shift_duration', 'allowed_out_duration', 'adjusted_in_date_time', 'adjusted_out_date_time', 'is_closed'],
    o: ['early_in_over_time', 'late_out_over_time', 'total_over_time', 'approved_early_in_over_time', 'approved_late_out_over_time', 'approved_extra_day', 'approval_remarks'],
    a: ['attendance_time', 'attendance_type', 'attendance_reason', 'attendance_seqno', 'duration', 'reason_remarks', 'allowed_duration', 'branch_name', 'shift_name'],
    k: ['branch_id', 'in_date_time', 'out_date_time', 'in_duration', 'out_duration'],
    r: ['time_out_reason_id', 'time_out_reason_duration'],
  },
};

function context() {
  const ctx = createContext({ companyId: 'company-main' });
  addRow(ctx, 'branch', { branch_id: 38, branch_name: 'COMMERCIAL', shift_id: 68 });
  addRow(ctx, 'branch', { branch_id: 44, branch_name: 'Mall 12', shift_id: 68 });
  addRow(ctx, 'shift', { shift_id: 68, shift_name: 'GENERAL', shift_start_hour: 11, shift_start_minute: 0, shift_end_hour: 23, shift_end_minute: 30, shift_relaxation_time: 15 });
  addRow(ctx, 'gender', { gender_id: 3, gender_name: 'Male' });
  addRow(ctx, 'employee_sub_group', { employee_sub_group_id: 46, employee_group_id: 21, employee_sub_group_name: 'Basement' });
  addRow(ctx, 'salary_sub_head', { salary_sub_head_id: 1, salary_sub_head_name: 'BASIC SALARY' });
  addRow(ctx, 'salary', { employee_id: 7, salary_sub_head_id: 1, amount: 32000 });
  addRow(ctx, 'time_out_reason', { time_out_reason_id: 5, time_out_reason_name: 'Prayer' });
  return ctx;
}

const employeeRow = overrides => ({ employee_id: 7, employee_code: 'M 5091', employee_name: ' Muhammad   Junaid ', designation_id: 49, shift_id: 68, employee_sub_group_id: 46, is_active: 1, employment_status: 'Employed', employee_cnic_number: '3740522275993', gender_id: 3, branch_id: 38, employee_joining_date: '2026-09-01', employee_leaving_date: '2100-01-01', ...overrides });

test('CNIC is normalized, placeholders become blank', () => {
  assert.equal(normalizeCnic('37405-2227599-3'), '37405-2227599-3');
  assert.equal(normalizeCnic('3740522275993'), '37405-2227599-3');
  assert.equal(normalizeCnic('.................'), '');
  assert.equal(normalizeCnic('0000000000000'), '');
});

test('day codes map to attendance statuses', () => {
  assert.equal(dayStatus(['A', 'A', 'A', 'A']), 'Absent');
  assert.equal(dayStatus(['H', 'H', 'H', 'H']), 'Holiday');
  assert.equal(dayStatus(['BD', 'BD', 'BD', 'BD']), 'Holiday');
  assert.equal(dayStatus(['P', 'LI', 'EO', 'FD']), 'Late');
  assert.equal(dayStatus(['P', 'II', 'EO', 'HD']), 'Half Day');
  assert.equal(dayStatus(['P', 'EI', 'IO', 'FD']), 'Present');
});

test('employee mapping keeps legacy details, salary and status', () => {
  const ctx = context();
  const employee = mapEmployee(ctx, { r: employeeRow(), thumb: 'data:image/jpeg;base64,AAA', fp: 'AAAA' });
  assert.equal(employee.id, 'emp-cy-7');
  assert.equal(employee.fullName, 'Muhammad Junaid');
  assert.equal(employee.cnic, '37405-2227599-3');
  assert.equal(employee.status, 'Active');
  assert.equal(employee.basicSalary, 32000);
  assert.equal(employee.branchId, 'branch-cy-38');
  assert.equal(employee.departmentId, 'dept-cy-21');
  assert.equal(employee.shift.startTime, '11:00');
  assert.equal(employee.pictureUrl, 'data:image/jpeg;base64,AAA');
  assert.deepEqual(employee.fingerprintTemplates, []);
  assert.equal(employee.legacy.fingerprintArchived, true);
  assert.equal(employee.legacy.leavingDate, undefined, '2100-01-01 means no date');

  const left = mapEmployee(ctx, { r: employeeRow({ employee_id: 8, is_active: 0, employment_status: 'Terminated', employee_leaving_date: '2019-03-31' }), thumb: 'x' });
  assert.equal(left.status, 'Terminated');
  assert.equal(left.separationDate, '2019-03-31');
  assert.equal(left.pictureUrl, '', 'former staff keep their photo in the archive only');
  assert.equal(left.basicSalary, 0);
  assert.equal(left.legacy.salaryPlaceholder, true);
});

test('a day with punches becomes an attendance log with breaks', () => {
  const ctx = context();
  const employee = mapEmployee(ctx, { r: employeeRow() });
  ctx.employees.set(7, { id: employee.id, status: employee.status, branchId: employee.branchId, shift: employee.shift });
  const log = mapDay(ctx, header, {
    t: 'day', e: 7, d: '2026-11-06',
    p: [['P', 'LI', 'EO', 'FD', '2026-11-06T11:20:00', '2026-11-06T22:07:00', 0, 0, 632, 40, 1, 750, 0, null, null, 0]],
    o: [[0, 17, 17, null, null, null, null]],
    a: [
      ['2026-11-06T11:20:00', 'In', 'Duty', 0, 0, '', 0, 'COMMERCIAL', 'GENERAL'],
      ['2026-11-06T13:55:00', 'Out', 'Prayer', 1, 0, '', 30, 'COMMERCIAL', 'GENERAL'],
      ['2026-11-06T14:14:00', 'In', 'Prayer', 1, 19, '', 30, 'COMMERCIAL', 'GENERAL'],
      ['2026-11-06T16:00:00', 'Out', 'Personal', 2, 0, '', 0, 'COMMERCIAL', 'GENERAL'],
      ['2026-11-06T16:21:00', 'In', 'Personal', 2, 21, '', 0, 'COMMERCIAL', 'GENERAL'],
      ['2026-11-06T22:07:00', 'Out', 'Duty Off', 3, 0, '', 0, 'COMMERCIAL', 'GENERAL'],
    ],
    k: [[44, '2026-11-06T11:20:00', '2026-11-06T22:07:00', 632, 40]],
    r: [[5, 19]],
  });
  assert.equal(log.id, 'att-cy-7-2026-11-06');
  assert.equal(log.status, 'Late');
  assert.equal(log.punchIn, '11:20:00');
  assert.equal(log.punchOut, '22:07:00');
  assert.deepEqual(log.breaks, [{ reason: 'Prayer', outAt: '13:55:00', returnAt: '14:14:00' }, { reason: 'Personal', outAt: '16:00:00', returnAt: '16:21:00' }]);
  assert.equal(log.personalOutMinutes, 21);
  assert.equal(log.overtimeMinutes, 17);
  assert.equal(log.terminalBranchId, 'branch-cy-44');
  assert.equal(log.crossBranch, true);
  assert.equal(log.legacy.outReasons.Prayer, 19);
  assert.equal(log.importSource, 'cyberap');
});

test('an unprocessed "A" day with a duty punch is corrected from the punches', () => {
  const ctx = context();
  const employee = mapEmployee(ctx, { r: employeeRow() });
  ctx.employees.set(7, { id: employee.id, status: employee.status, branchId: employee.branchId, shift: employee.shift });
  const day = (time, p) => mapDay(ctx, header, { t: 'day', e: 7, d: '2026-10-26', p, a: [[`2026-10-26T${time}`, 'In', 'Duty', 0, 0, '', 0, 'COMMERCIAL', 'GENERAL'], ['2026-10-26T22:05:00', 'Out', 'Duty Off', 1, 0, '', 0, 'COMMERCIAL', 'GENERAL']] });
  const absent = [['A', 'A', 'A', 'A', null, null, 0, 0, 0, 0, 0, 0, 0, null, null, 0]];
  assert.equal(day('11:42:00', absent).status, 'Late');
  assert.equal(day('11:42:00', absent).legacy.correctedFromAbsent, true);
  assert.equal(day('10:58:00', absent).status, 'Present');
  assert.equal(day('11:30:00', undefined).status, 'Late', 'today: punches only, no processed row yet');
  assert.equal(mapDay(ctx, header, { t: 'day', e: 7, d: '2026-10-27', p: absent }).status, 'Absent');
  assert.equal(mapDay(ctx, header, { t: 'day', e: 999, d: '2026-10-27', p: absent }), null, 'unknown employee');
});

test('absences after the last working day of a former employee are dropped', () => {
  const filter = createTrailingAbsentFilter();
  const log = (date, status) => ({ date, status });
  const written = [];
  for (const item of [log('2019-01-01', 'Present'), log('2019-01-02', 'Absent'), log('2019-01-03', 'Present'), log('2019-01-04', 'Absent'), log('2019-01-05', 'Absent')]) {
    written.push(...filter.push(item, false, 8));
  }
  written.push(...filter.push(log('2019-01-01', 'Absent'), true, 9)); // next employee, active: kept
  assert.deepEqual(written.map(item => item.date), ['2019-01-01', '2019-01-02', '2019-01-03', '2019-01-01']);
});
