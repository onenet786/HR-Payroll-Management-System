/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pakistan provinces
/** Provinces plus Islamabad Capital Territory, which follows federal labour and social-security law. */
export type Province = 'Punjab' | 'Sindh' | 'KPK' | 'Balochistan' | 'ICT';
export type SocialSecurityScheme = 'PESSI' | 'SESSI' | 'KP ESSI' | 'BESSI' | 'Federal / ICT';

// Organization Hierarchy
export interface Company {
  id: string;
  name: string;
  industry: string;
  taxRegistrationNumber: string; // NTN (legacy alias)
  eobiRegistrationNumber: string;
  socialSecurityRegion: string;
  code?: string;
  legalName?: string;
  legalType?: string;
  ntn?: string;
  strn?: string;
  eobiRegistration?: string;
  socialSecurityRegistration?: string;
  registeredAddress?: string;
  city?: string;
  province?: Province;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  fiscalYearStartMonth?: number;
  payrollFrequency?: 'Monthly' | 'Biweekly' | 'Weekly';
  defaultCurrency?: string;
  timezone?: string;
  status?: 'Active' | 'Inactive';
  createdAt?: string;
  updatedAt?: string;
  setupCompletedAt?: string;
}

export interface CompanySetupPayload {
  company: Company;
  branch: Branch;
  departments: Department[];
  designations: Designation[];
  statutoryConfig: StatutoryConfig;
}

export interface Branch {
  id: string;
  companyId: string;
  code?: string;
  name: string;
  city: string;
  province: Province;
  address: string;
  geofenceLatitude?: number;
  geofenceLongitude?: number;
  geofenceRadiusMeters?: number;
  establishmentType?: EstablishmentType;
}

export type EstablishmentType = 'Factory' | 'Shop / Commercial' | 'Industrial / Other';

/** Overrides for one labour-law category (Factories Act vs Shops & Establishments). Blank fields use the global setting. */
export interface EstablishmentRule {
  overtimeMultiplier?: number;
  maxWeeklyOvertimeHours?: number;
  maxConsecutiveWorkDays?: number;
  minimumWage?: number;
}
export type WorkerCategory = 'Worker' | 'Supervisory' | 'Managerial' | 'Contract' | 'Apprentice';

export interface Department {
  id: string;
  branchId: string;
  name: string;
  code: string;
}

export interface Designation {
  id: string;
  departmentId: string;
  code?: string;
  title: string;
  grade: string;
}

export interface Zone {
  id: string;
  companyId: string;
  code: string;
  name: string;
  status: 'Active' | 'Inactive';
}

export interface UcTown {
  id: string;
  zoneId: string;
  code: string;
  name: string;
  status: 'Active' | 'Inactive';
}

export interface WageType {
  id: string;
  companyId: string;
  code: string;
  name: string;
  calculationBasis: 'Monthly' | 'Daily';
  status: 'Active' | 'Inactive';
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
  breakMinutes?: number;
  overtimeAfterMinutes?: number;
  workingDays?: number[]; // JavaScript weekdays: 0 Sunday ... 6 Saturday
  ramadanStartDate?: string; // YYYY-MM-DD, configurable every year
  ramadanEndDate?: string; // YYYY-MM-DD, inclusive
  ramadanStartTime?: string;
  ramadanEndTime?: string;
  fridayStartTime?: string;
  fridayEndTime?: string;
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
  cnicExpiryDate?: string; // NADRA CNIC expiry (YYYY-MM-DD)
  contractEndDate?: string; // Fixed-term contract end (YYYY-MM-DD)
  probationEndDate?: string; // Review/confirmation due date (YYYY-MM-DD)
  probationConfirmedAt?: string; // Immutable confirmation decision timestamp
  drivingLicenceExpiryDate?: string;
  professionalCertificationExpiryDate?: string;
  workPermitExpiryDate?: string;
  bankVerifiedAt?: string;
  bankVerifiedBy?: string;
  onboardingChecklist?: Partial<Record<OnboardingChecklistItem, { done: boolean; at?: string; by?: string }>>;
  workerCategory?: WorkerCategory;
  /** Monthly taxable value of non-cash benefits (Income Tax Ordinance s.13): company car, accommodation, utilities, etc. */
  perquisiteVehicleMonthly?: number;
  perquisiteAccommodationMonthly?: number;
  perquisiteOtherMonthly?: number;
  separationType?: GratuitySettlement['separationType'];
  separationDate?: string;
  separationReason?: string;
  gender: string;
  dateOfBirth: string;
  dateOfJoining: string;
  status: 'Active' | 'On Leave' | 'Suspended' | 'Terminated';
  
