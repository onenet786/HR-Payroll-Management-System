/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pakistan provinces
export type Province = 'Punjab' | 'Sindh' | 'KPK' | 'Balochistan';

// Organization Hierarchy
export interface Company {
  id: string;
  name: string;
  industry: string;
  taxRegistrationNumber: string; // NTN
  eobiRegistrationNumber: string;
  socialSecurityRegion: string;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  city: string;
  province: Province;
  address: string;
}

export interface Department {
  id: string;
  branchId: string;
  name: string;
  code: string;
}

export interface Designation {
  id: string;
  departmentId: string;
  title: string;
  grade: string;
}

// Shifts
export interface Shift {
  id: string;
  name: string; // e.g. "Morning Shift", "Night Shift"
  startTime: string; // "09:00"
  endTime: string; // "18:00"
  graceMinutes: number; // 15 mins
  halfDayMinutes: number; // Late by 120 mins = Half Day
  overtimeMultiplier: number; // e.g. 1.5x or 2.0x
}

// Employee Master Record
export interface Employee {
  id: string;
  companyId: string;
  branchId: string;
  departmentId: string;
  designationId: string;
  employeeCode: string; // e.g. EMP-001
  fullName: string;
  email: string;
  contactNumber: string;
  cnic: string; // CNIC Format: 42101-XXXXXXX-X
  gender: string;
  dateOfBirth: string;
  dateOfJoining: string;
  status: 'Active' | 'On Leave' | 'Suspended' | 'Terminated';
  
  // Employment Details
  wageType: string;
  basicSalary: number; // Basic Monthly Wage or Daily Wage Rate
  providentFundOptIn: boolean;
  providentFundRate: number; // Percentage e.g. 5% or 8.33%
  gratuityOptIn: boolean;
  
  // Bank Information
  bankName: string;
  bankBranchName: string;
  bankAccountNumber: string;
  iban: string; // International Bank Account Number PKXX
  
  // Statutory IDs
  eobiNumber?: string;
  socialSecurityNumber?: string;

  // New onboarding and custom payroll configuration fields
  pictureUrl?: string;
  isZoneInCharge?: boolean;
  zoneInChargeName?: string;
  zone?: string;
  ucTown?: string;
  houseRentAllowance?: number;
  conveyanceAllowance?: number;
  medicalAllowance?: number;
  otherAllowances?: number;
  eobiEnabled?: boolean;
  fbrEnabled?: boolean;
  maritalStatus?: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  fingerprintTemplates?: string[]; // base64 FMD templates from Digital Persona URU 4500
  faceDescriptors?: {
    version: 1 | 2;
    vector: number[];
    capturedAt: string;
    source?: string;
  }[]; // compact camera descriptors for kiosk face recognition
}

// Attendance Logs
export interface AttendanceLog {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  punchIn?: string; // HH:MM:SS
  punchOut?: string; // HH:MM:SS
  outReason?: string;
  method: 'Biometric' | 'Camera' | 'Mobile GPS' | 'RFID' | 'Manual' | 'Web Punch';
  status: 'Present' | 'Late' | 'Half Day' | 'Absent' | 'On Leave' | 'Holiday';
  overtimeMinutes: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  regularizationRequested?: boolean;
  regularizationReason?: string;
  regularizationApproved?: boolean;
}

// Leave Requests
export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: 'Casual' | 'Sick' | 'Annual' | 'Maternity' | 'Paternity' | 'Hajj' | 'Unpaid';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedOn: string; // YYYY-MM-DD
  approvedBy?: string;
  approvedOn?: string;
}

// Leave Balance
export interface LeaveBalance {
  id: string;
  employeeId: string;
  casual: number; // limit e.g. 10
  sick: number;   // limit e.g. 8
  annual: number; // limit e.g. 14
  casualUsed: number;
  sickUsed: number;
  annualUsed: number;
}

// Tax Slab FBR
export interface TaxSlab {
  id: string;
  minIncome: number; // Annual limit e.g., 600,000 PKR
  maxIncome: number; // Annual limit e.g., 1,200,000 PKR
  baseTax: number;   // Fixed PKR tax
  percentage: number; // e.g. 2.5%
}

