import type { AttendanceBreak, AttendanceLog, Holiday, Shift } from '../types';

export const DEFAULT_SHIFT: Shift = {
  id: 'default-day-shift', name: 'Default Day Shift', startTime: '09:00', endTime: '17:00',
  graceMinutes: 15, halfDayMinutes: 120, overtimeMultiplier: 2, breakMinutes: 0,
  overtimeAfterMinutes: 480, workingDays: [1, 2, 3, 4, 5, 6],
};

const timeMinutes = (value?: string): number | undefined => {
  if (!value || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return undefined;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
};

const elapsedMinutes = (start: number, end: number) => end >= start ? end - start : end + 1440 - start;

export const completedBreakMinutes = (breaks: AttendanceBreak[] = []): number => breaks.reduce((total, item) => {
  const start = timeMinutes(item.outAt);
  const end = timeMinutes(item.returnAt);
  return start === undefined || end === undefined ? total : total + elapsedMinutes(start, end);
}, 0);

export function evaluateAttendanceTimes(punchIn: string | undefined, punchOut: string | undefined, shift: Shift = DEFAULT_SHIFT, breaks: AttendanceBreak[] = []): Pick<AttendanceLog, 'status' | 'overtimeMinutes'> & { workedMinutes: number } {
  const start = timeMinutes(shift.startTime) ?? 540;
  const end = timeMinutes(shift.endTime) ?? 1020;
  const input = timeMinutes(punchIn);
  const output = timeMinutes(punchOut);
  if (input === undefined) return { status: 'Absent', overtimeMinutes: 0, workedMinutes: 0 };

  const lateBy = elapsedMinutes(start, input);
  const isPlausiblyEarly = lateBy > 720;
  const status: AttendanceLog['status'] = isPlausiblyEarly || lateBy <= shift.graceMinutes
    ? 'Present'
    : lateBy >= shift.halfDayMinutes ? 'Half Day' : 'Late';
  if (output === undefined) return { status, overtimeMinutes: 0, workedMinutes: 0 };

  const grossWorked = elapsedMinutes(input, output);
  const recordedBreaks = completedBreakMinutes(breaks);
  const breakDeduction = Math.max(recordedBreaks, shift.breakMinutes || 0);
  const workedMinutes = Math.max(0, grossWorked - breakDeduction);
  const scheduledMinutes = elapsedMinutes(start, end) - (shift.breakMinutes || 0);
  const overtimeThreshold = shift.overtimeAfterMinutes ?? scheduledMinutes;
  return { status, workedMinutes, overtimeMinutes: Math.max(0, workedMinutes - overtimeThreshold) };
}

export function countScheduledWorkingDays(year: number, month: number, shift: Shift = DEFAULT_SHIFT, holidays: Holiday[] = []): number {
  const workingDays = new Set(shift.workingDays?.length ? shift.workingDays : DEFAULT_SHIFT.workingDays);
  const holidayDates = new Set(holidays.map(item => item.date));
  const lastDay = new Date(year, month, 0).getDate();
  let total = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const date = new Date(year, month - 1, day);
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (workingDays.has(date.getDay()) && !holidayDates.has(iso)) total += 1;
  }
  return total;
}
