import type { AttendanceLog, Branch, Department, Employee, JobApplication, JobPosting, LeaveRequest, PerformanceReview } from '../types';

/**
 * HR KPI figures for the operations dashboard: headcount, hires, attrition, attendance, diversity,
 * performance and recruitment, each for a chosen month with the previous month for comparison.
 * Everything is derived from the live records, so the dashboard can never disagree with payroll.
 */

export interface KpiFilters {
  /** YYYY-MM of the month shown (defaults to the current month). */
  month: string;
  departmentId?: string;
  branchId?: string;
}

export interface KpiInputs {
  employees: Employee[];
  attendances: AttendanceLog[];
  leaves: LeaveRequest[];
  departments: Department[];
  branches: Branch[];
  jobPostings?: JobPosting[];
  jobApplications?: JobApplication[];
  performanceReviews?: PerformanceReview[];
  /** Today (YYYY-MM-DD); defaults to the real date. */
  today?: string;
}

export interface KpiMetric { value: number; previous: number; delta: number; deltaPercent: number | null }
export interface KpiSlice { label: string; value: number }
export interface KpiMonth { key: string; label: string; headcount: number; hires: number; leavers: number; attritionRate: number; attendanceRate: number | null }
export interface FunnelStage { label: string; value: number; percent: number }

