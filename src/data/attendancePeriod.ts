import type { AttendanceLog, AttendancePeriod, AttendanceRegisterRow, Employee, Holiday, LeaveRequest, PayrollRun } from '../types';

export type AttendanceLockIssue = {
  attendanceId: string;
  employeeId: string;
  reason: string;
};

export function attendancePeriodId(month: number, year: number): string {
  return `attendance-period-${year}-${String(month).padStart(2, '0')}`;
}

export function findAttendanceLockIssues(attendances: AttendanceLog[], month: number, year: number): AttendanceLockIssue[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  return attendances.filter(item => item.date.startsWith(prefix)).flatMap(item => {
    const issues: AttendanceLockIssue[] = [];
    if (item.regularizationRequested && item.regularizationApproved === undefined) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: 'Regularization is awaiting a decision' });
    }
    if (item.method === 'Manual' && item.regularizationApproved !== true) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: 'Manual attendance is not approved' });
    }
    if (item.biometricMatch?.lowConfidence && item.regularizationApproved === undefined && !item.regularizationRequested) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: 'Low-confidence biometric match is not reviewed' });
    }
    if (item.punchIn && !item.punchOut && !['On Leave', 'Holiday'].includes(item.status)) {
      issues.push({ attendanceId: item.id, employeeId: item.employeeId, reason: 'Punch-out is missing' });
    }
    return issues;
  });
}

// FNV-1a provides a stable tamper-evident fingerprint without requiring browser crypto APIs.
export function attendanceIntegrityHash(attendances: AttendanceLog[], month: number, year: number): string {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const canonical = attendances
    .filter(item => item.date.startsWith(prefix))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => [item.id, item.employeeId, item.date, item.punchIn || '', item.punchOut || '', item.status, item.method, item.overtimeMinutes, item.regularizationApproved ?? ''].join('|'))
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

const dayKey = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const hashRows = (rows: AttendanceRegisterRow[]): string => {
  const canonical = rows.slice().sort((left, right) => `${left.employeeId}|${left.date}`.localeCompare(`${right.employeeId}|${right.date}`))
    .map(row => [row.employeeId, row.date, row.status, row.attendanceId || '', row.source || ''].join('|')).join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) { hash ^= canonical.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export function buildAttendanceRegister(attendances: AttendanceLog[], employees: Employee[], leaves: LeaveRequest[], holidays: Holiday[], month: number, year: number): AttendanceRegisterRow[] {
  const attendanceByEmployeeDay = new Map(attendances.filter(item => item.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)).map(item => [`${item.employeeId}|${item.date}`, item]));
  const holidayDates = new Set(holidays.map(item => item.date));
  const lastDay = new Date(year, month, 0).getDate();
  const eligible = employees.filter(employee => (employee.status === 'Active' || employee.status === 'On Leave') && employee.dateOfJoining <= dayKey(year, month, lastDay));
  return eligible.flatMap(employee => Array.from({ length: lastDay }, (_, offset) => {
    const date = dayKey(year, month, offset + 1);
    const attendance = attendanceByEmployeeDay.get(`${employee.id}|${date}`);
    const leave = leaves.find(item => item.employeeId === employee.id && item.status === 'Approved' && item.startDate <= date && item.endDate >= date);
    const weekday = new Date(`${date}T00:00:00`).getDay();
    const workingDays = employee.shift?.workingDays?.length ? employee.shift.workingDays : [1, 2, 3, 4, 5, 6];
    if (attendance?.regularizationRequested && attendance.regularizationApproved === undefined) return { employeeId: employee.id, date, status: 'Pending Review', attendanceId: attendance.id, source: attendance.method };
    if (attendance?.punchIn && !attendance.punchOut && !['On Leave', 'Holiday'].includes(attendance.status)) return { employeeId: employee.id, date, status: 'Missing Punch', attendanceId: attendance.id, source: attendance.method };
    if (!attendance && date < employee.dateOfJoining) return { employeeId: employee.id, date, status: 'Not Joined', source: 'Roster' };
    if (attendance) {
      const status = attendance.status === 'On Leave' ? 'Paid Leave' : attendance.status === 'Holiday' ? 'Holiday' : attendance.status as AttendanceRegisterRow['status'];
      return { employeeId: employee.id, date, status, attendanceId: attendance.id, source: attendance.method };
    }
    if (holidayDates.has(date)) return { employeeId: employee.id, date, status: 'Holiday', source: 'Holiday' };
    if (leave) return { employeeId: employee.id, date, status: leave.leaveType === 'Unpaid' ? 'Unpaid Leave' : 'Paid Leave', source: 'Leave' };
    if (!workingDays.includes(weekday)) return { employeeId: employee.id, date, status: 'Weekly Off', source: 'Roster' };
    return { employeeId: employee.id, date, status: 'Absent', source: 'Roster' };
  }));
}