  // Employment Details
  wageType: string;
  wageTypeId?: string;
  zoneId?: string;
  ucTownId?: string;
  basicSalary: number; // Basic Monthly Wage or Daily Wage Rate
  shiftId?: string;
  shift?: Shift; // backwards-compatible embedded policy until centralized rosters are assigned
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
  eobiExemptionReason?: string;
  socialSecurityExemptionReason?: string;

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
  priorEmployerTaxableIncome?: number;
  priorEmployerTaxDeducted?: number;
  maritalStatus?: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  emergencyContactName?: string;
  emergencyContactNumber?: string;
  reportingManagerId?: string;
  ntn?: string;
  fingerprintTemplates?: string[]; // base64 FMD templates from Digital Persona URU 4500
  faceDescriptors?: {
    version: 1 | 2 | 3;
    vector: number[];
    capturedAt: string;
    source?: string;
    liveness?: {
      method: 'active-turn-v1';
      verifiedAt: string;
      summary: {
        order: ['left' | 'right', 'left' | 'right'];
        durationMs: number;
        frameCounts: [number, number, number, number, number];
        maxLeftYaw: number;
        maxRightYaw: number;
        maxCenterDrift: number;
        maxScaleChange: number;
      };
    };
  }[]; // compact camera descriptors for kiosk face recognition
}

// Attendance Logs
export interface AttendanceBreak {
  reason: string;
  outAt: string; // HH:MM:SS
  returnAt: string; // HH:MM:SS
  outMethod?: string;
  returnMethod?: string;
  terminalId?: string;
  terminalLocation?: string;
}

export interface AttendanceLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  capturedAt: string;
  source: 'device-gps';
  address?: string;
}

export type MobileAttendanceAction = 'workday-in' | 'workday-out' | 'visit-in' | 'visit-out';

export interface MobilePunchDetails {
  action: MobileAttendanceAction;
  reasonCategory: string;
  reasonNote: string;
  clientName?: string;
  verificationMethod?: 'Biometric' | 'Camera';
}

export type MobileDutyType = 'Work from home' | 'Out of station' | 'Client visit' | 'Market / field duty' | 'Official travel' | 'Direct reporting to worksite' | 'Emergency duty';

