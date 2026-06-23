/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Branch, Company, Department, Designation, Employee,
  AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, Payslip,
  Role, UserAccount, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication,
  GratuitySettlement, AppNotification
} from '../types';

// Default FBR Income Tax Slabs for Salaried Individuals (Annual)
export const DEFAULT_TAX_SLABS: TaxSlab[] = [
  { id: 't1', minIncome: 0, maxIncome: 600000, baseTax: 0, percentage: 0 },
  { id: 't2', minIncome: 600000, maxIncome: 1200000, baseTax: 0, percentage: 5 },
  { id: 't3', minIncome: 1200000, maxIncome: 2200000, baseTax: 30000, percentage: 15 },
  { id: 't4', minIncome: 2200000, maxIncome: 3200000, baseTax: 180000, percentage: 25 },
  { id: 't5', minIncome: 3200000, maxIncome: 4100000, baseTax: 430000, percentage: 30 },
  { id: 't6', minIncome: 4100000, maxIncome: 99999999, baseTax: 700000, percentage: 35 }
];

// Default Pakistan Statutory Config
export const DEFAULT_STATUTORY_CONFIG: StatutoryConfig = {
  id: 'stat-pk-default',
  minimumWage: 37000, // PKR per month as of recent notices
  eobiEmployerRate: 5, // 5% of minimum wage (PKR 1,850)
  eobiEmployeeRate: 1, // 1% of minimum wage (PKR 370)
  pessiEmployerRate: 6, // 6% of basic salary (or capped wage)
  gratuityRateDaysPerYear: 30, // 30 days basic pay per year on final settlement
  providentFundMaxEmployeeContribution: 10,
  updatedAt: '2026-06-17'
};

// Default Organization Seeding
export const DEFAULT_COMPANIES: Company[] = [
  {
    id: 'c1',
    name: 'Bin Ishaq Logistics Ltd.',
    industry: 'Trading & Services',
    taxRegistrationNumber: 'NTN-4567891-2',
    eobiRegistrationNumber: 'EOBI- Karachi-987654',
    socialSecurityRegion: 'SESSI-Sindh'
  }
];

export const DEFAULT_BRANCHES: Branch[] = [
  {
    id: 'b1',
    companyId: 'c1',
    name: 'Karachi HQ Office',
    city: 'Karachi',
    province: 'Sindh',
    address: 'Clifton Block 5, Marine Drive, Karachi, Pakistan'
  },
  {
    id: 'b2',
    companyId: 'c1',
    name: 'Lahore Distribution Hub',
    city: 'Lahore',
    province: 'Punjab',
    address: 'Multan Road Industrial Area, Lahore, Pakistan'
  }
];

export const DEFAULT_DEPARTMENTS: Department[] = [
  { id: 'd1', branchId: 'b1', name: 'Information Technology', code: 'IT' },
  { id: 'd2', branchId: 'b1', name: 'Human Resources', code: 'HR' },
  { id: 'd3', branchId: 'b2', name: 'Warehouse & Logistics', code: 'WLOG' },
  { id: 'd4', branchId: 'b2', name: 'Finance & Accounts', code: 'FIN' }
];

export const DEFAULT_DESIGNATIONS: Designation[] = [
  { id: 'ds1', departmentId: 'd1', title: 'Senior Software Engineer', grade: 'A1' },
  { id: 'ds2', departmentId: 'd2', title: 'HR Manager', grade: 'M2' },
  { id: 'ds3', departmentId: 'd4', title: 'Senior Accountant', grade: 'A2' },
  { id: 'ds4', departmentId: 'd3', title: 'Logistics Supervisor', grade: 'S1' },
  { id: 'ds5', departmentId: 'd3', title: 'Dispatch Associate', grade: 'W1' }
];