export interface HrKpis {
  month: string;
  monthLabel: string;
  totalEmployees: KpiMetric;
  newHires: KpiMetric;
  attritionRate: KpiMetric;
  attendanceRate: KpiMetric;
  openVacancies: KpiMetric;
  wageBill: KpiMetric;
  trend: KpiMonth[];
  departments: KpiSlice[];
  gender: KpiSlice[];
  attendanceMix: { present: number; late: number; halfDay: number; absent: number; onLeave: number };
  performance: KpiSlice[];
  reviewedEmployees: number;
  funnel: FunnelStage[];
  leaveMix: KpiSlice[];
  leavingReasons: KpiSlice[];
  insights: string[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');
export const monthKey = (date: string) => date.slice(0, 7);
export const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
export function shiftMonth(key: string, by: number): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1 + by;
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}
const monthEnd = (key: string) => `${key}-${pad(new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate())}`;
const metric = (value: number, previous: number): KpiMetric => ({ value, previous, delta: value - previous, deltaPercent: previous ? Math.round(((value - previous) / previous) * 1000) / 10 : null });
const round1 = (value: number) => Math.round(value * 10) / 10;

/** The employee had left on or before this date (a separation date wins; a terminated record without one counts as gone). */
const leftBy = (employee: Employee, date: string) => employee.separationDate ? employee.separationDate <= date : employee.status === 'Terminated';
/** Employed on this date: joined by then and not yet left. */
export const employedOn = (employee: Employee, date: string) => Boolean(employee.dateOfJoining) && employee.dateOfJoining <= date && !leftBy(employee, date);

export function computeHrKpis(inputs: KpiInputs, filters: KpiFilters): HrKpis {
  const today = inputs.today || new Date().toISOString().slice(0, 10);
  const month = filters.month || monthKey(today);
  const inScope = (employee: Employee) => (!filters.departmentId || employee.departmentId === filters.departmentId) && (!filters.branchId || employee.branchId === filters.branchId);
  const employees = inputs.employees.filter(inScope);
  const ids = new Set(employees.map(employee => employee.id));
  const attendances = inputs.attendances.filter(log => ids.has(log.employeeId));
  const leaves = inputs.leaves.filter(leave => ids.has(leave.employeeId));

  const monthStats = (key: string): KpiMonth => {
    const start = `${key}-01`;
    const end = monthEnd(key);
    const headcountStart = employees.filter(employee => employedOn(employee, start)).length;
    const headcount = employees.filter(employee => employedOn(employee, end)).length;
    const hires = employees.filter(employee => employee.dateOfJoining >= start && employee.dateOfJoining <= end).length;
    const leavers = employees.filter(employee => employee.separationDate && employee.separationDate >= start && employee.separationDate <= end).length;
    const average = (headcountStart + headcount) / 2;
    const logs = attendances.filter(log => log.date >= start && log.date <= end);
    const worked = logs.filter(log => log.status === 'Present' || log.status === 'Late' || log.status === 'Half Day').length;
    const absent = logs.filter(log => log.status === 'Absent').length;
    return {
      key, label: monthLabel(key), headcount, hires, leavers,
      attritionRate: average > 0 ? round1((leavers / average) * 100) : 0,
      attendanceRate: worked + absent > 0 ? round1((worked / (worked + absent)) * 100) : null,
    };
  };

  const trend = Array.from({ length: 6 }, (_, index) => monthStats(shiftMonth(month, index - 5)));
  const current = trend[5];
  const previous = trend[4];

  const postings = (inputs.jobPostings || []).filter(posting => (!filters.departmentId || posting.departmentId === filters.departmentId) && (!filters.branchId || posting.branchId === filters.branchId));
  const postingIds = new Set(postings.map(posting => posting.id));
  const applications = (inputs.jobApplications || []).filter(application => postingIds.has(application.jobPostingId));
  // Vacancies still being recruited for that had been posted by the given date.
  const openVacancies = (asOf: string) => postings.filter(posting => posting.postedDate <= asOf && (posting.status === 'Open' || posting.status === 'On Hold')).reduce((sum, posting) => sum + (posting.vacancies || 0), 0);

  const activeNow = employees.filter(employee => employedOn(employee, monthEnd(month)));
  const activePrevious = employees.filter(employee => employedOn(employee, monthEnd(previous.key)));
  const monthlyWage = (employee: Employee) => (employee.wageType === 'Daily Wager' ? (employee.basicSalary || 0) * 26 : (employee.basicSalary || 0));
  const wageBill = metric(activeNow.reduce((sum, employee) => sum + monthlyWage(employee), 0), activePrevious.reduce((sum, employee) => sum + monthlyWage(employee), 0));

  const countBy = (items: Employee[], keyOf: (employee: Employee) => string): KpiSlice[] => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1);
    return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  };
  const departmentName = (id: string) => inputs.departments.find(department => department.id === id)?.name || 'Unassigned';
  const departments = countBy(activeNow, employee => departmentName(employee.departmentId));
  const gender = countBy(activeNow, employee => (employee.gender || 'Not recorded').trim() || 'Not recorded');

  const logsThisMonth = attendances.filter(log => log.date >= `${month}-01` && log.date <= monthEnd(month));
  const attendanceMix = {
    present: logsThisMonth.filter(log => log.status === 'Present').length,
    late: logsThisMonth.filter(log => log.status === 'Late').length,
    halfDay: logsThisMonth.filter(log => log.status === 'Half Day').length,
    absent: logsThisMonth.filter(log => log.status === 'Absent').length,
    onLeave: logsThisMonth.filter(log => log.status === 'On Leave').length,
  };

  // Latest decided review per active employee, bucketed by the manager rating.
  const RATING_LABELS = ['Poor', 'Needs improvement', 'Satisfactory', 'Good', 'Excellent'];
  const latestReview = new Map<string, PerformanceReview>();
  for (const review of (inputs.performanceReviews || []).filter(review => ids.has(review.employeeId) && review.status !== 'Draft' && review.status !== 'Rejected')) {
    const existing = latestReview.get(review.employeeId);
    if (!existing || review.reviewDate > existing.reviewDate) latestReview.set(review.employeeId, review);
  }
  const performance = RATING_LABELS.map((label, index) => ({ label, value: [...latestReview.values()].filter(review => Math.min(5, Math.max(1, Math.round(review.overallManagerRating || 0))) === index + 1).length }));

  const stageRank: Record<JobApplication['stage'], number> = { Applied: 0, Shortlisted: 1, 'Interview Scheduled': 2, Interviewed: 2, 'Offer Extended': 3, Hired: 4, Rejected: -1 };
  const reached = (rank: number) => applications.filter(application => stageRank[application.stage] >= rank).length;
  const applied = applications.length;
  const funnel: FunnelStage[] = [['Applications', applied], ['Screened', reached(1)], ['Interviews', reached(2)], ['Offers', reached(3)], ['Hired', reached(4)]]
    .map(([label, value]) => ({ label: label as string, value: value as number, percent: applied ? Math.round(((value as number) / applied) * 100) : 0 }));

  const leaveMix = countBy(leaves.filter(leave => leave.status === 'Approved' && leave.startDate <= monthEnd(month) && leave.endDate >= `${month}-01`) as unknown as Employee[], leave => (leave as unknown as LeaveRequest).leaveType);

  const leftInYear = employees.filter(employee => employee.separationDate && employee.separationDate > shiftMonth(month, -11) + '-01' && employee.separationDate <= monthEnd(month));
  const reasonOf = (employee: Employee) => {
    const text = (employee.separationReason || '').trim();
    if (!text) return employee.separationType || 'Not recorded';
    const sentence = text.split(/[.;\n]/)[0].trim();
    return (sentence.length > 40 ? `${sentence.slice(0, 40)}…` : sentence).replace(/^\w/, ch => ch.toUpperCase());
  };
  const leavingReasons = countBy(leftInYear, reasonOf).slice(0, 5);

  const totalEmployees = metric(current.headcount, previous.headcount);
  const newHires = metric(current.hires, previous.hires);
  const attritionRate = metric(current.attritionRate, previous.attritionRate);
  const attendanceRate = metric(current.attendanceRate ?? 0, previous.attendanceRate ?? 0);
  const vacancies = metric(openVacancies(monthEnd(month)), openVacancies(monthEnd(previous.key)));

  const insights: string[] = [];
  if (attritionRate.delta > 0) insights.push(`Attrition rose to ${current.attritionRate}% (${previous.attritionRate}% last month); ${current.leavers} employee(s) left.`);
  else if (current.leavers === 0) insights.push('No one left this month; attrition is 0%.');
  else insights.push(`Attrition improved to ${current.attritionRate}% from ${previous.attritionRate}%.`);
  if (current.attendanceRate !== null) {
    if (current.attendanceRate < 90) insights.push(`Attendance is ${current.attendanceRate}%: ${attendanceMix.absent} absence(s) and ${attendanceMix.late} late arrival(s) need follow-up.`);
    else insights.push(`Attendance is healthy at ${current.attendanceRate}%${attendanceMix.late ? ` with ${attendanceMix.late} late arrival(s)` : ''}.`);
  } else insights.push('No attendance has been recorded for this month yet.');
  if (newHires.value) insights.push(`${newHires.value} new hire(s) joined; make sure onboarding checklists are complete.`);
  if (vacancies.value) insights.push(`${vacancies.value} open vacancy(ies) in recruitment; ${funnel[2].value} candidate(s) at interview stage.`);
  if (leavingReasons.length) insights.push(`Top reason for leaving in the last 12 months: ${leavingReasons[0].label} (${leavingReasons[0].value}).`);
  const unreviewed = activeNow.length - [...latestReview.keys()].filter(id => activeNow.some(employee => employee.id === id)).length;
  if ((inputs.performanceReviews || []).length && unreviewed > 0) insights.push(`${unreviewed} active employee(s) have no performance review on record.`);

  return {
    month, monthLabel: monthLabel(month), totalEmployees, newHires, attritionRate, attendanceRate, openVacancies: vacancies, wageBill,
    trend, departments, gender, attendanceMix, performance, reviewedEmployees: latestReview.size, funnel, leaveMix, leavingReasons, insights,
  };
}
