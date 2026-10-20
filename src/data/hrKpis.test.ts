import test from 'node:test';
import assert from 'node:assert/strict';
import { computeHrKpis, employedOn, shiftMonth } from './hrKpis';
import type { AttendanceLog, Employee, JobApplication, JobPosting, PerformanceReview } from '../types';

const employee = (id: string, joined: string, extra: Partial<Employee> = {}): Employee => ({
  id, companyId: 'c1', branchId: 'b1', departmentId: extra.departmentId || 'd1', designationId: 'ds1', employeeCode: id, fullName: id, email: '', contactNumber: '',
  cnic: '', gender: 'Male', dateOfBirth: '1990-01-01', dateOfJoining: joined, status: 'Active', wageType: 'Monthly', basicSalary: 50000,
  providentFundOptIn: false, providentFundRate: 0, gratuityOptIn: false, bankName: '', bankBranchName: '', bankAccountNumber: '', iban: '', ...extra,
});
const log = (employeeId: string, date: string, status: AttendanceLog['status']): AttendanceLog => ({ id: `${employeeId}-${date}`, employeeId, date, status, method: 'Biometric', overtimeMinutes: 0 } as AttendanceLog);

test('month arithmetic', () => {
  assert.equal(shiftMonth('2026-10', -1), '2026-09');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
});

test('headcount, hires, leavers and attrition follow joining and separation dates', () => {
  const employees = [
    employee('a', '2025-01-01'),
    employee('b', '2026-10-10'),
    employee('c', '2025-06-01', { status: 'Terminated', separationDate: '2026-10-20', separationReason: 'Better opportunity abroad. Left on good terms.' }),
    employee('d', '2025-06-01', { status: 'Terminated', separationDate: '2026-09-05', separationReason: 'better opportunity' }),
    employee('e', '2026-11-01'),
  ];
  const kpis = computeHrKpis({ employees, attendances: [], leaves: [], departments: [{ id: 'd1', branchId: 'b1', name: 'Sales', code: 'S' }], branches: [], today: '2026-10-25' }, { month: '2026-10' });
  assert.equal(kpis.totalEmployees.value, 2, 'a and b employed at end of October');
  assert.equal(kpis.totalEmployees.previous, 2, 'a and c at end of September');
  assert.equal(kpis.newHires.value, 1);
  assert.equal(kpis.trend.length, 6);
  assert.equal(kpis.trend[5].leavers, 1);
  assert.equal(kpis.trend[5].attritionRate, 50, 'one leaver over an average headcount of 2 (a and c on 1 Oct, a and b on 31 Oct)');
  assert.equal(employedOn(employees[2], '2026-10-21'), false);
  assert.deepEqual(kpis.leavingReasons[0], { label: 'Better opportunity abroad', value: 1 });
  assert.equal(kpis.leavingReasons.length, 2, 'different wording is a different reason');
  assert.deepEqual(kpis.departments, [{ label: 'Sales', value: 2 }]);
});

test('attendance rate counts worked days against absences only', () => {
  const employees = [employee('a', '2025-01-01')];
  const attendances = [log('a', '2026-10-01', 'Present'), log('a', '2026-10-02', 'Late'), log('a', '2026-10-03', 'Absent'), log('a', '2026-10-04', 'On Leave'), log('a', '2026-10-05', 'Holiday'), log('a', '2026-09-01', 'Absent')];
  const kpis = computeHrKpis({ employees, attendances, leaves: [], departments: [], branches: [], today: '2026-10-25' }, { month: '2026-10' });
  assert.equal(kpis.attendanceRate.value, 66.7);
  assert.equal(kpis.attendanceRate.previous, 0);
  assert.deepEqual(kpis.attendanceMix, { present: 1, late: 1, halfDay: 0, absent: 1, onLeave: 1 });
});

test('filters, recruitment funnel and performance buckets', () => {
  const employees = [employee('a', '2025-01-01', { departmentId: 'd1' }), employee('b', '2025-01-01', { departmentId: 'd2', gender: 'Female' })];
  const postings: JobPosting[] = [{ id: 'j1', title: 'Clerk', departmentId: 'd1', branchId: 'b1', vacancies: 2, experienceRequired: '', qualificationRequired: '', salaryRange: '', jobType: 'Full Time', postedDate: '2026-09-01', closingDate: '2026-12-31', status: 'Open', description: '' }];
  const application = (id: string, stage: JobApplication['stage']): JobApplication => ({ id, jobPostingId: 'j1', applicantName: id, applicantEmail: '', applicantPhone: '', appliedDate: '2026-09-10', stage });
  const applications = [application('1', 'Applied'), application('2', 'Shortlisted'), application('3', 'Interviewed'), application('4', 'Hired'), application('5', 'Rejected')];
  const review = (employeeId: string, rating: number): PerformanceReview => ({ id: `r-${employeeId}`, employeeId, reviewerId: 'm', period: 'H1', reviewDate: '2026-08-01', kpis: [], overallSelfRating: rating, overallManagerRating: rating, strengths: '', areasOfImprovement: '', managerComments: '', status: 'Approved', incrementRecommended: false });
  const all = computeHrKpis({ employees, attendances: [], leaves: [], departments: [], branches: [], jobPostings: postings, jobApplications: applications, performanceReviews: [review('a', 4.6), review('b', 2)], today: '2026-10-25' }, { month: '2026-10' });
  assert.deepEqual(all.funnel.map(stage => stage.value), [5, 3, 2, 1, 1]);
  assert.equal(all.openVacancies.value, 2);
  assert.deepEqual(all.gender.map(slice => slice.label).sort(), ['Female', 'Male']);
  assert.deepEqual(all.performance.map(bucket => bucket.value), [0, 1, 0, 0, 1]);
  const sales = computeHrKpis({ employees, attendances: [], leaves: [], departments: [], branches: [], jobPostings: postings, jobApplications: applications, today: '2026-10-25' }, { month: '2026-10', departmentId: 'd2' });
  assert.equal(sales.totalEmployees.value, 1);
  assert.equal(sales.openVacancies.value, 0, 'postings of other departments are excluded');
  assert.ok(all.insights.length >= 2);
});