// Sample Employees
export const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: 'emp1',
    companyId: 'c1',
    branchId: 'b1',
    departmentId: 'd1',
    designationId: 'ds1',
    employeeCode: 'IND-KHI-001',
    fullName: 'Ali Raza Khan',
    email: 'ali.raza@induslog.com',
    contactNumber: '0300-1234567',
    cnic: '42101-1234567-3',
    gender: 'Male',
    dateOfBirth: '1992-04-12',
    dateOfJoining: '2021-02-01',
    status: 'Active',
    wageType: 'Salaried',
    basicSalary: 180000,
    providentFundOptIn: true,
    providentFundRate: 5.0, // 5% PF
    gratuityOptIn: true,
    bankName: 'Habib Bank Limited (HBL)',
    bankBranchName: 'Clifton Branch, Karachi',
    bankAccountNumber: '12345678901234',
    iban: 'PK42HABB0012345678901234',
    eobiNumber: '1090123456',
    socialSecurityNumber: 'SS-42-998877',
    pictureUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
    isZoneInCharge: true,
    zone: 'East Zone',
    ucTown: 'UC-2 Clifton Town',
    eobiEnabled: true,
    fbrEnabled: true
  },
  {
    id: 'emp2',
    companyId: 'c1',
    branchId: 'b1',
    departmentId: 'd2',
    designationId: 'ds2',
    employeeCode: 'IND-KHI-002',
    fullName: 'Sara Ahmed',
    email: 'sara.ahmed@induslog.com',
    contactNumber: '0321-7654321',
    cnic: '42201-9876543-2',
    gender: 'Female',
    dateOfBirth: '1989-08-25',
    dateOfJoining: '2019-11-15',
    status: 'Active',
    wageType: 'Salaried',
    basicSalary: 230000,
    providentFundOptIn: true,
    providentFundRate: 8.33, // 1 month salary per year PF
    gratuityOptIn: true,
    bankName: 'Meezan Bank Limited',
    bankBranchName: 'DHA Phase 6, Karachi',
    bankAccountNumber: '99021234567',
    iban: 'PK12MEZN0099021234567',
    eobiNumber: '1090123499',
    socialSecurityNumber: 'SS-42-991122',
    pictureUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
    isZoneInCharge: false,
    zoneInChargeName: 'Ali Raza Khan',
    zone: 'East Zone',
    ucTown: 'UC-2 Clifton Town',
    eobiEnabled: true,
    fbrEnabled: true
  },
  {
    id: 'emp3',
    companyId: 'c1',
    branchId: 'b2',
    departmentId: 'd4',
    designationId: 'ds3',
    employeeCode: 'IND-LHR-003',
    fullName: 'Muhammad Usman',
    email: 'usman.m@induslog.com',
    contactNumber: '0333-3112233',
    cnic: '35202-1234561-1',
    gender: 'Male',
    dateOfBirth: '1991-01-05',
    dateOfJoining: '2023-05-10',
    status: 'Active',
    wageType: 'Salaried',
    basicSalary: 120000,
    providentFundOptIn: true,
    providentFundRate: 5.0,
    gratuityOptIn: false,
    bankName: 'Bank Alfalah',
    bankBranchName: 'Gulberg Branch, Lahore',
    bankAccountNumber: '4455889901',
    iban: 'PK52ALFH004455889901',
    eobiNumber: '3590558899',
    socialSecurityNumber: 'SS-35-123456',
    pictureUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&q=80&w=200',
    isZoneInCharge: true,
    zone: 'West Zone',
    ucTown: 'UC-9 Gulberg Town',
    eobiEnabled: true,
    fbrEnabled: false // testing FBR disabled
  },
  {
    id: 'emp4',
    companyId: 'c1',
    branchId: 'b2',
    departmentId: 'd3',
    designationId: 'ds4',
    employeeCode: 'IND-LHR-004',
    fullName: 'Tariq Mahmood',
    email: 'tariq.m@induslog.com',
    contactNumber: '0312-9988776',
    cnic: '35103-5143219-5',
    gender: 'Male',
    dateOfBirth: '1985-06-15',
    dateOfJoining: '2018-01-20',
    status: 'Active',
    wageType: 'Salaried',
    basicSalary: 65000,
    providentFundOptIn: false,
    providentFundRate: 0,
    gratuityOptIn: true,
    bankName: 'National Bank of Pakistan (NBP)',
    bankBranchName: 'Multan Road Main Branch, Lahore',
    bankAccountNumber: '9876123456',
    iban: 'PK86NBPA009876123456',
    eobiNumber: '3590443322',
    socialSecurityNumber: 'SS-35-987654',
    pictureUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    isZoneInCharge: false,
    zoneInChargeName: 'Muhammad Usman',
    zone: 'West Zone',
    ucTown: 'UC-9 Gulberg Town',
    houseRentAllowance: 20000,
    conveyanceAllowance: 6500,
    medicalAllowance: 6500,
    otherAllowances: 2000,
    eobiEnabled: false, // testing EOBI disabled
    fbrEnabled: true
  },
  {
    id: 'emp5',
    companyId: 'c1',
    branchId: 'b2',
    departmentId: 'd3',
    designationId: 'ds5',
    employeeCode: 'IND-LHR-WS01',
    fullName: 'Kamran Bashir',
    email: 'kamran.dispatch@induslog.com',
    contactNumber: '0345-4455667',
    cnic: '35201-9988221-7',
    gender: 'Male',
    dateOfBirth: '1995-12-01',
    dateOfJoining: '2022-09-01',
    status: 'Active',
    wageType: 'Daily Wager',
    basicSalary: 1600, // PKR 1,600 Daily Wage Rate
    providentFundOptIn: false,
    providentFundRate: 0,
    gratuityOptIn: false,
    bankName: 'JazzCash Mobile Wallet',
    bankBranchName: 'Digital Branch',
    bankAccountNumber: '03454455667',
    iban: 'PK24JAZZ03454455667',
    eobiNumber: '',
    socialSecurityNumber: '',
    pictureUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
    isZoneInCharge: false,
    zoneInChargeName: 'Muhammad Usman',
    zone: 'West Zone',
    ucTown: 'UC-12 Town-C',
    eobiEnabled: true,
    fbrEnabled: true
  },
  {
    id: 'emp6',
    companyId: 'c1',
    branchId: 'b1',
    departmentId: 'd1',
    designationId: 'ds1',
    employeeCode: 'BINISHAQ-IT-00002',
    fullName: 'Aqeel Ur Rehman',
    email: 'aaqueel@gmail.com',
    contactNumber: '0300-1234567',
    cnic: '35201-1599874-1',
    gender: 'Male',
    dateOfBirth: '1990-05-15',
    dateOfJoining: '2026-06-01',
    status: 'Active',
    wageType: 'Salaried',
    basicSalary: 180000,
    providentFundOptIn: true,
    providentFundRate: 5.0,
    gratuityOptIn: true,
    bankName: 'Askari Bank',
    bankBranchName: 'Main Branch, Karachi',
    bankAccountNumber: '12345678901234',
    iban: 'PK42ASCB0012345678901234',
    eobiNumber: '1090123000',
    socialSecurityNumber: 'SS-42-000111',
    pictureUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=200',
    isZoneInCharge: false,
    zoneInChargeName: 'Ali Raza Khan',
    zone: 'East Zone',
    ucTown: 'UC-2 Clifton Town',
    eobiEnabled: true,
    fbrEnabled: true
  }
];