// Statutory Rate Table Config (Versioned & Editable in UI)
export interface StatutoryConfig {
  id: string;
  minimumWage: number; // e.g. 37,000 PKR
  eobiEmployerRate: number; // e.g. 5% of minimum wage (1850 PKR) or configurable
  eobiEmployeeRate: number; // e.g. 1% of minimum wage (370 PKR)
  pessiEmployerRate: number; // e.g. 6% of wage (up to a limit like max 40,000 basic)
  gratuityRateDaysPerYear: number; // e.g. 30 days basic pay per completed year of service
  providentFundMaxEmployeeContribution: number; // e.g. 10%
  updatedAt: string; // timestamp
}

// Payroll Run Instance
export interface PayrollRun {
  id: string;
  title: string; // e.g. "Payroll - June 2026"
  periodMonth: number; // 6
  periodYear: number; // 2026
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'Draft' | 'Approved' | 'Disbursed';
  createdAt: string;
  totalGrossPay: number;
  totalDeductions: number;
  totalNetPay: number;
  totalEobiEmployer: number;
  totalSocialSecurityEmployer: number;
}

// Individual Payslip details calculated under a Payroll Run
export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  cnic: string;
  departmentName: string;
  designationTitle: string;
  branchName: string;
  
  // Attendances & Days
  totalDaysInMonth: number;
  daysPresent: number;
  daysAbsent: number;
  daysLeave: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
  overtimePay: number;
  
  // Income Details
  basicEarnings: number; // Adjusted for absences
  houseRentAllowance: number; // e.g. 30% of basic
  conveyanceAllowance: number; // e.g. 10% of basic
  medicalAllowance: number; // e.g. 10% of basic
  otherAllowances: number;
  grossSalary: number; // Sum of allowances & basic
  
  // Deductions Detail (Pakistan statutory)
  incomeTaxDeduction: number; // calculated according to annual slab
  eobiEmployeeDeduction: number; // 1% of FBR minimum wage
  pessiEmployeeDeduction: number; // usually 0, or employer-paid
  providentFundDeduction: number; // e.g. 5% of basic
  loanRepaymentDeduction: number;
  unpaidLeaveDeduction: number;
  totalDeductions: number;
  
  // Net Earnings
  netSalary: number;
  
  // Employer Contributions (for reports & compliance auditing)
  eobiEmployerContribution: number; // 5% of min wage
  pessiEmployerContribution: number; // 6% of payroll (capped)
  providentFundEmployerContribution: number;
}

// Bank advice item
export interface BankAdviceItem {
  employeeName: string;
  employeeCode: string;
  bankName: string;
  bankAccountNumber: string;
  iban: string;
  netSalary: number;
}

// User management and role-based access control (RBAC)
export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[]; // e.g. ['view_dashboard', 'manage_employees', 'manage_attendance', 'manage_leaves', 'manage_payroll', 'manage_settings', 'manage_access']
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  roleId: string;
  employeeId?: string; // Links to Employee if they represent an internal worker
  status: 'Active' | 'Inactive';
  password?: string;
}

// Holiday Management
export interface Holiday {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  type: 'Public' | 'Company' | 'Optional';
  isRecurring: boolean; // repeats annually
  description?: string;
}

// Loan & Salary Advance Management
export interface LoanAdvance {
  id: string;
  employeeId: string;
  type: 'Loan' | 'Advance';
  principalAmount: number;
  approvedAmount: number;
  disbursedDate: string;
  totalInstallments: number;
  remainingInstallments: number;
  monthlyInstallment: number;
  totalRepaid: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Active' | 'Closed' | 'Rejected';
  appliedOn: string;
  approvedBy?: string;
  approvedOn?: string;
}

// Salary Revision / Increment History
export interface SalaryRevision {
  id: string;
  employeeId: string;
  previousSalary: number;
  newSalary: number;
  incrementAmount: number;
  incrementPercentage: number;
  effectiveDate: string; // YYYY-MM-DD
  reason: string;
  approvedBy: string;
  approvedOn: string;
  type: 'Annual Increment' | 'Promotion' | 'Adjustment' | 'Market Correction';
}