export interface MobileDutyAuthorization {
  id: string;
  employeeId: string;
  dutyType: MobileDutyType;
  validFrom: string;
  validTo: string;
  instructions: string;
  assignedLocation?: string;
  allowFieldVisits: boolean;
  status: 'Approved' | 'Cancelled';
  assignedByUserId: string;
  assignedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceFieldVisit {
  id: string;
  clientName: string;
  checkIn: string;
  checkOut?: string;
  checkInReasonCategory: string;
  checkInReasonNote: string;
  checkOutReasonCategory?: string;
  checkOutReasonNote?: string;
  checkInLocation: AttendanceLocation;
  checkOutLocation?: AttendanceLocation;
  method: 'Mobile GPS';
  verificationMethod: 'Biometric' | 'Camera';
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  punchIn?: string; // HH:MM:SS
  punchOut?: string; // HH:MM:SS
  outReason?: string;
  breaks?: AttendanceBreak[];
  lastPunchAt?: string;
  employeeBranchId?: string;
  terminalBranchId?: string;
  crossBranch?: boolean;
  method: 'Biometric' | 'Camera' | 'Mobile GPS' | 'Mobile Kiosk' | 'RFID' | 'Manual' | 'Web Punch';
  status: 'Present' | 'Late' | 'Half Day' | 'Absent' | 'On Leave' | 'Holiday';
  overtimeMinutes: number;
  latitude?: number;
  longitude?: number;
  locationAccuracyMeters?: number;
  locationCapturedAt?: string;
  locationSource?: 'device-gps';
  punchInLocation?: AttendanceLocation;
  punchOutLocation?: AttendanceLocation;
  punchInReasonCategory?: string;
  punchInReasonNote?: string;
  punchOutReasonCategory?: string;
  punchOutReasonNote?: string;
  fieldVisits?: AttendanceFieldVisit[];
  mobileDutyAuthorizationId?: string;
  address?: string;
  regularizationRequested?: boolean;
  regularizationReason?: string;
  regularizationApproved?: boolean;
  requestedById?: string;
  geofenceStatus?: 'inside' | 'authorized-offsite' | 'needs-review';
  geofenceDistanceMeters?: number;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedById?: string;
  reviewComment?: string;
  requestedAt?: string;
  lastPunchTimestamp?: string;
  evidenceDocumentIds?: string[];
  escalatedAt?: string;
  biometricMatch?: BiometricMatchEvidence;
  locationRisk?: string;
}

export interface BiometricMatchEvidence {
  kind: 'face' | 'fingerprint';
  score: number;
  threshold: number;
  /** 0–100: how far the match distance sits below the acceptance threshold. */
  strengthPercent: number;
  lowConfidence: boolean;
}

export interface AttendancePeriod {
  id: string;
  periodMonth: number;
  periodYear: number;
  status: 'Locked' | 'Reopened';
  lockedAt: string;
  lockedBy: string;
  attendanceCount: number;
  employeeCount: number;
  integrityHash: string;
  registerHash?: string;
  registerVersion?: number;
  registerRows?: AttendanceRegisterRow[];
  exceptionCount: number;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenedById?: string;
  reopenReason?: string;
  history?: AttendancePeriodHistoryEvent[];
}

export interface AttendancePeriodHistoryEvent {
  action: 'Locked' | 'Reopened';
  at: string;
  by: string;
  registerVersion: number;
  registerHash?: string;
  reason?: string;
}

export type AttendanceRegisterStatus = 'Working Day' | 'Present' | 'Late' | 'Half Day' | 'Paid Leave' | 'Unpaid Leave' | 'Holiday' | 'Weekly Off' | 'Absent' | 'Not Joined' | 'Missing Punch' | 'Pending Review';

export interface AttendanceRegisterRow {
  employeeId: string;
  date: string;
  status: AttendanceRegisterStatus;
  attendanceId?: string;
  source?: AttendanceLog['method'] | 'Leave' | 'Holiday' | 'Roster';
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
  effectiveFrom?: string;
  effectiveTo?: string;
  taxYear?: string;
  socialSecurityWageCeiling?: number;
  provincialSocialSecurityRates?: Partial<Record<Province, number>>;
  provincialMinimumWages?: Partial<Record<Province, number>>;
  provincialSocialSecuritySchemes?: Partial<Record<Province, SocialSecurityScheme>>;
  statutoryPolicyVersion?: string;
  overtimeMultiplier?: number;
  dailyWagerOvertimeMultiplier?: number;
  standardMonthlyHours?: number;
  absenceDeductionBasis?: AbsenceDeductionBasis;
  journalAccounts?: Partial<Record<JournalAccountKey, JournalAccount>>;
  maxWeeklyOvertimeHours?: number;
  maxConsecutiveWorkDays?: number;
  lowConfidenceBiometricPercent?: number;
  gratuityTaxExemptAmount?: number;
  changeRequestId?: string;
  /** Second Schedule Part I cl.139: medical allowance exempt up to this % of basic when free treatment is not provided. */
  medicalAllowanceExemptPercentOfBasic?: number;
  surchargeRatePercent?: number;
  surchargeThresholdAnnual?: number;
  provincialSocialSecurityCeilings?: Partial<Record<Province, number>>;
  socialSecurityEligibility?: 'Capped wage for all' | 'Only employees within wage ceiling';
  socialSecurityExcludedCategories?: WorkerCategory[];
  settlementDailyRateDivisor?: number;
  gratuityMinimumServiceYears?: number;
  gratuityCountPartYearOverSixMonths?: boolean;
  gratuityResignationUnderFiveYearsPercent?: number;
  annualLeaveDaysPerYear?: number;
  maxLeaveEncashDays?: number;
  /** FBR / EOBI / provincial notification number or official URL backing the current rates. */
  sourceReference?: string;
  sourceDocuments?: Array<{ id: string; name: string; uploadedAt: string }>;
  exportTemplates?: import('./data/exportTemplates').ExportTemplate[];
  establishmentRules?: Partial<Record<EstablishmentType, EstablishmentRule>>;
  leaveEntitlements?: Partial<Record<Exclude<LeaveRequest['leaveType'], 'Unpaid'>, number>>;
}

export type JournalAccountKey = 'salaryExpense' | 'reimbursementExpense' | 'eobiExpense' | 'socialSecurityExpense' | 'providentFundExpense'
  | 'incomeTaxPayable' | 'eobiPayable' | 'socialSecurityPayable' | 'providentFundPayable' | 'loanRecovery' | 'otherDeductions' | 'bankPayable';

export interface JournalAccount { code: string; name: string }

export interface StatutoryChangeRequest {
  id: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  proposedConfig: StatutoryConfig;
  proposedTaxSlabs: TaxSlab[];
  changedFields: string[];
  sourceReference?: string;
  createdAt: string;
  createdById: string;
  createdBy: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedBy?: string;
  reviewComment?: string;
}

export type AbsenceDeductionBasis = 'Calendar Days' | 'Scheduled Working Days' | 'Fixed 30 Days';

// Payroll Run Instance
export interface PayrollRun {
  id: string;
  title: string; // e.g. "Payroll - June 2026"
  periodMonth: number; // 6
  periodYear: number; // 2026
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'Draft' | 'Approved' | 'Disbursed' | 'Cancelled';
  createdAt: string;
  totalGrossPay: number;
  totalDeductions: number;
  totalNetPay: number;
  totalEobiEmployer: number;
  totalSocialSecurityEmployer: number;
  employeeCount?: number;
  statutoryConfigId?: string;
  statutoryEffectiveFrom?: string;
  approvedAt?: string;
  approvedBy?: string;
  createdById?: string;
  approvedById?: string;
  disbursedAt?: string;
  disbursedBy?: string;
  disbursedById?: string;
  payslips?: Payslip[];
  auditTrail?: PayrollAuditEvent[];
  attendancePeriodId: string;
  attendanceIntegrityHash: string;
  attendanceRegisterHash?: string;
  preflightCriticalCount?: number;
  preflightWarningCount?: number;
  bankAdviceChecksum?: string;
  bankAdviceGeneratedAt?: string;
  bankAdviceGeneratedById?: string;
  bankAdviceEmployeeCount?: number;
  bankAdviceTotal?: number;
  /** Name of the export template used; legacy values were fixed 'review required' labels. */
  bankAdviceProfile?: string;
  bankAdviceBatchReference?: string;
  bankAdviceControlHash?: string;
  bankAdviceTemplateVerified?: boolean;
  disbursementReference?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelledById?: string;
  cancellationReason?: string;
  statusBeforeCancellation?: 'Draft' | 'Approved';
  runType?: PayrollRunType;
  settlementId?: string;
  taxDeposit?: TaxDepositRecord;
  parallelRun?: ParallelRunRecord;
}

export interface ParallelRunRecord {
  comparedAt: string;
  comparedById: string;
  comparedBy: string;
  legacyFileName: string;
  matched: number;
  differing: number;
  onlyLegacy: number;
  onlySystem: number;
  netDelta: number;
  explanation?: string;
}

export type PayrollRunType = 'Regular' | 'Supplementary' | 'Final Settlement';

export interface TaxDepositRecord {
  cprNumber: string;
  amount: number;
  depositedOn: string;
  recordedAt: string;
  recordedById: string;
  recordedBy: string;
}

export type PayrollAdjustmentType = 'Bonus' | 'Commission' | 'Arrears' | 'Reimbursement' | 'Deduction' | 'Tax Adjustment';

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  periodMonth: number;
  periodYear: number;
  type: PayrollAdjustmentType;
  amount: number;
  taxable: boolean;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  createdById: string;
  createdBy: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedBy?: string;
  payrollRunId?: string;
}