// Sample Leave Requests
export const DEFAULT_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: 'lv1',
    employeeId: 'emp1',
    leaveType: 'Casual',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    totalDays: 2,
    reason: 'Family event in Hyderabad',
    status: 'Approved',
    appliedOn: '2026-06-05',
    approvedBy: 'Sara Ahmed',
    approvedOn: '2026-06-06'
  },
  {
    id: 'lv2',
    employeeId: 'emp3',
    leaveType: 'Sick',
    startDate: '2026-06-15',
    endDate: '2026-06-15',
    totalDays: 1,
    reason: 'Suffering from flu and high fever',
    status: 'Approved',
    appliedOn: '2026-06-15',
    approvedBy: 'Sara Ahmed',
    approvedOn: '2026-06-15'
  },
  {
    id: 'lv3',
    employeeId: 'emp4',
    leaveType: 'Annual',
    startDate: '2026-06-25',
    endDate: '2026-06-28',
    totalDays: 4,
    reason: 'Home renovation work',
    status: 'Pending',
    appliedOn: '2026-06-16'
  },
  {
    id: 'lv4',
    employeeId: 'emp6',
    leaveType: 'Annual',
    startDate: '2026-06-22',
    endDate: '2026-06-30',
    totalDays: 9,
    reason: 'Annaual Leaves',
    status: 'Approved',
    appliedOn: '2026-06-18',
    approvedBy: 'Sara Ahmed',
    approvedOn: '2026-06-18'
  }
];

// Sample Month Attendance Logs for June 2026 (partial sample, let's create a builder or standard)
export const DEFAULT_ATTENDANCES: AttendanceLog[] = [
  // Emp1
  { id: 'att1', employeeId: 'emp1', date: '2026-06-01', punchIn: '08:55:12', punchOut: '18:02:45', method: 'Biometric', status: 'Present', overtimeMinutes: 0 },
  { id: 'att2', employeeId: 'emp1', date: '2026-06-02', punchIn: '09:12:00', punchOut: '18:00:00', method: 'Biometric', status: 'Present', overtimeMinutes: 0 }, // past grace minutes? grace is 15 so till 9:15 is ok
  { id: 'att3', employeeId: 'emp1', date: '2026-06-03', punchIn: '08:48:30', punchOut: '19:15:00', method: 'Biometric', status: 'Present', overtimeMinutes: 75 }, // OT
  { id: 'att4', employeeId: 'emp1', date: '2026-06-04', punchIn: '09:25:00', punchOut: '18:01:00', method: 'Mobile GPS', status: 'Late', overtimeMinutes: 0 }, // Late
  { id: 'att5', employeeId: 'emp1', date: '2026-06-05', punchIn: '08:59:00', punchOut: '18:00:00', method: 'Biometric', status: 'Present', overtimeMinutes: 0 },
  
  // Emp2 (Sara)
  { id: 'att6', employeeId: 'emp2', date: '2026-06-01', punchIn: '08:45:00', punchOut: '18:15:00', method: 'Web Punch', status: 'Present', overtimeMinutes: 15 },
  { id: 'att7', employeeId: 'emp2', date: '2026-06-02', punchIn: '08:52:00', punchOut: '18:00:00', method: 'Web Punch', status: 'Present', overtimeMinutes: 0 },
  { id: 'att8', employeeId: 'emp2', date: '2026-06-03', punchIn: '09:05:00', punchOut: '18:00:00', method: 'Web Punch', status: 'Present', overtimeMinutes: 0 },
  
  // Emp3 (Usman)
  { id: 'att9', employeeId: 'emp3', date: '2026-06-01', punchIn: '09:02:00', punchOut: '18:00:00', method: 'Biometric', status: 'Present', overtimeMinutes: 0 },
  { id: 'att10', employeeId: 'emp3', date: '2026-06-02', punchIn: '09:35:00', punchOut: '14:00:00', method: 'Biometric', status: 'Half Day', overtimeMinutes: 0 }, // Mid day checkout
  
  // Emp5 (Kamran - Daily wage)
  { id: 'att11', employeeId: 'emp5', date: '2026-06-01', punchIn: '08:50:00', punchOut: '17:00:00', method: 'RFID', status: 'Present', overtimeMinutes: 0 },
  { id: 'att12', employeeId: 'emp5', date: '2026-06-02', punchIn: '08:55:00', punchOut: '17:00:00', method: 'RFID', status: 'Present', overtimeMinutes: 0 },
  { id: 'att13', employeeId: 'emp5', date: '2026-06-03', punchIn: '08:52:00', punchOut: '20:00:00', method: 'RFID', status: 'Present', overtimeMinutes: 180 }, // Overtime for daily wagers config
];

