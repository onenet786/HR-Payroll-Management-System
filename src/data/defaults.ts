/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Branch, Company, Department, Designation, Employee, 
  AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, Payslip,
  Role, UserAccount
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
  taxSlabs: TaxSlab[] = DEFAULT_TAX_SLABS
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
  
  // Loan / salary advances
  const loanRepaymentDeduction = 0; // standard mock or can be configured
  
  const totalDeductions = Math.round(
    incomeTaxDeduction + eobiEmployeeDeduction + providentFundDeduction + loanRepaymentDeduction
  );
  
  const netSalary = Math.max(0, grossSalary - totalDeductions);
  
  return {
    id: `pay-${employee.id}-${month}-${year}`,
    payrollRunId: '',
    employeeId: employee.id,
    employeeName: employee.fullName,
    employeeCode: employee.employeeCode,
    cnic: employee.cnic,
    departmentName: 'IT & Ops', // mapped in view
    designationTitle: 'Specialist', // mapped in view
    branchName: 'Karachi HQ', // mapped in view
    
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