export interface PayrollAuditEvent {
  action: 'Created' | 'Approved' | 'Disbursed' | 'Cancelled';
  at: string;
  by: string;
  actorId?: string;
  reason?: string;
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
  bankName?: string;
  bankAccountNumber?: string;
  iban?: string;
  
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
  bonusEarnings?: number;
  commissionEarnings?: number;
  arrearsEarnings?: number;
  reimbursements?: number;
  otherAdjustmentsDeduction?: number;
  manualTaxAdjustment?: number;
  payrollAdjustmentIds?: string[];
  grossSalary: number; // Sum of allowances & basic
  
  // Deductions Detail (Pakistan statutory)
  incomeTaxDeduction: number; // calculated according to annual slab
  taxYear?: string;
  taxableIncomeYtd?: number;
  taxDeductedBeforeCurrentPeriod?: number;
  projectedAnnualTaxableIncome?: number;
  projectedAnnualTaxLiability?: number;
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
  province?: Province;
  paidDays?: number;
  scheduledWorkingDays?: number;
  notJoinedDays?: number;
  absenceDeductionBasis?: AbsenceDeductionBasis;
  attendanceSource?: 'Certified Register' | 'Attendance Logs';
  runType?: PayrollRunType;
  taxableIncomeThisPeriod?: number;
  perquisitesValue?: number;
  exemptAllowance?: number;
  surchargeAnnual?: number;
  settlementGratuity?: number;
  settlementLeaveEncashment?: number;
  settlementNoticePay?: number;
  settlementPendingSalary?: number;
  paymentStatus?: 'Paid' | 'Failed' | 'Retried';
  paymentFailureReason?: string;
  paymentFailedAt?: string;
  paymentFailedById?: string;
  paymentRetryReference?: string;
  paymentRetriedAt?: string;
  paymentRetriedById?: string;
  retryBankName?: string;
  retryBankAccountNumber?: string;
  retryIban?: string;
  explicitAbsentDays?: number;
  statutoryConfigId?: string;
  calculationVersion?: string;
  periodMonth?: number;
  periodYear?: number;
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
  permissions: string[]; // includes manage_mobile_duty for mobile attendance authorization
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  roleId: string;
  employeeId?: string; // Links to Employee if they represent an internal worker
  status: 'Active' | 'Inactive';
  passwordHash?: string;
  mfaEnabled?: boolean;
  mfaEnrolledAt?: string;
}