// Helper to calculate realistic Pakistan income tax (FBR annualised salaried individuals)
export function calculateAnnualTax(annualTaxableIncome: number, slabs: TaxSlab[] = DEFAULT_TAX_SLABS): number {
  if (annualTaxableIncome <= 600000) return 0;
  
  // Find matching slab
  const matchingSlab = slabs.find(
    s => annualTaxableIncome >= s.minIncome && annualTaxableIncome < s.maxIncome
  );
  
  if (!matchingSlab) {
    // If somehow not found, go to highest
    const highest = slabs[slabs.length - 1];
    const excess = annualTaxableIncome - highest.minIncome;
    return highest.baseTax + (excess * highest.percentage) / 100;
  }
  
  const excess = annualTaxableIncome - matchingSlab.minIncome;
  return matchingSlab.baseTax + (excess * matchingSlab.percentage) / 100;
}

// Function to calculate exact Pakistan Statutory & gross-to-net payslip details
export function computePayslipDetails(
  employee: Employee,
  month: number,
  year: number,
  attendances: AttendanceLog[],
  leaves: LeaveRequest[],
  statConfigs: StatutoryConfig = DEFAULT_STATUTORY_CONFIG,
  taxSlabs: TaxSlab[] = DEFAULT_TAX_SLABS,
  departments: Department[] = DEFAULT_DEPARTMENTS,
  designations: Designation[] = DEFAULT_DESIGNATIONS,
  branches: Branch[] = DEFAULT_BRANCHES,
  loanAdvances: LoanAdvance[] = []
): Payslip {
  
  // Basic wage context
  const isDailyWager = employee.wageType === 'Daily Wager';
  
  // Determine date boundaries
  const totalDaysInMonth = new Date(year, month, 0).getDate();
  
  // Count relevant days
  const empAtts = attendances.filter(
    a => a.employeeId === employee.id && a.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)
  );
  
  const presentDays = empAtts.filter(a => a.status === 'Present' || a.status === 'Late').length;
  const halfDays = empAtts.filter(a => a.status === 'Half Day').length;
  const absentDays = empAtts.filter(a => a.status === 'Absent').length;
  const leaveDays = empAtts.filter(a => a.status === 'On Leave').length;
  
  // Overtime minutes
  const totalOtMinutes = empAtts.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);
  const overtimeHours = Number((totalOtMinutes / 60).toFixed(2));
  
  // Unpaid leaves count
  // Filter approved leaves for this month
  const empLeaves = leaves.filter(
    l => l.employeeId === employee.id && 
         l.status === 'Approved' && 
         l.startDate.startsWith(`${year}-${String(month).padStart(2, '0')}`)
  );
  
  const unpaidLeaveDays = empLeaves
    .filter(l => l.leaveType === 'Unpaid')
    .reduce((sum, l) => sum + l.totalDays, 0);
  
  // Allowances calculation: For salaried employees, Basic Wage is usually configured as 100% and broken into:
  // Base Wage = 50%
  // House Rent = 30%
  // Conveyance = 10%
  // Medical = 10%
  let baseContractSalary = employee.basicSalary;
  
  let basicEarnings = 0;
  let houseRentAllowance = 0;
  let conveyanceAllowance = 0;
  let medicalAllowance = 0;
  let otherAllowances = 0;
  let hourlyRate = 0;
  let overtimePay = 0;
  let unpaidLeaveDeduction = 0;
  
  if (isDailyWager) {
    // Daily wager gets paid for actual days present + (half days * 0.5)
    const effectiveDaysPaid = presentDays + (halfDays * 0.5);
    basicEarnings = effectiveDaysPaid * baseContractSalary;
    
    // Hourly rate derived from 8-hour shift structure
    hourlyRate = baseContractSalary / 8;
    overtimePay = overtimeHours * hourlyRate * 1.5; // 1.5x OT multiplier for daily wagers
  } else {
    // Check if custom allowances are set on employee record
    const hasCustomAllowances = 
      employee.houseRentAllowance !== undefined || 
      employee.conveyanceAllowance !== undefined || 
      employee.medicalAllowance !== undefined || 
      employee.otherAllowances !== undefined;

    let basicComponent = baseContractSalary;
    if (hasCustomAllowances) {
      // Use custom allowance values
      houseRentAllowance = employee.houseRentAllowance ?? 0;
      conveyanceAllowance = employee.conveyanceAllowance ?? 0;
      medicalAllowance = employee.medicalAllowance ?? 0;
      otherAllowances = employee.otherAllowances ?? 0;
      basicComponent = baseContractSalary;
    } else {
      // Fallback to standard 50/30/10/10 split
      basicComponent = baseContractSalary * 0.50;
      houseRentAllowance = baseContractSalary * 0.30;
      conveyanceAllowance = baseContractSalary * 0.10;
      medicalAllowance = baseContractSalary * 0.10;
    }
    
    // Standard calendar day deduction for absences & unpaid leaves
    const standardDailyDeduction = baseContractSalary / totalDaysInMonth;
    unpaidLeaveDeduction = unpaidLeaveDays * standardDailyDeduction;
    
    // Base basic earnings
    basicEarnings = basicComponent;
    
    // Calculate overtime base (basic component / 208 working standard hours per month in Pakistan)
    const otBaseHourly = basicComponent / 208;
    overtimePay = overtimeHours * otBaseHourly * 2.0; // 2x double OT rate standard in Punjab/Sindh Shops & Establishments
  }
  
  const grossSalary = Math.round(
    basicEarnings + houseRentAllowance + conveyanceAllowance + medicalAllowance + otherAllowances + overtimePay - unpaidLeaveDeduction
  );
  
  // 1. Income Tax Calculation (FBR)
  let incomeTaxDeduction = 0;
  if (employee.fbrEnabled !== false) {
    const estimatedAnnualGross = grossSalary * 12;
    const annualTax = calculateAnnualTax(estimatedAnnualGross, taxSlabs);
    incomeTaxDeduction = Math.round(annualTax / 12);
  }
  
  // 2. EOBI Calculation (Employees' Old-Age Benefits Institution)
  let eobiEmployeeDeduction = 0;
  let eobiEmployerContribution = 0;
  
  if (employee.eobiEnabled !== false) {
    if (employee.eobiNumber || !isDailyWager) {
      eobiEmployeeDeduction = Math.round((statConfigs.minimumWage * (statConfigs.eobiEmployeeRate / 100)));
      eobiEmployerContribution = Math.round((statConfigs.minimumWage * (statConfigs.eobiEmployerRate / 100)));
    }
  }
  
  // 3. PESSI / SESSI (Provincial Social Security)
  // Employer pays 6% of basic salary capped at maximum threshold (typically capped closely to minimum wage or defined limit, let's say max basic salary of 40,000 for PESSI)
  let pessiEmployerContribution = 0;
  const pessiWageBase = Math.min(basicEarnings, 40000); 
  if (employee.socialSecurityNumber || !isDailyWager) {
    pessiEmployerContribution = Math.round(pessiWageBase * (statConfigs.pessiEmployerRate / 100));
  }
  
  // 4. Provident Fund Deduction
  let providentFundDeduction = 0;
  let providentFundEmployerContribution = 0;
  if (employee.providentFundOptIn) {
    providentFundDeduction = Math.round(basicEarnings * (employee.providentFundRate / 100));
    providentFundEmployerContribution = providentFundDeduction; // Employer matches PF
  }
  
  // Loan / salary advance installment deduction
  const activeLoans = loanAdvances.filter(
    l => l.employeeId === employee.id && l.status === 'Active' && l.remainingInstallments > 0
  );
  const loanRepaymentDeduction = activeLoans.reduce((sum, l) => sum + l.monthlyInstallment, 0);

  const totalDeductions = Math.round(
    incomeTaxDeduction + eobiEmployeeDeduction + providentFundDeduction + loanRepaymentDeduction
  );

  const netSalary = Math.max(0, grossSalary - totalDeductions);

  // Resolve names via lookup
  const departmentName = departments.find(d => d.id === employee.departmentId)?.name || 'Unknown Dept';
  const designationTitle = designations.find(d => d.id === employee.designationId)?.title || 'Unknown Title';
  const branchName = branches.find(b => b.id === employee.branchId)?.name || 'Unknown Branch';

  return {
    id: `pay-${employee.id}-${month}-${year}`,
    payrollRunId: '',
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    cnic: employee.cnic,
    departmentName,
    designationTitle,
    branchName,
    
    totalDaysInMonth,
    daysPresent: presentDays,
    daysAbsent: absentDays,
    daysLeave: leaveDays,
    unpaidLeaveDays,
    overtimeHours,
    overtimePay,
    
    basicEarnings: Math.round(basicEarnings),
    houseRentAllowance: Math.round(houseRentAllowance),
    conveyanceAllowance: Math.round(conveyanceAllowance),
    medicalAllowance: Math.round(medicalAllowance),
    otherAllowances,
    grossSalary,
    
    incomeTaxDeduction,
    eobiEmployeeDeduction,
    pessiEmployeeDeduction: 0, // usually paid 100% by employer in Pak
    providentFundDeduction,
    loanRepaymentDeduction,
    unpaidLeaveDeduction: Math.round(unpaidLeaveDeduction),
    totalDeductions,
    netSalary,
    
    eobiEmployerContribution,
    pessiEmployerContribution,
    providentFundEmployerContribution
  };
}

