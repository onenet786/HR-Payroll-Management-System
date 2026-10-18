/**
 * Clears business records and seeds a 14-employee demo whose data flows through every module:
 * HR master data → attendance (kiosk, fingerprint, face, mobile GPS) → leave → certified attendance registers →
 * payroll (loans, adjustments, tax YTD) → approval → bank advice → disbursement → payslips in the mobile app.
 *
 * Kept: users, roles, companies, branches, statutory settings and tax slabs, sessions/MFA, kiosk devices, audit log.
 * Everything is computed with the app's own engines, so totals match what the screens recalculate.
 *
 * Usage (back up first: npm run postgres:backup):
 *   node scripts/seed-demo-workflow.cjs --yes-clear=<database name> [--dry-run]
 * The .cjs file is generated from this source by `npm run seed:demo:build`.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';
import { computePayslipDetails, DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS } from '../src/data/defaults';
import { attendancePeriodId, createAttendancePeriod } from '../src/data/attendancePeriod';
import { evaluateAttendanceTimes } from '../src/data/attendanceRules';
import { bankAdvicePayload } from '../src/data/bankAdvice';
import { payrollPreflight } from '../src/data/payrollPreflight';
import { calculateFinalSettlement } from '../src/data/lifecycle';
import { companyInitialsPrefix, generateMasterCode } from '../src/data/masterCodes';
import type {
  AppNotification, AttendanceLog, Branch, Company, CompanyAsset, Department, Designation, Employee, GratuitySettlement, Holiday,
  JobApplication, JobPosting, LeaveRequest, LifecycleRequest, LoanAdvance, MobileDutyAuthorization, PayrollAdjustment, PayrollRun,
  Payslip, PerformanceReview, SalaryRevision, Shift, StatutoryConfig, TaxSlab, UcTown, WageType, Zone,
} from '../src/types';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

// Business records only. Users, roles, companies, branches, statutory settings, sessions, MFA, kiosk devices,
// statutory change history and the audit log are never touched.
const CLEARED_TABLES = [
  'payslip_alert_deliveries', 'payslip_deliveries', 'payroll_payslips', 'payroll_runs', 'payroll_adjustments', 'attendance_periods',
  'attendances', 'leaves', 'mobile_duty_authorizations', 'loan_advances', 'salary_revisions', 'performance_reviews', 'gratuity_settlements',
  'lifecycle_requests', 'company_assets', 'job_applications', 'job_postings', 'notifications', 'employee_documents', 'biometric_templates',
  'employees', 'designations', 'departments', 'uc_towns', 'zones', 'wage_types', 'holidays',
];
const CLEARED_LEGACY_COLLECTIONS = [
  'payrollPayslips', 'payrollRuns', 'payrollAdjustments', 'attendancePeriods', 'attendances', 'leaves', 'mobileDutyAuthorizations', 'loanAdvances',
  'salaryRevisions', 'performanceReviews', 'gratuitySettlements', 'lifecycleRequests', 'companyAssets', 'jobApplications', 'jobPostings',
  'notifications', 'biometricTemplates', 'employees', 'designations', 'departments', 'ucTowns', 'zones', 'wageTypes', 'holidays',
];

const args = new Map(process.argv.slice(2).map(arg => { const [key, ...rest] = arg.replace(/^--/, '').split('='); return [key, rest.join('=') || 'true'] as const; }));
const dryRun = args.has('dry-run');

// ── Calendar helpers ─────────────────────────────────────────────────────────
const pad = (value: number) => String(value).padStart(2, '0');
const ymd = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate();
const weekday = (date: string) => new Date(`${date}T00:00:00`).getDay();
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const addMonths = (year: number, month: number, delta: number) => { const index = year * 12 + (month - 1) + delta; return { year: Math.floor(index / 12), month: (index % 12) + 1 }; };
const monthName = (year: number, month: number) => new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
const taxYearOf = (year: number, month: number) => String(month >= 7 ? year + 1 : year);
// Deterministic pseudo-random numbers so a re-run produces the same demo.
const noise = (key: string) => crypto.createHash('sha256').update(key).digest().readUInt32BE(0) / 0xffffffff;
const minutesToTime = (minutes: number) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}:00`;

const now = new Date();
const today = now.toISOString().slice(0, 10);
const yesterday = addDays(today, -1);
const openMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
const iso = (date: string, time = '10:00:00') => `${date}T${time}+05:00`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is not set (.env.local or environment).');
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
  });
  const client = await pool.connect();
  try {
    const database = (await client.query('SELECT current_database() AS name')).rows[0].name as string;
    if (args.get('yes-clear') !== database) {
      throw new Error(`This clears every employee, attendance, leave, payroll and HR record in database "${database}" (users, roles, companies, branches and statutory settings are kept).\n`
        + `Back up first (npm run postgres:backup), then re-run with --yes-clear=${database}  (add --dry-run to preview without saving).`);
    }

    // ── Read what is kept, and refuse before deleting anything if it cannot support the demo ──
    const rows = async <T>(table: string) => (await client.query(`SELECT id, data FROM ${table} ORDER BY created_at, id`)).rows.map(row => ({ ...row.data, id: row.id }) as T);
    let companies = await rows<Company>('companies');
    let branches = await rows<Branch>('branches');
    const statConfigs = await rows<StatutoryConfig>('stat_config');
    let taxSlabs = await rows<TaxSlab>('tax_slabs');
    const users = (await client.query(`SELECT id, data FROM users`)).rows.map(row => ({ ...row.data, id: row.id }));
    const roleIds = new Set((await client.query(`SELECT id FROM roles`)).rows.map(row => row.id));

    const notes: string[] = [];
    const created: string[] = [];
    if (!companies.length) {
      companies = [{ id: 'co-demo', name: 'Demo Textiles', legalName: 'Demo Textiles (Pvt) Ltd', industry: 'Textiles', taxRegistrationNumber: '1234567-8', ntn: '1234567-8',
        eobiRegistrationNumber: 'EOBI-LHR-1001', socialSecurityRegion: 'Punjab', city: 'Lahore', province: 'Punjab', status: 'Active', payrollFrequency: 'Monthly', defaultCurrency: 'PKR' } as Company];
      created.push('company "Demo Textiles" (no company existed)');
    }
    const company = companies[0];
    if (!branches.some(branch => branch.companyId === company.id)) {
      branches = [...branches, { id: 'br-demo-hq', companyId: company.id, code: 'HQ', name: 'Head Office', city: company.city || 'Lahore', province: (company.province || 'Punjab'),
        address: company.registeredAddress || 'Main Boulevard', establishmentType: 'Shop / Commercial', geofenceLatitude: 31.5204, geofenceLongitude: 74.3587, geofenceRadiusMeters: 250 } as Branch];
      created.push('branch "Head Office" (the company had no branch)');
    }
    const companyBranches = branches.filter(branch => branch.companyId === company.id);
    const headOffice = companyBranches[0];
    const site = companyBranches[1] || headOffice;

    const months = [-3, -2, -1].map(delta => addMonths(openMonth.year, openMonth.month, delta));
    let statConfig = statConfigs.find(config => config.taxYear === taxYearOf(openMonth.year, openMonth.month));
    if (!statConfig && !statConfigs.length) {
      statConfig = { ...DEFAULT_STATUTORY_CONFIG };
      created.push(`statutory configuration ${statConfig.id} (none existed)`);
    }
    if (!statConfig) {
      const taxYear = taxYearOf(openMonth.year, openMonth.month);
      const found = statConfigs.map(item => `${item.id}: tax year "${item.taxYear ?? ''}", effective from ${item.effectiveFrom || '(blank)'}`).join('\n  ');
      throw new Error(`No statutory configuration covers Tax Year ${taxYear} (July ${Number(taxYear) - 1} - June ${taxYear}). Found:\n  ${found}\n`
        + `Payroll needs the tax year written exactly as "${taxYear}". Propose it under Settings → Statutory Config (tax year ${taxYear}, effective from ${Number(taxYear) - 1}-07-01) and have a second admin approve it; nothing was changed.`);
    }
    const config = statConfig;
    const missingRates = (['minimumWage', 'eobiEmployerRate', 'eobiEmployeeRate', 'pessiEmployerRate', 'gratuityRateDaysPerYear'] as const)
      .filter(field => !Number.isFinite(Number(config[field])));
    if (missingRates.length) {
      throw new Error(`Statutory configuration ${config.id} is incomplete (missing ${missingRates.join(', ')}). Complete it under Settings → Statutory Governance first; nothing was changed.`);
    }
    // Payroll months: up to three closed months inside the configuration's tax year.
    const payrollMonths = months.filter(({ year, month }) => taxYearOf(year, month) === config.taxYear && (!config.effectiveFrom || ymd(year, month, 1) >= config.effectiveFrom));
    if (payrollMonths.length < months.length) notes.push(`Payroll seeded for ${payrollMonths.length} month(s) only: earlier months fall outside Tax Year ${config.taxYear}.`);
    if (!taxSlabs.length) { taxSlabs = DEFAULT_TAX_SLABS; created.push('FBR tax slabs (none existed)'); }
    const firstMonth = payrollMonths[0] || openMonth;
    const seedStart = ymd(firstMonth.year, firstMonth.month, 1);

    // ── Organisation: departments, designations, wage types, zones ──
    const departments: Department[] = [];
    const designations: Designation[] = [];
    const department = (key: string, name: string, branch: Branch) => {
      const item: Department = { id: `dep-${key}`, branchId: branch.id, name, code: generateMasterCode('department', { name, title: '', company, branch }, departments) };
      departments.push(item);
      return item;
    };
    const designation = (key: string, dept: Department, title: string, grade: string) => {
      const branch = companyBranches.find(item => item.id === dept.branchId);
      const item: Designation = { id: `des-${key}`, departmentId: dept.id, title, grade, code: generateMasterCode('designation', { name: '', title, company, branch, department: dept }, designations) };
      designations.push(item);
      return item;
    };
    const hr = department('hr', 'Human Resources', headOffice);
    const fin = department('fin', 'Finance & Accounts', headOffice);
    const it = department('it', 'Information Technology', headOffice);
    const sales = department('sales', 'Sales & Marketing', headOffice);
    const prd = department('prd', 'Production', site);
    const qc = department('qc', 'Quality Control', site);
    const adm = department('adm', 'Administration & Security', site);
    const D = {
      hrm: designation('hr-manager', hr, 'HR Manager', 'M2'), hro: designation('hr-officer', hr, 'HR Officer', 'O1'),
      fm: designation('fin-manager', fin, 'Finance Manager', 'M2'), acc: designation('accountant', fin, 'Accountant', 'O2'),
      ito: designation('it-officer', it, 'IT Officer', 'O2'),
      sm: designation('sales-manager', sales, 'Sales Manager', 'M1'), se: designation('sales-exec', sales, 'Sales Executive', 'O1'),
      sup: designation('supervisor', prd, 'Production Supervisor', 'S1'), opr: designation('operator', prd, 'Machine Operator', 'W1'),
      qci: designation('qc-inspector', qc, 'QC Inspector', 'W2'), sg: designation('security', adm, 'Security Guard', 'W1'), ao: designation('admin-officer', adm, 'Admin Officer', 'O1'),
    };
    const wageTypes: WageType[] = [];
    for (const [key, name, calculationBasis] of [['monthly', 'Monthly Salaried', 'Monthly'], ['daily', 'Daily Wager', 'Daily']] as const) {
      wageTypes.push({ id: `wt-${key}`, companyId: company.id, name, calculationBasis, status: 'Active', code: generateMasterCode('wageType', { name, title: '', company }, wageTypes) });
    }
    const zones: Zone[] = [];
    const ucTowns: UcTown[] = [];
    for (const [key, name, towns] of [['north', 'North Zone', ['Shadman', 'Model Town']], ['south', 'South Zone', ['Township', 'Johar Town']]] as const) {
      const zone: Zone = { id: `zone-${key}`, companyId: company.id, name, status: 'Active', code: generateMasterCode('zone', { name, title: '', company }, zones) };
      zones.push(zone);
      towns.forEach((town, index) => ucTowns.push({ id: `uc-${key}-${index + 1}`, zoneId: zone.id, name: town, status: 'Active', code: generateMasterCode('ucTown', { name: town, title: '', zone }, ucTowns) }));
    }

    // ── Employees ──
    const officeShift: Shift = { id: 'shift-office', name: 'Office Shift', startTime: '09:00', endTime: '17:00', graceMinutes: 15, halfDayMinutes: 120, overtimeMultiplier: 2, breakMinutes: 60, overtimeAfterMinutes: 480, workingDays: [1, 2, 3, 4, 5, 6], fridayStartTime: '09:00', fridayEndTime: '17:30' };
    const factoryShift: Shift = { ...officeShift, id: 'shift-factory', name: 'Factory Morning Shift', startTime: '08:00', endTime: '16:00', fridayStartTime: '08:00', fridayEndTime: '16:30' };
    const prefix = companyInitialsPrefix(company.name || company.legalName);
    const sequence = new Map<string, number>();
    const codeFor = (dept: Department) => {
      const token = dept.code.split('-').filter(Boolean).pop()!.replace(/[^A-Z0-9]/g, '');
      const next = (sequence.get(token) || 0) + 1;
      sequence.set(token, next);
      return `${prefix}-${token}-${String(next).padStart(5, '0')}`;
    };
    const monthTwoStart = payrollMonths[1] ? ymd(payrollMonths[1].year, payrollMonths[1].month, 1) : seedStart;
    const newJoinerDate = addDays(monthTwoStart, 16);
    type Seed = [key: string, name: string, gender: string, dept: Department, des: Designation, salary: number, joined: string, extra?: Partial<Employee>];
    const seeds: Seed[] = [
      ['e01', 'Ayesha Siddiqui', 'Female', hr, D.hrm, 210000, '2019-03-01', { maritalStatus: 'Married' }],
      ['e02', 'Bilal Ahmed', 'Male', hr, D.hro, 85000, '2022-06-01'],
      ['e03', 'Imran Qureshi', 'Male', fin, D.fm, 260000, '2018-01-15', { perquisiteVehicleMonthly: 15000 }],
      ['e04', 'Fatima Noor', 'Female', fin, D.acc, 121000, '2021-09-01'],
      ['e05', 'Hassan Raza', 'Male', it, D.ito, 110000, '2023-02-01'],
      ['e06', 'Sana Javed', 'Female', sales, D.sm, 180000, '2020-04-01'],
      ['e07', 'Usman Tariq', 'Male', sales, D.se, 70000, '2024-01-08', { zoneId: 'zone-north', ucTownId: 'uc-north-1', zone: 'North Zone', ucTown: 'Shadman' }],
      ['e08', 'Kashif Mehmood', 'Male', prd, D.sup, 90000, '2017-08-01'],
      ['e09', 'Zainab Bibi', 'Female', prd, D.opr, 42000, '2022-11-01'],
      ['e10', 'Naveed Akhtar', 'Male', prd, D.opr, 1600, '2025-03-03', { wageType: 'Daily Wager', wageTypeId: 'wt-daily', providentFundOptIn: false, gratuityOptIn: false }],
      ['e11', 'Rabia Anwar', 'Female', qc, D.qci, 52000, '2023-05-15'],
      ['e12', 'Tariq Javed', 'Male', qc, D.qci, 50000, '2021-05-10'],
      ['e13', 'Shahid Iqbal', 'Male', adm, D.sg, 38000, '2020-10-01', { eobiEnabled: true }],
      ['e14', 'Mariam Khan', 'Female', adm, D.ao, 65000, newJoinerDate, { probationEndDate: addDays(newJoinerDate, 90) }],
    ];
    const managerFor: Record<string, string> = { hr: 'e01', fin: 'e03', sales: 'e06', prd: 'e08', qc: 'e08', adm: 'e01', it: 'e03' };
    const employees: Employee[] = seeds.map(([key, fullName, gender, dept, des, basicSalary, dateOfJoining, extra = {}], index) => {
      const n = String(index + 1).padStart(2, '0');
      const deptKey = dept.id.replace('dep-', '');
      const isFactory = dept === prd || dept === qc;
      const isNewJoiner = key === 'e14';
      return {
        id: `emp-${key}`, companyId: company.id, branchId: dept.branchId, departmentId: dept.id, designationId: des.id,
        employeeCode: codeFor(dept), fullName, gender, email: `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
        contactNumber: `+92300${String(5550000 + index * 137).padStart(7, '0')}`, cnic: `35202-${String(4100000 + index * 7919).padStart(7, '0')}-${(index % 9) + 1}`,
        cnicExpiryDate: key === 'e09' ? addDays(today, 25) : '2032-06-30', dateOfBirth: `${1980 + (index % 15)}-${pad((index % 12) + 1)}-${pad((index % 27) + 1)}`,
        dateOfJoining, status: 'Active', wageType: 'Monthly Salaried', wageTypeId: 'wt-monthly', employmentType: 'Permanent', basicSalary,
        shiftId: isFactory ? factoryShift.id : officeShift.id, shift: isFactory ? factoryShift : officeShift,
        providentFundOptIn: true, providentFundRate: 5, gratuityOptIn: true,
        bankName: index % 3 === 0 ? 'Habib Bank Limited (HBL)' : index % 3 === 1 ? 'Meezan Bank' : 'United Bank Limited (UBL)',
        bankBranchName: index % 2 ? 'Gulberg' : 'Main Branch', bankAccountNumber: `0${n}7${String(31415926 + index * 2718).padStart(10, '0')}`,
        iban: `PK${String(10 + index).padStart(2, '0')}${index % 3 === 0 ? 'HABB' : index % 3 === 1 ? 'MEZN' : 'UNIL'}${String(1000000000000000 + index * 7777777).slice(0, 16)}`,
        eobiNumber: `EOBI-${2000 + index * 17}`, socialSecurityNumber: isNewJoiner ? '' : `PESSI-${7700 + index * 13}`,
        socialSecurityExemptionReason: isNewJoiner ? 'Registration filed, awaiting PESSI number' : undefined,
        // An individual's NTN is their CNIC number.
        ntn: `35202${String(4100000 + index * 7919).padStart(7, '0')}${(index % 9) + 1}`, fbrEnabled: true, eobiEnabled: true,
        reportingManagerId: managerFor[deptKey] && managerFor[deptKey] !== key ? `emp-${managerFor[deptKey]}` : undefined,
        workerCategory: des.grade.startsWith('M') ? 'Managerial' : des.grade.startsWith('S') ? 'Supervisory' : 'Worker',
        emergencyContactName: 'Next of kin', emergencyContactNumber: `+92321${String(4440000 + index).padStart(7, '0')}`,
        bankVerifiedAt: isNewJoiner ? undefined : iso(addDays(dateOfJoining, 7)), bankVerifiedBy: isNewJoiner ? undefined : 'HR Manager',
        probationConfirmedAt: isNewJoiner ? undefined : iso(addDays(dateOfJoining, 92)),
        onboardingChecklist: isNewJoiner
          ? { cnicCopy: { done: true, at: iso(newJoinerDate), by: 'HR Officer' }, appointmentLetter: { done: true, at: iso(newJoinerDate), by: 'HR Officer' } }
          : { cnicCopy: { done: true }, appointmentLetter: { done: true }, bankVerified: { done: true }, policyAcknowledged: { done: true } },
        ...extra,
      } as Employee;
    });
    const emp = (key: string) => employees.find(item => item.id === `emp-${key}`)!;

    // ── Holidays (Pakistan; Islamic dates are approximate for the demo) ──
    const holidays: Holiday[] = [
      ['Independence Day', `${openMonth.year}-08-14`, true], ['Eid Milad-un-Nabi (approx.)', `${openMonth.year}-08-26`, false],
      ['Iqbal Day', `${openMonth.year}-11-09`, true], ['Quaid-e-Azam Day', `${openMonth.year}-12-25`, true],
      ['Kashmir Solidarity Day', `${openMonth.year + 1}-02-05`, true], ['Pakistan Day', `${openMonth.year + 1}-03-23`, true], ['Labour Day', `${openMonth.year + 1}-05-01`, true],
    ].map(([name, date, isRecurring], index) => ({ id: `hol-${index + 1}`, name: name as string, date: date as string, type: 'Public', isRecurring: isRecurring as boolean, description: 'Gazetted public holiday' }));
    const holidayDates = new Set(holidays.map(item => item.date));
    const isWorkday = (employee: Employee, date: string) => (employee.shift?.workingDays || [1, 2, 3, 4, 5, 6]).includes(weekday(date)) && !holidayDates.has(date);
    const nthWorkday = (year: number, month: number, n: number) => {
      let count = 0;
      for (let day = 1; day <= daysIn(year, month); day += 1) {
        const date = ymd(year, month, day);
        if (weekday(date) !== 0 && !holidayDates.has(date) && ++count === n) return date;
      }
      return ymd(year, month, daysIn(year, month));
    };
    // Consecutive working days with no Sunday or holiday inside the range, so a leave never spans a day off.
    const workdaysFrom = (start: string, count: number) => {
      for (let first = start; ; first = addDays(first, 1)) {
        const dates = Array.from({ length: count }, (_, offset) => addDays(first, offset));
        if (dates.every(date => weekday(date) !== 0 && !holidayDates.has(date))) return dates;
      }
    };

    // ── Leave ──
    const leaves: LeaveRequest[] = [];
    const leave = (id: string, key: string, leaveType: LeaveRequest['leaveType'], dates: string[], status: LeaveRequest['status'], reason: string) => {
      const request: LeaveRequest = { id, employeeId: `emp-${key}`, leaveType, startDate: dates[0], endDate: dates[dates.length - 1], totalDays: dates.length, reason, status, appliedOn: addDays(dates[0], -5) };
      if (status !== 'Pending') Object.assign(request, { approvedBy: 'Ayesha Siddiqui (HR Manager)', approvedOn: addDays(dates[0], -3) });
      leaves.push(request);
      return request;
    };
    const [m1, m2, m3] = [payrollMonths[0], payrollMonths[1], payrollMonths[2]];
    if (m1) leave('lv-01', 'e01', 'Annual', workdaysFrom(nthWorkday(m1.year, m1.month, 8), 3), 'Approved', 'Family visit to Islamabad');
    if (m2) leave('lv-02', 'e04', 'Sick', [nthWorkday(m2.year, m2.month, 5)], 'Approved', 'Fever, medical certificate attached');
    if (m2) leave('lv-03', 'e11', 'Unpaid', workdaysFrom(nthWorkday(m2.year, m2.month, 12), 2), 'Approved', 'Personal matter, paid leave balance kept for later');
    if (m3) leave('lv-04', 'e09', 'Casual', [nthWorkday(m3.year, m3.month, 10)], 'Approved', 'Child school meeting');
    if (m3) leave('lv-05', 'e07', 'Annual', workdaysFrom(nthWorkday(m3.year, m3.month, 18), 2), 'Rejected', 'Requested during month-end sales closing');
    const futureDates = workdaysFrom(addDays(today, 3), 2);
    leave('lv-06', 'e02', 'Annual', futureDates, 'Approved', 'Sister wedding');
    leave('lv-07', 'e11', 'Casual', [workdaysFrom(addDays(today, 1), 1)[0]], 'Pending', 'Applied from the mobile app: bank work');
    leave('lv-08', 'e05', 'Annual', workdaysFrom(addDays(today, 7), 4), 'Pending', 'Umrah travel');
    const onLeave = (employeeId: string, date: string) => leaves.some(item => item.employeeId === employeeId && item.status === 'Approved' && item.startDate <= date && item.endDate >= date);

    // ── Mobile duty for field sales ──
    const sitePoint = { lat: headOffice.geofenceLatitude ?? 31.5204, lng: headOffice.geofenceLongitude ?? 74.3587 };
    const duty: MobileDutyAuthorization = {
      id: 'mda-e07', employeeId: 'emp-e07', dutyType: 'Market / field duty', validFrom: seedStart, validTo: `${openMonth.year}-12-31`,
      instructions: 'Visit retailers in North Zone daily; punch in/out from the mobile app and check in at each shop.', assignedLocation: 'North Zone markets',
      allowFieldVisits: true, status: 'Approved', assignedByUserId: 'demo-hr-manager', assignedByName: 'Ayesha Siddiqui (HR Manager)', createdAt: iso(seedStart), updatedAt: iso(seedStart),
    };

    // ── Attendance: every rostered day from the first seeded month to yesterday ──
    const attendances: AttendanceLog[] = [];
    const absentDays = new Set<string>();
    if (m3) absentDays.add(`emp-e13|${nthWorkday(m3.year, m3.month, 6)}`); // unexplained absence → salary deduction
    if (m2) absentDays.add(`emp-e10|${nthWorkday(m2.year, m2.month, 9)}`); // daily wager not paid for the day
    const overtimeKeys = new Set(['e08', 'e09', 'e10']);
    const methodFor = (key: string): AttendanceLog['method'] => key === 'e07' ? 'Mobile GPS' : ['e05', 'e06', 'e14'].includes(key) ? 'Camera' : 'Biometric';
    // Real phones never report the same coordinates twice; identical fixes are what the GPS-spoofing check flags.
    const location = (date: string, time: string, offset: number, address: string) => ({
      latitude: Number((sitePoint.lat + 0.018 + offset * 0.004 + (noise(`lat|${date}|${time}`) - 0.5) * 0.006).toFixed(6)),
      longitude: Number((sitePoint.lng + 0.011 - offset * 0.003 + (noise(`lng|${date}|${time}`) - 0.5) * 0.006).toFixed(6)),
      accuracyMeters: 8 + Math.round(noise(`acc|${date}|${time}`) * 14), capturedAt: iso(date, time), source: 'device-gps' as const, address,
    });
    for (const employee of employees) {
      const key = employee.id.replace('emp-', '');
      const shift = employee.shift!;
      const [startH, startM] = shift.startTime.split(':').map(Number);
      for (let date = employee.dateOfJoining > seedStart ? employee.dateOfJoining : seedStart; date <= yesterday; date = addDays(date, 1)) {
        if (!isWorkday(employee, date) || onLeave(employee.id, date) || absentDays.has(`${employee.id}|${date}`)) continue;
        const r = noise(`${employee.id}|${date}`);
        const start = startH * 60 + startM;
        let inMinutes = start - 12 + Math.round(r * 24); // mostly within the 15-minute grace
        if (r > 0.93) inMinutes = start + 25 + Math.round(r * 20); // occasionally late
        if (key === 'e02' && m1 && date === nthWorkday(m1.year, m1.month, 4)) inMinutes = start + 150; // half day
        const endTime = weekday(date) === 5 && shift.fridayEndTime ? shift.fridayEndTime : shift.endTime;
        const [endH, endM] = endTime.split(':').map(Number);
        let outMinutes = endH * 60 + endM + Math.round(noise(`out|${employee.id}|${date}`) * 20);
        if (overtimeKeys.has(key) && weekday(date) !== 5 && noise(`ot|${employee.id}|${date}`) > 0.55) outMinutes += 120; // two hours overtime
        const punchIn = minutesToTime(inMinutes);
        const punchOut = minutesToTime(outMinutes);
        const evaluated = evaluateAttendanceTimes(punchIn, punchOut, shift, [], date);
        const method = methodFor(key);
        const log: AttendanceLog = {
          id: `att-${employee.id}-${date}`, employeeId: employee.id, date, punchIn, punchOut, method, status: evaluated.status, overtimeMinutes: evaluated.overtimeMinutes,
          outReason: 'End of Shift', employeeBranchId: employee.branchId, terminalBranchId: employee.branchId, lastPunchAt: iso(date, punchOut),
          ...(method !== 'Mobile GPS' && { terminalId: employee.branchId === headOffice.id ? 'KIOSK-HQ-01' : 'KIOSK-SITE-01', terminalLocation: employee.branchId === headOffice.id ? 'Head Office Reception' : 'Factory Gate' }),
        } as AttendanceLog;
        if (method === 'Camera') log.biometricMatch = { kind: 'face', score: 0.29, threshold: 0.45, strengthPercent: 80, lowConfidence: false };
        if (method === 'Biometric') log.biometricMatch = { kind: 'fingerprint', score: 1200, threshold: 21474, strengthPercent: 94, lowConfidence: false };
        if (method === 'Mobile GPS') {
          const visitIn = minutesToTime(inMinutes + 90);
          const visitOut = minutesToTime(inMinutes + 150);
          Object.assign(log, {
            mobileDutyAuthorizationId: duty.id, geofenceStatus: 'authorized-offsite', punchInReasonCategory: 'Field duty', punchInReasonNote: 'Starting market visits',
            punchOutReasonCategory: 'End of field duty', punchOutReasonNote: 'Route completed',
            punchInLocation: location(date, punchIn, 0, 'Shadman Market'), punchOutLocation: location(date, punchOut, 2, 'Model Town Link Road'),
            latitude: location(date, punchIn, 0, '').latitude, longitude: location(date, punchIn, 0, '').longitude, locationAccuracyMeters: location(date, punchIn, 0, '').accuracyMeters, locationSource: 'device-gps',
            fieldVisits: [{ id: `visit-${date}`, clientName: `Retailer ${1 + Math.floor(noise(`client|${date}`) * 40)}`, checkIn: visitIn, checkOut: visitOut,
              checkInReasonCategory: 'Client visit', checkInReasonNote: 'Order booking', checkOutReasonCategory: 'Visit completed', checkOutReasonNote: 'Order taken',
              checkInLocation: location(date, visitIn, 1, 'Retail outlet'), checkOutLocation: location(date, visitOut, 1, 'Retail outlet'), method: 'Mobile GPS', verificationMethod: 'Camera' }],
          });
        }
        attendances.push(log);
      }
    }
    const attendanceOf = (key: string, date: string) => attendances.find(item => item.id === `att-emp-${key}-${date}`);
    // Closed months: one approved regularization (forgot to punch out) so the review trail is visible.
    if (m2) {
      const fixed = attendanceOf('e12', nthWorkday(m2.year, m2.month, 7));
      if (fixed) Object.assign(fixed, { regularizationRequested: true, regularizationReason: 'Forgot to punch out; left at 16:05 after shift', regularizationApproved: true,
        requestedAt: iso(fixed.date, '17:00:00'), requestedById: 'emp-e12', reviewedAt: iso(addDays(fixed.date, 1)), reviewedBy: 'Kashif Mehmood (Supervisor)', reviewedById: 'demo-line-manager', reviewComment: 'Confirmed with gate register' });
    }
    // Open month: items waiting for HR, so the review queue is not empty.
    const openDays = attendances.filter(item => item.date.startsWith(`${openMonth.year}-${pad(openMonth.month)}`));
    const lastOpen = (key: string) => openDays.filter(item => item.employeeId === `emp-${key}`).sort((a, b) => b.date.localeCompare(a.date))[0];
    const missing = lastOpen('e09');
    if (missing) { delete missing.punchOut; missing.overtimeMinutes = 0; missing.outReason = undefined; }
    const regularize = lastOpen('e12');
    if (regularize) Object.assign(regularize, { regularizationRequested: true, regularizationReason: 'Kiosk was offline at the gate; punched late by mistake', requestedAt: iso(regularize.date, '18:00:00'), requestedById: 'emp-e12' });
    const lowConfidence = lastOpen('e05');
    if (lowConfidence) lowConfidence.biometricMatch = { kind: 'face', score: 0.43, threshold: 0.45, strengthPercent: 10, lowConfidence: true };

    // ── Loans ──
    const loans: LoanAdvance[] = [
      { id: 'loan-e08', employeeId: 'emp-e08', type: 'Loan', principalAmount: 120000, approvedAmount: 120000, disbursedDate: addDays(seedStart, -20), totalInstallments: 12,
        remainingInstallments: 12, monthlyInstallment: 10000, totalRepaid: 0, reason: 'Motorcycle purchase', status: 'Active', appliedOn: addDays(seedStart, -35), approvedBy: 'Imran Qureshi (Finance Manager)', approvedOn: addDays(seedStart, -25) },
      { id: 'adv-e10', employeeId: 'emp-e10', type: 'Advance', principalAmount: 15000, approvedAmount: 0, disbursedDate: '', totalInstallments: 3, remainingInstallments: 3,
        monthlyInstallment: 5000, totalRepaid: 0, reason: 'Child school admission fee', status: 'Pending', appliedOn: yesterday },
    ];

    // ── Payroll adjustments ──
    const adjustments: PayrollAdjustment[] = [];
    const adjustment = (id: string, key: string, period: { year: number; month: number }, type: PayrollAdjustment['type'], amount: number, taxable: boolean, reason: string, status: PayrollAdjustment['status']) => {
      adjustments.push({ id, employeeId: `emp-${key}`, periodMonth: period.month, periodYear: period.year, type, amount, taxable, reason, status, createdAt: iso(ymd(period.year, period.month, 20)),
        createdById: 'demo-payroll-maker', createdBy: 'Payroll Officer', ...(status !== 'Pending' && { reviewedAt: iso(ymd(period.year, period.month, 22)), reviewedById: 'demo-payroll-checker', reviewedBy: 'Finance Manager' }) });
    };
    if (m2) adjustment('adj-commission-e07', 'e07', m2, 'Commission', 18000, true, 'Sales target achieved (112%)', 'Approved');
    if (m3) adjustment('adj-fuel-e07', 'e07', m3, 'Reimbursement', 6500, false, 'Fuel for field visits (receipts on file)', 'Approved');
    if (m3) adjustment('adj-bonus-e08', 'e08', m3, 'Bonus', 10000, true, 'Zero-defect production month', 'Approved');
    adjustment('adj-bonus-e09', 'e09', openMonth, 'Bonus', 5000, true, 'Best operator of the month', 'Pending');

    // ── Attendance registers and payroll, month by month (same steps as the Attendance and Payroll screens) ──
    const periods = [];
    const runs: PayrollRun[] = [];
    const payslips: Payslip[] = [];
    const notifications: AppNotification[] = [];
    for (const [index, period] of payrollMonths.entries()) {
      const lockedOn = iso(addDays(ymd(period.year, period.month, daysIn(period.year, period.month)), 2), '11:00:00');
      const locked = createAttendancePeriod(attendances, employees, leaves, holidays, period.month, period.year, 'Ayesha Siddiqui (HR Manager)', lockedOn);
      periods.push(locked);
      const runId = `run-${period.month}-${period.year}-seed`;
      const sheets = employees.filter(item => item.status === 'Active' || item.status === 'On Leave').map(item => ({
        ...computePayslipDetails(item, period.month, period.year, attendances, leaves, config, taxSlabs, departments, designations, companyBranches, loans, wageTypes, holidays, payslips, adjustments, locked.registerRows),
        id: `${runId}-${item.id}`, payrollRunId: runId,
      }));
      const critical = payrollPreflight(employees, sheets, payslips, companyBranches, config, wageTypes).filter(issue => issue.severity === 'Critical');
      if (critical.length) throw new Error(`Payroll preflight failed for ${monthName(period.year, period.month)}: ${critical.map(issue => `${issue.employeeName}: ${issue.message}`).join('; ')}`);
      const isLast = index === payrollMonths.length - 1;
      const createdAt = addDays(ymd(period.year, period.month, daysIn(period.year, period.month)), 3);
      const sum = (field: keyof Payslip) => sheets.reduce((total, sheet) => total + Number(sheet[field] || 0), 0);
      const run: PayrollRun = {
        id: runId, title: `Payroll - ${monthName(period.year, period.month)}`, periodMonth: period.month, periodYear: period.year,
        startDate: ymd(period.year, period.month, 1), endDate: ymd(period.year, period.month, daysIn(period.year, period.month)), status: isLast ? 'Approved' : 'Disbursed', createdAt,
        totalGrossPay: sum('grossSalary'), totalDeductions: sum('totalDeductions'), totalNetPay: sum('netSalary'), totalEobiEmployer: sum('eobiEmployerContribution'),
        totalSocialSecurityEmployer: sum('pessiEmployerContribution'), employeeCount: sheets.length, statutoryConfigId: config.id, statutoryEffectiveFrom: config.effectiveFrom,
        createdById: 'demo-payroll-maker', attendancePeriodId: locked.id, attendanceIntegrityHash: locked.integrityHash, attendanceRegisterHash: locked.registerHash,
        preflightCriticalCount: 0, preflightWarningCount: payrollPreflight(employees, sheets, payslips, companyBranches, config, wageTypes).length,
        approvedAt: iso(addDays(createdAt, 1), '15:00:00'), approvedBy: 'Imran Qureshi (Finance Manager)', approvedById: 'demo-payroll-checker',
        bankAdviceChecksum: crypto.createHash('sha256').update(bankAdvicePayload(sheets)).digest('hex'), bankAdviceGeneratedAt: iso(addDays(createdAt, 2), '10:00:00'),
        bankAdviceGeneratedById: 'demo-payroll-maker', bankAdviceEmployeeCount: sheets.length, bankAdviceTotal: sum('netSalary'), bankAdviceProfile: 'Generic CSV',
        auditTrail: [
          { action: 'Created', at: iso(createdAt, '12:00:00'), by: 'Payroll Officer', actorId: 'demo-payroll-maker' },
          { action: 'Approved', at: iso(addDays(createdAt, 1), '15:00:00'), by: 'Imran Qureshi (Finance Manager)', actorId: 'demo-payroll-checker' },
        ],
      };
      if (!isLast) {
        const paidOn = addDays(createdAt, 3);
        Object.assign(run, {
          disbursedAt: iso(paidOn, '11:30:00'), disbursedBy: 'Treasury Officer', disbursedById: 'demo-finance-disburser', disbursementReference: `HBL-IBFT-${period.year}${pad(period.month)}-0${index + 1}`,
          taxDeposit: { cprNumber: `IT-${period.year}${pad(period.month)}-${7710 + index}`, amount: sum('incomeTaxDeduction'), depositedOn: addDays(paidOn, 10), recordedAt: iso(addDays(paidOn, 10)), recordedById: 'demo-payroll-maker', recordedBy: 'Payroll Officer' },
        });
        run.auditTrail!.push({ action: 'Disbursed', at: iso(paidOn, '11:30:00'), by: 'Treasury Officer', actorId: 'demo-finance-disburser' });
        for (const sheet of sheets) {
          notifications.push({ id: `payroll-disbursed-${runId}-${sheet.employeeId}`, type: 'payroll_processed', title: 'Salary has been disbursed',
            message: `Your salary for ${run.title} has been disbursed. Check your payslip and bank account for the payment.`,
            titleUrdu: 'تنخواہ جاری کر دی گئی ہے', messageUrdu: `${run.title} کی آپ کی تنخواہ جاری کر دی گئی ہے۔ ادائیگی کے لیے اپنی پے سلپ اور بینک اکاؤنٹ دیکھیں۔`,
            targetEmployeeId: sheet.employeeId, createdAt: iso(paidOn, '11:31:00'), readBy: [], priority: 'high' });
        }
        // Loan balances move only when salary is actually paid (as on the Payroll screen).
        for (const loan of loans) {
          if (loan.status !== 'Active' || !sheets.some(sheet => sheet.employeeId === loan.employeeId && sheet.loanRepaymentDeduction > 0)) continue;
          loan.remainingInstallments -= 1;
          loan.totalRepaid += loan.monthlyInstallment;
          if (loan.remainingInstallments === 0) loan.status = 'Closed';
        }
      }
      const used = new Set(sheets.flatMap(sheet => sheet.payrollAdjustmentIds || []));
      for (const item of adjustments) if (used.has(item.id)) item.payrollRunId = runId;
      runs.push(run);
      payslips.push(...sheets);
    }

    // ── Salary revision, appraisal, lifecycle, gratuity, assets, recruitment ──
    const revisions: SalaryRevision[] = [
      { id: 'rev-e04-annual', employeeId: 'emp-e04', previousSalary: 110000, newSalary: 121000, incrementAmount: 11000, incrementPercentage: 10, effectiveDate: seedStart,
        reason: 'Annual increment from performance review (rating 4.4/5)', approvedBy: 'Imran Qureshi (Finance Manager)', approvedOn: addDays(seedStart, -4), type: 'Annual Increment', status: 'Approved',
        sourcePerformanceReviewId: 'pr-e04', createdById: 'demo-hr-manager', createdBy: 'Ayesha Siddiqui (HR Manager)', approvedById: 'demo-payroll-checker' },
      { id: 'rev-e02-draft', employeeId: 'emp-e02', previousSalary: 85000, newSalary: 93500, incrementAmount: 8500, incrementPercentage: 10, effectiveDate: ymd(openMonth.year, openMonth.month, 1),
        reason: 'Annual increment proposal; awaiting finance approval', approvedBy: '', approvedOn: '', type: 'Annual Increment', status: 'Draft', createdById: 'demo-hr-manager', createdBy: 'Ayesha Siddiqui (HR Manager)' },
    ];
    const reviews: PerformanceReview[] = [
      { id: 'pr-e04', employeeId: 'emp-e04', reviewerId: 'emp-e03', period: `Annual-${openMonth.year - 1}`, reviewDate: addDays(seedStart, -15),
        kpis: [{ kpi: 'Month-end close on time', weight: 40, selfScore: 5, managerScore: 5 }, { kpi: 'Reconciliation accuracy', weight: 40, selfScore: 4, managerScore: 4 }, { kpi: 'Team support', weight: 20, selfScore: 4, managerScore: 4 }],
        overallSelfRating: 4.4, overallManagerRating: 4.4, strengths: 'Reliable month-end close', areasOfImprovement: 'Automate bank reconciliation', managerComments: 'Recommended for 10% increment',
        status: 'Approved', incrementRecommended: true, incrementPercent: 10, approvedBy: 'Ayesha Siddiqui (HR Manager)', approvedOn: addDays(seedStart, -6), salaryRevisionId: 'rev-e04-annual' },
      { id: 'pr-e07', employeeId: 'emp-e07', reviewerId: 'emp-e06', period: `H1-${openMonth.year}`, reviewDate: addDays(today, -6),
        kpis: [{ kpi: 'Monthly sales target', weight: 60, selfScore: 4, managerScore: 4 }, { kpi: 'New retailers onboarded', weight: 40, selfScore: 4, managerScore: 3 }],
        overallSelfRating: 4, overallManagerRating: 3.6, strengths: 'Strong retailer relationships', areasOfImprovement: 'Timely visit reports', managerComments: 'Good half; needs consistent reporting',
        status: 'Submitted', incrementRecommended: false, trainingRecommended: true },
    ];
    const resignationDate = ymd(openMonth.year, openMonth.month, daysIn(openMonth.year, openMonth.month));
    const lifecycle: LifecycleRequest[] = [
      { id: 'lc-e14-probation', employeeId: 'emp-e14', type: 'Probation Confirmation', effectiveDate: emp('e14').probationEndDate!, reason: 'Probation completed with satisfactory feedback from department head',
        status: 'Pending', createdAt: iso(yesterday), createdById: 'demo-hr-officer', createdBy: 'Bilal Ahmed (HR Officer)' },
      { id: 'lc-e12-resign', employeeId: 'emp-e12', type: 'Resignation', effectiveDate: resignationDate, reason: 'Resigned to join family business in Multan; one month notice served',
        status: 'Pending', noticeDays: 0, leaveEncashDays: 6, createdAt: iso(addDays(today, -10)), createdById: 'demo-hr-officer', createdBy: 'Bilal Ahmed (HR Officer)' },
    ];
    // Settlement preview HR will see when approving the resignation (same calculation the approval uses).
    const settlementPreview = calculateFinalSettlement(emp('e12'), 'Resignation', resignationDate, 6, 0, config, wageTypes);
    const gratuity: GratuitySettlement[] = [];
    const assets: CompanyAsset[] = [
      { id: 'ast-lpt-1', assetTag: 'ASSET-LPT-001', name: 'Dell Latitude 5440', category: 'Laptop', serialNumber: 'DL5440-8812', purchaseDate: '2025-02-10', purchaseCost: 285000, condition: 'Good', assignedTo: 'emp-e03', assignedDate: '2025-02-15', status: 'Assigned' },
      { id: 'ast-lpt-2', assetTag: 'ASSET-LPT-002', name: 'HP ProBook 450', category: 'Laptop', serialNumber: 'HP450-1203', purchaseDate: '2025-06-01', purchaseCost: 240000, condition: 'Good', assignedTo: 'emp-e05', assignedDate: '2025-06-03', status: 'Assigned' },
      { id: 'ast-mob-1', assetTag: 'ASSET-MOB-001', name: 'Samsung Galaxy A35', category: 'Mobile', serialNumber: 'SMA35-5531', purchaseDate: '2025-12-01', purchaseCost: 95000, condition: 'Good', assignedTo: 'emp-e07', assignedDate: addDays(seedStart, -3), status: 'Assigned', notes: 'Field attendance phone' },
      { id: 'ast-sim-1', assetTag: 'ASSET-SIM-001', name: 'Jazz corporate SIM', category: 'SIM Card', purchaseDate: '2025-12-01', purchaseCost: 500, condition: 'New', assignedTo: 'emp-e07', assignedDate: addDays(seedStart, -3), status: 'Assigned' },
      { id: 'ast-tool-1', assetTag: 'ASSET-TL-004', name: 'Digital vernier caliper', category: 'Tool', purchaseDate: '2024-03-12', purchaseCost: 18000, condition: 'Fair', assignedTo: 'emp-e12', assignedDate: '2024-03-15', status: 'Assigned', notes: 'Return before final settlement' },
      { id: 'ast-lpt-3', assetTag: 'ASSET-LPT-003', name: 'Lenovo ThinkPad E14', category: 'Laptop', purchaseDate: addDays(today, -20), purchaseCost: 210000, condition: 'New', status: 'Available', notes: 'Reserved for new admin officer' },
    ];
    const jobs: JobPosting[] = [
      { id: 'job-qc', title: 'QC Inspector (replacement)', departmentId: qc.id, branchId: qc.branchId, vacancies: 1, experienceRequired: '2-4 years', qualificationRequired: 'DAE Textile / B.Sc',
        salaryRange: 'PKR 48,000 - 55,000', jobType: 'Full Time', postedDate: addDays(today, -8), closingDate: addDays(today, 14), status: 'Open', description: 'Replacement for a resigning inspector; fabric and stitching inspection.' },
      { id: 'job-sales', title: 'Sales Executive - South Zone', departmentId: sales.id, branchId: sales.branchId, vacancies: 2, experienceRequired: '1-3 years', qualificationRequired: 'Graduate',
        salaryRange: 'PKR 60,000 - 75,000 + commission', jobType: 'Full Time', postedDate: addDays(today, -20), closingDate: addDays(today, 5), status: 'Open', description: 'Field sales with mobile attendance and daily retailer visits.' },
    ];
    const applications: JobApplication[] = [
      { id: 'app-1', jobPostingId: 'job-qc', applicantName: 'Adeel Hussain', applicantEmail: 'adeel.h@example.com', applicantPhone: '+923335550101', appliedDate: addDays(today, -6), stage: 'Applied', expectedSalary: 50000 },
      { id: 'app-2', jobPostingId: 'job-qc', applicantName: 'Sadia Parveen', applicantEmail: 'sadia.p@example.com', applicantPhone: '+923335550102', appliedDate: addDays(today, -5), stage: 'Interview Scheduled', interviewDate: addDays(today, 2), expectedSalary: 52000 },
      { id: 'app-3', jobPostingId: 'job-sales', applicantName: 'Waqas Ali', applicantEmail: 'waqas.a@example.com', applicantPhone: '+923335550103', appliedDate: addDays(today, -15), stage: 'Offer Extended', offerAmount: 68000, expectedSalary: 70000, interviewNotes: 'Strong field experience' },
      { id: 'app-4', jobPostingId: 'job-sales', applicantName: 'Hira Batool', applicantEmail: 'hira.b@example.com', applicantPhone: '+923335550104', appliedDate: addDays(today, -14), stage: 'Rejected', rejectionReason: 'Not available for field travel' },
    ];
    notifications.push(
      { id: 'ntf-holiday', type: 'holiday_reminder', title: 'Upcoming public holiday', message: 'Iqbal Day (9 November) is a public holiday. Offices and the factory remain closed.', createdAt: iso(addDays(today, -1)), readBy: [], priority: 'low' },
      { id: 'ntf-leave-e02', type: 'leave_approved', title: 'Leave approved', message: `Your annual leave from ${futureDates[0]} to ${futureDates[futureDates.length - 1]} has been approved.`, targetEmployeeId: 'emp-e02', createdAt: iso(addDays(today, -1)), readBy: [], priority: 'medium' },
      { id: 'ntf-review-e07', type: 'review_due', title: 'Performance review submitted', message: 'Your H1 review was submitted by your manager and is awaiting HR.', targetEmployeeId: 'emp-e07', createdAt: iso(addDays(today, -6)), readBy: [], priority: 'low' },
      { id: 'ntf-asset-e07', type: 'asset_assigned', title: 'Asset assigned', message: 'Samsung Galaxy A35 and a corporate SIM are assigned to you for field attendance.', targetEmployeeId: 'emp-e07', createdAt: iso(addDays(seedStart, -3)), readBy: ['emp-e07'], priority: 'low' },
    );

    // ── Write everything in one transaction ──
    await client.query('BEGIN');
    for (const table of CLEARED_TABLES) {
      const exists = (await client.query(`SELECT to_regclass($1) AS name`, [`public.${table}`])).rows[0].name;
      if (exists) await client.query(`DELETE FROM ${table}`);
    }
    if ((await client.query(`SELECT to_regclass('public.hr_documents') AS name`)).rows[0].name) {
      await client.query(`DELETE FROM hr_documents WHERE collection_name = ANY($1::text[])`, [CLEARED_LEGACY_COLLECTIONS]);
    }
    const counts = new Map<string, number>();
    // Same columns the server's PUT /api/documents writes, so the app reads these rows exactly like its own.
    const put = async (table: string, input: object, ownerId?: string) => {
      const record = input as Record<string, any>;
      const data = JSON.stringify(Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)));
      const employeeId = record.employeeId || ownerId || null;
      const status = typeof record.status === 'string' ? record.status : null;
      if (table === 'attendances') {
        await client.query(`INSERT INTO attendances(id, employee_id, date, status, data, version, updated_at) VALUES($1,$2,$3,$4,$5::jsonb,1,now())`, [record.id, employeeId, record.date, status, data]);
      } else if (table === 'payroll_payslips') {
        await client.query(`INSERT INTO payroll_payslips(id, payroll_run_id, employee_id, status, net_salary, data, version, updated_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,1,now())`,
          [record.id, record.payrollRunId, employeeId, status, Number(record.netSalary || 0), data]);
      } else if (table === 'payroll_runs') {
        await client.query(`INSERT INTO payroll_runs(id, month, employee_id, status, data, version, updated_at) VALUES($1,$2,$3,$4,$5::jsonb,1,now())`,
          [record.id, `${record.periodYear}-${pad(Number(record.periodMonth))}`, employeeId, status, data]);
      } else {
        await client.query(`INSERT INTO ${table}(id, employee_id, status, data, version, updated_at) VALUES($1,$2,$3,$4::jsonb,1,now())
          ON CONFLICT(id) DO UPDATE SET employee_id=EXCLUDED.employee_id, status=COALESCE(EXCLUDED.status, ${table}.status), data=EXCLUDED.data, version=${table}.version+1, updated_at=now()`,
          [record.id, employeeId, status, data]);
      }
      counts.set(table, (counts.get(table) || 0) + 1);
    };
    for (const item of companies) if (created.some(text => text.startsWith('company'))) await put('companies', { ...item, status: 'Active' });
    for (const item of companyBranches) if (created.some(text => text.startsWith('branch')) && item.id === 'br-demo-hq') await put('branches', item);
    if (created.some(text => text.startsWith('statutory'))) await put('stat_config', config);
    if (created.some(text => text.startsWith('FBR'))) for (const slab of taxSlabs) await put('tax_slabs', slab);
    for (const item of departments) await put('departments', { ...item, status: 'Active' });
    for (const item of designations) await put('designations', { ...item, status: 'Active' });
    for (const item of wageTypes) await put('wage_types', item);
    for (const item of zones) await put('zones', item);
    for (const item of ucTowns) await put('uc_towns', item);
    for (const item of holidays) await put('holidays', item);
    for (const item of employees) await put('employees', item, item.id);
    for (const item of leaves) await put('leaves', item);
    await put('mobile_duty_authorizations', duty);
    for (const item of attendances) await put('attendances', item);
    for (const item of periods) await put('attendance_periods', { ...item, status: item.status });
    for (const item of loans) await put('loan_advances', item);
    for (const item of adjustments) await put('payroll_adjustments', item);
    for (const item of runs) await put('payroll_runs', item);
    for (const item of payslips) await put('payroll_payslips', item);
    for (const item of revisions) await put('salary_revisions', item);
    for (const item of reviews) await put('performance_reviews', item);
    for (const item of lifecycle) await put('lifecycle_requests', item);
    for (const item of gratuity) await put('gratuity_settlements', item);
    for (const item of assets) await put('company_assets', item);
    for (const item of jobs) await put('job_postings', item);
    for (const item of applications) await put('job_applications', item);
    for (const item of notifications) await put('notifications', item);

    // Mobile-app logins for two seeded employees (only when the username is free); passwords are printed once.
    const logins: string[] = [];
    if (roleIds.has('role-employee')) {
      for (const [key, username] of [['e07', 'demo.usman'], ['e11', 'demo.rabia']] as const) {
        const employee = emp(key);
        const existing = users.find(user => [user.username, user.email].some(value => String(value || '').toLowerCase() === username || String(value || '').toLowerCase() === employee.email));
        if (existing) {
          await client.query(`UPDATE users SET employee_id=$2, data = data || jsonb_build_object('employeeId', $3::text), updated_at=now() WHERE id=$1`, [existing.id, employee.id, employee.id]);
          logins.push(`${employee.fullName}: existing login ${existing.email || existing.username} re-linked to the seeded employee (password unchanged)`);
          continue;
        }
        const password = crypto.randomBytes(9).toString('base64url');
        const id = `usr-demo-${key}`;
        const data = { id, username, email: employee.email, roleId: 'role-employee', employeeId: employee.id, status: 'Active', passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: now.toISOString() };
        await client.query(`INSERT INTO users(id, username, email, role_id, employee_id, status, data) VALUES($1,$2,$3,'role-employee',$4,'Active',$5::jsonb)`, [id, username, employee.email, employee.id, JSON.stringify(data)]);
        logins.push(`${employee.fullName} (${employee.employeeCode}): email ${employee.email}  password ${password}`);
      }
    } else {
      notes.push('Role "Employee" (role-employee) is missing, so no mobile-app logins were created. Run npm run postgres:migrate.');
    }
    const dangling = users.filter(user => user.employeeId && !employees.some(item => item.id === user.employeeId) && !logins.some(line => line.includes(`"${user.username}"`)));
    if (dangling.length) notes.push(`${dangling.length} existing login(s) were linked to employees that no longer exist: ${dangling.map(user => user.username || user.email).join(', ')}. Re-link them under User Management.`);

    await client.query(`INSERT INTO hr_audit_log(actor_uid, actor_role_id, action, collection_name, document_id, new_data) VALUES('seed-script','system','create','demoSeed',$1,$2::jsonb)`,
      [`demo-seed-${now.toISOString()}`, JSON.stringify({ employees: employees.length, attendances: attendances.length, payrollRuns: runs.length, kept: 'users, roles, companies, branches, statutory settings' })]);
    if (dryRun) await client.query('ROLLBACK'); else await client.query('COMMIT');

    // ── Report ──
    const line = (text = '') => console.log(text);
    line(dryRun ? '\nDRY RUN: nothing was saved. The seed would write:' : `\nSeeded database "${database}" for ${company.name}:`);
    for (const [table, count] of counts) line(`  ${table.padEnd(28)} ${count}`);
    if (created.length) line(`\nAlso created (missing before): ${created.join('; ')}`);
    line('\nPayroll:');
    for (const run of runs) line(`  ${run.title.padEnd(28)} ${run.status.padEnd(10)} employees ${run.employeeCount}  gross PKR ${run.totalGrossPay.toLocaleString()}  net PKR ${run.totalNetPay.toLocaleString()}`);
    line(`\nWaiting for you in ${monthName(openMonth.year, openMonth.month)} (open month):`);
    line(`  • Attendance → Needs Review: missing punch-out (${emp('e09').fullName}), regularization (${emp('e12').fullName}), low-confidence face match (${emp('e05').fullName})`);
    line(`  • Leave: 2 pending requests (${emp('e11').fullName}, ${emp('e05').fullName}); Loans: 1 pending advance (${emp('e10').fullName})`);
    line(`  • Payroll: ${runs.at(-1)?.title || 'last run'} is Approved with bank advice ready → enter the bank reference to disburse; 1 pending bonus adjustment`);
    line(`  • Salary revision draft (${emp('e02').fullName}), probation confirmation (${emp('e14').fullName}), resignation (${emp('e12').fullName}: settlement PKR ${settlementPreview.totalSettlementAmount.toLocaleString()} on approval)`);
    if (logins.length) { line('\nMobile app logins (shown once; change them after the demo):'); for (const text of logins) line(`  ${text}`); }
    if (notes.length) { line('\nNotes:'); for (const text of notes) line(`  • ${text}`); }
    line('\nEmployees must enroll their face/fingerprint again (Biometric Devices) before kiosk punches work.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => { console.error(`\n${error instanceof Error ? error.message : error}`); process.exit(1); });