export type NewUserAccount = Omit<UserAccount, 'passwordHash'> & { password: string };

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
  status?: 'Draft' | 'Approved';
  sourcePerformanceReviewId?: string;
  createdById?: string;
  createdBy?: string;
  approvedById?: string;
  arrearsAdjustmentId?: string;
  arrearsAmount?: number;
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
  status: 'Draft' | 'Submitted' | 'Reviewed' | 'Acknowledged' | 'Approved' | 'Rejected';
  incrementRecommended: boolean;
  incrementPercent?: number;
  promotionRecommended?: boolean;
  trainingRecommended?: boolean;
  improvementPlanRequired?: boolean;
  developmentPlan?: string;
  hrDecisionComments?: string;
  approvedBy?: string;
  approvedOn?: string;
  salaryRevisionId?: string;
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
  createdAt?: string;
  createdById?: string;
  processedAt?: string;
  processedById?: string;
  paidById?: string;
  payrollRunId?: string;
}

// ─── Employee lifecycle ───────────────────────────────────────────────────────

export type OnboardingChecklistItem = 'cnicCopy' | 'appointmentLetter' | 'bankVerified' | 'eobiRegistered' | 'socialSecurityRegistered'
  | 'ntnCaptured' | 'biometricEnrolled' | 'policyAcknowledged';

export type LifecycleRequestType = 'Probation Confirmation' | 'Probation Extension' | 'Transfer' | 'Promotion' | 'Resignation' | 'Termination';

export interface LifecycleRequest {
  id: string;
  employeeId: string;
  type: LifecycleRequestType;
  effectiveDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  newBranchId?: string;
  newDepartmentId?: string;
  newDesignationId?: string;
  newBasicSalary?: number;
  newProbationEndDate?: string;
  noticeDays?: number;
  leaveEncashDays?: number;
  createdAt: string;
  createdById: string;
  createdBy: string;
  reviewedAt?: string;
  reviewedById?: string;
  reviewedBy?: string;
  reviewComment?: string;
  settlementId?: string;
  salaryRevisionId?: string;
}

// ─── In-App Notifications ─────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: 'leave_approved' | 'leave_rejected' | 'payroll_processed' | 'loan_approved' | 'loan_rejected' | 'asset_assigned' | 'review_due' | 'holiday_reminder' | 'system';
  title: string;
  message: string;
  /** Optional Urdu copy. Existing English-only notices remain fully compatible. */
  titleUrdu?: string;
  messageUrdu?: string;
  targetEmployeeId?: string;   // null = broadcast to all
  createdAt: string;
  readBy: string[];            // array of employeeIds who have read it
  priority: 'low' | 'medium' | 'high';
}