export const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-admin',
    name: 'Super Admin',
    description: 'Full administrative control of the system, including access permissions and roles.',
    permissions: ['view_dashboard', 'manage_employees', 'manage_attendance', 'manage_leaves', 'manage_payroll', 'manage_settings', 'manage_access']
  },
  {
    id: 'role-hr',
    name: 'HR Manager',
    description: 'Manages employee directories, leaves, and attendance records.',
    permissions: ['view_dashboard', 'manage_employees', 'manage_attendance', 'manage_leaves']
  },
  {
    id: 'role-payroll',
    name: 'Payroll Specialist',
    description: 'Processes payroll run cycles, statutory calculations, and bank advice sheets.',
    permissions: ['view_dashboard', 'manage_payroll']
  },
  {
    id: 'role-employee',
    name: 'Employee',
    description: 'Standard access to personal dashboard and attendance simulation.',
    permissions: ['view_dashboard']
  },
  {
    id: 'role-kiosk',
    name: 'Kiosk Terminal',
    description: 'Dedicated account for locking a device into Kiosk Attendance Terminal mode.',
    permissions: ['use_kiosk']
  }
];

export const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'usr-1',
    username: 'admin',
    email: 'admin@binishaq.com',
    roleId: 'role-admin',
    status: 'Active',
    password: 'admin123'
  },
  {
    id: 'usr-2',
    username: 'sara.hr',
    email: 'sara.ahmed@induslog.com',
    roleId: 'role-hr',
    employeeId: 'emp2',
    status: 'Active',
    password: 'sara123'
  },
  {
    id: 'usr-3',
    username: 'usman.payroll',
    email: 'usman.m@induslog.com',
    roleId: 'role-payroll',
    employeeId: 'emp3',
    status: 'Active',
    password: 'usman123'
  },
  {
    id: 'usr-4',
    username: 'ali.raza',
    email: 'ali.raza@induslog.com',
    roleId: 'role-employee',
    employeeId: 'emp1',
    status: 'Active',
    password: 'ali123'
  },
  {
    id: 'usr-kiosk',
    username: 'kiosk',
    email: 'kiosk@binishaq.com',
    roleId: 'role-kiosk',
    status: 'Active',
    password: 'kiosk123'
  }
];

