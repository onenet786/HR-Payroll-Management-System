import type { AttendanceLog, AttendancePeriod, Employee } from '../types';

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

export function createAttendancePeriod(
  attendances: AttendanceLog[], employees: Employee[], month: number, year: number, actor: string, now = new Date().toISOString()
): AttendancePeriod {
  const issues = findAttendanceLockIssues(attendances, month, year);
  if (issues.length) throw new Error(`Attendance period cannot be locked: ${issues.length} exception(s) require review.`);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const records = attendances.filter(item => item.date.startsWith(prefix));
  if (!records.length) throw new Error('Attendance period cannot be locked because it contains no attendance records.');
  return {
    id: attendancePeriodId(month, year), periodMonth: month, periodYear: year, status: 'Locked', lockedAt: now, lockedBy: actor,
    attendanceCount: records.length,
    employeeCount: employees.filter(item => item.status === 'Active' || item.status === 'On Leave').length,
    integrityHash: attendanceIntegrityHash(attendances, month, year), exceptionCount: 0,
  };
}

export function isAttendancePeriodValid(period: AttendancePeriod | undefined, attendances: AttendanceLog[]): boolean {
  return Boolean(period && period.status === 'Locked' && period.integrityHash === attendanceIntegrityHash(attendances, period.periodMonth, period.periodYear));
}