export function createAttendancePeriod(
  attendances: AttendanceLog[], employees: Employee[], leaves: LeaveRequest[], holidays: Holiday[], month: number, year: number, actor: string, now = new Date().toISOString(),
  previous?: AttendancePeriod
): AttendancePeriod {
  if (previous && previous.status !== 'Reopened') throw new Error('This attendance register is already locked. Reopen it with a documented reason before locking a new version.');
  const issues = findAttendanceLockIssues(attendances, month, year);
  if (issues.length) throw new Error(`Attendance period cannot be locked: ${issues.length} exception(s) require review.`);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const records = attendances.filter(item => item.date.startsWith(prefix));
  if (!records.length) throw new Error('Attendance period cannot be locked because it contains no attendance records.');
  const registerRows = buildAttendanceRegister(attendances, employees, leaves, holidays, month, year);
  const unresolved = registerRows.filter(row => row.status === 'Pending Review' || row.status === 'Missing Punch');
  if (unresolved.length) throw new Error(`Attendance period cannot be locked: ${unresolved.length} register day(s) require review.`);
  return {
    id: attendancePeriodId(month, year), periodMonth: month, periodYear: year, status: 'Locked', lockedAt: now, lockedBy: actor,
    attendanceCount: records.length,
    employeeCount: employees.filter(item => item.status === 'Active' || item.status === 'On Leave').length,
    integrityHash: attendanceIntegrityHash(attendances, month, year), exceptionCount: 0,
    registerVersion: (previous?.registerVersion || 0) + 1, registerRows, registerHash: hashRows(registerRows),
    history: [...(previous?.history || []), { action: 'Locked', at: now, by: actor, registerVersion: (previous?.registerVersion || 0) + 1, registerHash: hashRows(registerRows) }],
  };
}

export function reopenAttendancePeriod(
  period: AttendancePeriod, reason: string, actor: string, actorId: string, payrollRuns: PayrollRun[], now = new Date().toISOString()
): AttendancePeriod {
  if (period.status !== 'Locked') throw new Error('Only a locked attendance register can be reopened.');
  if (reason.trim().length < 10) throw new Error('Enter a reopening reason of at least 10 characters.');
  const activeRun = payrollRuns.find(run => run.attendancePeriodId === period.id && run.status !== 'Cancelled');
  if (activeRun?.status === 'Disbursed') throw new Error(`Payroll run "${activeRun.title}" has been disbursed from this register. Record corrections as payroll adjustments or arrears in an open period instead.`);
  if (activeRun) throw new Error(`Cancel payroll run "${activeRun.title}" (${activeRun.status}) before reopening the attendance register it consumed.`);
  return {
    ...period, status: 'Reopened', reopenedAt: now, reopenedBy: actor, reopenedById: actorId, reopenReason: reason.trim(),
    history: [...(period.history || []), { action: 'Reopened', at: now, by: actor, registerVersion: period.registerVersion || 1, registerHash: period.registerHash, reason: reason.trim() }],
  };
}

export type RegisterPayrollSummary = {
  presentDays: number; halfDays: number; paidLeaveDays: number; unpaidLeaveDays: number;
  absentDays: number; notJoinedDays: number; holidayDays: number; weeklyOffDays: number; rosteredDays: number;
};

export function registerPayrollSummary(rows: AttendanceRegisterRow[], employeeId: string): RegisterPayrollSummary {
  const summary: RegisterPayrollSummary = { presentDays: 0, halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, notJoinedDays: 0, holidayDays: 0, weeklyOffDays: 0, rosteredDays: 0 };
  for (const row of rows) {
    if (row.employeeId !== employeeId) continue;
    if (row.status === 'Present' || row.status === 'Late' || row.status === 'Working Day') summary.presentDays += 1;
    else if (row.status === 'Half Day') summary.halfDays += 1;
    else if (row.status === 'Paid Leave') summary.paidLeaveDays += 1;
    else if (row.status === 'Unpaid Leave') summary.unpaidLeaveDays += 1;
    else if (row.status === 'Absent') summary.absentDays += 1;
    else if (row.status === 'Not Joined') summary.notJoinedDays += 1;
    else if (row.status === 'Holiday') summary.holidayDays += 1;
    else if (row.status === 'Weekly Off') summary.weeklyOffDays += 1;
    if (!['Holiday', 'Weekly Off', 'Not Joined'].includes(row.status)) summary.rosteredDays += 1;
  }
  return summary;
}

export type RegisterInputs = { employees: Employee[]; leaves: LeaveRequest[]; holidays: Holiday[] };

// Attendance-log hashing alone misses leave, holiday and roster edits made after the lock,
// so when the register inputs are supplied the certified register is rebuilt and compared too.
export function isAttendancePeriodValid(period: AttendancePeriod | undefined, attendances: AttendanceLog[], inputs?: RegisterInputs): boolean {
  if (!period || period.status !== 'Locked' || period.integrityHash !== attendanceIntegrityHash(attendances, period.periodMonth, period.periodYear)) return false;
  if (!inputs || !period.registerHash) return true;
  const rebuilt = buildAttendanceRegister(attendances, inputs.employees, inputs.leaves, inputs.holidays, period.periodMonth, period.periodYear);
  return hashRows(rebuilt) === period.registerHash;
}