// Pakistan Public Holidays 2026
export const DEFAULT_HOLIDAYS: Holiday[] = [
  { id: 'hol-01', name: 'Kashmir Day', date: '2026-02-05', type: 'Public', isRecurring: true, description: 'National day of solidarity with Kashmir' },
  { id: 'hol-02', name: 'Pakistan Day', date: '2026-03-23', type: 'Public', isRecurring: true, description: 'Lahore Resolution anniversary' },
  { id: 'hol-03', name: 'Eid ul Fitr (Day 1)', date: '2026-03-31', type: 'Public', isRecurring: false, description: 'End of Ramadan' },
  { id: 'hol-04', name: 'Eid ul Fitr (Day 2)', date: '2026-04-01', type: 'Public', isRecurring: false, description: 'End of Ramadan (Day 2)' },
  { id: 'hol-05', name: 'Eid ul Fitr (Day 3)', date: '2026-04-02', type: 'Public', isRecurring: false, description: 'End of Ramadan (Day 3)' },
  { id: 'hol-06', name: 'Labour Day', date: '2026-05-01', type: 'Public', isRecurring: true, description: 'International Workers Day' },
  { id: 'hol-07', name: 'Eid ul Adha (Day 1)', date: '2026-06-08', type: 'Public', isRecurring: false, description: 'Festival of Sacrifice' },
  { id: 'hol-08', name: 'Eid ul Adha (Day 2)', date: '2026-06-09', type: 'Public', isRecurring: false, description: 'Festival of Sacrifice (Day 2)' },
  { id: 'hol-09', name: 'Eid ul Adha (Day 3)', date: '2026-06-10', type: 'Public', isRecurring: false, description: 'Festival of Sacrifice (Day 3)' },
  { id: 'hol-10', name: 'Independence Day', date: '2026-08-14', type: 'Public', isRecurring: true, description: 'Pakistan Independence Day' },
  { id: 'hol-11', name: 'Iqbal Day', date: '2026-11-09', type: 'Public', isRecurring: true, description: 'Allama Iqbal birthday' },
  { id: 'hol-12', name: 'Quaid-e-Azam Day', date: '2026-12-25', type: 'Public', isRecurring: true, description: 'Birthday of Quaid-e-Azam Muhammad Ali Jinnah' },
  { id: 'hol-c1', name: 'Company Foundation Day', date: '2026-07-15', type: 'Company', isRecurring: true, description: 'Bin Ishaq Logistics annual foundation celebration' }
];

// Sample Loan & Advance Records
export const DEFAULT_LOAN_ADVANCES: LoanAdvance[] = [
  {
    id: 'loan-001',
    employeeId: 'emp1',
    type: 'Loan',
    principalAmount: 150000,
    approvedAmount: 150000,
    disbursedDate: '2026-04-01',
    totalInstallments: 6,
    remainingInstallments: 4,
    monthlyInstallment: 25000,
    totalRepaid: 50000,
    reason: 'Home repair and renovation',
    status: 'Active',
    appliedOn: '2026-03-20',
    approvedBy: 'admin',
    approvedOn: '2026-03-25'
  },
  {
    id: 'loan-002',
    employeeId: 'emp3',
    type: 'Advance',
    principalAmount: 30000,
    approvedAmount: 30000,
    disbursedDate: '2026-05-15',
    totalInstallments: 2,
    remainingInstallments: 1,
    monthlyInstallment: 15000,
    totalRepaid: 15000,
    reason: 'Medical emergency',
    status: 'Active',
    appliedOn: '2026-05-10',
    approvedBy: 'admin',
    approvedOn: '2026-05-12'
  }
];

// Sample Salary Revisions
export const DEFAULT_SALARY_REVISIONS: SalaryRevision[] = [
  {
    id: 'rev-001',
    employeeId: 'emp1',
    previousSalary: 150000,
    newSalary: 180000,
    incrementAmount: 30000,
    incrementPercentage: 20,
    effectiveDate: '2026-01-01',
    reason: 'Annual performance appraisal increment',
    approvedBy: 'Sara Ahmed',
    approvedOn: '2025-12-20',
    type: 'Annual Increment'
  },
  {
    id: 'rev-002',
    employeeId: 'emp2',
    previousSalary: 200000,
    newSalary: 230000,
    incrementAmount: 30000,
    incrementPercentage: 15,
    effectiveDate: '2026-01-01',
    reason: 'Promotion to Senior HR Manager',
    approvedBy: 'admin',
    approvedOn: '2025-12-18',
    type: 'Promotion'
  },
  {
    id: 'rev-003',
    employeeId: 'emp4',
    previousSalary: 60000,
    newSalary: 65000,
    incrementAmount: 5000,
    incrementPercentage: 8.33,
    effectiveDate: '2026-03-01',
    reason: 'Mid-year performance bonus conversion',
    approvedBy: 'Sara Ahmed',
    approvedOn: '2026-02-28',
    type: 'Adjustment'
  }
];