// ─── Performance Appraisal ────────────────────────────────────────────────────

export interface KpiScore {
  kpi: string;
  weight: number;      // e.g. 30 (%)
  selfScore: number;   // 1-5
  managerScore: number;
  comment?: string;
}

export interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewerId: string;   // employeeId of reviewer / manager username
  period: string;       // e.g. "H1-2026", "Annual-2025"
  reviewDate: string;
  kpis: KpiScore[];
  overallSelfRating: number;    // 1-5
  overallManagerRating: number; // 1-5
  strengths: string;
  areasOfImprovement: string;
  managerComments: string;
  status: 'Draft' | 'Submitted' | 'Reviewed' | 'Acknowledged';
  incrementRecommended: boolean;
  incrementPercent?: number;
}

// ─── Asset Management ─────────────────────────────────────────────────────────

export interface CompanyAsset {
  id: string;
  assetTag: string;          // e.g. ASSET-LPT-001
  name: string;              // e.g. "Dell Latitude 5420"
  category: 'Laptop' | 'Mobile' | 'SIM Card' | 'Vehicle' | 'Furniture' | 'Tool' | 'Other';
  serialNumber?: string;
  purchaseDate: string;
  purchaseCost: number;
  condition: 'New' | 'Good' | 'Fair' | 'Poor';
  assignedTo?: string;       // employeeId
  assignedDate?: string;
  returnDate?: string;
  status: 'Available' | 'Assigned' | 'Under Repair' | 'Retired';
  notes?: string;
}

// ─── Recruitment ──────────────────────────────────────────────────────────────

export interface JobPosting {
  id: string;
  title: string;
  departmentId: string;
  branchId: string;
  vacancies: number;
  experienceRequired: string;  // e.g. "2-4 years"
  qualificationRequired: string;
  salaryRange: string;         // e.g. "PKR 80,000 – 120,000"
  jobType: 'Full Time' | 'Part Time' | 'Contract' | 'Internship';
  postedDate: string;
  closingDate: string;
  status: 'Open' | 'Closed' | 'On Hold' | 'Filled';
  description: string;
}

export type AppStage = 'Applied' | 'Shortlisted' | 'Interview Scheduled' | 'Interviewed' | 'Offer Extended' | 'Hired' | 'Rejected';

export interface JobApplication {
  id: string;
  jobPostingId: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  cnic?: string;
  currentSalary?: number;
  expectedSalary?: number;
  appliedDate: string;
  stage: AppStage;
  interviewDate?: string;
  interviewNotes?: string;
  offerAmount?: number;
  rejectionReason?: string;
  resumeUrl?: string;
}

// ─── Gratuity / Terminal Settlement ──────────────────────────────────────────

export interface GratuitySettlement {
  id: string;
  employeeId: string;
  separationType: 'Resignation' | 'Termination' | 'Retirement' | 'Death' | 'Redundancy';
  lastWorkingDate: string;
  separationDate: string;
  yearsOfService: number;        // calculated
  basicSalaryAtSeparation: number;
  gratuityAmount: number;        // (basic/26 * 30) * years
  encashableLeaveDays: number;
  leaveEncashmentAmount: number;
  noticePayDays: number;
  noticePayAmount: number;
  pendingSalaryDays: number;
  pendingSalaryAmount: number;
  totalSettlementAmount: number;
  paidDate?: string;
  status: 'Pending' | 'Processed' | 'Paid';
  notes?: string;
}

// ─── In-App Notifications ─────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: 'leave_approved' | 'leave_rejected' | 'payroll_processed' | 'loan_approved' | 'loan_rejected' | 'asset_assigned' | 'review_due' | 'holiday_reminder' | 'system';
  title: string;
  message: string;
  targetEmployeeId?: string;   // null = broadcast to all
  createdAt: string;
  readBy: string[];            // array of employeeIds who have read it
  priority: 'low' | 'medium' | 'high';
}