// ─── Performance Reviews Seed Data ───────────────────────────────────────────
export const DEFAULT_PERFORMANCE_REVIEWS: PerformanceReview[] = [
  {
    id: 'pr-001',
    employeeId: 'emp1',
    reviewerId: 'sara.hr',
    period: 'Annual-2025',
    reviewDate: '2026-01-15',
    kpis: [
      { kpi: 'Technical Delivery', weight: 40, selfScore: 4, managerScore: 4, comment: 'Delivered all sprint tasks on time' },
      { kpi: 'Code Quality', weight: 30, selfScore: 4, managerScore: 3, comment: 'Needs more unit test coverage' },
      { kpi: 'Team Collaboration', weight: 20, selfScore: 5, managerScore: 5, comment: 'Excellent team player' },
      { kpi: 'Attendance & Punctuality', weight: 10, selfScore: 4, managerScore: 4, comment: 'Minor late arrivals' }
    ],
    overallSelfRating: 4.2,
    overallManagerRating: 4.0,
    strengths: 'Strong technical skills, proactive problem solver, excellent communication with cross-functional teams.',
    areasOfImprovement: 'Needs to improve documentation habits and unit test coverage for production code.',
    managerComments: 'Ali has been a strong contributor throughout 2025. Recommended for 20% increment and senior role consideration.',
    status: 'Acknowledged',
    incrementRecommended: true,
    incrementPercent: 20
  },
  {
    id: 'pr-002',
    employeeId: 'emp2',
    reviewerId: 'admin',
    period: 'Annual-2025',
    reviewDate: '2026-01-18',
    kpis: [
      { kpi: 'HR Policy Compliance', weight: 35, selfScore: 5, managerScore: 5 },
      { kpi: 'Recruitment Efficiency', weight: 25, selfScore: 4, managerScore: 4 },
      { kpi: 'Employee Relations', weight: 25, selfScore: 5, managerScore: 5 },
      { kpi: 'Reporting Accuracy', weight: 15, selfScore: 4, managerScore: 4 }
    ],
    overallSelfRating: 4.7,
    overallManagerRating: 4.6,
    strengths: 'Outstanding leadership in HR transformation, excellent employee advocacy, zero grievances filed in 2025.',
    areasOfImprovement: 'Digital HR adoption could be accelerated. Training calendar for 2026 needs early planning.',
    managerComments: 'Sara is a key pillar of our HR function. Promotion to Senior HR Manager with 15% increment approved.',
    status: 'Acknowledged',
    incrementRecommended: true,
    incrementPercent: 15
  }
];

// ─── Company Assets Seed Data ─────────────────────────────────────────────────
export const DEFAULT_COMPANY_ASSETS: CompanyAsset[] = [
  {
    id: 'ast-001', assetTag: 'ASSET-LPT-001', name: 'Dell Latitude 5420',
    category: 'Laptop', serialNumber: 'DL5420-KHI-001', purchaseDate: '2023-03-15',
    purchaseCost: 185000, condition: 'Good', assignedTo: 'emp1',
    assignedDate: '2023-03-20', status: 'Assigned', notes: 'Primary development machine'
  },
  {
    id: 'ast-002', assetTag: 'ASSET-MOB-001', name: 'Samsung Galaxy A54',
    category: 'Mobile', serialNumber: 'SGA54-KHI-002', purchaseDate: '2023-06-01',
    purchaseCost: 65000, condition: 'Good', assignedTo: 'emp2',
    assignedDate: '2023-06-05', status: 'Assigned'
  },
  {
    id: 'ast-003', assetTag: 'ASSET-LPT-002', name: 'HP EliteBook 840',
    category: 'Laptop', serialNumber: 'HPE840-LHR-001', purchaseDate: '2022-11-10',
    purchaseCost: 195000, condition: 'Fair', assignedTo: 'emp3',
    assignedDate: '2022-11-15', status: 'Assigned', notes: 'Finance team machine, minor wear'
  },
  {
    id: 'ast-004', assetTag: 'ASSET-VHC-001', name: 'Toyota Hilux Revo (LHR-1234)',
    category: 'Vehicle', serialNumber: 'THL2024-LHR-001', purchaseDate: '2024-01-10',
    purchaseCost: 8500000, condition: 'Good', assignedTo: 'emp4',
    assignedDate: '2024-01-15', status: 'Assigned', notes: 'Logistics Supervisor field vehicle'
  },
  {
    id: 'ast-005', assetTag: 'ASSET-LPT-003', name: 'Lenovo ThinkPad E15',
    category: 'Laptop', serialNumber: 'LNV-E15-KHI-003', purchaseDate: '2025-02-20',
    purchaseCost: 160000, condition: 'New', status: 'Available'
  },
  {
    id: 'ast-006', assetTag: 'ASSET-SIM-001', name: 'Jazz Corporate SIM (0302-1234567)',
    category: 'SIM Card', purchaseDate: '2023-01-01',
    purchaseCost: 500, condition: 'Good', assignedTo: 'emp1',
    assignedDate: '2023-01-10', status: 'Assigned'
  }
];

// ─── Job Postings Seed Data ───────────────────────────────────────────────────
export const DEFAULT_JOB_POSTINGS: JobPosting[] = [
  {
    id: 'job-001', title: 'Senior React Developer', departmentId: 'd1', branchId: 'b1',
    vacancies: 2, experienceRequired: '3-5 years', qualificationRequired: 'BS Computer Science or equivalent',
    salaryRange: 'PKR 150,000 – 200,000', jobType: 'Full Time',
    postedDate: '2026-06-01', closingDate: '2026-06-30', status: 'Open',
    description: 'We are looking for experienced React developers to join our growing IT team. Candidates must have hands-on experience with TypeScript, Firebase, and modern CI/CD workflows.'
  },
  {
    id: 'job-002', title: 'Logistics Coordinator', departmentId: 'd3', branchId: 'b2',
    vacancies: 1, experienceRequired: '1-3 years', qualificationRequired: 'Graduation in Supply Chain or Business',
    salaryRange: 'PKR 50,000 – 70,000', jobType: 'Full Time',
    postedDate: '2026-05-15', closingDate: '2026-06-15', status: 'Filled',
    description: 'Coordinate inbound and outbound logistics, manage dispatch schedules, and maintain warehouse inventory records.'
  },
  {
    id: 'job-003', title: 'HR Executive (Intern)', departmentId: 'd2', branchId: 'b1',
    vacancies: 1, experienceRequired: 'Fresh / 6 months', qualificationRequired: 'BBA/MBA HR in progress or completed',
    salaryRange: 'PKR 25,000 – 35,000', jobType: 'Internship',
    postedDate: '2026-06-10', closingDate: '2026-07-10', status: 'Open',
    description: 'Support HR team with recruitment coordination, employee onboarding, payroll data entry, and compliance documentation.'
  }
];

// ─── Job Applications Seed Data ───────────────────────────────────────────────
export const DEFAULT_JOB_APPLICATIONS: JobApplication[] = [
  {
    id: 'app-001', jobPostingId: 'job-001', applicantName: 'Fahad Iqbal',
    applicantEmail: 'fahad.iqbal@gmail.com', applicantPhone: '0321-9988776',
    cnic: '42101-8877665-1', currentSalary: 110000, expectedSalary: 175000,
    appliedDate: '2026-06-05', stage: 'Interviewed',
    interviewDate: '2026-06-15', interviewNotes: 'Strong React skills. Needs Firebase deepening. Recommended for round 2.'
  },
  {
    id: 'app-002', jobPostingId: 'job-001', applicantName: 'Zainab Malik',
    applicantEmail: 'zainab.m.dev@outlook.com', applicantPhone: '0333-5544332',
    cnic: '42201-7766554-2', currentSalary: 130000, expectedSalary: 185000,
    appliedDate: '2026-06-08', stage: 'Interview Scheduled',
    interviewDate: '2026-06-25', interviewNotes: ''
  },
  {
    id: 'app-003', jobPostingId: 'job-001', applicantName: 'Bilal Hashmi',
    applicantEmail: 'bilal.hashmi.codes@gmail.com', applicantPhone: '0300-4433221',
    cnic: '35201-6655443-3', currentSalary: 95000, expectedSalary: 160000,
    appliedDate: '2026-06-12', stage: 'Shortlisted'
  },
  {
    id: 'app-004', jobPostingId: 'job-003', applicantName: 'Sana Baig',
    applicantEmail: 'sana.baig.hr@yahoo.com', applicantPhone: '0312-3344556',
    cnic: '42101-3344556-4', currentSalary: 0, expectedSalary: 30000,
    appliedDate: '2026-06-14', stage: 'Applied'
  }
];

// ─── Gratuity Settlements Seed Data ──────────────────────────────────────────
export const DEFAULT_GRATUITY_SETTLEMENTS: GratuitySettlement[] = [];

// ─── App Notifications Seed Data ─────────────────────────────────────────────
export const DEFAULT_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-001', type: 'payroll_processed', title: 'June 2026 Payroll Processed',
    message: 'Payroll for June 2026 has been approved. Net disbursement: PKR 614,000 for 6 employees.',
    createdAt: '2026-06-17T10:30:00Z', readBy: [], priority: 'high'
  },
  {
    id: 'notif-002', type: 'leave_approved', title: 'Annual Leave Approved',
    message: 'Your annual leave request (Jun 22–30) has been approved by Sara Ahmed.',
    targetEmployeeId: 'emp6', createdAt: '2026-06-18T09:00:00Z', readBy: [], priority: 'medium'
  },
  {
    id: 'notif-003', type: 'loan_approved', title: 'Salary Advance Approved',
    message: 'Your salary advance of PKR 30,000 has been approved and disbursed. Installments: PKR 15,000/month x 2.',
    targetEmployeeId: 'emp3', createdAt: '2026-05-12T11:00:00Z', readBy: ['emp3'], priority: 'medium'
  },
  {
    id: 'notif-004', type: 'holiday_reminder', title: 'Upcoming Holiday: Eid ul Adha',
    message: 'Office will remain closed June 8–10, 2026 for Eid ul Adha. Please plan your work accordingly.',
    createdAt: '2026-06-05T08:00:00Z', readBy: [], priority: 'low'
  },
  {
    id: 'notif-005', type: 'review_due', title: 'Performance Reviews Due',
    message: 'H1-2026 performance reviews are due by July 15. Please submit self-assessments.',
    createdAt: '2026-06-20T09:00:00Z', readBy: [], priority: 'high'
  }
];
