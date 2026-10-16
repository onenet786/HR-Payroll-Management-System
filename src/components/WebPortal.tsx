/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { JURISDICTIONS } from '../data/provincialCompliance';
import { DateField } from './DateField';
import React, { useState, useEffect, useMemo } from 'react';
import { empAvatarUrl } from '../utils/avatar';
import {
  Users, Calendar, CreditCard, ShieldCheck, FileText, Download, UserPlus,
  CheckCircle, AlertTriangle, Building, MapPin, Layers, Sliders, Info,
  CalendarDays, Banknote, TrendingUp, Star, Package, Briefcase, Calculator, Bell, Fingerprint,
  Database, BookOpen, Menu, X, ChevronDown, ListTree, Search, RotateCcw,
  ZoomIn, Eye, ExternalLink
} from 'lucide-react';
import {
  Employee, AttendanceLog, AttendancePeriod, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip,
  StatutoryChangeRequest, LifecycleRequest, OnboardingChecklistItem, ParallelRunRecord,
  Role, UserAccount, NewUserAccount, Branch, Department, Designation, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification, Company, CompanySetupPayload, Zone, UcTown, WageType, MobileDutyAuthorization, MobileDutyType, PayrollAdjustment, PayrollAdjustmentType
} from '../types';
import { computePayslipDetails, DEFAULT_TAX_SLABS, calculateFbrSalarySplit, calculateGrossFromTakeHome } from '../data/defaults';
import { deriveEmployeeCompanyId, getEmployeeEditDepartmentOptions, getEmployeeEditOptions, resolveEmployeeCompanyId, resolveRecordId, resolveUcTownName, resolveWageBasis, resolveWageTypeName, resolveZoneName, synchronizeDepartmentSelection, validateEmployeeMasterSelection } from '../data/masterData';
import { HolidayModule } from './HolidayModule';
import { LoansModule } from './LoansModule';
import { SalaryRevisionModule } from './SalaryRevisionModule';
import { PerformanceModule } from './PerformanceModule';
import { AssetModule } from './AssetModule';
import { RecruitmentModule } from './RecruitmentModule';
import { GratuityModule } from './GratuityModule';
import { NotificationCenter } from './NotificationCenter';
import { BiometricDeviceModule } from './BiometricDeviceModule';
import { FirestoreMaintenanceModule } from './FirestoreMaintenanceModule';
import { CompanySetupModule } from './CompanySetupModule';
import { MasterDataModule } from './MasterDataModule';
import { EmployeeDocumentVault } from './EmployeeDocumentVault';
import { motion, AnimatePresence } from 'motion/react';
import type { FirestoreSyncStatus } from '../App';
import { bankAdviceChecksum } from '../data/bankAdvice';
import { createStatutoryReport, type StatutoryReportKind } from '../data/statutoryReports';
import { createPayrollJournal } from '../data/accountingJournal';
import { isRegularizationOverdue, lineManagerReviewer, regularizationDueAt } from '../data/approvalRules';
import { createPayrollReversalJournal } from '../data/accountingJournal';
import { complianceAlerts } from '../data/complianceAlerts';
import { annualLeaveBalance, calculateFinalSettlement } from '../data/lifecycle';
import { downloadPayslipPdf } from '../data/payslipPdf';
import { downloadEmployeeDocument } from '../utils/employeeDocuments';
import { ComplianceAlertsPanel } from './ComplianceAlertsPanel';
import { EmployeeLifecycleModule } from './EmployeeLifecycleModule';
import { PaymentExceptionsModal } from './PaymentExceptionsModal';
import { PayrollReportsPanel } from './PayrollReportsPanel';
import { StatutoryGovernancePanel } from './StatutoryGovernancePanel';
import { leaveBalances } from '../data/leavePolicy';
import { companyInitialsPrefix, employeeCodePrefixError } from '../data/masterCodes';
import { goLiveReadiness } from '../data/goLiveReadiness';
import { GoLiveReadinessPanel } from './GoLiveReadinessPanel';
import { ParallelRunPanel } from './ParallelRunPanel';
import { applyUrduInterface } from '../utils/urduInterface';
import { authenticatedApiRequest as payrollApi } from '../data/postgresStore';
import { exportTemplatesFor, renderExport, type ExportKind } from '../data/exportTemplates';
import { authenticatedApiRequest } from '../data/postgresStore';
import KioskDevicesPanel from './KioskDevicesPanel';
import QRCode from 'qrcode';

const PAKISTAN_BANKS = [
  { name: 'Habib Bank Limited (HBL)', code: 'HABB' },
  { name: 'National Bank of Pakistan (NBP)', code: 'NBPA' },
  { name: 'Allied Bank Limited (ABL)', code: 'ABPA' },
  { name: 'MCB Bank Limited (MCB)', code: 'MUCB' },
  { name: 'United Bank Limited (UBL)', code: 'UNIL' },
  { name: 'Bank Alfalah (BAFL)', code: 'ALFH' },
  { name: 'Meezan Bank Limited', code: 'MEZN' },
  { name: 'Faysal Bank Limited', code: 'FAYS' },
  { name: 'Askari Bank', code: 'ASCB' },
  { name: 'Bank Al Habib (BAHL)', code: 'BAHL' },
  { name: 'Habib Metropolitan Bank', code: 'METR' },
  { name: 'Standard Chartered Bank', code: 'SCBL' },
  { name: 'Dubai Islamic Bank', code: 'DIBK' },
  { name: 'Bank of Punjab (BOP)', code: 'BPUN' },
  { name: 'JS Bank', code: 'JSBL' },
  { name: 'Summit Bank', code: 'SUBH' },
  { name: 'Al Baraka Bank', code: 'ALBK' }
];

const formatCNIC = (val: string): string => {
  const digits = val.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) {
    return digits;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
};

export const deriveCompanyPrefix = (
  company?: { code?: string; name?: string; legalName?: string } | null,
  fallback = 'ONENET'
): string => {
  // Company policy: employee codes start with the first three company initials (OneNet Solutions → ONS).
  return companyInitialsPrefix(company?.name || company?.legalName || fallback);
};

export const formatPakMobileNumber = (raw: string): string => {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('923')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('03')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('3')) {
    digits = digits.slice(1);
  }
  const clean9 = digits.slice(0, 9);
  return clean9.length > 0 ? `+923${clean9}` : '+923';
};

export const isValidPakMobileNumber = (val: string): boolean => {
  return /^\+923\d{9}$/.test((val || '').trim());
};

type LegacyEmployeeAssignment = Employee & {
  branch?: string;
  branchName?: string;
  branchCode?: string;
};

const getLegacyBranchValue = (employee: Employee) => {
  const legacyEmployee = employee as LegacyEmployeeAssignment;
  return legacyEmployee.branchName || legacyEmployee.branch || legacyEmployee.branchCode || employee.branchId || '';
};

const getExceptionalCurrentSuffix = (
  record: { id: string; companyId?: string; status?: 'Active' | 'Inactive' },
  currentId: string,
  companyId: string
) => {
  if (record.id !== currentId) return '';
  if (record.status === 'Inactive') return ' (Inactive — current)';
  if (!record.companyId) return ' (Legacy metadata — current)';
  if (companyId && record.companyId !== companyId) return ' (Outside company — current)';
  return '';
};

export interface MfaRecoveryRequest {
  id: string;
  userId: string;
  requestedById: string;
  username: string;
  email?: string;
  roleName?: string;
  reason: string;
  createdAt: string;
}

export interface WebPortalProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  mobileDutyAuthorizations: MobileDutyAuthorization[];
  leaves: LeaveRequest[];
  statConfig: StatutoryConfig;
  taxSlabs: TaxSlab[];
  payrollRuns: PayrollRun[];
  attendancePeriods: AttendancePeriod[];
  payrollPayslips: Payslip[];
  payrollAdjustments: PayrollAdjustment[];
  onCreatePayrollAdjustment: (adjustment: PayrollAdjustment) => void | Promise<void>;
  onReviewPayrollAdjustment: (id: string, status: 'Approved' | 'Rejected') => void | Promise<void>;
  onAddEmployee: (emp: Employee) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onUpdateStatConfig: (config: StatutoryConfig) => void;
  onUpdateTaxSlabs: (slabs: TaxSlab[]) => void;
  onApproveLeave: (id: string) => void;
  onRejectLeave: (id: string) => void;
  onApproveRegularization: (id: string, reviewComment: string) => void;
  onRejectRegularization: (id: string, reviewComment: string) => void;
  onCreatePayrollRun: (title: string, month: number, year: number) => void;
  onLockAttendancePeriod: (month: number, year: number) => void;
  onReopenAttendancePeriod: (month: number, year: number, reason: string) => void;
  onUpdatePayrollStatus: (runId: string, status: 'Approved' | 'Disbursed', disbursementReference?: string) => void;
  onCancelPayrollRun: (runId: string, reason: string) => void;
  statutoryChangeRequests: StatutoryChangeRequest[];
  onReviewStatutoryChange: (id: string, decision: 'Approved' | 'Rejected', comment: string) => void;
  lifecycleRequests: LifecycleRequest[];
  onCreateLifecycleRequest: (draft: Omit<LifecycleRequest, 'id' | 'status' | 'createdAt' | 'createdById' | 'createdBy'>) => Promise<boolean>;
  onReviewLifecycleRequest: (id: string, decision: 'Approved' | 'Rejected', comment: string) => void;
  onUpdateOnboarding: (employeeId: string, item: OnboardingChecklistItem, done: boolean) => void;
  onCreateSupplementaryRun: (month: number, year: number) => void;
  onCreateFinalSettlementRun: (settlementId: string) => void;
  onRecordTaxDeposit: (runId: string, cprNumber: string, amount: number, depositedOn: string) => void;
  onMarkPaymentFailed: (payslipId: string, reason: string) => void;
  onRecordPaymentRetry: (payslipIds: string[], reference: string) => void;
  onRetroRecalculate: (payslipId: string, reason: string, target: { month: number; year: number }) => void | Promise<void>;
  onRecordParallelRun: (runId: string, record: Omit<ParallelRunRecord, 'comparedAt' | 'comparedById' | 'comparedBy'>) => void | Promise<void>;
  onRecordBankAdvice: (runId: string, checksum: string, employeeCount: number, total: number, profile: PayrollRun['bankAdviceProfile'], batch?: { batchReference: string; controlHash: string; verified: boolean }) => void | Promise<void>;
  onSendPayslips: (runId: string) => Promise<{ sent: number; skipped: number; failed: Array<{ employeeId: string; error: string }> }>;
  onApplyLeave: (leave: LeaveRequest) => void;
  onAddAttendance: (log: AttendanceLog) => void;
  branches: Branch[];
  companies: Company[];
  onSaveCompanySetup: (payload: CompanySetupPayload) => Promise<void>;
  departments: Department[];
  designations: Designation[];
  zones: Zone[];
  ucTowns: UcTown[];
  wageTypes: WageType[];
  onSaveMasterData: (kind: 'branch' | 'department' | 'designation' | 'zone' | 'ucTown' | 'wageType', record: Branch | Department | Designation | Zone | UcTown | WageType) => Promise<void>;
  roles: Role[];
  users: UserAccount[];
  currentUserAccount: UserAccount;
  accessControlLoaded: boolean;
  onSetCurrentUserAccount: (user: UserAccount) => void;
  onAddRole: (role: Role) => void;
  onUpdateRole: (role: Role) => Promise<void>;
  onAddUser: (user: NewUserAccount) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onUpdateUserRole: (userId: string, roleId: string) => void;
  onUpdateUser: (user: UserAccount) => Promise<void>;
  onSaveMobileDutyAuthorization: (authorization: MobileDutyAuthorization) => Promise<void>;
  onCancelMobileDutyAuthorization: (id: string) => Promise<void>;
  onLogout: () => void;
  onAddBranch?: (branch: Branch) => void;
  onAddDepartment?: (dept: Department) => void;
  onAddDesignation?: (desg: Designation) => void;
  holidays: Holiday[];
  onAddHoliday: (holiday: Holiday) => void;
  onUpdateHoliday: (holiday: Holiday) => void;
  onDeleteHoliday: (id: string) => void;
  loanAdvances: LoanAdvance[];
  onApplyLoan: (loan: LoanAdvance) => void;
  onApproveLoan: (id: string) => void;
  onRejectLoan: (id: string) => void;
  salaryRevisions: SalaryRevision[];
  onAddSalaryRevision: (revision: SalaryRevision) => void;
  loggedInUser: UserAccount;
  performanceReviews: PerformanceReview[];
  onAddPerformanceReview: (review: PerformanceReview) => void;
  onUpdatePerformanceReview: (review: PerformanceReview) => void;
  companyAssets: CompanyAsset[];
  onAddAsset: (asset: CompanyAsset) => void;
  onUpdateAsset: (asset: CompanyAsset) => void;
  jobPostings: JobPosting[];
  onAddJobPosting: (posting: JobPosting) => void;
  onUpdateJobPosting: (posting: JobPosting) => void;
  jobApplications: JobApplication[];
  onAddJobApplication: (app: JobApplication) => void;
  onUpdateJobApplication: (app: JobApplication) => void;
  gratuitySettlements: GratuitySettlement[];
  onAddGratuitySettlement: (settlement: GratuitySettlement) => void;
  onUpdateGratuitySettlement: (settlement: GratuitySettlement) => void;
  notifications: AppNotification[];
  onAddNotification: (n: AppNotification) => void;
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onDeleteNotification: (id: string) => void;
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number, locationAccuracyMeters?: number, locationCapturedAt?: string, locationAddress?: string) => void | Promise<void>;
  firestoreSyncStatus: FirestoreSyncStatus;
}

type PortalTab = 'dashboard' | 'lifecycle' | 'employees' | 'attendance' | 'leaves' | 'payroll' | 'settings' | 'company-setup' | 'master-data' | 'access' | 'maintenance' | 'holidays' | 'loans' | 'revisions' | 'performance' | 'assets' | 'recruitment' | 'gratuity' | 'notifications' | 'biometric' | 'help';
type NavGroupKey = 'people' | 'time' | 'payroll' | 'system';

interface FlowStep {
  step: number;
  label: string;
  tab: PortalTab;
}

const FLOW_STEPS: FlowStep[] = [
  { step: 1, label: '1. Statutory', tab: 'settings' },
  { step: 2, label: '2. Company', tab: 'company-setup' },
  { step: 3, label: '3. People', tab: 'employees' },
  { step: 4, label: '4. Holidays', tab: 'holidays' },
  { step: 5, label: '5. Leave', tab: 'leaves' },
  { step: 6, label: '6. Devices', tab: 'biometric' },
  { step: 7, label: '7. Attendance', tab: 'attendance' },
  { step: 8, label: '8. Loans', tab: 'loans' },
  { step: 9, label: '9. Revisions', tab: 'revisions' },
  { step: 10, label: '10. Payroll', tab: 'payroll' },
  { step: 11, label: '11. Settlement', tab: 'gratuity' },
  { step: 12, label: '12. Dashboard', tab: 'dashboard' },
];

const TAB_HEADINGS_UR: Record<PortalTab, string> = {
  dashboard: 'آج کے اہم کام — پہلے تین صرف ایک منٹ لیتے ہیں۔',
  settings: 'قانونی شرحیں تمام صوبوں میں ماہانہ پے رول کٹوتیوں کا تعین کرتی ہیں۔',
  'company-setup': 'کمپنی کی معلومات اور کام کی جگہیں درج کریں۔',
  'master-data': 'برانچز، شعبے، عہدے، زون اور اجرت کی اقسام ترتیب دیں۔',
  employees: 'فعال ملازمین کی فہرست اور قانونی تعمیل کا ریکارڈ۔',
  recruitment: 'بھرتی کا عمل، اسامیاں اور امیدواروں کی درخواستیں۔',
  performance: 'کارکردگی کا جائزہ، اہداف اور درجہ بندی۔',
  assets: 'اثاثے واپس ہونے تک ملازمت کا اختتام مکمل نہیں ہوتا۔',
  holidays: 'سرکاری اور کمپنی کی تعطیلات کا کیلنڈر۔',
  leaves: 'پے رول سے پہلے چھٹی کی درخواستوں کی منظوری ضروری ہے۔',
  biometric: 'ہر مقام پر ریڈرز اور رجسٹرڈ ملازمین۔',
  attendance: 'کون موجود ہے، کن معاملات پر فیصلہ درکار ہے، اور ماہانہ رجسٹر۔',
  loans: 'قرضوں اور ایڈوانس کی اقساط کی خودکار وصولی۔',
  revisions: 'منظور شدہ اضافے اور تنخواہ میں ترامیم کی تاریخ۔',
  payroll: 'مرحلہ 10: ماہانہ تنخواہ، قانونی کٹوتیاں اور ادائیگی۔',
  gratuity: 'حتمی تصفیہ، گریجویٹی اور کلیئرنس۔',
  lifecycle: 'تقرری، پروبیشن، تبادلے، ترقی اور علیحدگی — دوسرے صارف کی منظوری کے ساتھ۔',
  access: 'صارف اکاؤنٹس، کردار اور اختیارات۔',
  maintenance: 'ڈیٹا بیک اپ اور بحالی۔',
  notifications: 'سسٹم کی سرگرمی، پے رول یاد دہانیاں اور اہم اطلاعات۔',
  help: 'تعمیل کی مکمل رہنمائی اور پورٹل گائیڈ۔',
};

const TAB_HELP_UR: Record<PortalTab, string> = {
  dashboard: 'اس صفحے کی ہر معلومات انہی ریکارڈز سے آتی ہے جو پے رول استعمال کرتا ہے؛ جو یہاں درست ہے وہی پے رول میں درست ہوگا۔',
  settings: 'قانونی حدود درست کریں۔ صوبائی کم از کم اجرت، ای او بی آئی اور سوشل سیکیورٹی کی حدیں اگلے پے رول کی کٹوتیاں طے کرتی ہیں۔ ہر تبدیلی دوسرے صارف کی منظوری کے بعد لاگو ہوتی ہے۔',
  'company-setup': 'پے رول دستاویزات پر کمپنی کا قانونی نام اور رجسٹریشن نمبر چھپتے ہیں، اور ہر مقام کا صوبہ کم از کم اجرت، سوشل سیکیورٹی اور چھٹی کے قواعد طے کرتا ہے۔',
  'master-data': 'ماسٹر ڈیٹا ملازمین کی شمولیت، حاضری اور پے رول رجسٹر میں استعمال ہونے والی معیاری فہرستیں فراہم کرتا ہے۔',
  employees: 'ملازمین کے پروفائل، ٹیکس حیثیت، شناختی کارڈ اور بینک ریکارڈ کا انتظام کریں۔ پہلے کمپنی کا ماسٹر ڈیٹا مکمل کریں۔',
  recruitment: 'اسامیاں شائع کریں، امیدواروں کے مراحل دیکھیں، اور منتخب امیدواروں کو براہِ راست ملازمین کی فہرست میں شامل کریں۔',
  performance: 'سہ ماہی اور سالانہ کارکردگی کے جائزے، اہداف اور درجہ بندی، جو تنخواہ میں اضافے کی بنیاد بنتے ہیں۔',
  assets: 'کمپنی کے اثاثے اور ان کے حامل افراد۔ ملازمت ختم ہونے پر یہ اثاثے تصفیہ کی فہرست میں خود شامل ہو جاتے ہیں۔',
  holidays: 'سرکاری اور اختیاری تعطیلات کام کے دنوں اور ماہانہ حاضری کے حساب میں شامل ہوتی ہیں۔',
  leaves: 'چھٹی کی درخواستیں نمٹائیں، سالانہ، اتفاقی اور بیماری کی چھٹیوں کا بیلنس دیکھیں، اور پے رول سے پہلے نقد ادائیگی کی اہلیت چیک کریں۔',
  biometric: 'آلات حاضری درج کرتے ہیں؛ عملہ ویب یا موبائل ایپ سے چہرے کی تصدیق اور جی پی ایس حد بندی کے ساتھ بھی حاضری لگا سکتا ہے۔',
  attendance: 'پے رول سے پہلے فیصلے درکار ہیں۔ درستگی کی درخواستیں نمٹائیں، پھر ماہانہ رجسٹر کو لاک کریں تاکہ کام کے دن درست شمار ہوں۔',
  loans: 'کمپنی کے قرضے اور ایڈوانس۔ فعال قسطیں تنخواہ کی ادائیگی پر خودکار طور پر کٹتی ہیں۔',
  revisions: 'تنخواہ کی تاریخ اور منظور شدہ اضافے۔ ہر ترمیم دوسرے صارف کی منظوری سے لاگو ہوتی ہے؛ ماضی کی تاریخ سے ترمیم پر بقایا جات بنتے ہیں۔',
  payroll: 'حاضری اور کٹوتیوں کا جائزہ لیں، ٹیکس کا حساب کریں، اور بینک ادائیگی کی فائل تیار کریں۔ تیاری، منظوری اور ادائیگی الگ الگ صارفین کرتے ہیں۔',
  gratuity: 'اثاثے واپس ہونے تک علیحدگی مکمل نہیں ہوتی۔ حتمی تصفیہ، گریجویٹی اور چھٹیوں کی نقد ادائیگی کا حساب کریں۔',
  lifecycle: 'ملازمت کی تبدیلیوں کی درخواست دیں؛ ملازم کا ریکارڈ دوسرے مجاز صارف کی منظوری کے بعد بدلتا ہے۔ علیحدگی پر حتمی تصفیہ خود بنتا ہے۔',
  access: 'کردار (ایڈمن، ایچ آر مینیجر، پے رول آفیسر، آڈیٹر) ترتیب دیں اور ماڈیول کے اختیارات تفویض کریں۔',
  maintenance: 'سرور کی صحت اور ڈیٹا کی ہم آہنگی چیک کریں، اور بحالی کے لیے بیک اپ محفوظ کریں۔',
  notifications: 'خودکار اطلاعات، منظوری کی درخواستیں، آلات کی وارننگز اور قانونی آخری تاریخیں۔',
  help: 'انکم ٹیکس آرڈیننس 2001، ای او بی آئی ایکٹ 1976، صوبائی سوشل سیکیورٹی اور فیکٹریز ایکٹ کی رہنمائی۔',
};

const TAB_WORKFLOW_META: Record<PortalTab, {
  heading: string;
  help: string;
  guideTitle: string;
  guideContent: string;
}> = {
  dashboard: {
    heading: 'Good morning. Five things need you today; the first three take a minute each.',
    help: 'Everything on this page comes from the same records payroll uses, so if it looks right here it is right there.',
    guideTitle: 'Guide for Operations Dashboard',
    guideContent: 'Step 12 of 12. The dashboard only reports; it never computes anything of its own. If a number here is wrong, the fix is on one of the other eleven screens.'
  },
  settings: {
    heading: 'Statutory parameters dictate monthly payroll deductions across all provinces.',
    help: 'Fix required statutory thresholds. Provincial minimum wage, EOBI, and PESSI/SESSI ceilings determine statutory deductions for the upcoming payroll run.',
    guideTitle: 'Guide for Statutory Config',
    guideContent: 'Step 1 of 12. Set up statutory tax slabs, provincial minimum wage, EOBI contribution limits, and social security ceilings before onboarding staff and running payroll.'
  },
  'company-setup': {
    heading: 'Tell the system who the company is and where people work.',
    help: 'Payroll outputs print the legal name and registration numbers, and the province of each location decides minimum wage, social security and leave rules.',
    guideTitle: 'Guide for Company & Master Data',
    guideContent: 'Step 2 of 12. Fill the legal details and registration numbers (NTN, STRN, EOBI, PESSI/SESSI), check location provinces, and ensure departments and shifts exist, because the onboarding form in step 3 can only pick from these lists.'
  },
  'master-data': {
    heading: 'Configure global branches, departments, designations, zones, and wage types.',
    help: 'Master data provides standardized hierarchy lists used across employee onboarding, attendance allocation, and cost center payroll registers.',
    guideTitle: 'Guide for Master Data Hierarchy',
    guideContent: 'Define operational branches, departments, designations, and wage types. All records connect to these master definitions.'
  },
  employees: {
    heading: 'Active employee directory and statutory compliance profile records.',
    help: 'Manage employee profiles, statutory tax status, CNIC, and banking records. The onboarding wizard requires company master data to be defined first.',
    guideTitle: 'Guide for Employee Directory',
    guideContent: 'Step 3 of 12. Manage the employee roster, assign designations, departments, shifts, compensation packages, and CNIC details. Each employee\'s location determines their tax and provincial benefits.'
  },
  recruitment: {
    heading: 'Recruitment pipelines, active job postings, and candidate applications.',
    help: 'Post job openings, track candidate evaluation stages, and onboard hired applicants directly into the employee directory.',
    guideTitle: 'Guide for Recruitment',
    guideContent: 'Create job postings, review applicant resumes, schedule interviews, and initiate employee onboarding with one click upon hiring.'
  },
  performance: {
    heading: 'Employee performance appraisals, KPI tracking, and rating reviews.',
    help: 'Track quarterly and annual performance reviews, KPI goals, and appraisal ratings to inform merit salary revisions.',
    guideTitle: 'Guide for Performance Management',
    guideContent: 'Evaluate team members against measurable objectives and link appraisal scores directly into annual compensation reviews.'
  },
  assets: {
    heading: 'Assets block an exit until they are back.',
    help: 'What the company owns and who has it. When someone leaves, their assets appear on the settlement checklist automatically.',
    guideTitle: 'Guide for Asset Management',
    guideContent: 'Not on the payroll chain, but step 11 waits for it. Every company laptop, phone, or credential issued to staff is tracked here and must be cleared prior to final settlement payout.'
  },
  holidays: {
    heading: 'Gazetted public holidays and corporate holiday calendar.',
    help: 'Gazetted and optional holidays are factored into working day calculations and payroll period attendance.',
    guideTitle: 'Guide for Holiday Calendar',
    guideContent: 'Step 4 of 12. Configure federal and provincial public holidays. When payroll runs, working days and paid non-working days are automatically calculated based on this calendar.'
  },
  leaves: {
    heading: 'Leave requests require supervisor review prior to payroll attendance cutoff.',
    help: 'Process leave requests, track annual / casual / sick balances, and check encashment eligibility before payroll.',
    guideTitle: 'Guide for Leave Management',
    guideContent: 'Step 5 of 12. Approve or decline pending leave applications. Approved leaves are credited as paid days in the attendance register, preventing unauthorized absence salary deductions.'
  },
  biometric: {
    heading: 'Readers at each location, and who is enrolled.',
    help: 'Devices capture physical punches, while staff can also punch from the web or the mobile app with biometric facial verification and GPS geofencing.',
    guideTitle: 'Guide for Biometric Devices',
    guideContent: 'Step 6 of 12. A device is the easiest way to get clean punches, but it is not required: web and mobile punches are tagged by source and go through the same rules in step 7.'
  },
  attendance: {
    heading: 'Who is in, what needs a decision, and the monthly register payroll will use.',
    help: 'Two things need a decision before payroll. Clear regularization exceptions to ensure accurate work day counts for the monthly salary register.',
    guideTitle: 'Guide for Attendance',
    guideContent: 'Step 7 of 12. Clear everything in "Needs review" before running payroll; the payroll screen will refuse to lock a period with open items.'
  },
  loans: {
    heading: 'Track company loans and salary advances with automated installment recovery.',
    help: 'Track company loans and salary advances. Active loan installments are automatically deducted from the monthly payroll slip.',
    guideTitle: 'Guide for Loans & Advances',
    guideContent: 'Step 8 of 12. Review employee loan applications and approve advances. Approved repayment schedules are automatically included as payroll deductions.'
  },
  revisions: {
    heading: 'Approved compensation increments and salary revision history.',
    help: 'View salary histories, revision bands, and approved compensation increments before running current month payroll.',
    guideTitle: 'Guide for Salary Revisions',
    guideContent: 'Step 9 of 12. Schedule and approve salary adjustments, increment letters, and grade promotions before the payroll cut-off date.'
  },
  payroll: {
    heading: 'Step 10 of 12: Monthly salary computation, statutory withholding, and disbursement.',
    help: 'Review attendance and deductions, calculate tax withholding, and disburse bank payment sheets.',
    guideTitle: 'Guide for Payroll Processing',
    guideContent: 'Step 10 of 12. Run the monthly payroll cycle, verify tax withholding under the Income Tax Ordinance, verify EOBI/social security contributions, and generate bank disbursement sheets.'
  },
  gratuity: {
    heading: 'Offboarding final settlements, gratuity entitlement, and clearance checklist.',
    help: 'Assets block an exit until they are back. Compute final settlements, gratuity entitlements, and leave encashment clearances.',
    guideTitle: 'Guide for Gratuity & Settlement',
    guideContent: 'Step 11 of 12. Offboard exiting personnel with full final settlement calculation including gratuity (30 days basic pay per completed year of service) and unutilized leave encashment.'
  },
  lifecycle: {
    heading: 'Onboarding, probation, transfers, promotions and separations with second-user approval.',
    help: 'Raise lifecycle requests; another authorized user approves them before the employee record changes. Separations create the final settlement automatically.',
    guideTitle: 'Guide for Employee Lifecycle',
    guideContent: 'Raise a request, have a different HR user approve it, then complete onboarding items and issue employment or experience letters.'
  },
  access: {
    heading: 'User access accounts, roles, and administrative permissions.',
    help: 'Configure multi-tier roles (Super Admin, HR Manager, Payroll Officer, Auditor) and assign granular module permissions.',
    guideTitle: 'Guide for User Management',
    guideContent: 'Enforce dual authorization principles: one officer prepares payroll, another approves. Granular permissions govern access to salaries and audit logs.'
  },
  maintenance: {
    heading: 'Database backup, synchronization, and system recovery snapshots.',
    help: 'Verify server health, inspect local and database synchronization states, and export database recovery snapshots.',
    guideTitle: 'Guide for Data Backup & Maintenance',
    guideContent: 'Ensure offline logs and biometric attestation events are securely backed up. Database synchronization runs continuously.'
  },
  notifications: {
    heading: 'System activity log, payroll cutoff reminders, and critical alerts.',
    help: 'Review automated notifications, approval requests, reader connection warnings, and statutory filing deadlines.',
    guideTitle: 'Guide for Notifications',
    guideContent: 'Central notifications center displaying all items requiring decision or action by HR and payroll administrators.'
  },
  help: {
    heading: 'Complete compliance handbook, Pakistan statutory labor laws, and portal guide.',
    help: 'Reference guidelines for Income Tax Ordinance 2001, EOBI Act 1976, Provincial Social Security, and Factories Act.',
    guideTitle: 'Guide for User Guide & Documentation',
    guideContent: 'Comprehensive documentation and statutory reference materials for Pakistan HR and payroll operations.'
  }
};

const SEARCHABLE_PAGES: Array<{ tab: PortalTab; label: string; category: string }> = [
  { tab: 'dashboard', label: 'Operations Dashboard', category: 'Overview' },
  { tab: 'settings', label: '1. Statutory Config', category: 'Set Up (Do Once)' },
  { tab: 'company-setup', label: '2. Company & Master Data', category: 'Set Up (Do Once)' },
  { tab: 'employees', label: '3. Employee Directory', category: 'People' },
  { tab: 'recruitment', label: 'Recruitment', category: 'People' },
  { tab: 'performance', label: 'Performance', category: 'People' },
  { tab: 'assets', label: 'Asset Management', category: 'People' },
  { tab: 'holidays', label: '4. Holiday Calendar', category: 'Time' },
  { tab: 'leaves', label: '5. Leave Management', category: 'Time' },
  { tab: 'biometric', label: '6. Biometric Devices', category: 'Time' },
  { tab: 'attendance', label: '7. Attendance', category: 'Time' },
  { tab: 'loans', label: '8. Loans & Advances', category: 'Payroll' },
  { tab: 'revisions', label: '9. Salary Revisions', category: 'Payroll' },
  { tab: 'payroll', label: '10. Payroll Processing', category: 'Payroll' },
  { tab: 'gratuity', label: '11. Gratuity & Settlement', category: 'Payroll' },
  { tab: 'maintenance', label: 'Data Backup', category: 'System' },
  { tab: 'access', label: 'User Management', category: 'System' },
  { tab: 'master-data', label: 'Master Data Lists', category: 'System' },
  { tab: 'notifications', label: 'Notifications Center', category: 'System' },
  { tab: 'help', label: 'User Guide & Labor Laws', category: 'Help' },
];

export function WebPortal({
  employees,
  attendances,
  mobileDutyAuthorizations,
  leaves,
  statConfig,
  taxSlabs,
  payrollRuns,
  attendancePeriods,
  payrollPayslips,
  payrollAdjustments,
  onCreatePayrollAdjustment,
  onReviewPayrollAdjustment,
  onAddEmployee,
  onUpdateEmployee,
  onUpdateStatConfig,
  onUpdateTaxSlabs,
  onApproveLeave,
  onRejectLeave,
  onApproveRegularization,
  onRejectRegularization,
  onCreatePayrollRun,
  onLockAttendancePeriod,
  onReopenAttendancePeriod,
  onUpdatePayrollStatus,
  onCancelPayrollRun,
  statutoryChangeRequests,
  onReviewStatutoryChange,
  lifecycleRequests,
  onCreateLifecycleRequest,
  onReviewLifecycleRequest,
  onUpdateOnboarding,
  onCreateSupplementaryRun,
  onCreateFinalSettlementRun,
  onRecordTaxDeposit,
  onMarkPaymentFailed,
  onRecordPaymentRetry,
  onRetroRecalculate,
  onRecordParallelRun,
  onRecordBankAdvice,
  onSendPayslips,
  onApplyLeave,
  onAddAttendance,
  branches,
  companies,
  onSaveCompanySetup,
  departments,
  designations,
  zones,
  ucTowns,
  wageTypes,
  onSaveMasterData,
  roles,
  users,
  currentUserAccount,
  accessControlLoaded,
  onSetCurrentUserAccount: _onSetCurrentUserAccount,
  onAddRole,
  onUpdateRole,
  onAddUser,
  onDeleteUser,
  onUpdateUserRole,
  onUpdateUser,
  onSaveMobileDutyAuthorization,
  onCancelMobileDutyAuthorization,
  onLogout,
  onAddBranch,
  onAddDepartment,
  onAddDesignation,
  holidays,
  onAddHoliday,
  onUpdateHoliday,
  onDeleteHoliday,
  loanAdvances,
  onApplyLoan,
  onApproveLoan,
  onRejectLoan,
  salaryRevisions,
  onAddSalaryRevision,
  loggedInUser,
  performanceReviews,
  onAddPerformanceReview,
  onUpdatePerformanceReview,
  companyAssets,
  onAddAsset,
  onUpdateAsset,
  jobPostings,
  onAddJobPosting,
  onUpdateJobPosting,
  jobApplications,
  onAddJobApplication,
  onUpdateJobApplication,
  gratuitySettlements,
  onAddGratuitySettlement,
  onUpdateGratuitySettlement,
  notifications,
  onAddNotification,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onDeleteNotification,
  onSimulatePunch,
  firestoreSyncStatus
}: WebPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedNavGroup, setExpandedNavGroup] = useState<NavGroupKey | null>('system');
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(current => current === msg ? null : current);
    }, 2600);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowGuideModal(false);
        setShowQuickSearch(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowQuickSearch(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const currentDateString = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const closeSidebar = () => setSidebarOpen(false);
  // Settings edit the pending proposal (maker-checker); payroll always uses the live statConfig/taxSlabs.
  const pendingStatutoryChange = statutoryChangeRequests.find(item => item.status === 'Pending');
  const editableStatConfig = pendingStatutoryChange?.proposedConfig || statConfig;
  const editableTaxSlabs = pendingStatutoryChange?.proposedTaxSlabs || taxSlabs;
  const activeTaxSlabs = editableTaxSlabs && editableTaxSlabs.length > 0 ? editableTaxSlabs : DEFAULT_TAX_SLABS;
  const [payslipUrdu, setPayslipUrdu] = useState(false);
  // English stays the authoritative record; Urdu is offered for navigation and employee-facing documents.
  const [portalLanguage, setPortalLanguage] = useState<'en' | 'ur'>(() => {
    try { return window.localStorage.getItem('hr_portal_language') === 'ur' ? 'ur' : 'en'; } catch { return 'en'; }
  });
  const togglePortalLanguage = () => setPortalLanguage(previous => {
    const next = previous === 'en' ? 'ur' : 'en';
    try { window.localStorage.setItem('hr_portal_language', next); } catch { /* preference is optional */ }
    setPayslipUrdu(next === 'ur');
    return next;
  });
  const navLabel = (english: string, urdu: string) => portalLanguage === 'ur' ? urdu : english;
  useEffect(() => {
    const main = portalLanguage === 'ur' ? document.getElementById('web-main-panel') : null;
    return main ? applyUrduInterface(main) : undefined;
  }, [portalLanguage]);
  const [paymentExceptionRun, setPaymentExceptionRun] = useState<PayrollRun | null>(null);
  const [alertChannels, setAlertChannels] = useState<{ email: boolean; sms: boolean; whatsapp: boolean; known: boolean }>({ email: false, sms: false, whatsapp: false, known: false });
  useEffect(() => {
    if (activeTab !== 'payroll' && activeTab !== 'dashboard') return;
    let active = true;
    payrollApi('/api/payroll-delivery/channels').then(result => { if (active) setAlertChannels({ email: Boolean(result.email), sms: Boolean(result.sms), whatsapp: Boolean(result.whatsapp), known: true }); }).catch(() => undefined);
    return () => { active = false; };
  }, [activeTab]);
  const sendSalaryAlerts = async (runId: string, channel: 'sms' | 'whatsapp') => {
    try {
      const result = await payrollApi(`/api/payroll-delivery/${encodeURIComponent(runId)}/alerts`, { method: 'POST', body: JSON.stringify({ channel }) }) as { sent: number; skipped: number; failed: Array<{ employeeId: string; error: string }> };
      const summary = `${result.sent} sent, ${result.skipped} already delivered, ${result.failed.length} failed.`;
      if (result.failed.length) alert(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} alerts completed with exceptions: ${summary}\n• ${result.failed.slice(0, 8).map(item => `${employees.find(employee => employee.id === item.employeeId)?.fullName || item.employeeId}: ${item.error}`).join('\n• ')}`);
      else showToast(`${channel === 'sms' ? 'SMS' : 'WhatsApp'} alerts: ${summary}`);
    } catch (error) { alert(error instanceof Error ? error.message : 'Alerts could not be sent.'); }
  };
  const openComplianceAlerts = useMemo(() => complianceAlerts({ employees, attendances, branches, wageTypes, statConfig }), [employees, attendances, branches, wageTypes, statConfig]);
  const bilingual = (english: string, urdu: string) => payslipUrdu ? `${english} / ${urdu}` : english;
  const updateTaxSlab = (id: string, field: keyof Pick<TaxSlab, 'minIncome' | 'maxIncome' | 'baseTax' | 'percentage'>, value: number) =>
    onUpdateTaxSlabs(activeTaxSlabs.map(slab => slab.id === id ? { ...slab, [field]: value } : slab));

  const handleDownloadFbrCsv = () => {
    const activeSlabs = taxSlabs && taxSlabs.length > 0 ? taxSlabs : DEFAULT_TAX_SLABS;
    const headers = ['Slab #', 'Min Annual Income (PKR)', 'Max Annual Income (PKR)', 'Fixed Base Tax (PKR)', 'Tax Rate (%)', 'FBR Rule Description'];
    const rows = activeSlabs.map((s, idx) => {
      const slabNum = idx + 1;
      const min = s.minIncome;
      const max = s.maxIncome >= 999999999 ? 'Exceeding' : s.maxIncome;
      const base = s.baseTax;
      const pctValue = s.percentage < 1 && s.percentage > 0 ? (s.percentage * 100) : s.percentage;
      const rate = `${pctValue}%`;
      const desc = s.maxIncome <= 600000 
        ? 'Where taxable income does not exceed Rs. 600,000: 0%'
        : s.maxIncome >= 999999999
          ? `Where taxable income exceeds Rs. ${s.minIncome.toLocaleString()}: Rs. ${s.baseTax.toLocaleString()} + ${pctValue}% of the amount exceeding Rs. ${s.minIncome.toLocaleString()}`
          : `Where taxable income exceeds Rs. ${s.minIncome.toLocaleString()} but does not exceed Rs. ${s.maxIncome.toLocaleString()}: Rs. ${s.baseTax.toLocaleString()} + ${pctValue}% of the amount exceeding Rs. ${s.minIncome.toLocaleString()}`;
      return [slabNum, min, max, base, rate, `"${desc}"`].join(',');
    });
    rows.push('');
    rows.push('"Note: Under Section 4AB of Income Tax Ordinance 2001, a 10% surcharge is levied on income tax payable where taxable income exceeds Rs. 10,000,000."');
    
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `FBR_Salaried_Tax_Slabs_Finance_Act_${statConfig.taxYear || '2025'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadStatutoryReport = (kind: StatutoryReportKind, run: PayrollRun) => {
    try {
      const report = createStatutoryReport(kind, run, payrollPayslips, employees);
      const url = URL.createObjectURL(new Blob([report.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = report.filename;
      link.click();
      URL.revokeObjectURL(url);
      if (report.warnings.length) alert(`Return pack generated with ${report.warnings.length} review warning(s):\n• ${report.warnings.slice(0, 8).join('\n• ')}`);
      else showToast(`${kind.replace('_', ' ')} return reconciled: PKR ${report.total.toLocaleString()}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Statutory report could not be generated.');
    }
  };

  const downloadAccountingJournal = (run: PayrollRun) => {
    try {
      const journal = run.status === 'Cancelled' ? createPayrollReversalJournal(run, payrollPayslips, statConfig) : createPayrollJournal(run, payrollPayslips, statConfig);
      const url = URL.createObjectURL(new Blob([journal.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = journal.filename;
      link.click();
      URL.revokeObjectURL(url);
      showToast(`Balanced journal exported: PKR ${journal.totalDebit.toLocaleString()}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Accounting journal could not be generated.');
    }
  };

  const handleUpdateFromFbr = () => {
    onUpdateTaxSlabs(DEFAULT_TAX_SLABS);
    alert('FBR Income Tax Slabs successfully updated & synchronized with official FBR Finance Act 2024/2025 rates (First Schedule, Part I, Division I, Clause 2).');
  };

  const primaryCompany = companies[0];
  const companyDisplayName = (primaryCompany?.legalName || primaryCompany?.name || 'OneNet Solutions Pk.').trim();
  const companyLegalName = primaryCompany?.legalName || companyDisplayName;
  const companyCode = primaryCompany?.code || 'IND-KHI-456';
  const primaryBranch = branches.find(branch => branch.companyId === primaryCompany?.id);
  const companyAddressLine = [primaryCompany?.registeredAddress, primaryCompany?.city, primaryCompany?.province].filter(Boolean).join(', ');
  const companyRegistrationLine = [
    primaryCompany?.ntn || primaryCompany?.taxRegistrationNumber ? `NTN: ${primaryCompany?.ntn || primaryCompany?.taxRegistrationNumber}` : '',
    primaryCompany?.strn ? `STRN: ${primaryCompany.strn}` : '',
    primaryCompany?.eobiRegistration || primaryCompany?.eobiRegistrationNumber ? `EOBI: ${primaryCompany?.eobiRegistration || primaryCompany?.eobiRegistrationNumber}` : '',
    primaryCompany?.socialSecurityRegistration ? `Social Security: ${primaryCompany.socialSecurityRegistration}` : '',
  ].filter(Boolean).join(' • ');

  const currentUserRole = roles.find(r => r.id === currentUserAccount.roleId);
  const isCanonicalSuperAdmin = currentUserAccount.roleId === 'role-admin' || currentUserRole?.name === 'Super Admin';
  // Older Super Admin role documents may predate manage_access.
  // Preserve the canonical administrator's recovery path to User Management;
  // all other roles remain governed strictly by their saved permissions.
  const userPermissions = currentUserRole
    ? [...new Set([...currentUserRole.permissions, ...(isCanonicalSuperAdmin ? ['manage_access'] : [])])]
    : isCanonicalSuperAdmin
      ? ['manage_access']
      : [];
  const isRoleResolving = !accessControlLoaded || Boolean(currentUserAccount.roleId && !currentUserRole && roles.length === 0);
  const syncBadgeClass =
    firestoreSyncStatus.state === 'synced'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : firestoreSyncStatus.state === 'warning'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : firestoreSyncStatus.state === 'syncing'
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-slate-100 text-slate-600 border-slate-200';
  const syncLabel =
    firestoreSyncStatus.state === 'synced'
      ? 'Server Synced'
      : firestoreSyncStatus.state === 'warning'
        ? 'Sync Warning'
        : firestoreSyncStatus.state === 'syncing'
          ? 'Syncing Server'
          : 'Local Mode';

  const hasPermission = (tab: string) => {
    if (!accessControlLoaded) return false;
    if (tab === 'dashboard') return userPermissions.includes('view_dashboard');
    if (tab === 'employees') return userPermissions.includes('manage_employees');
    if (tab === 'attendance') return userPermissions.includes('manage_attendance');
    if (tab === 'leaves') return userPermissions.includes('manage_leaves');
    if (tab === 'payroll') return userPermissions.includes('manage_payroll');
    if (tab === 'settings') return userPermissions.includes('manage_settings');
    if (tab === 'company-setup') return userPermissions.includes('manage_settings');
    if (tab === 'master-data') return userPermissions.includes('manage_settings');
    if (tab === 'access') return userPermissions.includes('manage_access');
    if (tab === 'maintenance') return userPermissions.includes('manage_access') || userPermissions.includes('manage_settings');
    if (tab === 'holidays') return userPermissions.includes('manage_attendance') || userPermissions.includes('manage_settings');
    if (tab === 'loans') return userPermissions.includes('manage_payroll') || userPermissions.includes('manage_employees');
    if (tab === 'revisions') return userPermissions.includes('manage_payroll') || userPermissions.includes('manage_employees');
    if (tab === 'performance') return userPermissions.includes('manage_employees') || userPermissions.includes('view_dashboard');
    if (tab === 'assets') return userPermissions.includes('manage_employees') || userPermissions.includes('manage_settings');
    if (tab === 'recruitment') return userPermissions.includes('manage_employees');
    if (tab === 'gratuity') return userPermissions.includes('manage_payroll');
    if (tab === 'lifecycle') return userPermissions.includes('manage_employees');
    if (tab === 'notifications') return true;
    if (tab === 'help') return true;
    if (tab === 'biometric') return userPermissions.includes('manage_attendance') || userPermissions.includes('manage_employees');
    return false;
  };
  
  // Modals state
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showEditEmpModal, setShowEditEmpModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editDepartmentMoveNotice, setEditDepartmentMoveNotice] = useState('');
  const [showBankFileModal, setShowBankFileModal] = useState<PayrollRun | null>(null);
  const [showPayslipModal, setShowPayslipModal] = useState<Payslip | null>(null);
  const [showOffboardModal, setShowOffboardModal] = useState<Employee | null>(null);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userEditSaving, setUserEditSaving] = useState(false);
  const [userEditError, setUserEditError] = useState('');
  
  // Forms local state
  const [newEmpForm, setNewEmpForm] = useState({
    fullName: '',
    email: '',
    contactNumber: '+923001234567',
    cnic: '42101-1234567-3',
    cnicExpiryDate: '',
    drivingLicenceExpiryDate: '',
    professionalCertificationExpiryDate: '',
    workPermitExpiryDate: '',
    workerCategory: 'Worker',
    perquisiteVehicleMonthly: '',
    perquisiteAccommodationMonthly: '',
    perquisiteOtherMonthly: '',
    contractEndDate: '',
    probationEndDate: '',
    probationConfirmed: false,
    gender: 'Male',
    dateOfBirth: '1995-01-01',
    branchId: 'b1',
    departmentId: 'd1',
    designationId: 'ds1',
    zoneId: '',
    ucTownId: '',
    wageTypeId: '',
    wageType: 'Salaried' as string,
    basicSalary: 85000,
    shiftStartTime: '09:00', shiftEndTime: '17:00', shiftGraceMinutes: 15, shiftHalfDayMinutes: 120, shiftBreakMinutes: 0,
    ramadanStartDate: '', ramadanEndDate: '', ramadanStartTime: '09:00', ramadanEndTime: '15:00', fridayStartTime: '', fridayEndTime: '',
    providentFundOptIn: true,
    providentFundRate: 5.0,
    gratuityOptIn: true,
    bankName: 'Habib Bank Limited (HBL)',
    bankAccountNumber: '12345678901234',
    iban: 'PK42HABB0012345678901234',
    eobiNumber: '1090123000',
    socialSecurityNumber: 'SS-42-000111',
    eobiExemptionReason: '', socialSecurityExemptionReason: '',
    ntn: '',
    // Custom onboarding fields
    pictureUrl: '',
    isZoneInCharge: false,
    zoneInChargeName: '',
    zone: 'East Zone',
    ucTown: 'UC-2 Clifton Town',
    houseRentAllowance: 25500,
    conveyanceAllowance: 8500,
    medicalAllowance: 8500,
    otherAllowances: 0,
    eobiEnabled: true,
    fbrEnabled: true,
    priorEmployerTaxableIncome: 0,
    priorEmployerTaxDeducted: 0,
    employeeCode: '',
    maritalStatus: 'Single'
  });

  const [editEmpForm, setEditEmpForm] = useState({
    fullName: '',
    email: '',
    contactNumber: '+923001234567',
    cnic: '',
    cnicExpiryDate: '',
    drivingLicenceExpiryDate: '',
    professionalCertificationExpiryDate: '',
    workPermitExpiryDate: '',
    workerCategory: 'Worker',
    perquisiteVehicleMonthly: '',
    perquisiteAccommodationMonthly: '',
    perquisiteOtherMonthly: '',
    contractEndDate: '',
    probationEndDate: '',
    probationConfirmed: false,
    gender: 'Male',
    dateOfBirth: '1995-01-01',
    branchId: 'b1',
    departmentId: 'd1',
    designationId: 'ds1',
    zoneId: '',
    ucTownId: '',
    wageTypeId: '',
    wageType: 'Salaried' as string,
    basicSalary: 85000,
    shiftStartTime: '09:00', shiftEndTime: '17:00', shiftGraceMinutes: 15, shiftHalfDayMinutes: 120, shiftBreakMinutes: 0,
    ramadanStartDate: '', ramadanEndDate: '', ramadanStartTime: '09:00', ramadanEndTime: '15:00', fridayStartTime: '', fridayEndTime: '',
    providentFundOptIn: true,
    providentFundRate: 5.0,
    gratuityOptIn: true,
    bankName: '',
    bankAccountNumber: '',
    iban: '',
    eobiNumber: '',
    socialSecurityNumber: '',
    eobiExemptionReason: '', socialSecurityExemptionReason: '',
    ntn: '',
    pictureUrl: '',
    isZoneInCharge: false,
    zoneInChargeName: '',
    zone: '',
    ucTown: '',
    houseRentAllowance: 0,
    conveyanceAllowance: 0,
    medicalAllowance: 0,
    otherAllowances: 0,
    eobiEnabled: true,
    fbrEnabled: true,
    priorEmployerTaxableIncome: 0,
    priorEmployerTaxDeducted: 0,
    employeeCode: '',
    maritalStatus: 'Single'
  });

  const [newEmpTakeHome, setNewEmpTakeHome] = useState(false);
  const [editEmpTakeHome, setEditEmpTakeHome] = useState(false);
  const [viewImageModal, setViewImageModal] = useState<{ open: boolean; url: string; title: string; subtitle?: string } | null>(null);
  const [documentVaultEmployee, setDocumentVaultEmployee] = useState<Employee | null>(null);
  const [bankAdviceProfile, setBankAdviceProfile] = useState<string>('tpl-generic-csv');
  const [bankValueDate, setBankValueDate] = useState(new Date().toISOString().slice(0, 10));
  const bankTemplates = exportTemplatesFor(statConfig, 'Bank Advice');
  const selectedBankTemplate = bankTemplates.find(item => item.id === bankAdviceProfile) || bankTemplates[0];
  const batchReferenceFor = (run: PayrollRun) => `${run.periodYear}${String(run.periodMonth).padStart(2, '0')}${run.id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase()}`;
  const downloadText = (content: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: filename.endsWith('.csv') ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  };
  const downloadTemplateReturn = (kind: Exclude<ExportKind, 'Bank Advice'>, run: PayrollRun) => {
    const templates = exportTemplatesFor(statConfig, kind);
    const template = templates.find(item => item.verified) || templates[0];
    if (!template) { alert(`Configure a ${kind} template in Statutory Config first.`); return; }
    const result = renderExport(template, payrollPayslips, { run, companyName: companyLegalName, valueDate: run.endDate, batchReference: batchReferenceFor(run), employees });
    if (result.errors.length) { alert(`${kind} file blocked — ${result.errors.length} problem(s):\n• ${result.errors.slice(0, 10).join('\n• ')}`); return; }
    downloadText(result.content, result.filename);
    if (result.warnings.length) alert(result.warnings.join('\n'));
    else showToast(`${kind}: ${result.recordCount} rows, PKR ${result.totalAmount.toLocaleString()}`);
  };

  const now = new Date();
  const [payrollMonth, setPayrollMonth] = useState(now.getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(now.getFullYear());
  const [adjustmentEmployeeId, setAdjustmentEmployeeId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<PayrollAdjustmentType>('Bonus');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentTaxable, setAdjustmentTaxable] = useState(true);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [mfaEnrollment, setMfaEnrollment] = useState<{ enrollmentId: string; secret: string; issuer: string; account: string; otpauthUri: string } | null>(null);
  const [mfaSetupChoice, setMfaSetupChoice] = useState<'choose' | 'totp' | 'email' | null>(null);
  const [emailMfaEnrollment, setEmailMfaEnrollment] = useState<{ enrollmentId: string; email: string } | null>(null);
  const [mfaQrCode, setMfaQrCode] = useState('');
  const [mfaEnrollmentCode, setMfaEnrollmentCode] = useState('');
  const [mfaEmailCode, setMfaEmailCode] = useState('');
  const [mfaEnabledLocally, setMfaEnabledLocally] = useState(false);
  const [mfaEnrollmentError, setMfaEnrollmentError] = useState('');
  const [showMfaRecoveryForm, setShowMfaRecoveryForm] = useState(false);
  const [mfaRecoveryReason, setMfaRecoveryReason] = useState('');
  const [mfaRecoveryError, setMfaRecoveryError] = useState('');
  const [mfaRecoverySubmitting, setMfaRecoverySubmitting] = useState(false);
  const [adminRecoveryTargetId, setAdminRecoveryTargetId] = useState('');
  const [adminRecoveryReason, setAdminRecoveryReason] = useState('');
  const [mfaRecoveryRequests, setMfaRecoveryRequests] = useState<MfaRecoveryRequest[]>([]);
  const [mfaRecoveryRequestsLoading, setMfaRecoveryRequestsLoading] = useState(false);
  const [reviewingMfaRecoveryId, setReviewingMfaRecoveryId] = useState<string | null>(null);

  // Settlement manual additions for offboarding
  const [settlementLeavesEncash, setSettlementLeavesEncash] = useState(10);
  const [settlementType, setSettlementType] = useState<GratuitySettlement['separationType']>('Resignation');
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [settlementNoticeDays, setSettlementNoticeDays] = useState(0);
  const [settlementReason, setSettlementReason] = useState('');

  // System country settings (defaulting to Pakistan)
  const selectedCountry = 'Pakistan';

  useEffect(() => {
    setMfaEnabledLocally(Boolean(currentUserAccount.mfaEnabled));
  }, [currentUserAccount.id, currentUserAccount.mfaEnabled]);

  const mfaEnabled = Boolean(currentUserAccount.mfaEnabled || mfaEnabledLocally);
  const mfaRequiredForRole = userPermissions.some(permission =>
    ['manage_access', 'manage_payroll'].includes(permission)
  );
  const canManageMfaRecovery = userPermissions.includes('manage_access');

  const beginMfaEnrollment = async () => {
    try {
      setMfaEnrollmentError('');
      setMfaSetupChoice('totp');
      const enrollment = await authenticatedApiRequest('/api/auth/mfa/enroll', { method: 'POST', body: '{}' });
      const qrCode = await QRCode.toDataURL(enrollment.otpauthUri, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 224,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
      setMfaEnrollment(enrollment);
      setMfaQrCode(qrCode);
      setMfaEnrollmentCode('');
    } catch (error) {
      setMfaQrCode('');
      setMfaEnrollmentError(error instanceof Error ? error.message : 'MFA enrollment could not start.');
    }
  };

  const beginEmailMfaEnrollment = async () => {
    try {
      setMfaEnrollmentError('');
      setMfaSetupChoice('email');
      const enrollment = await authenticatedApiRequest('/api/auth/mfa/email-enroll/request', { method: 'POST', body: '{}' });
      setEmailMfaEnrollment(enrollment);
      setMfaEmailCode('');
    } catch (error) {
      setMfaSetupChoice(null);
      setMfaEnrollmentError(error instanceof Error ? error.message : 'Email MFA enrollment could not start.');
    }
  };

  const confirmMfaEnrollment = async () => {
    if (!mfaEnrollment) return;
    try {
      setMfaEnrollmentError('');
      await authenticatedApiRequest('/api/auth/mfa/confirm', {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: mfaEnrollment.enrollmentId, code: mfaEnrollmentCode })
      });
      setMfaEnabledLocally(true);
      setMfaEnrollment(null);
      setMfaQrCode('');
      setMfaEnrollmentCode('');
      showToast('Authenticator MFA is enabled. Other sessions for this account were revoked.');
    } catch (error) {
      setMfaEnrollmentError(error instanceof Error ? error.message : 'Authenticator code could not be verified.');
    }
  };

  const confirmEmailMfaEnrollment = async () => {
    if (!emailMfaEnrollment) return;
    try {
      setMfaEnrollmentError('');
      await authenticatedApiRequest('/api/auth/mfa/email-enroll/confirm', { method: 'POST', body: JSON.stringify({ enrollmentId: emailMfaEnrollment.enrollmentId, code: mfaEmailCode }) });
      setMfaEnabledLocally(true); setEmailMfaEnrollment(null); setMfaSetupChoice(null); setMfaEmailCode('');
      showToast('Email MFA is enabled. Other sessions for this account were revoked.');
    } catch (error) { setMfaEnrollmentError(error instanceof Error ? error.message : 'Email code could not be verified.'); }
  };

  const reviewMfaRecoveryRequest = async (requestId: string, decision: 'Approved' | 'Rejected') => {
    try {
      setReviewingMfaRecoveryId(requestId);
      await authenticatedApiRequest(`/api/auth/mfa/recovery-request/${encodeURIComponent(requestId)}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ decision })
      });
      setMfaRecoveryRequests(current => current.filter(request => request.id !== requestId));
      showToast(`MFA recovery request ${decision.toLowerCase()}.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'MFA recovery request could not be reviewed.');
    } finally {
      setReviewingMfaRecoveryId(null);
    }
  };

  const submitMfaRecoveryRequest = async (userId?: string, requestedReason?: string) => {
    const reason = (requestedReason ?? mfaRecoveryReason).trim();
    if (reason.length < 10) {
      setMfaRecoveryError('Please provide a short reason (at least 10 characters) so an administrator can verify your request.');
      return;
    }
    try {
      setMfaRecoveryError('');
      setMfaRecoverySubmitting(true);
      await authenticatedApiRequest('/api/auth/mfa/recovery-request', { method: 'POST', body: JSON.stringify({ reason, ...(userId ? { userId } : {}) }) });
      setMfaRecoveryReason('');
      setShowMfaRecoveryForm(false);
      setAdminRecoveryReason('');
      setAdminRecoveryTargetId('');
      showToast('MFA recovery request sent for administrator review.');
    } catch (error) {
      setMfaRecoveryError(error instanceof Error ? error.message : 'MFA recovery request could not be sent.');
    } finally {
      setMfaRecoverySubmitting(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'access' || !canManageMfaRecovery) return;
    let cancelled = false;
    setMfaRecoveryRequestsLoading(true);
    authenticatedApiRequest('/api/auth/mfa/recovery-requests')
      .then((response: Array<Record<string, unknown>> | { requests?: Array<Record<string, unknown>> }) => {
        const requests = Array.isArray(response) ? response : response.requests || [];
        if (!cancelled) setMfaRecoveryRequests(requests.map(request => ({
          id: String(request.id), userId: String(request.userId), requestedById: String(request.requestedById), username: String(request.userName || request.userId), email: request.email ? String(request.email) : undefined,
          roleName: request.roleName ? String(request.roleName) : undefined, reason: String(request.reason), createdAt: String(request.requestedAt || ''),
        })));
      })
      .catch(() => {
        if (!cancelled) setMfaRecoveryRequests([]);
      })
      .finally(() => {
        if (!cancelled) setMfaRecoveryRequestsLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeTab, canManageMfaRecovery]);

  // Local state copies of branches, departments, designations
  const [localBranches, setLocalBranches] = useState(branches);
  const [localDepartments, setLocalDepartments] = useState(departments);
  const [localDesignations, setLocalDesignations] = useState(designations);
  const companyBranches = localBranches.filter(branch => !primaryCompany || branch.companyId === primaryCompany.id);
  const activeZones = zones.filter(zone => (!primaryCompany || zone.companyId === primaryCompany.id) && zone.status === 'Active');
  const activeWageTypes = wageTypes.filter(wage => (!primaryCompany || wage.companyId === primaryCompany.id) && wage.status === 'Active');
  const editingCompanyId = editingEmployee
    ? resolveEmployeeCompanyId(editingEmployee, localBranches, companies.map(company => company.id), primaryCompany?.id)
    : '';
  const editingCompany = companies.find(company => company.id === editingCompanyId) || primaryCompany;
  const editBranchOptions = getEmployeeEditOptions(localBranches, editingCompanyId, editEmpForm.branchId);
  const editCompanyBranchIds = new Set(localBranches
    .filter(branch => !editingCompanyId || branch.companyId === editingCompanyId)
    .map(branch => branch.id));
  const editCompanyDepartmentsForResolution = localDepartments.filter(department => editCompanyBranchIds.has(department.branchId));
  const resolvedEditingDepartmentId = editingEmployee
    ? resolveRecordId(editCompanyDepartmentsForResolution, editingEmployee.departmentId, editingEmployee.departmentId)
    : '';
  const editDepartmentOptions = getEmployeeEditDepartmentOptions(
    localDepartments,
    localBranches,
    editingCompanyId,
    editEmpForm.branchId,
    resolvedEditingDepartmentId
  );
  const savedEditingDepartment = localDepartments.find(department => department.id === resolvedEditingDepartmentId);
  const savedEditingDepartmentBranch = localBranches.find(branch => branch.id === savedEditingDepartment?.branchId);
  const savedDepartmentLabel = savedEditingDepartment?.name || editingEmployee?.departmentId || '';
  const resolvedEditingDesignationId = editingEmployee
    ? resolveRecordId(
      localDesignations
        .filter(designation => designation.departmentId === (editEmpForm.departmentId || resolvedEditingDepartmentId))
        .map(designation => ({ ...designation, name: designation.title, code: designation.grade })),
      editingEmployee.designationId,
      editingEmployee.designationId
    )
    : '';
  const editDesignationOptions = localDesignations.filter(designation =>
    designation.departmentId === editEmpForm.departmentId
    && ((designation as Designation & { status?: 'Active' | 'Inactive' }).status !== 'Inactive' || designation.id === resolvedEditingDesignationId)
  );
  const savedEditingDesignation = localDesignations.find(designation => designation.id === resolvedEditingDesignationId);
  const savedDesignationLabel = savedEditingDesignation?.title || editingEmployee?.designationId || '';
  const editZoneOptions = getEmployeeEditOptions(zones, editingCompanyId, editEmpForm.zoneId);
  const editWageTypeOptions = getEmployeeEditOptions(wageTypes, editingCompanyId, editEmpForm.wageTypeId);
  const editUcTownOptions = ucTowns.filter(item =>
    item.zoneId === editEmpForm.zoneId
    && (item.status === 'Active' || item.id === editEmpForm.ucTownId)
  );

  React.useEffect(() => { setLocalBranches(branches); }, [branches]);
  React.useEffect(() => { setLocalDepartments(departments); }, [departments]);
  React.useEffect(() => { setLocalDesignations(designations); }, [designations]);

  React.useEffect(() => {
    if (!showEditEmpModal || !editingEmployee) return;

    const employeeCompanyId = resolveEmployeeCompanyId(
      editingEmployee,
      localBranches,
      companies.map(company => company.id),
      primaryCompany?.id
    );
    const companyBranchesForResolution = localBranches.filter(branch =>
      !employeeCompanyId || !branch.companyId || branch.companyId === employeeCompanyId || branch.id === editingEmployee.branchId
    );
    const companyZonesForResolution = zones.filter(zone =>
      !employeeCompanyId || !zone.companyId || zone.companyId === employeeCompanyId || zone.id === editingEmployee.zoneId
    );
    const companyWagesForResolution = wageTypes.filter(wage =>
      !employeeCompanyId || !wage.companyId || wage.companyId === employeeCompanyId || wage.id === editingEmployee.wageTypeId
    );
    const companyBranchIds = new Set(localBranches
      .filter(branch => !employeeCompanyId || branch.companyId === employeeCompanyId)
      .map(branch => branch.id));
    const companyDepartmentsForResolution = localDepartments.filter(department => companyBranchIds.has(department.branchId));

    setEditEmpForm(previous => {
      const branchId = resolveRecordId(companyBranchesForResolution, previous.branchId, getLegacyBranchValue(editingEmployee));
      const validPreviousDepartment = companyDepartmentsForResolution.find(department => department.id === previous.departmentId);
      const savedDepartmentId = resolveRecordId(
        companyDepartmentsForResolution,
        editingEmployee.departmentId,
        editingEmployee.departmentId
      );
      const savedDepartment = companyDepartmentsForResolution.find(department => department.id === savedDepartmentId);
      const departmentId = validPreviousDepartment?.branchId === branchId
        ? validPreviousDepartment.id
        : savedDepartment?.branchId === branchId ? savedDepartment.id : '';
      const designationCandidates = localDesignations.filter(designation => designation.departmentId === departmentId);
      const designationId = resolveRecordId(
        designationCandidates.map(designation => ({ ...designation, name: designation.title, code: designation.grade })),
        previous.designationId,
        editingEmployee.designationId
      );
      const zoneId = resolveRecordId(companyZonesForResolution, previous.zoneId, editingEmployee.zone);
      const ucTownId = resolveRecordId(
        ucTowns.filter(item => item.zoneId === zoneId),
        previous.ucTownId,
        editingEmployee.ucTown
      );
      const wageTypeId = resolveRecordId(companyWagesForResolution, previous.wageTypeId, editingEmployee.wageType);

      if (
        branchId === previous.branchId
        && departmentId === previous.departmentId
        && designationId === previous.designationId
        && zoneId === previous.zoneId
        && ucTownId === previous.ucTownId
        && wageTypeId === previous.wageTypeId
      ) return previous;
      return { ...previous, branchId, departmentId, designationId, zoneId, ucTownId, wageTypeId };
    });
  }, [showEditEmpModal, editingEmployee, localBranches, localDepartments, localDesignations, zones, ucTowns, wageTypes, companies, primaryCompany?.id]);

  // For Auto Code Generation
  const [autoGenNewCode, setAutoGenNewCode] = useState(false);
  const [autoGenEditCode, setAutoGenEditCode] = useState(false);

  const getAutoEmployeeCode = (branchId: string, departmentId: string) => {
    const branch = localBranches.find(b => b.id === branchId);
    const company = companies.find(c => c.id === branch?.companyId) || primaryCompany;
    const compPrefix = deriveCompanyPrefix(company, companyDisplayName);
    const dept = localDepartments.find(d => d.id === departmentId);
    // Department codes may already embed company/branch (BI-LHR-IT); the employee code uses its own token only.
    const deptCode = (dept?.code || 'GEN').toUpperCase().split('-').filter(Boolean).pop()!.replace(/[^A-Z0-9]/g, '') || 'GEN';
    const stem = `${compPrefix}-${deptCode}-`;
    const usedCodes = new Set(employees.map(e => (e.employeeCode || '').toUpperCase()));
    // Continue from the highest number in use so deletions never recycle a code.
    let sequence = employees.reduce((max, e) => {
      const code = (e.employeeCode || '').toUpperCase();
      return code.startsWith(stem) ? Math.max(max, Number(code.slice(stem.length)) || 0) : max;
    }, 0) + 1;
    while (usedCodes.has(`${stem}${String(sequence).padStart(5, '0')}`)) sequence += 1;
    return `${stem}${String(sequence).padStart(5, '0')}`;
  };

  React.useEffect(() => {
    if (autoGenNewCode) {
      setNewEmpForm(prev => ({
        ...prev,
        employeeCode: getAutoEmployeeCode(prev.branchId, prev.departmentId)
      }));
    }
  }, [autoGenNewCode, newEmpForm.branchId, newEmpForm.departmentId, localDepartments, localBranches, companies, companyDisplayName, employees]);

  React.useEffect(() => {
    if (autoGenEditCode) {
      setEditEmpForm(prev => ({
        ...prev,
        employeeCode: getAutoEmployeeCode(prev.branchId, prev.departmentId)
      }));
    }
  }, [autoGenEditCode, editEmpForm.branchId, editEmpForm.departmentId, localDepartments, localBranches, companies, companyDisplayName, employees]);

  // Picture Upload Handlers
  const handlePictureFileChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
      if (!allowedTypes.has(file.type)) {
        alert('Only JPEG, PNG, or WebP profile images are allowed.');
        e.target.value = '';
        return;
      }
      if (file.size > 512 * 1024) {
        alert('Profile images must be 512 KB or smaller.');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (isEdit) {
          setEditEmpForm(prev => ({ ...prev, pictureUrl: base64String }));
        } else {
          setNewEmpForm(prev => ({ ...prev, pictureUrl: base64String }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Helper to construct local Pakistan bank IBAN prefix and format
  const formatIban = (bankCode: string, accountNum: string) => {
    const clean = accountNum.replace(/[^a-zA-Z0-9]/g, '');
    const padded = clean.padStart(16, '0').slice(-16);
    return `PK42${bankCode.toUpperCase()}${padded}`;
  };

  // Bank Selection pre-fills
  const handleBankChange = (bankName: string, isEdit: boolean) => {
    const bank = PAKISTAN_BANKS.find(b => b.name === bankName);
    if (!bank) {
      if (isEdit) {
        setEditEmpForm(prev => ({ ...prev, bankName }));
      } else {
        setNewEmpForm(prev => ({ ...prev, bankName }));
      }
      return;
    }
    if (isEdit) {
      setEditEmpForm(prev => ({
        ...prev,
        bankName: bank.name,
        iban: formatIban(bank.code, prev.bankAccountNumber)
      }));
    } else {
      setNewEmpForm(prev => ({
        ...prev,
        bankName: bank.name,
        iban: formatIban(bank.code, prev.bankAccountNumber)
      }));
    }
  };

  const handleAccountNumberChange = (accNum: string, isEdit: boolean) => {
    if (isEdit) {
      setEditEmpForm(prev => {
        const bank = PAKISTAN_BANKS.find(b => b.name === prev.bankName);
        const bankCode = bank ? bank.code : 'XXXX';
        return {
          ...prev,
          bankAccountNumber: accNum,
          iban: formatIban(bankCode, accNum)
        };
      });
    } else {
      setNewEmpForm(prev => {
        const bank = PAKISTAN_BANKS.find(b => b.name === prev.bankName);
        const bankCode = bank ? bank.code : 'XXXX';
        return {
          ...prev,
          bankAccountNumber: accNum,
          iban: formatIban(bankCode, accNum)
        };
      });
    }
  };

  // Runtime addition helpers
  const handleCreateBranch = (name: string, city: string, province: any) => {
    const newB = {
      id: 'b-' + Date.now(),
      companyId: primaryCompany?.id ?? 'c1',
      name,
      city,
      province,
      address: `${name}, ${city}`
    };
    setLocalBranches(prev => [...prev, newB]);
    if (onAddBranch) onAddBranch(newB);
    return newB.id;
  };

  const handleCreateDepartment = (branchId: string, name: string, code: string) => {
    const newD = {
      id: 'd-' + Date.now(),
      branchId,
      name,
      code: code.toUpperCase()
    };
    setLocalDepartments(prev => [...prev, newD]);
    if (onAddDepartment) onAddDepartment(newD);
    return newD.id;
  };

  const handleCreateDesignation = (departmentId: string, title: string, grade: string) => {
    const newDs = {
      id: 'ds-' + Date.now(),
      departmentId,
      title,
      grade
    };
    setLocalDesignations(prev => [...prev, newDs]);
    if (onAddDesignation) onAddDesignation(newDs);
    return newDs.id;
  };

  // Sub-tabs state
  const [empSubTab, setEmpSubTab] = useState<'list' | 'reports'>('list');
  const [attSubTab, setAttSubTab] = useState<'stream' | 'reports'>('stream');
  const [mobileDutyForm, setMobileDutyForm] = useState(() => {
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return { employeeId: '', dutyType: 'Work from home' as MobileDutyType, validFrom: localDate, validTo: localDate, instructions: '', assignedLocation: '', allowFieldVisits: false };
  });
  const [leaveSubTab, setLeaveSubTab] = useState<'list' | 'reports'>('list');

  // Reports state
  const [reportGrouping, setReportGrouping] = useState<'uc' | 'zone' | 'supervisor'>('uc');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [attPeriodType, setAttPeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [selectedAttDate, setSelectedAttDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedAttEmployeeId, setSelectedAttEmployeeId] = useState('all');

  const [leavePeriodType, setLeavePeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [selectedLeaveDate, setSelectedLeaveDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Manual Modals state
  const [showAddAttendanceModal, setShowAddAttendanceModal] = useState(false);
  const [newAttendanceForm, setNewAttendanceForm] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    punchIn: '09:00',
    punchOut: '17:00',
    method: 'Manual' as const,
    status: 'Present' as const
  });

  const [showAddLeaveModal, setShowAddLeaveModal] = useState(false);
  const [newLeaveForm, setNewLeaveForm] = useState({
    employeeId: '',
    leaveType: 'Casual' as const,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: ''
  });

  // Calculate statistics
  const totalCount = employees.length;
  const activeCount = employees.filter(e => e.status === 'Active').length;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todayPunches = attendances.filter(a => a.date === todayStr);
  const presentToday = todayPunches.filter(p => p.status === 'Present' || p.status === 'Late').length;
  const attendanceRate = totalCount > 0 ? Math.round((presentToday / totalCount) * 100) : 0;
  
  const pendingLeavesCount = leaves.filter(l => l.status === 'Pending').length;
  const pendingRegularizationsCount = attendances.filter(a => a.regularizationRequested && !a.regularizationApproved).length;
  const pendingPayrollAdjustmentsCount = payrollAdjustments.filter(item => item.status === 'Pending').length;
  const approvalInbox = [
    ...leaves.filter(item => item.status === 'Pending').map(item => ({
      id: `leave-${item.id}`, tab: 'leave', type: 'Leave request', date: item.appliedOn || item.startDate,
      employee: employees.find(employee => employee.id === item.employeeId)?.fullName || 'Employee',
      detail: `${item.leaveType} · ${item.totalDays} day${item.totalDays === 1 ? '' : 's'}`,
    })),
    ...attendances.filter(item => item.regularizationRequested && item.regularizationApproved === undefined).map(item => ({
      id: `attendance-${item.id}`, tab: 'attendance', type: 'Attendance correction', date: item.date,
      employee: employees.find(employee => employee.id === item.employeeId)?.fullName || 'Employee',
      detail: item.regularizationReason || 'Attendance regularization',
    })),
    ...payrollAdjustments.filter(item => item.status === 'Pending').map(item => ({
      id: `payroll-${item.id}`, tab: 'payroll', type: 'Payroll adjustment', date: item.createdAt.slice(0, 10),
      employee: employees.find(employee => employee.id === item.employeeId)?.fullName || 'Employee',
      detail: `${item.type} · PKR ${item.amount.toLocaleString()}`,
    })),
  ].map(item => ({ ...item, ageDays: Math.max(0, Math.floor((Date.now() - new Date(`${item.date}T00:00:00`).getTime()) / 86_400_000)) }))
    .sort((left, right) => right.ageDays - left.ageDays);
  const overdueApprovalCount = approvalInbox.filter(item => item.ageDays >= 2).length;
  const cnicCompliance = employees
    .filter(employee => employee.status === 'Active')
    .map(employee => {
      const expiry = employee.cnicExpiryDate;
      if (!expiry) return { employee, expiry, state: 'missing' as const, days: null };
      const days = Math.ceil((new Date(`${expiry}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86_400_000);
      return { employee, expiry, state: days < 0 ? 'expired' as const : days <= 90 ? 'due' as const : 'valid' as const, days };
    });
  const cnicActionItems = cnicCompliance.filter(item => item.state !== 'valid');
  const lifecycleActionItems = employees.filter(employee => employee.status === 'Active').flatMap(employee => {
    const actionItems: { employee: Employee; kind: 'Contract' | 'Probation'; due: string; days: number; overdue: boolean }[] = [];
    for (const [kind, due] of [['Contract', employee.contractEndDate], ['Probation', employee.probationConfirmedAt ? undefined : employee.probationEndDate]] as const) {
      if (!due) continue;
      const days = Math.ceil((new Date(`${due}T00:00:00`).getTime() - new Date(`${todayStr}T00:00:00`).getTime()) / 86_400_000);
      if (days <= 60) actionItems.push({ employee, kind, due, days, overdue: days < 0 });
    }
    return actionItems;
  }).sort((left, right) => left.days - right.days);
  const normalizeComplianceIdentity = (value?: string) => (value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const activeEmployees = employees.filter(employee => employee.status !== 'Terminated');
  const duplicateIdentityGroups = [
    ...Array.from(activeEmployees.reduce((groups, employee) => {
      const value = normalizeComplianceIdentity(employee.cnic);
      if (value) groups.set(value, [...(groups.get(value) || []), employee]);
      return groups;
    }, new Map<string, Employee[]>()).values())
      .filter(group => group.length > 1)
      .map(group => ({ type: 'CNIC' as const, employees: group })),
    ...Array.from(activeEmployees.reduce((groups, employee) => {
      const value = normalizeComplianceIdentity(employee.iban) || `${normalizeComplianceIdentity(employee.bankName)}:${normalizeComplianceIdentity(employee.bankAccountNumber)}`;
      if (value !== ':') groups.set(value, [...(groups.get(value) || []), employee]);
      return groups;
    }, new Map<string, Employee[]>()).values())
      .filter(group => group.length > 1)
      .map(group => ({ type: 'Bank account' as const, employees: group })),
  ];
  const payrollReleaseQueue = [...payrollRuns]
    .sort((left, right) => (right.periodYear - left.periodYear) || (right.periodMonth - left.periodMonth) || right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6)
    .map(run => {
      if (run.status === 'Cancelled') return { run, label: 'Cancelled', detail: run.cancellationReason || 'Cancelled before payment.', tone: 'slate' as const };
      if (run.status === 'Disbursed') return { run, label: 'Disbursed', detail: `Bank reference: ${run.disbursementReference || 'recorded'}`, tone: 'emerald' as const };
      if (run.status === 'Approved' && run.bankAdviceChecksum) return { run, label: 'Ready to disburse', detail: 'Bank advice generated; enter bank reference after payment.', tone: 'blue' as const };
      if (run.status === 'Approved') return { run, label: 'Bank advice required', detail: 'Generate and verify the bank advice before payment.', tone: 'amber' as const };
      return { run, label: 'Awaiting approval', detail: run.preflightCriticalCount ? `${run.preflightCriticalCount} critical preflight issue(s)` : 'Independent payroll approval is required.', tone: run.preflightCriticalCount ? 'rose' as const : 'slate' as const };
    });
  const attendanceExceptionQueue = todayPunches
    .filter(item => item.status === 'Late' || item.status === 'Half Day' || item.status === 'Absent' || Boolean(item.regularizationRequested && !item.regularizationApproved))
    .map(item => {
      const employee = employees.find(record => record.id === item.employeeId);
      const needsReview = Boolean(item.regularizationRequested && !item.regularizationApproved);
      const label = needsReview ? 'Correction requested' : item.status;
      return { item, employee: employee?.fullName || 'Employee', label, needsReview };
    });
  const complianceAttendanceAlerts = [
    ...attendances.filter(item => item.overtimeMinutes > 240).map(item => ({
      id: `overtime-${item.id}`, type: 'Excess overtime', tone: 'amber' as const,
      employee: employees.find(employee => employee.id === item.employeeId)?.fullName || 'Employee',
      detail: `${Math.round(item.overtimeMinutes / 60 * 10) / 10} overtime hour(s) on ${item.date}; operational review threshold is 4 hours/day.`,
    })),
    ...attendances.filter(item => item.method === 'Manual' && item.regularizationApproved !== true).map(item => ({
      id: `manual-${item.id}`, type: 'Manual attendance', tone: 'rose' as const,
      employee: employees.find(employee => employee.id === item.employeeId)?.fullName || 'Employee',
      detail: `Manual record on ${item.date} is awaiting independent approval.`,
    })),
    ...employees.filter(employee => employee.status === 'Active').flatMap(employee => {
      const activeDays = new Set(attendances.filter(item => item.employeeId === employee.id && ['Present', 'Late', 'Half Day'].includes(item.status)).map(item => item.date));
      for (let offset = 0; offset <= 24; offset += 1) {
        const end = new Date(`${todayStr}T00:00:00`); end.setDate(end.getDate() - offset);
        const range = Array.from({ length: 7 }, (_, index) => { const day = new Date(end); day.setDate(day.getDate() - index); return day.toISOString().slice(0, 10); });
        if (range.every(date => activeDays.has(date))) return [{ id: `rest-${employee.id}-${range[0]}`, type: 'Weekly rest', tone: 'rose' as const, employee: employee.fullName, detail: `Seven consecutive attendance days ending ${range[0]}; verify statutory rest-day entitlement.` }];
      }
      return [];
    }),
  ].sort((left, right) => left.type.localeCompare(right.type));

  // Compute live payroll estimation
  const totalSalaries = employees.reduce((sum, emp) => {
    if (resolveWageBasis(emp, wageTypes) === 'Daily') {
      return sum + (emp.basicSalary * 26); // assuming 26 days average
    }
    return sum + emp.basicSalary;
  }, 0);

  const handleCreateEmployeeSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newEmpForm.fullName || !newEmpForm.email || !newEmpForm.cnic) {
      alert('Kindly fill in all required fields.');
      return;
    }
    
    // CNIC Regex validation
    const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
    if (!cnicRegex.test(newEmpForm.cnic)) {
      alert('CNIC format must be valid (e.g. 42101-1234567-3)');
      return;
    }

    if (!isValidPakMobileNumber(newEmpForm.contactNumber)) {
      alert('Mobile Contact must start with +923 followed by exactly 9 digits (e.g. +923214444444).');
      return;
    }

    const masterErrors = validateEmployeeMasterSelection(newEmpForm, { branches: companyBranches, departments: localDepartments, designations: localDesignations, zones, ucTowns, wageTypes });
    if (masterErrors.length) { alert(`Please correct the employee assignment:\n• ${masterErrors.join('\n• ')}`); return; }

    const generatedCode = getAutoEmployeeCode(newEmpForm.branchId, newEmpForm.departmentId);
    const newCodeCompany = companies.find(c => c.id === localBranches.find(b => b.id === newEmpForm.branchId)?.companyId) || primaryCompany;
    const newCode = (newEmpForm.employeeCode.trim() || generatedCode).toUpperCase();
    const newCodeError = employeeCodePrefixError(newCode, newCodeCompany?.name || newCodeCompany?.legalName || companyDisplayName);
    if (newCodeError) { alert(newCodeError); return; }
    if (employees.some(e => (e.employeeCode || '').toUpperCase() === newCode)) { alert(`Employee code ${newCode} is already in use.`); return; }

    const selectedZone = zones.find(item => item.id === newEmpForm.zoneId);
    const selectedUcTown = ucTowns.find(item => item.id === newEmpForm.ucTownId);
    const selectedWageType = wageTypes.find(item => item.id === newEmpForm.wageTypeId);
    const newEmp: Employee = {
      id: 'emp-' + Date.now(),
      companyId: deriveEmployeeCompanyId(newEmpForm.branchId, localBranches, primaryCompany?.id),
      branchId: newEmpForm.branchId,
      departmentId: newEmpForm.departmentId,
      designationId: newEmpForm.designationId,
      employeeCode: newCode,
      fullName: newEmpForm.fullName,
      email: newEmpForm.email,
      contactNumber: newEmpForm.contactNumber,
      cnic: newEmpForm.cnic,
      cnicExpiryDate: newEmpForm.cnicExpiryDate || undefined,
      drivingLicenceExpiryDate: newEmpForm.drivingLicenceExpiryDate || undefined,
      professionalCertificationExpiryDate: newEmpForm.professionalCertificationExpiryDate || undefined,
      workPermitExpiryDate: newEmpForm.workPermitExpiryDate || undefined,
      workerCategory: (newEmpForm.workerCategory || 'Worker') as Employee['workerCategory'],
      perquisiteVehicleMonthly: Number(newEmpForm.perquisiteVehicleMonthly) || undefined,
      perquisiteAccommodationMonthly: Number(newEmpForm.perquisiteAccommodationMonthly) || undefined,
      perquisiteOtherMonthly: Number(newEmpForm.perquisiteOtherMonthly) || undefined,
      contractEndDate: newEmpForm.contractEndDate || undefined,
      probationEndDate: newEmpForm.probationEndDate || undefined,
      probationConfirmedAt: newEmpForm.probationConfirmed ? new Date().toISOString() : undefined,
      gender: newEmpForm.gender,
      dateOfBirth: newEmpForm.dateOfBirth,
      dateOfJoining: todayStr,
      status: 'Active',
      wageTypeId: selectedWageType?.id,
      wageType: selectedWageType?.name ?? newEmpForm.wageType,
      basicSalary: Number(newEmpForm.basicSalary),
      shift: { id: 'employee-shift', name: 'Employee Shift', startTime: newEmpForm.shiftStartTime, endTime: newEmpForm.shiftEndTime, graceMinutes: Number(newEmpForm.shiftGraceMinutes), halfDayMinutes: Number(newEmpForm.shiftHalfDayMinutes), overtimeMultiplier: statConfig.overtimeMultiplier || 2, breakMinutes: Number(newEmpForm.shiftBreakMinutes), workingDays: [1, 2, 3, 4, 5, 6], ramadanStartDate: newEmpForm.ramadanStartDate || undefined, ramadanEndDate: newEmpForm.ramadanEndDate || undefined, ramadanStartTime: newEmpForm.ramadanStartTime || undefined, ramadanEndTime: newEmpForm.ramadanEndTime || undefined, fridayStartTime: newEmpForm.fridayStartTime || undefined, fridayEndTime: newEmpForm.fridayEndTime || undefined },
      providentFundOptIn: newEmpForm.providentFundOptIn,
      providentFundRate: Number(newEmpForm.providentFundRate),
      gratuityOptIn: newEmpForm.gratuityOptIn,
      bankName: newEmpForm.bankName,
      bankBranchName: 'Main Corporate Branch',
      bankAccountNumber: newEmpForm.bankAccountNumber,
      iban: newEmpForm.iban,
      eobiNumber: newEmpForm.eobiNumber,
      socialSecurityNumber: newEmpForm.socialSecurityNumber,
      eobiExemptionReason: newEmpForm.eobiExemptionReason || undefined,
      socialSecurityExemptionReason: newEmpForm.socialSecurityExemptionReason || undefined,
      ntn: newEmpForm.ntn || undefined,
      // Custom onboarding properties
      pictureUrl: newEmpForm.pictureUrl,
      isZoneInCharge: newEmpForm.isZoneInCharge,
      zoneInChargeName: newEmpForm.isZoneInCharge ? undefined : newEmpForm.zoneInChargeName,
      zoneId: selectedZone?.id,
      ucTownId: selectedUcTown?.id,
      zone: selectedZone?.name ?? newEmpForm.zone,
      ucTown: selectedUcTown?.name ?? newEmpForm.ucTown,
      houseRentAllowance: newEmpForm.houseRentAllowance > 0 ? Number(newEmpForm.houseRentAllowance) : undefined,
      conveyanceAllowance: newEmpForm.conveyanceAllowance > 0 ? Number(newEmpForm.conveyanceAllowance) : undefined,
      medicalAllowance: newEmpForm.medicalAllowance > 0 ? Number(newEmpForm.medicalAllowance) : undefined,
      otherAllowances: newEmpForm.otherAllowances > 0 ? Number(newEmpForm.otherAllowances) : undefined,
      eobiEnabled: newEmpForm.eobiEnabled,
      fbrEnabled: newEmpForm.fbrEnabled,
      priorEmployerTaxableIncome: Number(newEmpForm.priorEmployerTaxableIncome) || 0,
      priorEmployerTaxDeducted: Number(newEmpForm.priorEmployerTaxDeducted) || 0,
      maritalStatus: newEmpForm.maritalStatus as 'Single' | 'Married' | 'Divorced' | 'Widowed'
    };

    onAddEmployee(newEmp);
    setShowAddEmpModal(false);
    setNewEmpTakeHome(false);
    // Reset
    setNewEmpForm({
      fullName: '',
      email: '',
      contactNumber: '+923001234567',
      cnic: '42101-1234567-3',
      cnicExpiryDate: '',
      drivingLicenceExpiryDate: '',
      professionalCertificationExpiryDate: '',
      workPermitExpiryDate: '',
      workerCategory: 'Worker',
      perquisiteVehicleMonthly: '',
      perquisiteAccommodationMonthly: '',
      perquisiteOtherMonthly: '',
      contractEndDate: '',
      probationEndDate: '',
      probationConfirmed: false,
      gender: 'Male',
      dateOfBirth: '1995-01-01',
      branchId: 'b1',
      departmentId: 'd1',
      designationId: 'ds1',
      zoneId: '',
      ucTownId: '',
      wageTypeId: activeWageTypes[0]?.id ?? '',
      wageType: 'Salaried',
      basicSalary: 85000,
      shiftStartTime: '09:00', shiftEndTime: '17:00', shiftGraceMinutes: 15, shiftHalfDayMinutes: 120, shiftBreakMinutes: 0,
      ramadanStartDate: '', ramadanEndDate: '', ramadanStartTime: '09:00', ramadanEndTime: '15:00', fridayStartTime: '', fridayEndTime: '',
      providentFundOptIn: true,
      providentFundRate: 5.0,
      gratuityOptIn: true,
      bankName: 'Habib Bank Limited (HBL)',
      bankAccountNumber: '12345678901234',
      iban: 'PK42HABB0012345678901234',
      eobiNumber: '1090123000',
      socialSecurityNumber: 'SS-42-000111',
      eobiExemptionReason: '', socialSecurityExemptionReason: '',
      ntn: '',
      pictureUrl: '',
      isZoneInCharge: false,
      zoneInChargeName: '',
      zone: 'East Zone',
      ucTown: 'UC-2 Clifton Town',
      houseRentAllowance: 25500,
      conveyanceAllowance: 8500,
      medicalAllowance: 8500,
      otherAllowances: 0,
      eobiEnabled: true,
      fbrEnabled: true,
      priorEmployerTaxableIncome: 0,
      priorEmployerTaxDeducted: 0,
      employeeCode: '',
      maritalStatus: 'Single'
    });
  };

  const handleEditEmployeeSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editEmpForm.fullName || !editEmpForm.email || !editEmpForm.cnic) {
      alert('Kindly fill in all required fields.');
      return;
    }
    
    // CNIC Regex validation
    const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
    if (!cnicRegex.test(editEmpForm.cnic)) {
      alert('CNIC format must be valid (e.g. 42101-1234567-3)');
      return;
    }

    if (!isValidPakMobileNumber(editEmpForm.contactNumber)) {
      alert('Mobile Contact must start with +923 followed by exactly 9 digits (e.g. +923214444444).');
      return;
    }

    const masterErrors = validateEmployeeMasterSelection(editEmpForm, {
      branches: editBranchOptions,
      departments: editDepartmentOptions,
      designations: editDesignationOptions,
      zones: editZoneOptions,
      ucTowns: editUcTownOptions,
      wageTypes: editWageTypeOptions,
    });
    if (masterErrors.length) { alert(`Please correct the employee assignment:\n• ${masterErrors.join('\n• ')}`); return; }

    if (!editingEmployee) return;

    // Existing codes are kept as they are (payslips and attendance reference them); a changed code must follow the rule.
    const editedCode = (editEmpForm.employeeCode.trim() || editingEmployee.employeeCode).toUpperCase();
    if (editedCode !== (editingEmployee.employeeCode || '').toUpperCase()) {
      const editCompany = companies.find(c => c.id === localBranches.find(b => b.id === editEmpForm.branchId)?.companyId) || primaryCompany;
      const editCodeError = employeeCodePrefixError(editedCode, editCompany?.name || editCompany?.legalName || companyDisplayName);
      if (editCodeError) { alert(editCodeError); return; }
      if (employees.some(e => e.id !== editingEmployee.id && (e.employeeCode || '').toUpperCase() === editedCode)) { alert(`Employee code ${editedCode} is already in use.`); return; }
    }

    const selectedBranch = localBranches.find(item => item.id === editEmpForm.branchId);
    const selectedZone = zones.find(item => item.id === editEmpForm.zoneId);
    const selectedUcTown = ucTowns.find(item => item.id === editEmpForm.ucTownId);
    const selectedWageType = wageTypes.find(item => item.id === editEmpForm.wageTypeId);
    const updatedEmp: Employee = {
      ...editingEmployee,
      companyId: selectedBranch?.companyId || editingEmployee.companyId,
      branchId: editEmpForm.branchId,
      departmentId: editEmpForm.departmentId,
      designationId: editEmpForm.designationId,
      employeeCode: editedCode,
      fullName: editEmpForm.fullName,
      email: editEmpForm.email,
      contactNumber: editEmpForm.contactNumber,
      cnic: editEmpForm.cnic,
      cnicExpiryDate: editEmpForm.cnicExpiryDate || undefined,
      drivingLicenceExpiryDate: editEmpForm.drivingLicenceExpiryDate || undefined,
      professionalCertificationExpiryDate: editEmpForm.professionalCertificationExpiryDate || undefined,
      workPermitExpiryDate: editEmpForm.workPermitExpiryDate || undefined,
      workerCategory: (editEmpForm.workerCategory || 'Worker') as Employee['workerCategory'],
      perquisiteVehicleMonthly: Number(editEmpForm.perquisiteVehicleMonthly) || undefined,
      perquisiteAccommodationMonthly: Number(editEmpForm.perquisiteAccommodationMonthly) || undefined,
      perquisiteOtherMonthly: Number(editEmpForm.perquisiteOtherMonthly) || undefined,
      contractEndDate: editEmpForm.contractEndDate || undefined,
      probationEndDate: editEmpForm.probationEndDate || undefined,
      probationConfirmedAt: editEmpForm.probationConfirmed ? (editingEmployee.probationConfirmedAt || new Date().toISOString()) : undefined,
      gender: editEmpForm.gender,
      dateOfBirth: editEmpForm.dateOfBirth,
      wageTypeId: selectedWageType?.id,
      wageType: selectedWageType?.name ?? editEmpForm.wageType,
      basicSalary: Number(editEmpForm.basicSalary),
      shift: { id: editingEmployee.shift?.id || 'employee-shift', name: editingEmployee.shift?.name || 'Employee Shift', startTime: editEmpForm.shiftStartTime, endTime: editEmpForm.shiftEndTime, graceMinutes: Number(editEmpForm.shiftGraceMinutes), halfDayMinutes: Number(editEmpForm.shiftHalfDayMinutes), overtimeMultiplier: editingEmployee.shift?.overtimeMultiplier || statConfig.overtimeMultiplier || 2, breakMinutes: Number(editEmpForm.shiftBreakMinutes), workingDays: editingEmployee.shift?.workingDays || [1, 2, 3, 4, 5, 6], ramadanStartDate: editEmpForm.ramadanStartDate || undefined, ramadanEndDate: editEmpForm.ramadanEndDate || undefined, ramadanStartTime: editEmpForm.ramadanStartTime || undefined, ramadanEndTime: editEmpForm.ramadanEndTime || undefined, fridayStartTime: editEmpForm.fridayStartTime || undefined, fridayEndTime: editEmpForm.fridayEndTime || undefined },
      providentFundOptIn: editEmpForm.providentFundOptIn,
      providentFundRate: Number(editEmpForm.providentFundRate),
      gratuityOptIn: editEmpForm.gratuityOptIn,
      bankName: editEmpForm.bankName,
      bankAccountNumber: editEmpForm.bankAccountNumber,
      iban: editEmpForm.iban,
      eobiNumber: editEmpForm.eobiNumber,
      socialSecurityNumber: editEmpForm.socialSecurityNumber,
      eobiExemptionReason: editEmpForm.eobiExemptionReason || undefined,
      socialSecurityExemptionReason: editEmpForm.socialSecurityExemptionReason || undefined,
      ntn: editEmpForm.ntn || undefined,
      // Custom onboarding properties
      pictureUrl: editEmpForm.pictureUrl,
      isZoneInCharge: editEmpForm.isZoneInCharge,
      zoneInChargeName: editEmpForm.isZoneInCharge ? undefined : editEmpForm.zoneInChargeName,
      zoneId: selectedZone?.id,
      ucTownId: selectedUcTown?.id,
      zone: selectedZone?.name ?? editEmpForm.zone,
      ucTown: selectedUcTown?.name ?? editEmpForm.ucTown,
      houseRentAllowance: editEmpForm.houseRentAllowance > 0 ? Number(editEmpForm.houseRentAllowance) : undefined,
      conveyanceAllowance: editEmpForm.conveyanceAllowance > 0 ? Number(editEmpForm.conveyanceAllowance) : undefined,
      medicalAllowance: editEmpForm.medicalAllowance > 0 ? Number(editEmpForm.medicalAllowance) : undefined,
      otherAllowances: editEmpForm.otherAllowances > 0 ? Number(editEmpForm.otherAllowances) : undefined,
      eobiEnabled: editEmpForm.eobiEnabled,
      fbrEnabled: editEmpForm.fbrEnabled,
      priorEmployerTaxableIncome: Number(editEmpForm.priorEmployerTaxableIncome) || 0,
      priorEmployerTaxDeducted: Number(editEmpForm.priorEmployerTaxDeducted) || 0,
      maritalStatus: editEmpForm.maritalStatus as 'Single' | 'Married' | 'Divorced' | 'Widowed'
    };

    onUpdateEmployee(updatedEmp);
    setShowEditEmpModal(false);
    setEditEmpTakeHome(false);
    setEditingEmployee(null);
  };

  const openEditEmployee = (emp: Employee) => {
    const employeeCompanyId = resolveEmployeeCompanyId(emp, localBranches, companies.map(company => company.id), primaryCompany?.id);
    const branchCandidates = localBranches.filter(branch =>
      !employeeCompanyId || !branch.companyId || branch.companyId === employeeCompanyId || branch.id === emp.branchId
    );
    const zoneCandidates = zones.filter(zone =>
      !employeeCompanyId || !zone.companyId || zone.companyId === employeeCompanyId || zone.id === emp.zoneId
    );
    const wageCandidates = wageTypes.filter(wage =>
      !employeeCompanyId || !wage.companyId || wage.companyId === employeeCompanyId || wage.id === emp.wageTypeId
    );
    const resolvedBranchId = resolveRecordId(branchCandidates, emp.branchId, getLegacyBranchValue(emp));
    const companyBranchIds = new Set(localBranches
      .filter(branch => !employeeCompanyId || branch.companyId === employeeCompanyId)
      .map(branch => branch.id));
    const companyDepartmentCandidates = localDepartments.filter(department => companyBranchIds.has(department.branchId));
    const savedDepartmentId = resolveRecordId(companyDepartmentCandidates, emp.departmentId, emp.departmentId);
    const savedDepartment = companyDepartmentCandidates.find(department => department.id === savedDepartmentId);
    const resolvedDepartmentId = savedDepartment?.branchId === resolvedBranchId ? savedDepartmentId : '';
    const designationCandidates = localDesignations
      .filter(designation => designation.departmentId === resolvedDepartmentId)
      .map(designation => ({ ...designation, name: designation.title, code: designation.grade }));
    const resolvedDesignationId = resolveRecordId(designationCandidates, emp.designationId, emp.designationId);
    const resolvedZoneId = resolveRecordId(zoneCandidates, emp.zoneId, emp.zone);
    const resolvedUcTownId = resolveRecordId(ucTowns.filter(item => item.zoneId === resolvedZoneId), emp.ucTownId, emp.ucTown);
    const resolvedWageTypeId = resolveRecordId(wageCandidates, emp.wageTypeId, emp.wageType);
    setEditingEmployee(emp);
    setEditEmpForm({
      fullName: emp.fullName,
      email: emp.email,
      contactNumber: formatPakMobileNumber(emp.contactNumber || ''),
      cnic: emp.cnic,
      cnicExpiryDate: emp.cnicExpiryDate || '',
      drivingLicenceExpiryDate: emp.drivingLicenceExpiryDate || '',
      professionalCertificationExpiryDate: emp.professionalCertificationExpiryDate || '',
      workPermitExpiryDate: emp.workPermitExpiryDate || '',
      workerCategory: emp.workerCategory || 'Worker',
      perquisiteVehicleMonthly: emp.perquisiteVehicleMonthly ? String(emp.perquisiteVehicleMonthly) : '',
      perquisiteAccommodationMonthly: emp.perquisiteAccommodationMonthly ? String(emp.perquisiteAccommodationMonthly) : '',
      perquisiteOtherMonthly: emp.perquisiteOtherMonthly ? String(emp.perquisiteOtherMonthly) : '',
      contractEndDate: emp.contractEndDate || '',
      probationEndDate: emp.probationEndDate || '',
      probationConfirmed: Boolean(emp.probationConfirmedAt),
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth,
      branchId: resolvedBranchId,
      departmentId: resolvedDepartmentId,
      designationId: resolvedDesignationId,
      zoneId: resolvedZoneId,
      ucTownId: resolvedUcTownId,
      wageTypeId: resolvedWageTypeId,
      wageType: emp.wageType,
      basicSalary: emp.basicSalary,
      shiftStartTime: emp.shift?.startTime || '09:00',
      shiftEndTime: emp.shift?.endTime || '17:00',
      shiftGraceMinutes: emp.shift?.graceMinutes ?? 15,
      shiftHalfDayMinutes: emp.shift?.halfDayMinutes ?? 120,
      shiftBreakMinutes: emp.shift?.breakMinutes ?? 0,
      ramadanStartDate: emp.shift?.ramadanStartDate || '',
      ramadanEndDate: emp.shift?.ramadanEndDate || '',
      ramadanStartTime: emp.shift?.ramadanStartTime || '09:00',
      ramadanEndTime: emp.shift?.ramadanEndTime || '15:00',
      fridayStartTime: emp.shift?.fridayStartTime || '',
      fridayEndTime: emp.shift?.fridayEndTime || '',
      providentFundOptIn: emp.providentFundOptIn,
      providentFundRate: emp.providentFundRate,
      gratuityOptIn: emp.gratuityOptIn,
      bankName: emp.bankName,
      bankAccountNumber: emp.bankAccountNumber,
      iban: emp.iban,
      eobiNumber: emp.eobiNumber || '',
      socialSecurityNumber: emp.socialSecurityNumber || '',
      eobiExemptionReason: emp.eobiExemptionReason || '',
      socialSecurityExemptionReason: emp.socialSecurityExemptionReason || '',
      ntn: emp.ntn || '',
      pictureUrl: emp.pictureUrl || '',
      isZoneInCharge: emp.isZoneInCharge || false,
      zoneInChargeName: emp.zoneInChargeName || '',
      zone: emp.zone || '',
      ucTown: emp.ucTown || '',
      houseRentAllowance: emp.houseRentAllowance || 0,
      conveyanceAllowance: emp.conveyanceAllowance || 0,
      medicalAllowance: emp.medicalAllowance || 0,
      otherAllowances: emp.otherAllowances || 0,
      eobiEnabled: emp.eobiEnabled !== false,
      fbrEnabled: emp.fbrEnabled !== false,
      priorEmployerTaxableIncome: emp.priorEmployerTaxableIncome || 0,
      priorEmployerTaxDeducted: emp.priorEmployerTaxDeducted || 0,
      employeeCode: emp.employeeCode,
      maritalStatus: emp.maritalStatus || 'Single'
    });
    setEditEmpTakeHome(false);
    setEditDepartmentMoveNotice('');
    setShowEditEmpModal(true);
  };

  const handleCreateAttendanceSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newAttendanceForm.employeeId || !newAttendanceForm.date) {
      alert('Kindly select an employee and date.');
      return;
    }
    const log: AttendanceLog = {
      id: `att-man-${newAttendanceForm.employeeId}-${Date.now()}`,
      employeeId: newAttendanceForm.employeeId,
      date: newAttendanceForm.date,
      punchIn: newAttendanceForm.punchIn || undefined,
      punchOut: newAttendanceForm.punchOut || undefined,
      method: newAttendanceForm.method,
      status: newAttendanceForm.status,
      overtimeMinutes: 0
    };
    onAddAttendance(log);
    setShowAddAttendanceModal(false);
  };

  const handleCreateLeaveSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newLeaveForm.employeeId || !newLeaveForm.startDate || !newLeaveForm.endDate || !newLeaveForm.reason) {
      alert('Kindly fill in all fields.');
      return;
    }
    const start = new Date(newLeaveForm.startDate);
    const end = new Date(newLeaveForm.endDate);
    if (end < start) {
      alert('End date cannot be before start date.');
      return;
    }
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const leave: LeaveRequest = {
      id: `lv-man-${newLeaveForm.employeeId}-${Date.now()}`,
      employeeId: newLeaveForm.employeeId,
      leaveType: newLeaveForm.leaveType,
      startDate: newLeaveForm.startDate,
      endDate: newLeaveForm.endDate,
      totalDays: diffDays,
      reason: newLeaveForm.reason,
      status: 'Approved',
      appliedOn: todayStr,
      approvedBy: currentUserAccount.username,
      approvedOn: todayStr
    };
    onApplyLeave(leave);
    setShowAddLeaveModal(false);
    setNewLeaveForm({
      employeeId: '',
      leaveType: 'Casual',
      startDate: todayStr,
      endDate: todayStr,
      reason: ''
    });
  };

  const handleAddBranchChange = (branchId: string) => {
    setNewEmpForm(prev => ({
      ...prev,
      branchId,
      departmentId: '',
      designationId: ''
    }));
  };

  const handleAddDeptChange = (departmentId: string) => {
    setNewEmpForm(prev => ({
      ...prev,
      departmentId,
      designationId: ''
    }));
  };

  const handleEditBranchChange = (branchId: string) => {
    setEditDepartmentMoveNotice('');
    setEditEmpForm(prev => ({
      ...prev,
      branchId,
      departmentId: '',
      designationId: ''
    }));
  };

  const handleEditDeptChange = (departmentId: string) => {
    const update = synchronizeDepartmentSelection(departmentId, editEmpForm.branchId, editDepartmentOptions);
    if (update.branchChanged) {
      const oldBranch = localBranches.find(branch => branch.id === editEmpForm.branchId)?.name || 'the previous branch';
      const newBranch = localBranches.find(branch => branch.id === update.branchId)?.name || 'the department branch';
      setEditDepartmentMoveNotice(`Branch changed from ${oldBranch} to ${newBranch}; choose a Designation for the new Department.`);
    } else {
      setEditDepartmentMoveNotice(departmentId ? 'Department confirmed; choose a Designation.' : '');
    }
    setEditEmpForm(previous => ({ ...previous, branchId: update.branchId, departmentId: update.departmentId, designationId: update.designationId }));
  };

  const executeOffboarding = async () => {
    if (!showOffboardModal) return;
    if (!settlementDate || !settlementReason.trim()) { alert('Enter the effective separation date and reason before finalizing the exit.'); return; }
    // Separation is maker-checker controlled: this raises a request; a second user approves it in Employee Lifecycle,
    // which then terminates the record and creates the settlement.
    const preview = calculateFinalSettlement(showOffboardModal, settlementType, settlementDate, settlementLeavesEncash, settlementNoticeDays, statConfig, wageTypes);
    const created = await onCreateLifecycleRequest({
      employeeId: showOffboardModal.id, type: settlementType === 'Termination' ? 'Termination' : 'Resignation', effectiveDate: settlementDate,
      reason: settlementType === 'Termination' || settlementType === 'Resignation' ? settlementReason.trim() : `${settlementType}: ${settlementReason.trim()}`,
      noticeDays: settlementNoticeDays, leaveEncashDays: settlementLeavesEncash,
    });
    if (!created) return;
    alert(`Separation request for ${showOffboardModal.fullName} submitted for approval.\n`
      + `- Gratuity (${preview.yearsOfService} completed years): PKR ${preview.gratuityAmount.toLocaleString()}\n`
      + `- Leave encashment (${preview.encashableLeaveDays} days): PKR ${preview.leaveEncashmentAmount.toLocaleString()}\n`
      + `- Notice pay: PKR ${preview.noticePayAmount.toLocaleString()}\n`
      + `- Estimated settlement: PKR ${preview.totalSettlementAmount.toLocaleString()}\n`
      + 'The employee stays active until another authorized user approves the request in Employee Lifecycle.');
    setShowOffboardModal(null);
  };

  const openAddEmployee = () => {
    const branchId = companyBranches.find(item => item.id === newEmpForm.branchId)?.id ?? companyBranches[0]?.id ?? '';
    const availableDepartments = localDepartments.filter(item => item.branchId === branchId);
    const departmentId = availableDepartments.find(item => item.id === newEmpForm.departmentId)?.id ?? availableDepartments[0]?.id ?? '';
    const availableDesignations = localDesignations.filter(item => item.departmentId === departmentId);
    const designationId = availableDesignations.find(item => item.id === newEmpForm.designationId)?.id ?? availableDesignations[0]?.id ?? '';
    const wageTypeId = activeWageTypes.find(item => item.id === newEmpForm.wageTypeId)?.id ?? activeWageTypes[0]?.id ?? '';
    setNewEmpForm(previous => ({ ...previous, branchId, departmentId, designationId, wageTypeId }));
    setShowAddEmpModal(true);
  };

  const navigateFromSidebar = (tab: PortalTab, group?: NavGroupKey) => {
    if (group) setExpandedNavGroup(group);
    setActiveTab(tab);
    closeSidebar();
  };

  const getFlowStepState = (step: FlowStep): { className: string; statusText: string } => {
    const currentStepObj = FLOW_STEPS.find(s => s.tab === activeTab);
    const currentStepNum = currentStepObj ? currentStepObj.step : 12;

    if (activeTab === step.tab) {
      return { className: 'now', statusText: 'you are here' };
    }

    if (step.tab === 'settings') {
      const hasFix = !statConfig?.minimumWage || !statConfig?.taxYear || !taxSlabs || taxSlabs.length === 0;
      if (hasFix) return { className: 'fix', statusText: 'slabs to set' };
    }
    if (step.tab === 'company-setup') {
      const hasFix = !primaryCompany?.ntn && !primaryCompany?.taxRegistrationNumber;
      if (hasFix) return { className: 'fix', statusText: 'NTN missing' };
    }
    if (step.tab === 'attendance') {
      if (pendingRegularizationsCount > 0) {
        return { className: 'fix', statusText: `${pendingRegularizationsCount} need review` };
      }
    }
    if (step.tab === 'leaves') {
      if (pendingLeavesCount > 0) {
        return { className: 'fix', statusText: `${pendingLeavesCount} pending` };
      }
    }
    if (step.tab === 'loans') {
      const pendingLoans = loanAdvances.filter(l => l.status === 'Pending').length;
      if (pendingLoans > 0) {
        return { className: 'fix', statusText: `${pendingLoans} pending` };
      }
    }

    if (step.step < currentStepNum) {
      return { className: 'done', statusText: 'ready' };
    }
    return { className: 'todo', statusText: 'next' };
  };

  const unreadNotificationCount = notifications.filter(n => !n.readBy.includes(currentUserAccount?.employeeId || currentUserAccount?.username || '')).length;

  const searchFilteredPages = SEARCHABLE_PAGES.filter(p =>
    !searchQuery || p.label.toLowerCase().includes(searchQuery.toLowerCase()) || p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const searchFilteredEmployees = employees.filter(e =>
    searchQuery && (
      e.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.employeeCode && e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ((designations.find(d => d.id === e.designationId)?.title || '').toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.cnic && e.cnic.includes(searchQuery))
    )
  ).slice(0, 5);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans" id="web-portal-root">
      
      {/* Friendly build v2 Top Bar */}
      <div className="top" id="web-hdr">
        {/* Hamburger — mobile only */}
        <button
          className="md:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 flex-shrink-0"
          onClick={() => setSidebarOpen(v => !v)}
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand */}
        <div className="brand flex items-center gap-2">
          <span>{companyDisplayName} HR &amp; PAYROLL</span>
          <span style={{ fontSize: '10px', background: '#059669', borderRadius: '4px', padding: '1px 5px', color: '#fff', fontWeight: 600 }}>v2</span>
          <small>Friendly build</small>
        </div>

        {/* Tenant Identity */}
        <div
          className="tenant"
          onClick={() => setActiveTab('company-setup')}
          title="Click to manage Company & Master Data"
        >
          <span className="text-emerald-400">●</span>
          <b>{companyDisplayName}</b>
          <span className="id">{primaryCompany?.city ? `${primaryCompany.city}, ${primaryCompany.province || 'PK'}` : 'Lahore, Punjab'}</span>
          <span className="text-slate-400 text-[10px]">▾</span>
        </div>

        {/* Quick Search Bar */}
        <div
          className="search-bar hidden sm:flex"
          onClick={() => setShowQuickSearch(true)}
          title="Click or press Ctrl+K to find anything"
        >
          <span className="flex items-center gap-2 truncate text-slate-400">
            <Search className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">Find anything: a person, a payslip, a setting…</span>
          </span>
          <span className="flex items-center gap-1 flex-shrink-0">
            <span className="kbd">Ctrl</span>
            <span className="kbd">K</span>
          </span>
        </div>

        {/* Right actions */}
        <div className="right">
          <span className="hidden lg:inline text-slate-300 font-medium">{currentDateString}</span>

          {/* Sync status indicator */}
          <div className="hidden xl:flex items-center">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${syncBadgeClass}`}>
              ● {syncLabel}
            </span>
          </div>

          {/* Notifications Bell */}
          <div
            className="bell-btn"
            onClick={() => setActiveTab('notifications')}
            title={`${unreadNotificationCount} things need you`}
          >
            <Bell className="w-4 h-4 text-slate-300" />
            {unreadNotificationCount > 0 && <i>{unreadNotificationCount}</i>}
          </div>

          {/* User chip */}
          <div className="user-chip">
            <div className="av">
              {(currentUserAccount.username || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <div className="font-bold text-slate-100 leading-tight">{currentUserAccount.username}</div>
              <small>{currentUserRole?.name || 'Super Admin'}</small>
            </div>
          </div>

          {/* Logout button */}
          <button
            onClick={onLogout}
            className="btn sm d"
            title="Sign out of system"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Framework Divider */}
      <div className="flex flex-1 overflow-hidden relative" id="web-main-container">

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeSidebar}
          />
        )}

        {/* Sidebar Nav */}
        <nav
          className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-300 ease-in-out side
            md:static md:z-auto md:w-60 xl:w-64 md:flex-shrink-0 md:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
          id="web-sidebar"
        >
          {/* Close button — mobile only */}
          <div className="flex items-center justify-between mb-2 md:hidden px-2 pt-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Navigation</span>
            <button onClick={closeSidebar} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-1" aria-label="HR portal navigation" dir={portalLanguage === 'ur' ? 'rtl' : undefined}>
            <button type="button" onClick={togglePortalLanguage} className="mx-2 mb-2 w-[calc(100%-1rem)] rounded-lg border border-slate-700 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-slate-800">{portalLanguage === 'ur' ? 'English' : 'اردو'}</button>
            {/* Dashboard */}
            {hasPermission('dashboard') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('dashboard')}
                className={`side-item ${activeTab === 'dashboard' ? 'on' : ''}`}
              >
                <span>{navLabel('Operations Dashboard', 'آپریشنز ڈیش بورڈ')}</span>
              </button>
            )}

            {/* Section: SET UP (DO ONCE) */}
            <div className="sec"><span>{navLabel('SET UP (DO ONCE)', 'ابتدائی ترتیب')}</span></div>
            {hasPermission('settings') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('settings')}
                className={`side-item ${activeTab === 'settings' ? 'on' : ''}`}
              >
                <span>{navLabel('1. Statutory Config', '1. قانونی ترتیبات')}</span>
                {(!statConfig?.minimumWage || !statConfig?.taxYear || !taxSlabs || taxSlabs.length === 0) && (
                  <span className="n" style={{ background: '#B91C1C', color: '#fff' }}>fix</span>
                )}
              </button>
            )}
            {hasPermission('company-setup') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('company-setup')}
                className={`side-item ${activeTab === 'company-setup' ? 'on' : ''}`}
              >
                <span>{navLabel('2. Company & Master Data', '2. کمپنی اور ماسٹر ڈیٹا')}</span>
                {(!primaryCompany?.ntn && !primaryCompany?.taxRegistrationNumber) && (
                  <span className="n" style={{ background: '#B91C1C', color: '#fff' }}>fix</span>
                )}
              </button>
            )}

            {/* Section: PEOPLE */}
            <div className="sec"><span>{navLabel('PEOPLE', 'افراد')}</span></div>
            {hasPermission('employees') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('employees')}
                className={`side-item ${activeTab === 'employees' ? 'on' : ''}`}
              >
                <span>{navLabel('3. Employee Directory', '3. ملازمین کی فہرست')}</span>
              </button>
            )}
            {hasPermission('recruitment') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('recruitment')}
                className={`side-item ${activeTab === 'recruitment' ? 'on' : ''}`}
              >
                <span>{navLabel('Recruitment', 'بھرتی')}</span>
                {jobPostings.filter(j => j.status === 'Open').length > 0 && (
                  <span className="tag">{jobPostings.filter(j => j.status === 'Open').length}</span>
                )}
              </button>
            )}
            {hasPermission('performance') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('performance')}
                className={`side-item ${activeTab === 'performance' ? 'on' : ''}`}
              >
                <span>{navLabel('Performance', 'کارکردگی')}</span>
              </button>
            )}
            {hasPermission('assets') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('assets')}
                className={`side-item ${activeTab === 'assets' ? 'on' : ''}`}
              >
                <span>{navLabel('Asset Management', 'اثاثہ جات')}</span>
                {companyAssets.length > 0 && (
                  <span className="n">{companyAssets.length}</span>
                )}
              </button>
            )}

            {/* Section: TIME */}
            <div className="sec"><span>{navLabel('TIME', 'وقت')}</span></div>
            {hasPermission('holidays') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('holidays')}
                className={`side-item ${activeTab === 'holidays' ? 'on' : ''}`}
              >
                <span>{navLabel('4. Holiday Calendar', '4. تعطیلات کا کیلنڈر')}</span>
              </button>
            )}
            {hasPermission('leaves') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('leaves')}
                className={`side-item ${activeTab === 'leaves' ? 'on' : ''}`}
              >
                <span>{navLabel('5. Leave Management', '5. چھٹیوں کا انتظام')}</span>
                {pendingLeavesCount > 0 && (
                  <span className="n">{pendingLeavesCount}</span>
                )}
              </button>
            )}
            {hasPermission('biometric') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('biometric')}
                className={`side-item ${activeTab === 'biometric' ? 'on' : ''}`}
              >
                <span>{navLabel('6. Biometric Devices', '6. بایومیٹرک آلات')}</span>
              </button>
            )}
            {hasPermission('attendance') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('attendance')}
                className={`side-item ${activeTab === 'attendance' ? 'on' : ''}`}
              >
                <span>{navLabel('7. Attendance', '7. حاضری')}</span>
                {pendingRegularizationsCount > 0 && (
                  <span className="n">{pendingRegularizationsCount}</span>
                )}
              </button>
            )}

            {/* Section: PAYROLL */}
            <div className="sec"><span>{navLabel('PAYROLL', 'پے رول')}</span></div>
            {hasPermission('loans') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('loans')}
                className={`side-item ${activeTab === 'loans' ? 'on' : ''}`}
              >
                <span>{navLabel('8. Loans & Advances', '8. قرضے اور ایڈوانس')}</span>
                {loanAdvances.filter(l => l.status === 'Pending').length > 0 && (
                  <span className="n">{loanAdvances.filter(l => l.status === 'Pending').length}</span>
                )}
              </button>
            )}
            {hasPermission('revisions') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('revisions')}
                className={`side-item ${activeTab === 'revisions' ? 'on' : ''}`}
              >
                <span>{navLabel('9. Salary Revisions', '9. تنخواہ میں ترمیم')}</span>
              </button>
            )}
            {hasPermission('payroll') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('payroll')}
                className={`side-item ${activeTab === 'payroll' ? 'on' : ''}`}
              >
                <span>{navLabel('10. Payroll Processing', '10. پے رول')}</span>
              </button>
            )}
            {hasPermission('gratuity') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('gratuity')}
                className={`side-item ${activeTab === 'gratuity' ? 'on' : ''}`}
              >
                <span>{navLabel('11. Gratuity & Settlement', '11. گریجویٹی اور تصفیہ')}</span>
              </button>
            )}

            {hasPermission('lifecycle') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('lifecycle')}
                className={`side-item ${activeTab === 'lifecycle' ? 'on' : ''}`}
              >
                <span>{navLabel('12. Employee Lifecycle', '12. ملازمت کا دورانیہ')}{lifecycleRequests.some(item => item.status === 'Pending') ? ` (${lifecycleRequests.filter(item => item.status === 'Pending').length})` : ''}</span>
              </button>
            )}

            {/* Section: SYSTEM */}
            <div className="sec"><span>{navLabel('SYSTEM', 'سسٹم')}</span></div>
            {hasPermission('maintenance') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('maintenance')}
                className={`side-item ${activeTab === 'maintenance' ? 'on' : ''}`}
              >
                <span>{navLabel('Data Backup', 'ڈیٹا بیک اپ')}</span>
              </button>
            )}
            {hasPermission('access') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('access')}
                className={`side-item ${activeTab === 'access' ? 'on' : ''}`}
              >
                <span>{navLabel('User Management', 'صارفین کا انتظام')}</span>
              </button>
            )}
            {hasPermission('master-data') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('master-data')}
                className={`side-item ${activeTab === 'master-data' ? 'on' : ''}`}
              >
                <span>{navLabel('Master Data', 'ماسٹر ڈیٹا')}</span>
              </button>
            )}

            {/* Section: HELP */}
            <div className="sec"><span>{navLabel('HELP', 'مدد')}</span></div>
            <button
              type="button"
              onClick={() => setShowGuideModal(true)}
              className="side-item"
            >
              <span>{navLabel('❓ Guide for this page', '❓ اس صفحے کی رہنمائی')}</span>
            </button>
          </div>
        </nav>

        {/* Dynamic Display Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pt-3 px-3 sm:px-4 xl:px-6 pb-6 bg-slate-50 min-w-0 w-full" id="web-main-panel">
          
          {isRoleResolving ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 shadow-md text-center space-y-4 max-w-lg mx-auto mt-12 select-none">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <ShieldCheck className="w-8 h-8 animate-pulse" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Loading Access Profile</h3>
              <p className="text-slate-500 text-sm max-w-sm">
                Restoring your account permissions from the server.
              </p>
            </div>
          ) : !hasPermission(activeTab) ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 shadow-md text-center space-y-4 max-w-lg mx-auto mt-12 select-none">
              <div className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 animate-bounce">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Access Denied</h3>
              <p className="text-slate-505 text-sm max-w-sm">
                Your account <strong>{currentUserAccount.username}</strong> ({currentUserRole?.name || 'No Role'}) does not have permission to view the <strong>{activeTab}</strong> tab.
              </p>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition"
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* 12-Step Compliance & Payroll Flow */}
              <div className="flow" aria-label="12-step compliance and payroll flow">
                {FLOW_STEPS.map(step => {
                  const { className, statusText } = getFlowStepState(step);
                  return (
                    <button
                      key={step.tab}
                      type="button"
                      onClick={() => setActiveTab(step.tab)}
                      className={`flow-step ${className}`}
                      title={`Jump to ${step.label}`}
                    >
                      <b>{step.label}</b>
                      <span>{statusText}</span>
                    </button>
                  );
                })}
              </div>

              <section aria-labelledby="my-security-title" className={`mb-4 overflow-hidden rounded-xl border shadow-sm ${mfaEnabled ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
                <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${mfaEnabled ? 'border-emerald-200 bg-emerald-100 text-emerald-700' : 'border-amber-200 bg-amber-100 text-amber-700'}`}>
                      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 id="my-security-title" className="text-sm font-bold text-slate-900">My Security</h2>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${mfaEnabled ? 'bg-emerald-700 text-white' : 'bg-amber-200 text-amber-950'}`}>
                          {mfaEnabled ? 'Protected' : 'Action needed'}
                        </span>
                        <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">{currentUserRole?.name || 'User'}</span>
                        {!mfaEnabled && <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${mfaRequiredForRole ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>{mfaRequiredForRole ? 'Required for this role' : 'Recommended'}</span>}
                      </div>
                      <p className={`mt-1 text-xs ${mfaEnabled ? 'text-emerald-900' : 'text-amber-950'}`}>
                        {mfaEnabled
                          ? 'MFA protection is active for this account.'
                          : mfaRequiredForRole
                            ? 'This account can access sensitive people, payroll, or system data. Set up MFA now.'
                            : 'Set up MFA to protect your account if your password is ever exposed.'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-600">Session policy: signed out after 30 minutes of inactivity (12 hours maximum), or up to 5 days with “Remember me”.</p>
                      {mfaEnabled && <button type="button" onClick={async () => {
                        if (!window.confirm('Every device that skips the verification code will have to enter a code again at its next sign-in. Continue?')) return;
                        try {
                          const result = await payrollApi('/api/auth/mfa/trusted-devices/revoke', { method: 'POST', body: '{}' }) as { revoked: number };
                          try { localStorage.removeItem('hr_mfa_trusted_devices'); } catch { /* nothing stored */ }
                          showToast(`${result.revoked} trusted device(s) removed. A code will be asked at the next sign-in.`);
                        } catch (error) { alert(error instanceof Error ? error.message : 'Trusted devices could not be removed.'); }
                      }} className="mt-2 text-[11px] font-semibold text-emerald-800 underline hover:text-emerald-950">Stop trusting my devices (lost phone or shared device)</button>}
                    </div>
                  </div>
                  {!mfaEnabled && !mfaSetupChoice && <button type="button" onClick={() => setMfaSetupChoice('choose')} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">Set up MFA</button>}
                </div>
                {!mfaEnabled && mfaSetupChoice === 'choose' && <div className="border-t border-amber-200 bg-white/85 p-4"><h3 className="text-sm font-bold text-slate-900">Choose your MFA method</h3><p className="mt-1 text-xs text-slate-600">Select one method. Only the selected method will be required when you sign in.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><button type="button" onClick={beginMfaEnrollment} className="rounded-xl border border-slate-300 bg-white p-4 text-left hover:border-emerald-500"><b className="text-sm text-slate-900">Authenticator app</b><span className="mt-1 block text-xs text-slate-600">Use a QR code with Google or Microsoft Authenticator, Authy, or another compatible app.</span></button><button type="button" onClick={beginEmailMfaEnrollment} className="rounded-xl border border-slate-300 bg-white p-4 text-left hover:border-emerald-500"><b className="text-sm text-slate-900">Email verification</b><span className="mt-1 block text-xs text-slate-600">Receive a one-time code at your registered email address for each sign-in.</span></button></div><button type="button" onClick={() => setMfaSetupChoice(null)} className="mt-3 text-xs font-semibold text-slate-600 underline">Cancel</button></div>}
                {mfaEnrollment && <div className="border-t border-amber-200 bg-white/85 p-4">
                  <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-end">
                    {mfaQrCode && <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                      <img src={mfaQrCode} width={224} height={224} alt="Scan this QR code with your authenticator app to add your HR Payroll account" className="h-40 w-40" />
                      <p className="mt-1 max-w-40 text-center text-[10px] font-medium text-slate-500">Scan with your authenticator app</p>
                    </div>}
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">Connect your authenticator app</h3>
                      <p className="mt-1 text-xs text-slate-600">Scan the QR code in Google Authenticator, Microsoft Authenticator, Authy, or a compatible app. Use the manual secret only if scanning is unavailable. <strong className="text-rose-700">Never share codes or this secret.</strong></p>
                      <output aria-label="Authenticator setup secret" className="mt-3 block break-all rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
                        Issuer: {mfaEnrollment.issuer}<br />Account: {mfaEnrollment.account}<br />Secret: {mfaEnrollment.secret}
                      </output>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                      <label className="sr-only" htmlFor="my-security-mfa-code">Six-digit authenticator code</label>
                      <input id="my-security-mfa-code" aria-describedby="mfa-code-help" value={mfaEnrollmentCode} onChange={event => setMfaEnrollmentCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Authenticator code" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tracking-[0.2em] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 lg:w-40" />
                      <span id="mfa-code-help" className="sr-only">Enter the current six-digit code shown by your authenticator app.</span>
                      <button type="button" disabled={mfaEnrollmentCode.length !== 6} onClick={confirmMfaEnrollment} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Confirm MFA</button>
                      <button type="button" onClick={() => { setMfaEnrollment(null); setMfaQrCode(''); setMfaEnrollmentCode(''); setMfaSetupChoice(null); setMfaEnrollmentError(''); }} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 underline hover:text-slate-900">Cancel</button>
                    </div>
                  </div>
                  {mfaEnrollmentError && <p role="alert" className="mt-3 text-xs font-medium text-rose-700">{mfaEnrollmentError}</p>}
                </div>}
                {emailMfaEnrollment && <div className="border-t border-amber-200 bg-white/85 p-4"><div className="max-w-xl space-y-3"><h3 className="text-sm font-bold text-slate-900">Confirm email MFA</h3><p className="text-xs text-slate-600">A six-digit setup code was sent to <strong>{emailMfaEnrollment.email}</strong>. Enter it to enable email verification as your MFA method.</p><input value={mfaEmailCode} onChange={event => setMfaEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Email verification code" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tracking-[0.2em]" /><div className="flex gap-2"><button type="button" disabled={mfaEmailCode.length !== 6} onClick={confirmEmailMfaEnrollment} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Confirm email MFA</button><button type="button" onClick={() => { setEmailMfaEnrollment(null); setMfaEmailCode(''); setMfaSetupChoice(null); setMfaEnrollmentError(''); }} className="px-2 text-xs font-semibold text-slate-600 underline">Cancel</button></div></div>{mfaEnrollmentError && <p role="alert" className="mt-3 text-xs font-medium text-rose-700">{mfaEnrollmentError}</p>}</div>}
                {mfaEnabled && <div className="border-t border-emerald-200 bg-white/70 p-4">
                  {!showMfaRecoveryForm ? <button type="button" onClick={() => setShowMfaRecoveryForm(true)} className="text-xs font-semibold text-slate-700 underline hover:text-rose-700">Lost or replacing your authenticator device? Request a controlled MFA reset.</button> : <div className="max-w-xl space-y-2"><label className="block text-xs font-bold text-slate-800">MFA recovery reason</label><textarea value={mfaRecoveryReason} onChange={event => setMfaRecoveryReason(event.target.value)} maxLength={500} rows={2} placeholder="Describe how your identity can be independently verified." className="w-full rounded-lg border border-slate-300 p-2 text-xs" /><div className="flex gap-2"><button type="button" disabled={mfaRecoverySubmitting} onClick={() => submitMfaRecoveryRequest()} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Submit recovery request</button><button type="button" onClick={() => { setShowMfaRecoveryForm(false); setMfaRecoveryError(''); }} className="px-2 text-xs font-semibold text-slate-600 underline">Cancel</button></div>{mfaRecoveryError && <p role="alert" className="text-xs font-medium text-rose-700">{mfaRecoveryError}</p>}</div>}
                </div>}
              </section>

              {/* Contextual Help Banner for Current View */}
              {TAB_WORKFLOW_META[activeTab] && (
                <div className="help-banner">
                  <div className="ic">💡</div>
                  <div>
                    <b dir={portalLanguage === 'ur' ? 'rtl' : undefined}>{portalLanguage === 'ur' ? TAB_HEADINGS_UR[activeTab] : TAB_WORKFLOW_META[activeTab].heading}</b>
                    <span dir={portalLanguage === 'ur' ? 'rtl' : undefined}>{portalLanguage === 'ur' ? TAB_HELP_UR[activeTab] : TAB_WORKFLOW_META[activeTab].help}</span>
                  </div>
                </div>
              )}

              {/* TAB 1: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  
                  {/* Pakistan Banner notification */}
                  <div className="bg-gradient-to-r from-emerald-800 to-green-700 text-white pt-1 pb-2 px-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm shadow-emerald-950/5">
                    <div className="space-y-0">
                      <h2 className="text-sm font-bold tracking-tight">Assalam-o-Alaikum!</h2>
                      <p className="text-emerald-100 text-[10px] max-w-xl">
                        Welcome to the {companyDisplayName} corporate portal. Today is <strong>{new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
                      </p>
                    </div>
                    <div className="mt-1.5 md:mt-0 flex space-x-1.5 bg-emerald-900/40 py-0.5 px-2 rounded border border-emerald-500/20 font-mono text-[10px]">
                      <span>Current Zone: PK (GMT+5)</span>
                    </div>
                  </div>

                  {(userPermissions.includes('manage_settings') || userPermissions.includes('manage_payroll')) && (
                    <GoLiveReadinessPanel items={goLiveReadiness({ statConfig, employees, branches, users, roles, payrollRuns, channels: alertChannels.known ? alertChannels : undefined })} />
                  )}
                  <ComplianceAlertsPanel alerts={openComplianceAlerts} onOpenEmployees={() => setActiveTab('employees')} />

                  {/* Operations Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Active Headcount</p>
                        <h3 className="text-2xl font-bold text-slate-900">{activeCount} / {totalCount}</h3>
                        <p className="text-[11px] text-emerald-600 flex items-center font-medium">95.4% Retention Rate</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Users className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Daily Attendance</p>
                        <h3 className="text-2xl font-bold text-slate-900">{attendanceRate}%</h3>
                        <p className="text-[11px] text-slate-400 font-mono">{presentToday} present in office today</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Calendar className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Pending Tasks</p>
                        <h3 className="text-2xl font-bold text-slate-900">{approvalInbox.length}</h3>
                        <p className="text-[11px] text-amber-500 font-semibold">{overdueApprovalCount ? `${overdueApprovalCount} overdue · ` : ''}{pendingLeavesCount} leaves, {pendingRegularizationsCount} corrections, {pendingPayrollAdjustmentsCount} payroll</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Payroll Disbursals</p>
                        <h3 className="text-xl font-bold text-slate-900">PKR {(totalSalaries).toLocaleString()}</h3>
                        <p className="text-[11px] text-slate-400 font-mono">Monthly Estimated Liability</p>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                        <CreditCard className="w-6 h-6" />
                      </div>
                    </div>
                  </div>

                  {/* Interactive Multi-tenant Hierarchy & Branches list */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wide">Multi-Branch Locations & Compliance Scope</h3>
                        <span className="text-xs text-indigo-600 font-semibold">2 Active Locations</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {localBranches.map(br => {
                          const branchEmps = employees.filter(e => e.branchId === br.id);
                          return (
                            <div key={br.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 space-y-2">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-bold text-slate-900 text-sm flex items-center">
                                    <Building className="w-4 h-4 mr-1 text-slate-600" />
                                    {br.name}
                                  </h4>
                                  <p className="text-xs text-slate-500 flex items-center mt-0.5">
                                    <MapPin className="w-3.5 h-3.5 mr-0.5" /> {br.city}, {br.province}
                                  </p>
                                </div>
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] uppercase px-1.5 py-0.5 rounded font-mono font-bold">
                                  {br.province === 'Sindh' ? 'SESSI Linked' : 'PESSI Linked'}
                                </span>
                              </div>
                              
                              <div className="flex justify-between text-xs pt-2 border-t border-slate-200">
                                <span className="text-slate-500">Staff Count:</span>
                                <span className="font-semibold text-slate-800">{branchEmps.length} Employees</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-sm text-slate-900 uppercase tracking-wide">Manager Approval Inbox</h3><p className="mt-1 text-[11px] text-slate-500">Leave, attendance, and payroll items awaiting review.</p></div>{overdueApprovalCount > 0 && <span className="rounded bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-800">{overdueApprovalCount} overdue</span>}</div>
                      <div className="space-y-2">
                        {approvalInbox.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">No approvals need review.</p> : approvalInbox.slice(0, 5).map(item => <div key={item.id} className={`rounded-lg border p-3 text-xs ${item.ageDays >= 2 ? 'border-rose-200 bg-rose-50/60' : 'border-slate-100 bg-slate-50'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold text-slate-800">{item.employee}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-500">{item.type}</p><p className="mt-1 truncate text-slate-600">{item.detail}</p></div><button type="button" onClick={() => setActiveTab(item.tab as typeof activeTab)} className="shrink-0 font-bold text-emerald-700 underline">Review</button></div><p className={`mt-2 text-[10px] font-medium ${item.ageDays >= 2 ? 'text-rose-700' : 'text-slate-400'}`}>{item.ageDays === 0 ? 'Received today' : `${item.ageDays} day${item.ageDays === 1 ? '' : 's'} waiting`}</p></div>)}
                      </div>
                    </div>

                  </div>

                </motion.div>
              )}

              {/* TAB 2: EMPLOYEES DIRECTORY */}
              {activeTab === 'employees' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Central Employee Master</h2>
                      <p className="text-xs text-slate-500">Total {employees.length} records mapped across {companyDisplayName}</p>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={openAddEmployee}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center space-x-1.5 shadow"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Onboard Employee</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-tabs Selection */}
                  {activeZones.length > 0 && (
                    <div className="flex border-b border-slate-200 space-x-4 mb-4 select-none">
                      <button 
                        onClick={() => setEmpSubTab('list')}
                        className={`pb-2 text-xs font-bold border-b-2 transition uppercase tracking-wider ${empSubTab === 'list' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                      >
                        Employee Records List
                      </button>
                      <button 
                        onClick={() => setEmpSubTab('reports')}
                        className={`pb-2 text-xs font-bold border-b-2 transition uppercase tracking-wider ${empSubTab === 'reports' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                      >
                        UC / Zone / Supervisor Analytics Reports
                      </button>
                    </div>
                  )}

                  {empSubTab === 'list' || activeZones.length === 0 ? (
                    /* Grid or Table listing of employees */
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                          <thead className="bg-slate-50 font-semibold text-slate-700 text-xs uppercase tracking-wider">
                            <tr>
                              <th className="px-6 py-4">Employee &amp; Code</th>
                              <th className="px-6 py-4">CNIC &amp; Province</th>
                              <th className="px-6 py-4">Department &amp; Job</th>
                              <th className="px-6 py-4">Bank/IBAN Info</th>
                              <th className="px-6 py-4">Basic Wage (PKR)</th>
                              <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-slate-700">
                            {employees.map(emp => {
                              const branch = localBranches.find(b => b.id === emp.branchId);
                              const dept = localDepartments.find(d => d.id === emp.departmentId);
                              const desig = localDesignations.find(ds => ds.id === emp.designationId);
                              
                              return (
                                <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center space-x-3">
                                      <div
                                        className="relative cursor-pointer group flex-shrink-0"
                                        onClick={() => setViewImageModal({
                                          open: true,
                                          url: empAvatarUrl(emp),
                                          title: emp.fullName,
                                          subtitle: `${emp.employeeCode} • ${desig?.title || 'Employee'} • ${dept?.name || 'Department'}`
                                        })}
                                        title="Click to view full photo"
                                      >
                                        <img 
                                          src={empAvatarUrl(emp)}
                                          alt={emp.fullName} 
                                          className="w-9 h-9 rounded-full object-cover border border-slate-200 group-hover:ring-2 group-hover:ring-emerald-500 transition-all" 
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).src = empAvatarUrl({ gender: emp.gender });
                                          }}
                                        />
                                        <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[10px]">
                                          <Eye className="w-3.5 h-3.5" />
                                        </div>
                                      </div>
                                      <div>
                                        <div className="font-semibold text-slate-900">{emp.fullName}</div>
                                        <div className="text-xs font-mono text-slate-500 mt-0.5">{emp.employeeCode} • {emp.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="font-mono text-xs font-semibold text-slate-800">{emp.cnic}</span>
                                    <div className="text-xs text-slate-500 mt-0.5">{branch?.city} • {branch?.province}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-slate-800 font-medium text-xs">{desig?.title || 'Specialist'}</div>
                                    <div className="text-[11px] text-slate-500">{dept?.name || 'General Operations'}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-xs font-medium text-slate-800 flex items-center">
                                      <Building className="w-3 h-3 mr-1 text-slate-400" />
                                      {emp.bankName}
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">{emp.iban}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="font-bold text-slate-900">
                                      PKR {(emp.basicSalary || 0).toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-slate-400 block font-sans">
                                      {resolveWageTypeName(emp, wageTypes)} {emp.providentFundOptIn ? '+ 5% PF' : ''}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                    <button
                                      onClick={() => setDocumentVaultEmployee(emp)}
                                      className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded border border-emerald-200 transition cursor-pointer"
                                    >
                                      Documents
                                    </button>
                                    <button 
                                      onClick={() => openEditEmployee(emp)}
                                      className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200 transition cursor-pointer"
                                    >
                                      Edit Record
                                    </button>
                                    {emp.status === 'Active' ? (
                                      <button 
                                        onClick={() => {
                                          setShowOffboardModal(emp);
                                          setSettlementLeavesEncash(Math.min(statConfig.maxLeaveEncashDays ?? 30, annualLeaveBalance(emp, leaves, todayStr, statConfig)));
                                        }}
                                        className="text-xs font-semibold px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded border border-rose-200 transition cursor-pointer"
                                      >
                                        Trigger Exit
                                      </button>
                                    ) : (
                                      <span className="inline-flex px-2.5 py-1 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                                        {emp.status}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* Group Summary Reports view (master-detail) */
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      
                      {/* Left: Group list cards */}
                      <div className="lg:col-span-1 space-y-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                          <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider">Select Grouping Dimension</h3>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => { setReportGrouping('uc'); setSelectedGroup(null); }}
                              className={`flex-1 text-center py-2 rounded text-[10px] uppercase tracking-wider font-semibold transition cursor-pointer ${reportGrouping === 'uc' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-650 hover:bg-slate-200'}`}
                            >
                              UC / Town
                            </button>
                            <button
                              onClick={() => { setReportGrouping('zone'); setSelectedGroup(null); }}
                              className={`flex-1 text-center py-2 rounded text-[10px] uppercase tracking-wider font-semibold transition cursor-pointer ${reportGrouping === 'zone' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-650 hover:bg-slate-200'}`}
                            >
                              Zone Wise
                            </button>
                            <button
                              onClick={() => { setReportGrouping('supervisor'); setSelectedGroup(null); }}
                              className={`flex-1 text-center py-2 rounded text-[10px] uppercase tracking-wider font-semibold transition cursor-pointer ${reportGrouping === 'supervisor' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-650 hover:bg-slate-200'}`}
                            >
                              Supervisor
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                          {(() => {
                            const uniqueGroups = Array.from(new Set(employees.map(e => {
                              if (reportGrouping === 'uc') return resolveUcTownName(e, ucTowns) || 'Unassigned';
                              if (reportGrouping === 'zone') return resolveZoneName(e, zones) || 'Unassigned';
                              return e.zoneInChargeName || (e.isZoneInCharge ? 'Zone In Charge (Self)' : 'Unassigned');
                            })));

                            return uniqueGroups.map(groupName => {
                              const matchingEmps = employees.filter(e => {
                                if (reportGrouping === 'uc') return (resolveUcTownName(e, ucTowns) || 'Unassigned') === groupName;
                                if (reportGrouping === 'zone') return (resolveZoneName(e, zones) || 'Unassigned') === groupName;
                                const supervisor = e.zoneInChargeName || (e.isZoneInCharge ? 'Zone In Charge (Self)' : 'Unassigned');
                                return supervisor === groupName;
                              });

                              const totalSalary = matchingEmps.reduce((sum, e) => {
                                const wage = resolveWageBasis(e, wageTypes) === 'Daily' ? e.basicSalary * 26 : e.basicSalary;
                                return sum + wage;
                              }, 0);

                              const isActive = selectedGroup === groupName || (selectedGroup === null && uniqueGroups[0] === groupName);
                              if (selectedGroup === null && uniqueGroups[0] === groupName) {
                                // Set initial selected group state safely outside layout lifecycle
                                setTimeout(() => setSelectedGroup(groupName), 0);
                              }

                              return (
                                <div 
                                  key={groupName}
                                  onClick={() => setSelectedGroup(groupName)}
                                  className={`p-4 rounded-xl border transition cursor-pointer select-none ${isActive ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'}`}
                                >
                                  <h4 className="font-bold text-sm truncate">{groupName}</h4>
                                  <div className="flex justify-between items-center mt-2.5 text-xs">
                                    <span className={isActive ? 'text-slate-300' : 'text-slate-500'}>Headcount:</span>
                                    <span className="font-bold">{matchingEmps.length} Employees</span>
                                  </div>
                                  <div className="flex justify-between items-center mt-1 text-xs">
                                    <span className={isActive ? 'text-slate-300' : 'text-slate-500'}>Est. Wage Liability:</span>
                                    <span className="font-bold font-mono">PKR {totalSalary.toLocaleString()}</span>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>

                      {/* Right: Selected Group Employees List */}
                      <div className="lg:col-span-2 space-y-4">
                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4 min-h-[400px]">
                          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
                            <h3 className="font-bold text-slate-850 text-xs uppercase tracking-wider">
                              Group Scope: <span className="text-emerald-600 font-extrabold font-mono text-sm ml-1">{selectedGroup || 'Unassigned'}</span>
                            </h3>
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-sans">
                              {employees.filter(e => {
                                if (reportGrouping === 'uc') return (resolveUcTownName(e, ucTowns) || 'Unassigned') === selectedGroup;
                                if (reportGrouping === 'zone') return (resolveZoneName(e, zones) || 'Unassigned') === selectedGroup;
                                const supervisor = e.zoneInChargeName || (e.isZoneInCharge ? 'Zone In Charge (Self)' : 'Unassigned');
                                return supervisor === selectedGroup;
                              }).length} Staff Members
                            </span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100 text-xs text-left">
                              <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                  <th className="px-3 py-2.5">Employee</th>
                                  <th className="px-3 py-2.5">Code</th>
                                  <th className="px-3 py-2.5">Designation</th>
                                  <th className="px-3 py-2.5">Wage (PKR)</th>
                                  <th className="px-3 py-2.5">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-700">
                                {employees.filter(e => {
                                  if (reportGrouping === 'uc') return (resolveUcTownName(e, ucTowns) || 'Unassigned') === selectedGroup;
                                  if (reportGrouping === 'zone') return (resolveZoneName(e, zones) || 'Unassigned') === selectedGroup;
                                  const supervisor = e.zoneInChargeName || (e.isZoneInCharge ? 'Zone In Charge (Self)' : 'Unassigned');
                                  return supervisor === selectedGroup;
                                }).map(emp => (
                                  <tr key={emp.id} className="hover:bg-slate-50 transition">
                                    <td className="px-3 py-2.5 font-sans font-medium text-slate-850 flex items-center space-x-2">
                                      <img src={empAvatarUrl(emp)}alt="" className="w-6 h-6 rounded-full object-cover border" />
                                      <span>{emp.fullName}</span>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono">{emp.employeeCode}</td>
                                    <td className="px-3 py-2.5 text-slate-500">
                                      {localDesignations.find(ds => ds.id === emp.designationId)?.title || 'Specialist'}
                                    </td>
                                    <td className="px-3 py-2.5 font-bold font-mono text-slate-800">
                                      {(emp.basicSalary || 0).toLocaleString()}
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${emp.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                                        {emp.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                </motion.div>
              )}

              {/* TAB 3: ATTENDANCE & TIME REGULARIZATIONS */}
              {activeTab === 'attendance' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Attendance Ingestion &amp; Overtime</h2>
                      <p className="text-xs text-slate-500">Tracking GPS check-ins, web check-ins, and mock biometric devices</p>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => setShowAddAttendanceModal(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center space-x-1.5 shadow transition cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Add Attendance Log</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-tabs Selection */}
                  <div className="flex border-b border-slate-200 space-x-4 mb-4 select-none">
                    <button 
                      onClick={() => setAttSubTab('stream')}
                      className={`pb-2 text-xs font-bold border-b-2 transition uppercase tracking-wider ${attSubTab === 'stream' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                    >
                      Attendance Ingestion Stream
                    </button>
                    <button 
                      onClick={() => setAttSubTab('reports')}
                      className={`pb-2 text-xs font-bold border-b-2 transition uppercase tracking-wider ${attSubTab === 'reports' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                    >
                      Daily / Weekly / Monthly / Yearly Registers
                    </button>
                  </div>

                  {attSubTab === 'stream' ? (
                    <>
                      {(userPermissions.includes('manage_mobile_duty') || isCanonicalSuperAdmin) && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-4">
                          <div>
                            <h3 className="font-bold text-sm text-indigo-900">Mobile Duty Authorizations</h3>
                            <p className="text-[10px] text-indigo-700">Mobile attendance remains hidden unless an approved assignment is valid for the employee and date.</p>
                          </div>
                          <form className="grid grid-cols-1 gap-2 md:grid-cols-4" onSubmit={async event => {
                            event.preventDefault();
                            if (!mobileDutyForm.employeeId || !mobileDutyForm.instructions.trim()) { alert('Select an employee and enter assignment instructions.'); return; }
                            if (mobileDutyForm.validTo < mobileDutyForm.validFrom) { alert('Valid To cannot be before Valid From.'); return; }
                            if (mobileDutyAuthorizations.some(item => item.employeeId === mobileDutyForm.employeeId && item.status === 'Approved' && item.validFrom <= mobileDutyForm.validTo && item.validTo >= mobileDutyForm.validFrom)) { alert('This employee already has an overlapping approved mobile-duty assignment.'); return; }
                            const now = new Date().toISOString();
                            await onSaveMobileDutyAuthorization({
                              id: `mobile-duty-${Date.now()}`,
                              ...mobileDutyForm,
                              instructions: mobileDutyForm.instructions.trim(),
                              assignedLocation: mobileDutyForm.assignedLocation.trim() || undefined,
                              status: 'Approved',
                              assignedByUserId: currentUserAccount.id,
                              assignedByName: currentUserAccount.username,
                              createdAt: now,
                              updatedAt: now,
                            });
                            setMobileDutyForm(previous => ({ ...previous, employeeId: '', instructions: '', assignedLocation: '' }));
                          }}>
                            <select required value={mobileDutyForm.employeeId} onChange={e => setMobileDutyForm(p => ({ ...p, employeeId: e.target.value }))} className="rounded-lg border border-indigo-200 bg-white p-2 text-xs"><option value="">Select employee *</option>{employees.filter(employee => employee.status === 'Active').map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} ({employee.employeeCode})</option>)}</select>
                            <select value={mobileDutyForm.dutyType} onChange={e => setMobileDutyForm(p => ({ ...p, dutyType: e.target.value as MobileDutyType }))} className="rounded-lg border border-indigo-200 bg-white p-2 text-xs">{(['Work from home', 'Out of station', 'Client visit', 'Market / field duty', 'Official travel', 'Direct reporting to worksite', 'Emergency duty'] as MobileDutyType[]).map(type => <option key={type}>{type}</option>)}</select>
                            <DateField required value={mobileDutyForm.validFrom} onChange={e => setMobileDutyForm(p => ({ ...p, validFrom: e.target.value }))} className="rounded-lg border border-indigo-200 bg-white p-2 text-xs" aria-label="Mobile duty valid from" />
                            <DateField required value={mobileDutyForm.validTo} onChange={e => setMobileDutyForm(p => ({ ...p, validTo: e.target.value }))} className="rounded-lg border border-indigo-200 bg-white p-2 text-xs" aria-label="Mobile duty valid to" />
                            <input value={mobileDutyForm.assignedLocation} onChange={e => setMobileDutyForm(p => ({ ...p, assignedLocation: e.target.value }))} placeholder="Assigned client/location (optional)" className="rounded-lg border border-indigo-200 bg-white p-2 text-xs" />
                            <input required value={mobileDutyForm.instructions} onChange={e => setMobileDutyForm(p => ({ ...p, instructions: e.target.value }))} placeholder="Instructions / approval reason *" className="rounded-lg border border-indigo-200 bg-white p-2 text-xs md:col-span-2" />
                            <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 text-[10px] text-slate-700"><input type="checkbox" checked={mobileDutyForm.allowFieldVisits} onChange={e => setMobileDutyForm(p => ({ ...p, allowFieldVisits: e.target.checked }))} /> Allow multiple field visits</label>
                            <button type="submit" className="rounded-lg bg-indigo-700 px-4 py-2 text-xs font-bold text-white md:col-span-4">Assign Mobile Duty</button>
                          </form>
                          <div className="grid gap-2 md:grid-cols-2">
                            {mobileDutyAuthorizations.slice().reverse().map(item => {
                              const employee = employees.find(candidate => candidate.id === item.employeeId);
                              return <div key={item.id} className="rounded-lg border border-indigo-100 bg-white p-3 text-[10px]">
                                <div className="flex justify-between gap-2"><strong className="text-slate-800">{employee?.fullName || item.employeeId} — {item.dutyType}</strong><span className={item.status === 'Approved' ? 'text-emerald-700' : 'text-rose-600'}>{item.status}</span></div>
                                <div className="mt-1 text-slate-500">{item.validFrom} to {item.validTo} · Assigned by {item.assignedByName}</div>
                                <div className="mt-1 text-slate-600">{item.instructions}</div>
                                {item.status === 'Approved' && <button type="button" onClick={() => onCancelMobileDutyAuthorization(item.id)} className="mt-2 font-semibold text-rose-600 underline">Cancel authorization</button>}
                              </div>;
                            })}
                          </div>
                        </div>
                      )}
                      {/* Regularizations queue if active */}
                      {attendances.filter(a => a.regularizationRequested && a.regularizationApproved === undefined).length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                          <h3 className="font-bold text-sm text-amber-800 flex items-center">
                            <AlertTriangle className="w-4 h-4 mr-1.5" />
                            Pending Attendance Regularization Requests ({attendances.filter(a => a.regularizationRequested && a.regularizationApproved === undefined).length})
                          </h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {attendances
                              .filter(a => a.regularizationRequested && a.regularizationApproved === undefined)
                              .map(att => {
                                const emp = employees.find(e => e.id === att.employeeId);
                                return (
                                  <div key={att.id} className="bg-white p-4 rounded-lg border border-amber-200/60 shadow-xs space-y-2 text-xs">
                                    <div className="flex justify-between font-bold text-slate-900">
                                      <span>{emp?.fullName}</span>
                                      <span className="text-slate-500 font-mono">{att.date}</span>
                                    </div>
                                    <p className="text-slate-600"><strong>Requested Status:</strong> {att.punchIn ? 'Re-evaluated against shift on approval' : 'Present & Regularized'}</p>
                                    {(() => { const manager = lineManagerReviewer({ employee: emp, users, roles }); return manager && <p className="text-slate-500">Line manager: <strong>{manager.username}</strong>{isRegularizationOverdue(att) ? ' — escalated, HR may decide' : ''}</p>; })()}
                                    {(att.evidenceDocumentIds || []).length > 0 && <div className="flex flex-wrap gap-2">{att.evidenceDocumentIds!.map((id, index) => <button key={id} type="button" onClick={() => downloadEmployeeDocument(id, `attendance-evidence-${att.date}-${index + 1}`).catch(error => alert(error instanceof Error ? error.message : 'Download failed.'))} className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">Evidence {index + 1}</button>)}</div>}
                                    {att.biometricMatch && <p className="text-slate-500">{att.biometricMatch.kind === 'face' ? 'Face' : 'Fingerprint'} match strength: <strong>{att.biometricMatch.strengthPercent}%</strong></p>}
                                    {att.requestedAt && <p className={isRegularizationOverdue(att) ? 'font-bold text-rose-700' : 'text-slate-500'}>
                                      {isRegularizationOverdue(att) ? 'OVERDUE — escalate to department head. ' : ''}Review due by {new Date(regularizationDueAt(att.requestedAt)!).toLocaleDateString('en-PK')}
                                    </p>}
                                    <p className="text-slate-550 italic bg-amber-50/50 p-2 rounded">
                                      "Reason: {att.regularizationReason || 'Forgot card contact error'}"
                                    </p>
                                    <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                                      <button 
                                        onClick={() => { const comment = window.prompt('Reason for declining this attendance correction:')?.trim(); if (comment) onRejectRegularization(att.id, comment); }}
                                        disabled={att.requestedById === currentUserAccount.id}
                                        title={att.requestedById === currentUserAccount.id ? 'The requester cannot review their own attendance adjustment.' : 'Decline request'}
                                        className="px-2.5 py-1 text-slate-600 border border-slate-355 hover:bg-slate-100 rounded disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        Decline
                                      </button>
                                      <button 
                                        onClick={() => { const comment = window.prompt('Approval comment — evidence reviewed (e.g. gate log, manager confirmation):')?.trim(); if (comment) onApproveRegularization(att.id, comment); }}
                                        disabled={att.requestedById === currentUserAccount.id}
                                        title={att.requestedById === currentUserAccount.id ? 'The requester cannot approve their own attendance adjustment.' : 'Approve request'}
                                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold shadow-xs flex items-center disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Log stream feed */}
                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                          <h3 className="font-bold text-sm text-slate-700">Digital Attendance Stream</h3>
                          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-mono font-bold">Live Stream</span>
                        </div>
                        
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold text-slate-505 uppercase tracking-wider">
                              <tr>
                                <th className="px-6 py-3">Employee</th>
                                <th className="px-6 py-3">Log Date</th>
                                <th className="px-6 py-3">In Punch</th>
                                <th className="px-6 py-3">Out Punch</th>
                                <th className="px-6 py-3">Method/GPS</th>
                                <th className="px-6 py-3">Location Evidence</th>
                                <th className="px-6 py-3">Overtime</th>
                                <th className="px-6 py-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                              {attendances.slice().reverse().map(att => {
                                const emp = employees.find(e => e.id === att.employeeId);
                                const legacyLocation = Number.isFinite(att.latitude) && Number.isFinite(att.longitude)
                                  ? {
                                      latitude: Number(att.latitude), longitude: Number(att.longitude),
                                      accuracyMeters: Number(att.locationAccuracyMeters || 0),
                                      capturedAt: att.locationCapturedAt || '', source: 'device-gps' as const,
                                      address: att.address || '',
                                    }
                                  : undefined;
                                const locationEntries = [
                                  att.punchInLocation ? { label: 'IN', value: att.punchInLocation } : null,
                                  att.punchOutLocation ? { label: 'OUT', value: att.punchOutLocation } : null,
                                  !att.punchInLocation && !att.punchOutLocation && legacyLocation ? { label: 'GPS', value: legacyLocation } : null,
                                ].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
                                return (
                                  <tr key={att.id} className="hover:bg-slate-50/50">
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <div className="flex items-center space-x-2">
                                        <img src={empAvatarUrl(emp)} alt="" className="w-6 h-6 rounded-full object-cover border" />
                                        <div>
                                          <div className="font-semibold text-slate-800 text-xs">{emp?.fullName || 'Wager employee'}</div>
                                          <div className="text-[10px] text-slate-400 font-mono">{emp?.fullName ? emp.employeeCode : 'SYSTEM'}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-xs font-mono">
                                      {att.date}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-xs text-emerald-700 font-mono">
                                      {att.punchIn || '--:--'}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-xs text-indigo-700 font-mono">
                                      {att.punchOut || '--:--'}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-[11px] text-slate-500">
                                      {att.method}
                                    </td>
                                    <td className="px-6 py-3 min-w-56 text-[10px] text-slate-600">
                                      {locationEntries.length ? (
                                        <div className="space-y-1">
                                          {locationEntries.map(({ label, value }) => {
                                            const validCoordinates = value.latitude >= -90 && value.latitude <= 90 && value.longitude >= -180 && value.longitude <= 180;
                                            const mapUrl = validCoordinates ? `https://www.google.com/maps?q=${value.latitude},${value.longitude}` : '';
                                            return (
                                              <div key={label} className="flex items-start gap-1.5">
                                                <span className="rounded bg-slate-100 px-1 py-0.5 font-bold text-slate-500">{label}</span>
                                                <div>
                                                  {validCoordinates ? (
                                                    <a href={mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline hover:text-emerald-900">
                                                      {value.address || `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}`}
                                                    </a>
                                                  ) : <span className="text-rose-600">Invalid coordinates</span>}
                                                  <div className="text-[9px] text-slate-400">
                                                    {value.accuracyMeters > 0 ? `±${Math.round(value.accuracyMeters)} m` : 'Accuracy unavailable'}
                                                    {value.capturedAt ? ` · ${new Date(value.capturedAt).toLocaleString('en-PK')}` : ''}
                                                  </div>
                                                  {label === 'IN' && att.punchInReasonCategory && <div className="mt-0.5 text-[9px] text-slate-600"><strong>{att.punchInReasonCategory}:</strong> {att.punchInReasonNote}</div>}
                                                  {label === 'OUT' && att.punchOutReasonCategory && <div className="mt-0.5 text-[9px] text-slate-600"><strong>{att.punchOutReasonCategory}:</strong> {att.punchOutReasonNote}</div>}
                                                </div>
                                              </div>
                                            );
                                          })}
                                          {att.fieldVisits?.map((visit, index) => (
                                            <div key={visit.id} className="mt-2 rounded border border-indigo-100 bg-indigo-50/60 p-1.5">
                                              <div className="font-bold text-indigo-800">Visit {index + 1}: {visit.clientName}</div>
                                              <div className="mt-1 space-y-1">
                                                {([
                                                  { label: 'CHECK IN', time: visit.checkIn, location: visit.checkInLocation, category: visit.checkInReasonCategory, note: visit.checkInReasonNote },
                                                  visit.checkOutLocation ? { label: 'CHECK OUT', time: visit.checkOut, location: visit.checkOutLocation, category: visit.checkOutReasonCategory, note: visit.checkOutReasonNote } : null,
                                                ] as const).filter(Boolean).map(entry => {
                                                  if (!entry) return null;
                                                  const mapUrl = `https://www.google.com/maps?q=${entry.location.latitude},${entry.location.longitude}`;
                                                  return <div key={entry.label}>
                                                    <span className="font-bold text-slate-500">{entry.label} {entry.time}</span>{' — '}
                                                    <a href={mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 underline">{entry.location.address || `${entry.location.latitude.toFixed(5)}, ${entry.location.longitude.toFixed(5)}`}</a>
                                                    <div className="text-[9px] text-slate-600"><strong>{entry.category}:</strong> {entry.note}</div>
                                                  </div>;
                                                })}
                                                {!visit.checkOut && <div className="font-semibold text-amber-700">Visit currently active</div>}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : <span className="text-slate-400">No location</span>}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-xs font-mono font-medium">
                                      {att.overtimeMinutes > 0 ? `${att.overtimeMinutes} mins` : 'None'}
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                                        att.status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                        att.status === 'Late' ? 'bg-orange-100 text-orange-850' :
                                        att.status === 'Half Day' ? 'bg-amber-100 text-amber-800' :
                                        att.status === 'Absent' ? 'bg-rose-100 text-rose-800' :
                                        att.status === 'On Leave' ? 'bg-indigo-100 text-indigo-855' :
                                        'bg-slate-100 text-slate-600'
                                      }`}>
                                        {att.status}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Attendance Register Reports view */
                    <div className="space-y-6">
                      
                      {/* Period Type Selection header */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex space-x-2 select-none">
                          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(p => (
                            <button
                              key={p}
                              onClick={() => setAttPeriodType(p)}
                              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${attPeriodType === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {p} register
                            </button>
                          ))}
                        </div>

                        {/* Parameter selections depending on period */}
                        {attPeriodType === 'daily' && (
                          <div className="grid w-full grid-cols-1 gap-3 text-xs sm:grid-cols-2 md:w-auto">
                            <label className="flex flex-col gap-1.5 text-slate-500 font-medium">
                              <span>Select Register Date</span>
                              <DateField
                                aria-label="Select Attendance Register Date"
                                value={selectedAttDate}
                                onChange={(e) => setSelectedAttDate(e.target.value)}
                                className="min-h-9 rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-slate-500 font-medium">
                              <span className="flex items-center justify-between gap-4">
                                <span>Audit Scope</span>
                                <span className={`text-[9px] font-bold uppercase tracking-wider ${selectedAttEmployeeId === 'all' ? 'text-slate-400' : 'text-emerald-700'}`}>
                                  {selectedAttEmployeeId === 'all' ? `${employees.length} employees` : 'Focused view'}
                                </span>
                              </span>
                              <span className="relative block">
                                <Users aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-600" />
                                <select
                                  aria-label="Filter Daily Attendance Register by Employee"
                                  value={selectedAttEmployeeId}
                                  onChange={(e) => setSelectedAttEmployeeId(e.target.value)}
                                  className="min-h-9 w-full min-w-64 rounded border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                >
                                  <option value="all">All Employees</option>
                                  {selectedAttEmployeeId !== 'all' && !employees.some(emp => emp.id === selectedAttEmployeeId) && (
                                    <option value={selectedAttEmployeeId}>Selected employee is no longer available</option>
                                  )}
                                  {[...employees]
                                    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }))
                                    .map(emp => (
                                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>
                                    ))}
                                </select>
                              </span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* DAILY REGISTER VIEW */}
                      {attPeriodType === 'daily' && (
                        <div className="space-y-4">
                          {/* Metrics summary */}
                          {(() => {
                            const scopedEmployees = selectedAttEmployeeId === 'all'
                              ? employees
                              : employees.filter(emp => emp.id === selectedAttEmployeeId);
                            const scopedEmployeeIds = new Set(scopedEmployees.map(emp => emp.id));
                            const dayPunches = attendances.filter(a => a.date === selectedAttDate && scopedEmployeeIds.has(a.employeeId));
                            const pCount = dayPunches.filter(a => a.status === 'Present').length;
                            const lCount = dayPunches.filter(a => a.status === 'Late').length;
                            const hdCount = dayPunches.filter(a => a.status === 'Half Day').length;
                            const olCount = dayPunches.filter(a => a.status === 'On Leave').length;
                            const aCount = scopedEmployees.length - pCount - lCount - hdCount - olCount;

                            return (
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
                                <div className="bg-white p-4 rounded-xl border shadow-sm text-center">
                                  <div className="text-2xl font-bold text-emerald-600">{pCount}</div>
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Present</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border shadow-sm text-center">
                                  <div className="text-2xl font-bold text-orange-500">{lCount}</div>
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Late</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border shadow-sm text-center">
                                  <div className="text-2xl font-bold text-amber-500">{hdCount}</div>
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Half Day</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border shadow-sm text-center">
                                  <div className="text-2xl font-bold text-indigo-500">{olCount}</div>
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">On Leave</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border shadow-sm text-center bg-rose-50/20 border-rose-100">
                                  <div className="text-2xl font-bold text-rose-600">{Math.max(0, aCount)}</div>
                                  <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Absent</div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Detail table */}
                          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                            <table className="min-w-[900px] w-full text-xs text-left">
                              <thead className="bg-slate-50 font-bold text-slate-550 uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3">Employee</th>
                                  <th className="px-4 py-3">In Punch</th>
                                  <th className="px-4 py-3">Out Punch</th>
                                  <th className="px-4 py-3">Out Reason</th>
                                  <th className="px-4 py-3">Method</th>
                                  <th className="px-4 py-3">Overtime</th>
                                  <th className="px-4 py-3">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-700">
                                {employees
                                  .filter(emp => selectedAttEmployeeId === 'all' || emp.id === selectedAttEmployeeId)
                                  .map(emp => {
                                  const punch = attendances.find(a => a.employeeId === emp.id && a.date === selectedAttDate);
                                  const status = punch ? punch.status : 'Absent';
                                  
                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 font-medium flex items-center space-x-2">
                                        <img src={empAvatarUrl(emp)} alt="" className="w-6 h-6 rounded-full object-cover border" />
                                        <span>{emp.fullName} ({emp.employeeCode})</span>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-emerald-700">{punch?.punchIn || '--:--'}</td>
                                      <td className="px-4 py-3 font-mono text-indigo-700">{punch?.punchOut || '--:--'}</td>
                                      <td className="px-4 py-3">
                                        {(() => {
                                          const completedBreaks = Array.isArray(punch?.breaks) ? punch.breaks : [];
                                          const finalReason = punch?.punchOut && punch.outReason?.trim()
                                            ? [{ reason: punch.outReason.trim(), outAt: punch.punchOut, returnAt: '' }]
                                            : [];
                                          const reasons = [...completedBreaks, ...finalReason];
                                          if (reasons.length) {
                                            return (
                                              <div className="flex max-w-64 flex-wrap gap-1.5">
                                                {reasons.map((entry, index) => {
                                                  const timeRange = entry.returnAt
                                                    ? `${entry.outAt.slice(0, 5)}–${entry.returnAt.slice(0, 5)}`
                                                    : entry.outAt.slice(0, 5);
                                                  return (
                                                    <span
                                                      key={`${entry.reason}-${entry.outAt}-${index}`}
                                                      title={`${entry.reason} · ${timeRange}`}
                                                      className={`inline-flex max-w-60 truncate rounded border px-2 py-0.5 text-[10px] font-semibold ${entry.returnAt ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
                                                    >
                                                      {entry.reason} · {timeRange}
                                                    </span>
                                                  );
                                                })}
                                              </div>
                                            );
                                          }
                                          return punch?.punchOut ? (
                                            <span className="inline-flex rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                              Not recorded
                                            </span>
                                          ) : (
                                            <span className="text-slate-400" aria-label="No punch-out">&mdash;</span>
                                          );
                                        })()}
                                      </td>
                                      <td className="px-4 py-3 text-slate-500">{punch?.method || 'N/A'}</td>
                                      <td className="px-4 py-3 font-mono">{punch?.overtimeMinutes ? `${punch.overtimeMinutes}m` : 'None'}</td>
                                      <td className="px-4 py-3">
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                                          status === 'Present' ? 'bg-emerald-100 text-emerald-800' :
                                          status === 'Late' ? 'bg-orange-100 text-orange-850' :
                                          status === 'Half Day' ? 'bg-amber-100 text-amber-800' :
                                          status === 'On Leave' ? 'bg-indigo-100 text-indigo-800' :
                                          'bg-rose-100 text-rose-800'
                                        }`}>
                                          {status}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                                {employees.filter(emp => selectedAttEmployeeId === 'all' || emp.id === selectedAttEmployeeId).length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center">
                                      <div className="mx-auto max-w-md">
                                        <div className="font-semibold text-slate-700">No employee attendance to display</div>
                                        <div className="mt-1 text-xs leading-5 text-slate-500">
                                          The selected employee is no longer available, or there are no employees in this register. Choose All Employees to review the current workforce.
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* WEEKLY REGISTER VIEW */}
                      {attPeriodType === 'weekly' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { name: 'Week 1 (June 01 - June 07)', start: '2026-06-01', end: '2026-06-07' },
                            { name: 'Week 2 (June 08 - June 14)', start: '2026-06-08', end: '2026-06-14' },
                            { name: 'Week 3 (June 15 - June 21)', start: '2026-06-15', end: '2026-06-21' },
                            { name: 'Week 4 (June 22 - June 28)', start: '2026-06-22', end: '2026-06-28' }
                          ].map(wk => {
                            const wkPunches = attendances.filter(a => a.date >= wk.start && a.date <= wk.end);
                            const presents = wkPunches.filter(a => a.status === 'Present' || a.status === 'Late').length;
                            const halfDays = wkPunches.filter(a => a.status === 'Half Day').length;
                            const totalExpected = employees.length * 5; // 5 working days expected per employee
                            const attendanceRate = totalExpected > 0 ? Math.round((presents / totalExpected) * 100) : 0;
                            const totalOT = wkPunches.reduce((sum, a) => sum + a.overtimeMinutes, 0);

                            return (
                              <div key={wk.name} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                <div className="flex justify-between border-b pb-2">
                                  <h4 className="font-bold text-slate-800">{wk.name}</h4>
                                  <span className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-1.5 py-0.5 rounded border border-emerald-100">
                                    {attendanceRate}% rate
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                  <div className="bg-slate-50 p-2 rounded">
                                    <div className="font-bold text-slate-800">{presents}</div>
                                    <div className="text-[9px] text-slate-400 uppercase mt-0.5">Presents</div>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded">
                                    <div className="font-bold text-slate-800">{halfDays}</div>
                                    <div className="text-[9px] text-slate-400 uppercase mt-0.5">Half Days</div>
                                  </div>
                                  <div className="bg-slate-50 p-2 rounded">
                                    <div className="font-bold text-slate-800 font-mono">{Math.round(totalOT/60)}h</div>
                                    <div className="text-[9px] text-slate-400 uppercase mt-0.5">Overtime</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* MONTHLY REGISTER VIEW */}
                      {attPeriodType === 'monthly' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
                          <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Monthly Aggregate Register: {new Date(`${selectedAttDate.slice(0, 7)}-01T00:00:00`).toLocaleString('en-PK', { month: 'long', year: 'numeric' })}</h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs text-left">
                              <thead className="bg-slate-50 font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                  <th className="px-3 py-2.5">Employee</th>
                                  <th className="px-3 py-2.5 text-center">Present</th>
                                  <th className="px-3 py-2.5 text-center">Late</th>
                                  <th className="px-3 py-2.5 text-center">Half Day</th>
                                  <th className="px-3 py-2.5 text-center">On Leave</th>
                                  <th className="px-3 py-2.5 text-center">Absent</th>
                                  <th className="px-3 py-2.5 text-right">Overtime</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-700">
                                {employees.map(emp => {
                                  const monthPunches = attendances.filter(
                                    a => a.employeeId === emp.id && a.date.startsWith(selectedAttDate.slice(0, 7))
                                  );
                                  const present = monthPunches.filter(a => a.status === 'Present').length;
                                  const late = monthPunches.filter(a => a.status === 'Late').length;
                                  const half = monthPunches.filter(a => a.status === 'Half Day').length;
                                  const leave = monthPunches.filter(a => a.status === 'On Leave').length;
                                  const absent = monthPunches.filter(a => a.status === 'Absent').length;
                                  const otMinutes = monthPunches.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);

                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                        <img src={empAvatarUrl(emp)} alt="" className="w-5 h-5 rounded-full object-cover border" />
                                        <span>{emp.fullName}</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{present}</td>
                                      <td className="px-3 py-2.5 text-center text-orange-500">{late}</td>
                                      <td className="px-3 py-2.5 text-center text-amber-500">{half}</td>
                                      <td className="px-3 py-2.5 text-center text-indigo-500">{leave}</td>
                                      <td className="px-3 py-2.5 text-center text-rose-500">{absent}</td>
                                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{(otMinutes/60).toFixed(1)} hrs</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* YEARLY REGISTER VIEW */}
                      {attPeriodType === 'yearly' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
                          <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Annual Aggregate Register: Calendar Year 2026</h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs text-left">
                              <thead className="bg-slate-50 font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                  <th className="px-3 py-2.5">Employee</th>
                                  <th className="px-3 py-2.5 text-center">Present Days</th>
                                  <th className="px-3 py-2.5 text-center">Late Days</th>
                                  <th className="px-3 py-2.5 text-center">Half Days</th>
                                  <th className="px-3 py-2.5 text-center">On Leave Days</th>
                                  <th className="px-3 py-2.5 text-right">OT Logged</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-700">
                                {employees.map(emp => {
                                  const yrPunches = attendances.filter(a => a.employeeId === emp.id && a.date.startsWith(selectedAttDate.slice(0, 4)));
                                  const present = yrPunches.filter(a => a.status === 'Present').length;
                                  const late = yrPunches.filter(a => a.status === 'Late').length;
                                  const half = yrPunches.filter(a => a.status === 'Half Day').length;
                                  const leave = yrPunches.filter(a => a.status === 'On Leave').length;
                                  const ot = yrPunches.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);

                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                        <img src={empAvatarUrl(emp)} alt="" className="w-5 h-5 rounded-full object-cover border" />
                                        <span>{emp.fullName}</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center font-bold text-emerald-600">{present}</td>
                                      <td className="px-3 py-2.5 text-center text-orange-500">{late}</td>
                                      <td className="px-3 py-2.5 text-center text-amber-500">{half}</td>
                                      <td className="px-3 py-2.5 text-center text-indigo-500">{leave}</td>
                                      <td className="px-3 py-2.5 text-right font-mono font-semibold">{(ot/60).toFixed(1)} hrs</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </motion.div>
              )}

              {/* TAB 4: LEAVE MANAGEMENT WORKFLOW */}
              {activeTab === 'leaves' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Regional Leave Accruals &amp; approvals</h2>
                      <p className="text-xs text-slate-500">Configured according to Provincial Shops &amp; Establishments laws</p>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => setShowAddLeaveModal(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center space-x-1.5 shadow transition cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Add Leave Record</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-tabs Selection */}
                  <div className="flex border-b border-slate-200 space-x-4 mb-4 select-none">
                    <button 
                      onClick={() => setLeaveSubTab('list')}
                      className={`pb-2 text-xs font-bold border-b-2 transition uppercase tracking-wider ${leaveSubTab === 'list' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                    >
                      Leave Applications List
                    </button>
                    <button 
                      onClick={() => setLeaveSubTab('reports')}
                      className={`pb-2 text-xs font-bold border-b-2 transition uppercase tracking-wider ${leaveSubTab === 'reports' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
                    >
                      Daily / Weekly / Monthly / Yearly Reports
                    </button>
                  </div>

                  {leaveSubTab === 'list' ? (
                    /* Grid of multi-step leaves status */
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                          <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-widest">
                            <tr>
                              <th className="px-6 py-4">Employee</th>
                              <th className="px-6 py-4">Leave Type</th>
                              <th className="px-6 py-4">Dates Selected</th>
                              <th className="px-6 py-4">Days</th>
                              <th className="px-6 py-4">Reason Statement</th>
                              <th className="px-6 py-4 text-right">Decision</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-slate-700">
                            {leaves.map(lv => {
                              const emp = employees.find(e => e.id === lv.employeeId) || employees.find(e => e.fullName.toLowerCase().includes('aqeel'));
                              return (
                                <tr key={lv.id} className="hover:bg-slate-50">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="font-semibold text-slate-800">{emp?.fullName}</div>
                                    <div className="text-[11px] font-mono text-slate-400">{emp?.employeeCode}</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-xs">
                                    <span className="font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                                      {lv.leaveType}
                                    </span>
                                    {emp && lv.status === 'Pending' && lv.leaveType !== 'Unpaid' && (() => {
                                      const balance = leaveBalances(emp, leaves, Number(lv.startDate.slice(0, 4)), statConfig, lv.id).find(item => item.type === lv.leaveType);
                                      return balance && <div className={`mt-1 text-[10px] font-semibold ${balance.remaining < lv.totalDays ? 'text-rose-700' : 'text-slate-500'}`}>{balance.remaining} of {balance.entitled} day(s) left</div>;
                                    })()}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-slate-600">
                                    {lv.startDate} to {lv.endDate}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap font-bold text-xs text-slate-900">
                                    {lv.totalDays} Days
                                  </td>
                                  <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-505 italic text-slate-500">
                                    "{lv.reason}"
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                                    {lv.status === 'Pending' ? (
                                      <div className="inline-flex space-x-1.5 justify-end">
                                        <button
                                          onClick={() => onRejectLeave(lv.id)}
                                          className="text-rose-600 hover:text-rose-800 bg-rose-50 border border-rose-200 font-semibold px-2.5 py-1 rounded transition cursor-pointer"
                                        >
                                          Reject
                                        </button>
                                        <button
                                          onClick={() => onApproveLeave(lv.id)}
                                          className="text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-300 font-semibold px-2.5 py-1 rounded transition cursor-pointer"
                                        >
                                          Approve
                                        </button>
                                      </div>
                                    ) : (
                                      <span className={`inline-flex px-2.5 py-1 rounded text-xs font-bold leading-none ${
                                        lv.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                                      }`}>
                                        {lv.status}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* Leave Register Reports view */
                    <div className="space-y-6">
                      
                      {/* Period Selection */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex space-x-2 select-none">
                          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(p => (
                            <button
                              key={p}
                              onClick={() => setLeavePeriodType(p)}
                              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition cursor-pointer ${leavePeriodType === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            >
                              {p} register
                            </button>
                          ))}
                        </div>

                        {leavePeriodType === 'daily' && (
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-slate-500 font-medium">Select Register Date:</span>
                            <DateField
                              aria-label="Select Leave Register Date"
                              value={selectedLeaveDate}
                              onChange={(e) => setSelectedLeaveDate(e.target.value)}
                              className="p-1.5 border rounded font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        )}
                      </div>

                      {/* DAILY LEAVES VIEW */}
                      {leavePeriodType === 'daily' && (
                        <div className="space-y-4">
                          {(() => {
                            const activeLeaves = leaves.filter(
                              l => l.status === 'Approved' && selectedLeaveDate >= l.startDate && selectedLeaveDate <= l.endDate
                            );
                            const casual = activeLeaves.filter(l => l.leaveType === 'Casual').length;
                            const sick = activeLeaves.filter(l => l.leaveType === 'Sick').length;
                            const annual = activeLeaves.filter(l => l.leaveType === 'Annual').length;
                            const unpaid = activeLeaves.filter(l => l.leaveType === 'Unpaid').length;

                            return (
                              <>
                                <div className="grid grid-cols-4 gap-4 text-center">
                                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                                    <div className="text-xl font-bold text-slate-800">{casual}</div>
                                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-1">Casual Leave</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                                    <div className="text-xl font-bold text-orange-600">{sick}</div>
                                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-1">Sick Leave</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                                    <div className="text-xl font-bold text-emerald-600">{annual}</div>
                                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-1">Annual Leave</div>
                                  </div>
                                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                                    <div className="text-xl font-bold text-rose-500">{unpaid}</div>
                                    <div className="text-[9px] uppercase tracking-wider text-slate-400 mt-1">Unpaid Leave</div>
                                  </div>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-3">Employees on Leave for {selectedLeaveDate}</h3>
                                  {activeLeaves.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic py-6 text-center">No employees are on approved leave on this date.</p>
                                  ) : (
                                    <table className="min-w-full text-xs text-left">
                                      <thead className="bg-slate-50 text-slate-500 font-bold">
                                        <tr>
                                          <th className="px-3 py-2">Employee</th>
                                          <th className="px-3 py-2">Leave Type</th>
                                          <th className="px-3 py-2">Duration</th>
                                          <th className="px-3 py-2">Reason</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200 text-slate-700">
                                        {activeLeaves.map(l => {
                                          const emp = employees.find(e => e.id === l.employeeId) || employees.find(e => e.fullName.toLowerCase().includes('aqeel'));
                                          return (
                                            <tr key={l.id} className="hover:bg-slate-50">
                                              <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                                <img src={empAvatarUrl(emp)} alt="" className="w-5 h-5 rounded-full object-cover border" />
                                                <span>{emp?.fullName}</span>
                                              </td>
                                              <td className="px-3 py-2.5">
                                                <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded font-mono text-[10px]">{l.leaveType}</span>
                                              </td>
                                              <td className="px-3 py-2.5 font-mono">{l.startDate} to {l.endDate} ({l.totalDays} Days)</td>
                                              <td className="px-3 py-2.5 text-slate-550 italic text-slate-500">"{l.reason}"</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {/* WEEKLY LEAVES VIEW */}
                      {leavePeriodType === 'weekly' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {[
                            { name: 'Week 1 (June 01 - June 07)', start: '2026-06-01', end: '2026-06-07' },
                            { name: 'Week 2 (June 08 - June 14)', start: '2026-06-08', end: '2026-06-14' },
                            { name: 'Week 3 (June 15 - June 21)', start: '2026-06-15', end: '2026-06-21' },
                            { name: 'Week 4 (June 22 - June 28)', start: '2026-06-22', end: '2026-06-28' }
                          ].map(wk => {
                            const wkLeaves = leaves.filter(
                              l => l.status === 'Approved' && 
                                  ((l.startDate >= wk.start && l.startDate <= wk.end) || 
                                   (l.endDate >= wk.start && l.endDate <= wk.end))
                            );
                            const totalDays = wkLeaves.reduce((sum, l) => sum + l.totalDays, 0);

                            return (
                              <div key={wk.name} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                <h4 className="font-bold text-slate-800 border-b pb-2">{wk.name}</h4>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500">Approved Leave Filings:</span>
                                  <span className="font-bold">{wkLeaves.length} Applications</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-slate-500">Cumulative Days Off:</span>
                                  <span className="font-bold text-emerald-600 font-mono">{totalDays} Mandays</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* MONTHLY LEAVES VIEW */}
                      {leavePeriodType === 'monthly' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                          <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Monthly Leave Log Summary: {new Date(`${selectedLeaveDate.slice(0, 7)}-01T00:00:00`).toLocaleString('en-PK', { month: 'long', year: 'numeric' })}</h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs text-left">
                              <thead className="bg-slate-50 font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                  <th className="px-3 py-2.5">Employee</th>
                                  <th className="px-3 py-2.5 text-center">Casual</th>
                                  <th className="px-3 py-2.5 text-center">Sick</th>
                                  <th className="px-3 py-2.5 text-center">Annual</th>
                                  <th className="px-3 py-2.5 text-center">Unpaid</th>
                                  <th className="px-3 py-2.5 text-right">Total Days Off</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-700">
                                {employees.map(emp => {
                                  const monthLeaves = leaves.filter(
                                    l => l.employeeId === emp.id && l.status === 'Approved' && l.startDate.startsWith(selectedLeaveDate.slice(0, 7))
                                  );
                                  const casual = monthLeaves.filter(l => l.leaveType === 'Casual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const sick = monthLeaves.filter(l => l.leaveType === 'Sick').reduce((sum, l) => sum + l.totalDays, 0);
                                  const annual = monthLeaves.filter(l => l.leaveType === 'Annual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const unpaid = monthLeaves.filter(l => l.leaveType === 'Unpaid').reduce((sum, l) => sum + l.totalDays, 0);
                                  const total = casual + sick + annual + unpaid;

                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                        <img src={empAvatarUrl(emp)} alt="" className="w-5 h-5 rounded-full object-cover border" />
                                        <span>{emp.fullName}</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{casual || '-'}</td>
                                      <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{sick || '-'}</td>
                                      <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{annual || '-'}</td>
                                      <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{unpaid || '-'}</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-indigo-700">{total || '-'} days</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* YEARLY LEAVES VIEW */}
                      {leavePeriodType === 'yearly' && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                          <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Annual Leave Log Summary: Calendar Year {selectedLeaveDate.slice(0, 4)}</h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs text-left">
                              <thead className="bg-slate-50 font-bold text-slate-500 uppercase tracking-wider">
                                <tr>
                                  <th className="px-3 py-2.5">Employee</th>
                                  <th className="px-3 py-2.5 text-center">Casual Approved</th>
                                  <th className="px-3 py-2.5 text-center">Sick Approved</th>
                                  <th className="px-3 py-2.5 text-center">Annual Approved</th>
                                  <th className="px-3 py-2.5 text-right">Total Days Off</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-705">
                                {employees.map(emp => {
                                  const yrLeaves = leaves.filter(
                                    l => l.employeeId === emp.id && l.status === 'Approved' && l.startDate.startsWith(selectedLeaveDate.slice(0, 4))
                                  );
                                  const casual = yrLeaves.filter(l => l.leaveType === 'Casual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const sick = yrLeaves.filter(l => l.leaveType === 'Sick').reduce((sum, l) => sum + l.totalDays, 0);
                                  const annual = yrLeaves.filter(l => l.leaveType === 'Annual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const total = casual + sick + annual;

                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                        <img src={empAvatarUrl(emp)} alt="" className="w-5 h-5 rounded-full object-cover border" />
                                        <span>{emp.fullName}</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center font-semibold text-slate-850">{casual || '-'}</td>
                                      <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{sick || '-'}</td>
                                      <td className="px-3 py-2.5 text-center font-semibold text-slate-800">{annual || '-'}</td>
                                      <td className="px-3 py-2.5 text-right font-bold text-indigo-800">{total || '-'} days</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </motion.div>
              )}

              {/* TAB 5: PAYROLL ENGINE & RUNS */}
              {activeTab === 'payroll' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-2 md:space-y-0">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">FBR &amp; Regional Statutory Payroll Engine</h2>
                      <p className="text-xs text-slate-500">Calculate EOBI, Provincial PESSI contributions, individual 12-month annualized tax slabs and download HBL/Alfalah files</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select aria-label="Payroll month" value={payrollMonth} onChange={e => setPayrollMonth(Number(e.target.value))} className="border border-slate-300 rounded-lg px-2 py-2 text-xs bg-white text-slate-800">
                        {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('en-PK', { month: 'long' })}</option>)}
                      </select>
                      <input aria-label="Payroll year" type="number" min="2020" max="2100" value={payrollYear} onChange={e => setPayrollYear(Number(e.target.value))} className="w-24 border border-slate-300 rounded-lg px-2 py-2 text-xs bg-white text-slate-800" />
                      {attendancePeriods.find(item => item.periodMonth === payrollMonth && item.periodYear === payrollYear)?.status === 'Locked' ? (
                        <button
                          onClick={() => { const reason = window.prompt('Reason for reopening the certified attendance register (min 10 characters):')?.trim(); if (reason) onReopenAttendancePeriod(payrollMonth, payrollYear, reason); }}
                          className="bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs px-3 py-2 rounded-lg shadow transition"
                        >
                          Reopen Register (v{attendancePeriods.find(item => item.periodMonth === payrollMonth && item.periodYear === payrollYear)?.registerVersion || 1})
                        </button>
                      ) : (
                        <button
                          onClick={() => onLockAttendancePeriod(payrollMonth, payrollYear)}
                          className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-3 py-2 rounded-lg shadow transition"
                        >
                          {attendancePeriods.some(item => item.periodMonth === payrollMonth && item.periodYear === payrollYear) ? 'Lock Corrected Register' : 'Lock Register'}
                        </button>
                      )}
                      <button 
                        onClick={() => onCreatePayrollRun(`Payroll - ${new Date(payrollYear, payrollMonth - 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })}`, payrollMonth, payrollYear)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center space-x-1 shadow transition"
                      >
                        <span>Run New Payroll Cycle</span>
                      </button>
                    </div>
                  </div>

                  <PayrollReportsPanel
                    employees={employees}
                    payrollRuns={payrollRuns}
                    payrollPayslips={payrollPayslips}
                    gratuitySettlements={gratuitySettlements}
                    statConfig={statConfig}
                    wageTypes={wageTypes}
                    company={primaryCompany}
                    periodMonth={payrollMonth}
                    periodYear={payrollYear}
                    onCreateSupplementaryRun={onCreateSupplementaryRun}
                    onCreateFinalSettlementRun={onCreateFinalSettlementRun}
                    onRecordTaxDeposit={onRecordTaxDeposit}
                    currentUser={currentUserAccount}
                    onCreatePayrollAdjustment={onCreatePayrollAdjustment}
                    onRetroRecalculate={onRetroRecalculate}
                  />
                  <ParallelRunPanel payrollRuns={payrollRuns} payrollPayslips={payrollPayslips} onRecord={onRecordParallelRun} />

                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">One-time payroll adjustments</h3>
                      <p className="text-xs text-slate-500">Period-specific items require approval by a different payroll user and can be consumed by one payroll run only.</p>
                    </div>
                    <form className="grid grid-cols-1 md:grid-cols-6 gap-3" onSubmit={async event => {
                      event.preventDefault();
                      const amount = Number(adjustmentAmount);
                      if (!adjustmentEmployeeId || !Number.isFinite(amount) || amount <= 0 || !adjustmentReason.trim()) {
                        showToast('Select an employee and enter a positive amount with a reason.');
                        return;
                      }
                      const nonTaxableType = adjustmentType === 'Reimbursement' || adjustmentType === 'Deduction' || adjustmentType === 'Tax Adjustment';
                      await onCreatePayrollAdjustment({
                        id: `adjustment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        employeeId: adjustmentEmployeeId,
                        periodMonth: payrollMonth,
                        periodYear: payrollYear,
                        type: adjustmentType,
                        amount,
                        taxable: nonTaxableType ? false : adjustmentTaxable,
                        reason: adjustmentReason.trim(),
                        status: 'Pending',
                        createdAt: new Date().toISOString(),
                        createdById: currentUserAccount.id,
                        createdBy: currentUserAccount.username,
                      });
                      setAdjustmentAmount('');
                      setAdjustmentReason('');
                      showToast('Adjustment submitted for independent approval.');
                    }}>
                      <select aria-label="Adjustment employee" value={adjustmentEmployeeId} onChange={e => setAdjustmentEmployeeId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white">
                        <option value="">Select employee</option>
                        {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.employeeCode} — {employee.fullName}</option>)}
                      </select>
                      <select aria-label="Adjustment type" value={adjustmentType} onChange={e => setAdjustmentType(e.target.value as PayrollAdjustmentType)} className="border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white">
                        {(['Bonus', 'Commission', 'Arrears', 'Reimbursement', 'Deduction', 'Tax Adjustment'] as PayrollAdjustmentType[]).map(type => <option key={type}>{type}</option>)}
                      </select>
                      <input aria-label="Adjustment amount" type="number" min="1" step="0.01" value={adjustmentAmount} onChange={e => setAdjustmentAmount(e.target.value)} placeholder="Amount (PKR)" className="border border-slate-300 rounded-lg px-3 py-2 text-xs" />
                      <input aria-label="Adjustment reason" value={adjustmentReason} onChange={e => setAdjustmentReason(e.target.value)} placeholder="Reason / reference" className="border border-slate-300 rounded-lg px-3 py-2 text-xs md:col-span-2" />
                      <button type="submit" className="bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs px-3 py-2 rounded-lg">Submit for approval</button>
                      {!['Reimbursement', 'Deduction', 'Tax Adjustment'].includes(adjustmentType) && <label className="md:col-span-6 flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={adjustmentTaxable} onChange={e => setAdjustmentTaxable(e.target.checked)} /> Include in taxable salary</label>}
                    </form>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]"><tr><th className="p-2 text-left">Employee</th><th className="p-2 text-left">Type</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Reason</th><th className="p-2 text-left">Maker</th><th className="p-2 text-left">Status / action</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {payrollAdjustments.filter(item => item.periodMonth === payrollMonth && item.periodYear === payrollYear).map(item => (
                            <tr key={item.id}>
                              <td className="p-2 font-medium">{employees.find(employee => employee.id === item.employeeId)?.fullName || item.employeeId}</td>
                              <td className="p-2">{item.type}{item.taxable ? ' · taxable' : ''}</td>
                              <td className="p-2 text-right font-mono">PKR {item.amount.toLocaleString()}</td>
                              <td className="p-2 text-slate-600">{item.reason}</td>
                              <td className="p-2 text-slate-500">{item.createdBy}</td>
                              <td className="p-2">
                                {item.status === 'Pending' ? <div className="flex gap-2"><button type="button" disabled={item.createdById === currentUserAccount.id} onClick={() => onReviewPayrollAdjustment(item.id, 'Approved')} className="text-emerald-700 font-bold disabled:text-slate-400" title={item.createdById === currentUserAccount.id ? 'Another payroll user must approve.' : 'Approve'}>Approve</button><button type="button" disabled={item.createdById === currentUserAccount.id} onClick={() => onReviewPayrollAdjustment(item.id, 'Rejected')} className="text-rose-700 font-bold disabled:text-slate-400">Reject</button></div> : <span className={item.status === 'Approved' ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>{item.status}{item.payrollRunId ? ' · consumed' : ''}</span>}
                              </td>
                            </tr>
                          ))}
                          {!payrollAdjustments.some(item => item.periodMonth === payrollMonth && item.periodYear === payrollYear) && <tr><td colSpan={6} className="p-4 text-center text-slate-400">No adjustments for this payroll period.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* History list of cycles */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm md:col-span-1 space-y-4">
                      <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">Historical Runs</h3>
                      
                      <div className="space-y-3">
                        {payrollRuns.map(run => {
                          return (
                            <div key={run.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/50 transition cursor-pointer text-xs space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-900">{run.title}{run.runType && run.runType !== 'Regular' && <span className="ml-1 rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-bold uppercase text-indigo-800">{run.runType}</span>}</span>
                                <span className={`${run.status === 'Cancelled' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'} font-bold px-1.5 py-0.5 rounded text-[10px]`}>
                                  {run.status}
                                </span>
                              </div>
                              
                              <div className="flex justify-between font-mono text-[11px] text-slate-500">
                                <span>Month: {run.periodMonth}/{run.periodYear}</span>
                                <span>{run.employeeCount || 0} employees</span>
                              </div>

                              <div className="flex justify-between font-bold text-slate-800 text-xs">
                                <span>Net Total:</span>
                                <span>PKR {run.totalNetPay.toLocaleString()}</span>
                              </div>
                              {(run.preflightWarningCount || 0) > 0 && <div className="rounded bg-amber-50 px-2 py-1 text-amber-800 font-semibold">{run.preflightWarningCount} material pay variance warning(s)</div>}
                              {run.status === 'Cancelled' && <div className="rounded bg-rose-50 px-2 py-1 text-rose-800">Cancelled by {run.cancelledBy} on {run.cancelledAt?.slice(0, 10)}: {run.cancellationReason}</div>}
                              {run.status === 'Cancelled' && run.statusBeforeCancellation === 'Approved' && <button type="button" onClick={() => downloadAccountingJournal(run)} className="text-[10px] font-semibold text-rose-700 hover:underline">Reversal journal CSV</button>}
                              {run.taxDeposit && <div className="text-[10px] text-slate-500">FBR deposit CPR {run.taxDeposit.cprNumber} · PKR {run.taxDeposit.amount.toLocaleString()} on {run.taxDeposit.depositedOn}</div>}
                              
                              <div className="border-t border-slate-200 pt-2 flex justify-between space-x-1.5 text-[11px]">
                                <button disabled={run.status === 'Draft' || run.status === 'Cancelled'} title={run.status === 'Draft' ? 'Approve payroll before generating bank advice.' : run.status === 'Cancelled' ? 'Cancelled runs cannot be paid.' : 'Generate bank advice'}
                                  onClick={() => setShowBankFileModal(run)}
                                  className="text-emerald-750 hover:underline flex items-center disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed"
                                >
                                  <Download className="w-3 h-3 mr-0.5" /> Bank Advice File
                                </button>
                                {run.status === 'Draft' && <button disabled={run.createdById === currentUserAccount.id} title={run.createdById === currentUserAccount.id ? 'Prepared by you; another payroll officer must approve.' : 'Approve payroll'} onClick={() => onUpdatePayrollStatus(run.id, 'Approved')} className="text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">Approve</button>}
                                {run.status === 'Approved' && <button disabled={run.approvedById === currentUserAccount.id || !run.bankAdviceChecksum} title={run.approvedById === currentUserAccount.id ? 'Approved by you; another authorized user must disburse.' : !run.bankAdviceChecksum ? 'Generate and download bank advice first.' : 'Mark payroll disbursed'} onClick={() => { const reference = window.prompt('Enter the bank transaction/reference number shown by your bank:')?.trim(); if (reference) onUpdatePayrollStatus(run.id, 'Disbursed', reference); }} className="text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">Mark Disbursed</button>}
                                {(run.status === 'Draft' || run.status === 'Approved') && <button type="button" onClick={() => { const reason = window.prompt('Reason for cancelling this payroll run (min 10 characters). Payslips are kept for audit:')?.trim(); if (reason) onCancelPayrollRun(run.id, reason); }} className="text-rose-700 hover:underline">Cancel Run</button>}
                              </div>
                              {run.status !== 'Draft' && run.status !== 'Cancelled' && <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 pt-2 text-[10px] font-semibold">
                                <button type="button" onClick={() => downloadStatutoryReport('FBR', run)} className="text-indigo-700 hover:underline">FBR withholding CSV</button>
                                <button type="button" onClick={() => downloadStatutoryReport('EOBI', run)} className="text-indigo-700 hover:underline">EOBI return CSV</button>
                                <button type="button" onClick={() => downloadStatutoryReport('SOCIAL_SECURITY', run)} className="text-indigo-700 hover:underline">Provincial social-security CSV</button>
                                <button type="button" onClick={() => downloadTemplateReturn('EOBI Return', run)} className="text-indigo-700 hover:underline">EOBI upload file</button>
                                <button type="button" onClick={() => downloadTemplateReturn('Social Security Return', run)} className="text-indigo-700 hover:underline">Social-security upload file</button>
                                {run.bankAdviceBatchReference && <span className="text-slate-500">Bank batch {run.bankAdviceBatchReference} · control {run.bankAdviceControlHash}{run.bankAdviceTemplateVerified ? '' : ' (unverified template)'}</span>}
                                <button type="button" onClick={() => downloadAccountingJournal(run)} className="text-indigo-700 hover:underline">Accounting journal CSV</button>
                                {run.status === 'Disbursed' && <button type="button" onClick={() => setPaymentExceptionRun(run)} className="text-rose-700 hover:underline">Payment exceptions{payrollPayslips.some(item => item.payrollRunId === run.id && item.paymentStatus === 'Failed') ? ' (open)' : ''}</button>}
                                {run.status === 'Disbursed' && <button type="button" onClick={async () => { try { const result = await onSendPayslips(run.id); const message = `${result.sent} sent, ${result.skipped} already delivered, ${result.failed.length} failed.`; if (result.failed.length) alert(`Payslip delivery completed with exceptions: ${message}`); else showToast(`Payslip delivery: ${message}`); } catch (error) { alert(error instanceof Error ? error.message : 'Payslips could not be sent.'); } }} className="text-indigo-700 hover:underline">Email payslips</button>}
                                {run.status === 'Disbursed' && <button type="button" disabled={!alertChannels.sms} title={alertChannels.sms ? 'Text employees that salary was processed (no amounts)' : 'SMS provider not configured on the server'} onClick={() => sendSalaryAlerts(run.id, 'sms')} className="text-indigo-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">SMS alert</button>}
                                {run.status === 'Disbursed' && <button type="button" disabled={!alertChannels.whatsapp} title={alertChannels.whatsapp ? 'WhatsApp employees that salary was processed (no amounts)' : 'WhatsApp provider not configured on the server'} onClick={() => sendSalaryAlerts(run.id, 'whatsapp')} className="text-indigo-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">WhatsApp alert</button>}
                              </div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Payroll calculation grid (Active simulation) */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm md:col-span-2 space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">Payroll Preview ({new Date(payrollYear, payrollMonth - 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })})</h3>
                          <p className="text-xs text-slate-400">Reflecting calculated deductions based on latest configured statutory parameters</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100 text-xs text-left">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            <tr>
                              <th className="px-3 py-2">Staff</th>
                              <th className="px-3 py-2">Gross (PKR)</th>
                              <th className="px-3 py-2">FBR Tax</th>
                              <th className="px-3 py-2">EOBI (1%)</th>
                              <th className="px-3 py-2">Prov. Sec (6%)</th>
                              <th className="px-3 py-2">P.F (Employer Match)</th>
                              <th className="px-3 py-2">Net Wage (PKR)</th>
                              <th className="px-3 py-2 text-right">Payslip</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 text-slate-700 font-mono">
                            {employees.map(emp => {
                              const sheet = computePayslipDetails(
                                emp, payrollMonth, payrollYear, attendances, leaves, statConfig, taxSlabs, departments, designations, branches, loanAdvances, wageTypes, holidays, payrollPayslips, payrollAdjustments
                              );
                              return (
                                <tr key={emp.id} className="hover:bg-slate-50/50">
                                  <td className="px-3 py-2 font-sans font-medium text-slate-850">
                                    {emp.fullName}
                                    <span className="block text-[10px] text-slate-400">{emp.employeeCode}</span>
                                  </td>
                                  <td className="px-3 py-2 font-bold text-slate-800">
                                    {sheet.grossSalary.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-rose-700">
                                    {sheet.incomeTaxDeduction ? `${sheet.incomeTaxDeduction.toLocaleString()}` : '0'}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sheet.eobiEmployeeDeduction.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2">
                                    {sheet.eobiEmployerContribution.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-indigo-700">
                                    {sheet.providentFundDeduction.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 font-bold text-emerald-700">
                                    {sheet.netSalary.toLocaleString()}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <button 
                                      onClick={() => setShowPayslipModal(sheet)}
                                      className="text-xs bg-indigo-50 text-indigo-750 hover:bg-indigo-100 font-sans px-2 py-0.5 rounded"
                                    >
                                      View Slip
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>
                  
                </motion.div>
              )}

              {/* TAB 6: SYSTEM SLABS & STATUTORY SETTINGS */}
              {activeTab === 'settings' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <StatutoryGovernancePanel
                    editableConfig={editableStatConfig}
                    pendingRequest={pendingStatutoryChange}
                    recentDecisions={statutoryChangeRequests.filter(item => item.status !== 'Pending').sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''))}
                    currentUserId={currentUserAccount.id}
                    onUpdateStatConfig={onUpdateStatConfig}
                    onReviewStatutoryChange={onReviewStatutoryChange}
                  />
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">FBR Individual Tax Slabs settings</h2>
                      <p className="text-xs text-slate-500">Easily update tax matrices annually without code migration</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Tax slabs table editor */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div>
                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono flex items-center gap-2">
                            <span>Current FBR Income Tax Slabs Table</span>
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              Finance Act {editableStatConfig.taxYear || '2024–2025'}
                            </span>
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-0.5">First Schedule, Part I, Division I, Clause (2) - Salaried Individuals</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleDownloadFbrCsv}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors shadow-sm cursor-pointer"
                            title="Download Current FBR Tax Slabs CSV"
                          >
                            <Download className="w-3.5 h-3.5 text-slate-600" />
                            <span>Download CSV</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleUpdateFromFbr}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm cursor-pointer"
                            title="Reset / Synchronize with Official FBR Tax Slabs"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Update from FBR</span>
                          </button>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {((editableTaxSlabs && editableTaxSlabs.length > 0) ? editableTaxSlabs : DEFAULT_TAX_SLABS).map((slab, idx) => (
                          <div key={slab.id || `slab-${idx}`} className="flex space-x-3 items-center bg-slate-50 p-2.5 rounded-lg text-xs font-mono hover:bg-slate-100/80 transition-colors">
                            <span className="font-bold text-slate-500 w-16">Slab #{idx + 1}</span>
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2">
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Min Annual (PKR):</span>
                                <input aria-label={`Slab ${idx + 1} minimum`} type="number" value={slab.minIncome} onChange={e => updateTaxSlab(slab.id, 'minIncome', Number(e.target.value))} className="w-full font-bold bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-800" />
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Max Annual (PKR):</span>
                                <input aria-label={`Slab ${idx + 1} maximum`} type="number" value={slab.maxIncome} onChange={e => updateTaxSlab(slab.id, 'maxIncome', Number(e.target.value))} className="w-full font-bold bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-800" />
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Base Tax + Rate:</span>
                                <div className="flex gap-1">
                                  <input aria-label={`Slab ${idx + 1} base tax`} type="number" value={slab.baseTax} onChange={e => updateTaxSlab(slab.id, 'baseTax', Number(e.target.value))} className="w-2/3 font-bold bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-800" title="Fixed Base Tax in PKR" />
                                  <input aria-label={`Slab ${idx + 1} percentage`} type="number" step="0.01" value={slab.percentage} onChange={e => updateTaxSlab(slab.id, 'percentage', Number(e.target.value))} className="w-1/3 font-bold bg-white border border-slate-200 rounded px-1.5 py-1 text-slate-800" title="Tax Rate (e.g. 0.05 for 5%)" />
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Section 4AB Surcharge Notice */}
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold block">Section 4AB Surcharge (Finance Act 2024 / 2025):</span>
                          An additional 10% surcharge on tax liability is automatically computed for salaried individuals earning exceeding Rs. 10,000,000 (10 Million PKR) per annum.
                        </div>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg text-xs text-slate-500 border border-dashed border-slate-300">
                        Slab parameters automatically recalculate basic payroll registers on the fly. You can safely simulate different fiscal year slabs or click <strong>&quot;Update from FBR&quot;</strong> to restore official rates.
                      </div>
                    </div>

                    {/* EOBI & Social Security Config */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">Regional Contribution Configurations</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Tax year / effective date:</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input aria-label="FBR tax year" value={editableStatConfig.taxYear || ''} onChange={e => onUpdateStatConfig({ ...editableStatConfig, taxYear: e.target.value, updatedAt: new Date().toISOString() })} placeholder="2027" className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
                            <DateField aria-label="Statutory effective from" value={editableStatConfig.effectiveFrom || ''} onChange={e => onUpdateStatConfig({ ...editableStatConfig, effectiveFrom: e.target.value, updatedAt: new Date().toISOString() })} className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">System Country Setting:</label>
                          <select
                            aria-label="System Country Setting"
                            value={selectedCountry}
                            disabled
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          >
                            <option value="Pakistan">Pakistan</option>
                          </select>
                          <span className="text-[10px] text-slate-400">Pakistan-only payroll and statutory configuration.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Government Minimum Wage (PKR):</label>
                          <input
                            type="number"
                            aria-label="Government Minimum Wage (PKR)"
                            value={editableStatConfig.minimumWage}
                            onChange={(e) => onUpdateStatConfig({ ...editableStatConfig, minimumWage: Number(e.target.value) })}
                            className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400">EOBI calculations are mathematically bound to 1% employee / 5% employer of this constant.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Provincial social security employer %:</label>
                          <div className="grid grid-cols-2 gap-2">
                            {JURISDICTIONS.map(province => <label key={province} className="text-[10px] text-slate-500">{province}<input type="number" min="0" step="0.01" value={editableStatConfig.provincialSocialSecurityRates?.[province] ?? editableStatConfig.pessiEmployerRate} onChange={e => onUpdateStatConfig({ ...editableStatConfig, provincialSocialSecurityRates: { ...editableStatConfig.provincialSocialSecurityRates, [province]: Number(e.target.value) }, updatedAt: new Date().toISOString() })} className="mt-1 w-full text-xs font-mono p-2 border border-slate-300 rounded" /></label>)}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Absence deduction basis (salaried):</label>
                          <select aria-label="Absence deduction basis" value={editableStatConfig.absenceDeductionBasis || 'Calendar Days'} onChange={e => onUpdateStatConfig({ ...editableStatConfig, absenceDeductionBasis: e.target.value as NonNullable<StatutoryConfig['absenceDeductionBasis']>, updatedAt: new Date().toISOString() })} className="w-full text-xs p-2 border border-slate-300 rounded bg-white">
                            <option value="Calendar Days">Monthly salary ÷ calendar days</option>
                            <option value="Scheduled Working Days">Monthly salary ÷ rostered working days</option>
                            <option value="Fixed 30 Days">Monthly salary ÷ 30</option>
                          </select>
                          <span className="text-[10px] text-slate-400">Organization policy; confirm against your appointment letters and applicable standing orders.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Overtime multiplier (salaried / daily wagers):</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input aria-label="Salaried overtime multiplier" type="number" min="1" step="0.25" value={editableStatConfig.overtimeMultiplier ?? 2} onChange={e => onUpdateStatConfig({ ...editableStatConfig, overtimeMultiplier: Number(e.target.value), updatedAt: new Date().toISOString() })} className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
                            <input aria-label="Daily wager overtime multiplier" type="number" min="1" step="0.25" value={editableStatConfig.dailyWagerOvertimeMultiplier ?? editableStatConfig.overtimeMultiplier ?? 2} onChange={e => onUpdateStatConfig({ ...editableStatConfig, dailyWagerOvertimeMultiplier: Number(e.target.value), updatedAt: new Date().toISOString() })} className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Social security wage ceiling (PKR):</label>
                          <input type="number" value={editableStatConfig.socialSecurityWageCeiling || 0} onChange={e => onUpdateStatConfig({ ...editableStatConfig, socialSecurityWageCeiling: Number(e.target.value), updatedAt: new Date().toISOString() })} className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Gratuity Entitlement rate (annual):</label>
                          <input
                            type="number"
                            aria-label="Gratuity Entitlement Rate (annual days)"
                            min="1"
                            max="365"
                            value={editableStatConfig.gratuityRateDaysPerYear}
                            onChange={(e) => onUpdateStatConfig({ ...editableStatConfig, gratuityRateDaysPerYear: Number(e.target.value) })}
                            className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400">Days of basic salary earned per completed year of employment on exit clearance.</span>
                        </div>
                      </div>
                    </div>

                  </div>

                  <section className={`rounded-xl border p-5 shadow-sm ${cnicActionItems.length ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50'}`} aria-labelledby="cnic-compliance-title">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 id="cnic-compliance-title" className="text-sm font-bold text-slate-900">CNIC Compliance Watch</h3>
                        <p className="mt-1 text-xs text-slate-600">NADRA identity expiry tracking for active employees. Review records within 90 days of expiry.</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('employees')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Review employee records</button>
                    </div>
                    {cnicActionItems.length === 0 ? (
                      <p className="mt-4 text-sm font-semibold text-emerald-800">All active employee CNIC records are current and more than 90 days from expiry.</p>
                    ) : (
                      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {cnicActionItems.slice(0, 6).map(({ employee, expiry, state, days }) => (
                          <div key={employee.id} className={`rounded-lg border bg-white p-3 text-xs ${state === 'expired' ? 'border-rose-200' : 'border-amber-200'}`}>
                            <p className="font-bold text-slate-900">{employee.fullName}</p>
                            <p className={`mt-1 font-semibold ${state === 'expired' ? 'text-rose-700' : 'text-amber-800'}`}>
                              {state === 'missing' ? 'Expiry date not recorded' : state === 'expired' ? `Expired ${Math.abs(days || 0)} day(s) ago` : `Expires in ${days} day(s)`}
                            </p>
                            <p className="mt-1 font-mono text-[10px] text-slate-500">{expiry || 'Add expiry date in employee profile'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {cnicActionItems.length > 6 && <p className="mt-3 text-xs font-medium text-slate-600">+ {cnicActionItems.length - 6} more employee record(s) need attention.</p>}
                  </section>

                  <section className={`rounded-xl border p-5 shadow-sm ${lifecycleActionItems.length ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50'}`} aria-labelledby="lifecycle-watch-title">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 id="lifecycle-watch-title" className="text-sm font-bold text-slate-900">Contract &amp; Probation Watch</h3>
                        <p className="mt-1 text-xs text-slate-600">Review fixed-term contracts within 60 days and record each probation decision by its due date.</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('employees')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Open employee records</button>
                    </div>
                    {lifecycleActionItems.length === 0 ? <p className="mt-4 text-sm font-semibold text-emerald-800">No upcoming contract or unconfirmed probation actions are recorded.</p> : <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {lifecycleActionItems.slice(0, 6).map(item => <div key={`${item.kind}-${item.employee.id}`} className={`rounded-lg border bg-white p-3 text-xs ${item.overdue ? 'border-rose-200' : 'border-amber-200'}`}>
                        <p className={`font-bold ${item.overdue ? 'text-rose-800' : 'text-amber-800'}`}>{item.kind} {item.overdue ? 'overdue' : 'due soon'}</p>
                        <p className="mt-1 font-semibold text-slate-900">{item.employee.fullName}</p>
                        <p className="mt-1 text-[10px] text-slate-500">{item.due} · {item.overdue ? `${Math.abs(item.days)} day(s) overdue` : `${item.days} day(s) remaining`}</p>
                      </div>)}
                    </div>}
                    {lifecycleActionItems.length > 6 && <p className="mt-3 text-xs font-medium text-slate-600">+ {lifecycleActionItems.length - 6} more employee lifecycle action(s) need attention.</p>}
                  </section>

                  <section className={`rounded-xl border p-5 shadow-sm ${duplicateIdentityGroups.length ? 'border-rose-200 bg-rose-50/50' : 'border-emerald-200 bg-emerald-50/50'}`} aria-labelledby="identity-payment-title">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 id="identity-payment-title" className="text-sm font-bold text-slate-900">Identity &amp; Payment Collision Watch</h3>
                        <p className="mt-1 text-xs text-slate-600">Duplicate CNICs block payroll. Shared payment accounts need an approver’s documented confirmation.</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('employees')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Review employee records</button>
                    </div>
                    {duplicateIdentityGroups.length === 0 ? (
                      <p className="mt-4 text-sm font-semibold text-emerald-800">No duplicate active CNICs or payment accounts were found.</p>
                    ) : (
                      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {duplicateIdentityGroups.slice(0, 6).map((group, index) => (
                          <div key={`${group.type}-${index}`} className={`rounded-lg border bg-white p-3 text-xs ${group.type === 'CNIC' ? 'border-rose-200' : 'border-amber-200'}`}>
                            <p className={`font-bold ${group.type === 'CNIC' ? 'text-rose-800' : 'text-amber-800'}`}>{group.type === 'CNIC' ? 'Duplicate CNIC — payroll block' : 'Shared payment account — review'}</p>
                            <p className="mt-1 font-semibold text-slate-900">{group.employees.map(employee => employee.fullName).join(' · ')}</p>
                            <p className="mt-1 text-[10px] text-slate-500">{group.employees.map(employee => employee.employeeCode).join(' · ')}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {duplicateIdentityGroups.length > 6 && <p className="mt-3 text-xs font-medium text-slate-600">+ {duplicateIdentityGroups.length - 6} more collision(s) require review.</p>}
                  </section>

                  <section className={`rounded-xl border p-5 shadow-sm ${complianceAttendanceAlerts.length ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/50'}`} aria-labelledby="attendance-compliance-title">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 id="attendance-compliance-title" className="text-sm font-bold text-slate-900">Attendance Compliance Alerts</h3>
                        <p className="mt-1 text-xs text-slate-600">Flags overtime above four hours/day, manual records lacking approval, and seven consecutive recorded workdays.</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('attendance')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Review attendance</button>
                    </div>
                    {complianceAttendanceAlerts.length === 0 ? <p className="mt-4 text-sm font-semibold text-emerald-800">No attendance compliance risks are currently detected.</p> : <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {complianceAttendanceAlerts.slice(0, 6).map(alert => <div key={alert.id} className={`rounded-lg border bg-white p-3 text-xs ${alert.tone === 'rose' ? 'border-rose-200' : 'border-amber-200'}`}>
                        <p className={`font-bold ${alert.tone === 'rose' ? 'text-rose-800' : 'text-amber-800'}`}>{alert.type}</p>
                        <p className="mt-1 font-semibold text-slate-900">{alert.employee}</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{alert.detail}</p>
                      </div>)}
                    </div>}
                    {complianceAttendanceAlerts.length > 6 && <p className="mt-3 text-xs font-medium text-slate-600">+ {complianceAttendanceAlerts.length - 6} more attendance risk(s) need attention.</p>}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="payroll-release-title">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 id="payroll-release-title" className="text-sm font-bold text-slate-900">Payroll Release Control</h3>
                        <p className="mt-1 text-xs text-slate-600">Maker-checker progress from draft payroll through verified bank disbursement.</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('payroll')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Open payroll processing</button>
                    </div>
                    {payrollReleaseQueue.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">No payroll runs have been created yet.</p> : <div className="mt-4 grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
                      {payrollReleaseQueue.map(({ run, label, detail, tone }) => {
                        const toneClass = tone === 'emerald' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : tone === 'blue' ? 'border-blue-200 bg-blue-50 text-blue-800' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : tone === 'rose' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-slate-50 text-slate-700';
                        return <div key={run.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{run.title}</p><p className="mt-1 text-[10px] text-slate-500">PKR {run.totalNetPay.toLocaleString()} · {run.employeeCount || 0} employees</p></div><span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold ${toneClass}`}>{label}</span></div><p className="mt-3 text-[11px] leading-relaxed text-slate-600">{detail}</p></div>;
                      })}
                    </div>}
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="attendance-exceptions-title">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 id="attendance-exceptions-title" className="text-sm font-bold text-slate-900">Today’s Attendance Exceptions</h3>
                        <p className="mt-1 text-xs text-slate-600">Late arrivals, absences, half days, and employee correction requests recorded today.</p>
                      </div>
                      <button type="button" onClick={() => setActiveTab('attendance')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50">Open attendance register</button>
                    </div>
                    {attendanceExceptionQueue.length === 0 ? <p className="py-6 text-center text-xs font-medium text-emerald-700">No recorded attendance exceptions today.</p> : <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {attendanceExceptionQueue.slice(0, 9).map(({ item, employee, label, needsReview }) => <div key={item.id} className={`rounded-lg border p-3 ${needsReview || item.status === 'Absent' ? 'border-rose-200 bg-rose-50/60' : item.status === 'Late' ? 'border-amber-200 bg-amber-50/60' : 'border-blue-200 bg-blue-50/60'}`}><div className="flex items-start justify-between gap-2"><p className="text-xs font-bold text-slate-900">{employee}</p><span className="rounded bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-700">{label}</span></div><p className="mt-2 text-[11px] text-slate-600">{item.punchIn ? `In ${item.punchIn}` : 'No punch-in'}{item.punchOut ? ` · Out ${item.punchOut}` : ''}</p>{item.regularizationReason && <p className="mt-1 truncate text-[10px] text-slate-500">{item.regularizationReason}</p>}</div>)}
                    </div>}
                    {attendanceExceptionQueue.length > 9 && <p className="mt-3 text-xs font-medium text-slate-600">+ {attendanceExceptionQueue.length - 9} more exception(s) in the attendance register.</p>}
                  </section>

                </motion.div>
              )}

              {/* TAB 7: ACCESS CONTROL (RBAC) */}
              {activeTab === 'access' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">User Management &amp; Access</h2>
                      <p className="text-xs text-slate-500">Create mobile login accounts, link each employee, and assign roles and permissions.</p>
                    </div>
                  </div>

                  <section aria-labelledby="mfa-recovery-requests-title" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 id="mfa-recovery-requests-title" className="text-xs font-bold uppercase tracking-wide text-slate-800">MFA recovery requests</h3>
                        <p className="mt-1 text-xs text-slate-500">Approve only after verifying the employee identity through an independent channel.</p>
                      </div>
                      <span className={`rounded px-2 py-1 text-[10px] font-bold ${mfaRecoveryRequests.length ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}>{mfaRecoveryRequests.length} pending</span>
                    </div>
                    <div className="mt-3 grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                      <select aria-label="User needing MFA recovery" value={adminRecoveryTargetId} onChange={event => setAdminRecoveryTargetId(event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"><option value="">Select user for recovery</option>{users.filter(user => user.mfaEnabled).map(user => <option key={user.id} value={user.id}>{user.username}</option>)}</select>
                      <input aria-label="Administrator recovery reason" value={adminRecoveryReason} onChange={event => setAdminRecoveryReason(event.target.value)} maxLength={500} placeholder="Identity-verification reason" className="rounded border border-slate-300 px-2 py-1.5 text-xs" />
                      <button type="button" disabled={!adminRecoveryTargetId || adminRecoveryReason.trim().length < 10 || mfaRecoverySubmitting} onClick={() => submitMfaRecoveryRequest(adminRecoveryTargetId, adminRecoveryReason)} className="rounded bg-amber-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Request reset</button>
                    </div>
                    {mfaRecoveryRequests.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">No MFA recovery requests need review.</div>
                    ) : (
                      <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
                        {mfaRecoveryRequests.map(request => {
                          const age = new Date(request.createdAt).toLocaleString();
                          const isReviewing = reviewingMfaRecoveryId === request.id;
                          return <div key={request.id} className="flex flex-col gap-3 p-3 text-xs lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900">{request.username} <span className="font-normal text-slate-500">{request.roleName ? `â€¢ ${request.roleName}` : ''}</span></div>
                              <p className="mt-1 break-words text-slate-600"><span className="font-semibold text-slate-700">Reason:</span> {request.reason}</p>
                              <p className="mt-1 text-[10px] text-slate-400">Requested {Number.isNaN(new Date(request.createdAt).getTime()) ? 'recently' : age}{request.email ? ` â€¢ ${request.email}` : ''}</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <button type="button" disabled={isReviewing || request.requestedById === currentUserAccount.id} title={request.requestedById === currentUserAccount.id ? 'The requester cannot approve their own reset.' : 'Approve MFA reset'} onClick={() => reviewMfaRecoveryRequest(request.id, 'Approved')} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">Approve</button>
                              <button type="button" disabled={isReviewing || request.requestedById === currentUserAccount.id} onClick={() => reviewMfaRecoveryRequest(request.id, 'Rejected')} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">Reject</button>
                            </div>
                          </div>;
                        })}
                      </div>
                    )}
                  </section>

                  <KioskDevicesPanel />

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Users List & Role Assignment */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">System Users</h3>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Role permission updates</h4>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {roles.map(role => {
                            const enabled = role.permissions.includes('manage_mobile_duty');
                            return <label key={role.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-[11px]">
                              <span><strong>{role.name}</strong><span className="ml-1 text-slate-400">Assign Mobile Duty</span></span>
                              <input type="checkbox" checked={enabled} disabled={role.id === 'role-employee' || role.id === 'role-kiosk'} onChange={async event => {
                                const permissions = event.target.checked ? [...new Set([...role.permissions, 'manage_mobile_duty'])] : role.permissions.filter(permission => permission !== 'manage_mobile_duty');
                                await onUpdateRole({ ...role, permissions });
                              }} />
                            </label>;
                          })}
                        </div>
                        <p className="mt-2 text-[9px] text-slate-400">Employee and Kiosk roles cannot assign mobile duty.</p>
                      </div>
                      
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                          <thead className="bg-slate-50 font-bold text-slate-550 uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-3">Username / Email</th>
                              <th className="px-4 py-3">Linked Employee</th>
                              <th className="px-4 py-3">Assigned Role</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {users.map(u => {
                              const linkedEmp = employees.find(e => e.id === u.employeeId);
                              return (
                                <tr key={u.id} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-slate-900">{u.username}</div>
                                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{u.email}</div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">
                                    {linkedEmp ? `${linkedEmp.fullName} (${linkedEmp.employeeCode})` : 'Not Linked'}
                                  </td>
                                  <td className="px-4 py-3">
                                    {roles.find(role => role.id === u.roleId)?.name || 'Unknown role'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                      u.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-150 text-slate-650'
                                    }`}>
                                      {u.status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      type="button"
                                      onClick={() => { setEditingUser({ ...u }); setUserEditError(''); }}
                                      className="mr-3 text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
                                    >Edit</button>
                                    <button
                                      disabled={u.id === loggedInUser.id}
                                      onClick={async () => {
                                        if (window.confirm('Permanently delete this account and associated personal data? Payroll history will be anonymized.')) {
                                          await onDeleteUser(u.id);
                                        }
                                      }}
                                      className="text-xs text-rose-600 hover:text-rose-800 underline disabled:text-slate-300 disabled:no-underline"
                                    >Delete data</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Add User & Role Forms Sidebar */}
                    <div className="space-y-6">
                      
                      {/* ONBOARD USER FORM */}
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">Onboard System User</h3>
                        
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.target as any;
                          const username = form.elements.username.value;
                          const email = form.elements.email.value;
                          const roleId = form.elements.roleId.value;
                          const employeeId = form.elements.employeeId.value;
                          const password = form.elements.password.value;
                          
                           if (!username || !email || !password) {
                            alert('Please enter username, email, and password.');
                            return;
                           }

                           if (roleId === 'role-employee' && !employeeId) {
                             alert('Link an employee before creating an Employee mobile account.');
                             return;
                           }
                           if (employeeId && users.some(user => user.employeeId === employeeId)) {
                             alert('This employee is already linked to another login account.');
                             return;
                           }

                          if (password.length < 12) {
                            alert('Password must be at least 12 characters.');
                            return;
                          }

                          try {
                            await onAddUser({
                              id: '',
                              username: username.trim(),
                              email: email.trim(),
                              roleId,
                              employeeId: employeeId || undefined,
                              status: 'Active',
                              password
                            });
                            form.reset();
                            alert('Success: User account and HR profile created.');
                          } catch (error) {
                            const message = (error as Error)?.message || 'Unable to create the user account. No partial HR profile was saved.';
                            alert(message);
                          }
                        }} className="space-y-3">
                          <div>
                            <label htmlFor="username" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Username:</label>
                            <input id="username" name="username" type="text" required placeholder="e.g. jahanzaib.hr" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label htmlFor="email" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email:</label>
                            <input id="email" name="email" type="email" required placeholder="e.g. jahanzaib@binishaq.com" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label htmlFor="password" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password:</label>
                            <input id="password" name="password" type="password" required placeholder="Assign system password" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label htmlFor="roleId" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assign Initial Role:</label>
                            <select id="roleId" name="roleId" className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:ring-1">
                              {roles.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="employeeId" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Link Employee (Required for Mobile):</label>
                            <select id="employeeId" name="employeeId" className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:ring-1">
                              <option value="">-- No Link --</option>
                              {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
                              ))}
                            </select>
                          </div>
                          <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded text-xs shadow-xs">
                            Create Account
                          </button>
                        </form>
                      </div>

                      {/* ROLE CREATION FORM */}
                      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">Create Custom Role</h3>
                        
                        <form onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.target as any;
                          const roleName = form.elements.roleName.value;
                          const description = form.elements.description.value;
                          
                          // Gather permission checkboxes
                          const selectedPerms: string[] = ['view_dashboard'];
                          if (form.elements.perm_emp.checked) selectedPerms.push('manage_employees');
                          if (form.elements.perm_att.checked) selectedPerms.push('manage_attendance');
                          if (form.elements.perm_mobile_duty.checked) selectedPerms.push('manage_mobile_duty');
                          if (form.elements.perm_leave.checked) selectedPerms.push('manage_leaves');
                          if (form.elements.perm_payroll.checked) selectedPerms.push('manage_payroll');
                          if (form.elements.perm_settings.checked) selectedPerms.push('manage_settings');
                          if (form.elements.perm_access.checked) selectedPerms.push('manage_access');

                          if (!roleName) {
                            alert('Please enter a role name.');
                            return;
                          }

                          onAddRole({
                            id: 'role-' + Date.now(),
                            name: roleName,
                            description,
                            permissions: selectedPerms
                          });

                          form.reset();
                          alert(`Success: Role "${roleName}" has been created.`);
                        }} className="space-y-3">
                          <div>
                            <label htmlFor="roleName" className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Role Name:</label>
                            <input id="roleName" name="roleName" type="text" required placeholder="e.g. Auditor" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-505 uppercase mb-1">Description:</label>
                            <textarea name="description" aria-label="Role description" placeholder="Role description..." className="w-full text-xs p-2 border border-slate-300 rounded h-12 focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-505 uppercase mb-1">Permissions Scope:</label>
                            <div className="space-y-1.5 mt-1 border p-2 rounded max-h-32 overflow-y-auto bg-slate-50">
                              <label className="flex items-center space-x-2 text-[11px] text-slate-650">
                                <input type="checkbox" name="perm_emp" /> <span>Manage Employees</span>
                              </label>
                              <label className="flex items-center space-x-2 text-[11px] text-slate-650">
                                <input type="checkbox" name="perm_att" /> <span>Manage Attendance</span>
                              </label>
                              <label className="flex items-center space-x-2 text-[11px] text-slate-650">
                                <input type="checkbox" name="perm_mobile_duty" /> <span>Assign Mobile Duty</span>
                              </label>
                              <label className="flex items-center space-x-2 text-[11px] text-slate-650">
                                <input type="checkbox" name="perm_leave" /> <span>Manage Leaves</span>
                              </label>
                              <label className="flex items-center space-x-2 text-[11px] text-slate-650">
                                <input type="checkbox" name="perm_payroll" /> <span>Manage Payroll</span>
                              </label>
                              <label className="flex items-center space-x-2 text-[11px] text-slate-650">
                                <input type="checkbox" name="perm_settings" /> <span>Manage statutory settings</span>
                              </label>
                              <label className="flex items-center space-x-2 text-[11px] text-slate-650">
                                <input type="checkbox" name="perm_access" /> <span>Manage Access & Roles</span>
                              </label>
                            </div>
                          </div>
                          <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded text-xs shadow-xs">
                            Create Custom Role
                          </button>
                        </form>
                      </div>

                    </div>

                  </div>

                  {editingUser && (
                    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
                      <form
                        onSubmit={async event => {
                          event.preventDefault();
                          setUserEditSaving(true);
                          setUserEditError('');
                          try {
                            await onUpdateUser(editingUser);
                            setEditingUser(null);
                          } catch (error) {
                            setUserEditError(error instanceof Error ? error.message : 'Unable to update this user.');
                          } finally {
                            setUserEditSaving(false);
                          }
                        }}
                        className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 id="edit-user-title" className="text-lg font-bold text-slate-900">Edit User Account</h3>
                            <p className="mt-1 text-xs text-slate-500">Link this login to an employee for mobile attendance, leave, and payslips.</p>
                          </div>
                          <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close edit user"><X size={18} /></button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <label className="text-xs font-semibold text-slate-700">Username
                            <input value={editingUser.username} onChange={event => setEditingUser({ ...editingUser, username: event.target.value })} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
                          </label>
                          <label className="text-xs font-semibold text-slate-700">Authentication Email
                            <input value={editingUser.email} readOnly className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 p-2.5 text-sm text-slate-500" />
                            <span className="mt-1 block text-[10px] font-normal text-slate-400">Email is unique and read-only for identity security.</span>
                          </label>
                          <label className="text-xs font-semibold text-slate-700">Role
                            <select value={editingUser.roleId} onChange={event => setEditingUser({ ...editingUser, roleId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
                              {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
                            </select>
                          </label>
                          <label className="text-xs font-semibold text-slate-700">Account Status
                            <select value={editingUser.status} onChange={event => setEditingUser({ ...editingUser, status: event.target.value as UserAccount['status'] })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
                              <option value="Active">Active</option>
                              <option value="Inactive">Inactive</option>
                            </select>
                          </label>
                        </div>

                        <label className="block text-xs font-semibold text-slate-700">Linked Employee — required for mobile
                          <select value={editingUser.employeeId || ''} onChange={event => setEditingUser({ ...editingUser, employeeId: event.target.value || undefined })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
                            <option value="">Not linked</option>
                            {employees.map(employee => {
                              const linkedElsewhere = users.some(user => user.id !== editingUser.id && user.employeeId === employee.id);
                              return <option key={employee.id} value={employee.id} disabled={linkedElsewhere}>{employee.fullName} ({employee.employeeCode}){linkedElsewhere ? ' — already linked' : ''}</option>;
                            })}
                          </select>
                        </label>

                        {userEditError && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{userEditError}</div>}
                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                          <button type="button" onClick={() => setEditingUser(null)} disabled={userEditSaving} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700">Cancel</button>
                          <button type="submit" disabled={userEditSaving} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{userEditSaving ? 'Saving…' : 'Save User'}</button>
                        </div>
                      </form>
                    </div>
                  )}

                </motion.div>
              )}

              {/* TAB 8: DATA BACKUP & RESTORE */}
              {activeTab === 'maintenance' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                  <FirestoreMaintenanceModule />
                </motion.div>
              )}

              {activeTab === 'company-setup' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                  <CompanySetupModule companies={companies} branches={branches} departments={departments} designations={designations} statutoryConfig={statConfig} taxSlabs={taxSlabs} onSave={onSaveCompanySetup} />
                </motion.div>
              )}

              {activeTab === 'master-data' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full">
                  <MasterDataModule companies={companies} branches={branches} departments={departments} designations={designations} zones={zones} ucTowns={ucTowns} wageTypes={wageTypes} employees={employees} onSave={onSaveMasterData} />
                </motion.div>
              )}

              {/* TAB 8: HOLIDAY CALENDAR */}
              {activeTab === 'holidays' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <HolidayModule
                    holidays={holidays}
                    onAddHoliday={onAddHoliday}
                    onUpdateHoliday={onUpdateHoliday}
                    onDeleteHoliday={onDeleteHoliday}
                  />
                </motion.div>
              )}

              {/* TAB 9: LOANS & ADVANCES */}
              {activeTab === 'loans' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <LoansModule
                    loanAdvances={loanAdvances}
                    employees={employees}
                    currentUserEmployeeId={loggedInUser?.employeeId}
                    canApprove={userPermissions.includes('manage_payroll') || userPermissions.includes('manage_employees')}
                    onApplyLoan={onApplyLoan}
                    onApproveLoan={onApproveLoan}
                    onRejectLoan={onRejectLoan}
                  />
                </motion.div>
              )}

              {/* TAB 10: SALARY REVISIONS */}
              {activeTab === 'revisions' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <SalaryRevisionModule
                    salaryRevisions={salaryRevisions}
                    employees={employees}
                    currentUserAccount={currentUserAccount}
                    onAddSalaryRevision={onAddSalaryRevision}
                  />
                </motion.div>
              )}

              {/* TAB 11: PERFORMANCE APPRAISALS */}
              {activeTab === 'performance' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <PerformanceModule
                    reviews={performanceReviews}
                    employees={employees}
                    currentUserAccount={currentUserAccount}
                    canManage={userPermissions.includes('manage_employees')}
                    onAddReview={onAddPerformanceReview}
                    onUpdateReview={onUpdatePerformanceReview}
                    onCreateSalaryRevision={onAddSalaryRevision}
                  />
                </motion.div>
              )}

              {/* TAB 12: ASSET MANAGEMENT */}
              {activeTab === 'assets' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <AssetModule
                    assets={companyAssets}
                    employees={employees}
                    canManage={userPermissions.includes('manage_employees') || userPermissions.includes('manage_settings')}
                    onAddAsset={onAddAsset}
                    onUpdateAsset={onUpdateAsset}
                  />
                </motion.div>
              )}

              {/* TAB 13: RECRUITMENT */}
              {activeTab === 'recruitment' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <RecruitmentModule
                    jobPostings={jobPostings}
                    applications={jobApplications}
                    departments={departments}
                    branches={branches}
                    canManage={userPermissions.includes('manage_employees')}
                    onAddPosting={onAddJobPosting}
                    onUpdatePosting={onUpdateJobPosting}
                    onAddApplication={onAddJobApplication}
                    onUpdateApplication={onUpdateJobApplication}
                  />
                </motion.div>
              )}

              {/* TAB 14: GRATUITY & TERMINAL SETTLEMENT */}
              {activeTab === 'gratuity' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <GratuityModule
                    settlements={gratuitySettlements}
                    employees={employees}
                    statConfig={statConfig}
                    canManage={userPermissions.includes('manage_payroll')}
                    currentUserAccount={currentUserAccount}
                    onAddSettlement={onAddGratuitySettlement}
                    onUpdateSettlement={onUpdateGratuitySettlement}
                  />
                </motion.div>
              )}

              {activeTab === 'lifecycle' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <EmployeeLifecycleModule
                    employees={employees}
                    branches={branches}
                    departments={departments}
                    designations={designations}
                    companies={companies}
                    lifecycleRequests={lifecycleRequests}
                    currentUserId={currentUserAccount.id}
                    onCreate={onCreateLifecycleRequest}
                    onReview={onReviewLifecycleRequest}
                    onUpdateOnboarding={onUpdateOnboarding}
                    leaves={leaves}
                    statConfig={statConfig}
                  />
                </motion.div>
              )}

              {/* TAB 16: FINGERPRINT DEVICE — DigitalPersona/SecuGen URU 4500 / SecuGen Hamster Pro */}
              {activeTab === 'biometric' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <BiometricDeviceModule
                    employees={employees}
                    attendances={attendances}
                    onUpdateEmployee={onUpdateEmployee}
                    onSimulatePunch={onSimulatePunch}
                  />
                </motion.div>
              )}

              {/* TAB: USER GUIDE */}
              {activeTab === 'help' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full -mx-6 -mt-3">
                  <iframe
                    src="/user-guide.html"
                    title={`${companyDisplayName} — User Guide`}
                    className="w-full border-0"
                    style={{ height: 'calc(100vh - 64px)' }}
                  />
                </motion.div>
              )}

              {/* TAB 15: NOTIFICATION CENTER */}
              {activeTab === 'notifications' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  <NotificationCenter
                    notifications={notifications}
                    employees={employees}
                    currentEmployeeId={loggedInUser?.employeeId || loggedInUser?.username}
                    canManage={userPermissions.includes('manage_employees') || userPermissions.includes('manage_payroll')}
                    onAddNotification={onAddNotification}
                    onMarkRead={onMarkNotificationRead}
                    onMarkAllRead={onMarkAllNotificationsRead}
                    onDeleteNotification={onDeleteNotification}
                  />
                </motion.div>
              )}
            </>
          )}
        </main>
      </div>

      {/* MODAL 1: ADD EMPLOYEE ONBOARDING */}
      <AnimatePresence>
        {showAddEmpModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.96, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-6xl xl:max-w-[1220px] shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col my-auto"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center flex-shrink-0 shadow-xs">
                <span className="font-bold text-sm tracking-wider uppercase flex items-center">
                  <UserPlus className="w-4 h-4 mr-2 text-emerald-400" /> Onboard New Employee Workspace
                </span>
                <button onClick={() => setShowAddEmpModal(false)} className="text-slate-400 hover:text-white font-bold text-xl leading-none px-2 py-1 rounded-lg transition-colors">×</button>
              </div>

              <form onSubmit={handleCreateEmployeeSubmit} className="p-5 md:p-6 overflow-y-auto space-y-4 text-xs select-none flex-1 bg-slate-50/50">
                {/* SECTION 1: PERSONAL & CORE DETAILS */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3.5">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-emerald-600 border-b border-slate-100 pb-2">Personal &amp; Core Details</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Full Name:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Full Name"
                        placeholder="e.g. Ali Ahmed"
                        value={newEmpForm.fullName}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, fullName: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-sans text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Official Email ID:</span>
                      </label>
                      <input
                        type="email" required
                        aria-label="Official Email ID"
                        placeholder="e.g. employee@company.com"
                        value={newEmpForm.email}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, email: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-sans text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Employee Code:</span>
                      </label>
                      <div className="flex space-x-1.5 items-center h-9">
                        <input
                          type="text"
                          aria-label="Employee Code"
                          placeholder={`e.g. ${deriveCompanyPrefix(primaryCompany, companyDisplayName)}-PRD-00001`}
                          disabled={autoGenNewCode}
                          value={newEmpForm.employeeCode}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, employeeCode: e.target.value })}
                          className="flex-1 h-9 px-3 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 transition-all placeholder:text-slate-400"
                        />
                        <label className="h-9 px-2.5 flex items-center space-x-1 whitespace-nowrap bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer select-none transition-colors">
                          <input
                            type="checkbox"
                            aria-label="Auto-generate Employee Code"
                            checked={autoGenNewCode}
                            onChange={(e) => setAutoGenNewCode(e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-xs font-bold text-slate-700">Auto</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Pakistan CNIC:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Pakistan CNIC"
                        placeholder="e.g. 42101-1234567-3"
                        value={newEmpForm.cnic}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, cnic: formatCNIC(e.target.value) })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">CNIC Expiry (NADRA):</label>
                      <DateField aria-label="CNIC Expiry Date" value={newEmpForm.cnicExpiryDate} onChange={e => setNewEmpForm({ ...newEmpForm, cnicExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Contract End (if fixed-term):</label>
                      <DateField aria-label="Contract End Date" value={newEmpForm.contractEndDate} onChange={e => setNewEmpForm({ ...newEmpForm, contractEndDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Probation Review Due:</label>
                      <DateField aria-label="Probation Review Due Date" value={newEmpForm.probationEndDate} onChange={e => setNewEmpForm({ ...newEmpForm, probationEndDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                      <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={newEmpForm.probationConfirmed} onChange={e => setNewEmpForm({ ...newEmpForm, probationConfirmed: e.target.checked })} className="accent-emerald-600" />Probation decision recorded</label>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Driving Licence Expiry:</label>
                      <DateField aria-label="Driving Licence Expiry" value={newEmpForm.drivingLicenceExpiryDate} onChange={e => setNewEmpForm({ ...newEmpForm, drivingLicenceExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Certification Expiry:</label>
                      <DateField aria-label="Certification Expiry" value={newEmpForm.professionalCertificationExpiryDate} onChange={e => setNewEmpForm({ ...newEmpForm, professionalCertificationExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Work Permit / Visa Expiry:</label>
                      <DateField aria-label="Work Permit / Visa Expiry" value={newEmpForm.workPermitExpiryDate} onChange={e => setNewEmpForm({ ...newEmpForm, workPermitExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Worker Category:</label>
                      <select aria-label="Worker Category" value={newEmpForm.workerCategory} onChange={e => setNewEmpForm({ ...newEmpForm, workerCategory: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none bg-white">
                        {['Worker', 'Supervisory', 'Managerial', 'Contract', 'Apprentice'].map(category => <option key={category}>{category}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Vehicle Perquisite (PKR / month, taxable):</label>
                      <input type="number" min="0" aria-label="Vehicle Perquisite" value={newEmpForm.perquisiteVehicleMonthly} onChange={e => setNewEmpForm({ ...newEmpForm, perquisiteVehicleMonthly: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Accommodation Perquisite (PKR / month, taxable):</label>
                      <input type="number" min="0" aria-label="Accommodation Perquisite" value={newEmpForm.perquisiteAccommodationMonthly} onChange={e => setNewEmpForm({ ...newEmpForm, perquisiteAccommodationMonthly: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Other Perquisites (PKR / month, taxable):</label>
                      <input type="number" min="0" aria-label="Other Perquisites" value={newEmpForm.perquisiteOtherMonthly} onChange={e => setNewEmpForm({ ...newEmpForm, perquisiteOtherMonthly: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Shift Start:</label>
                      <input type="time" aria-label="Shift Start" value={newEmpForm.shiftStartTime} onChange={e => setNewEmpForm({ ...newEmpForm, shiftStartTime: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Shift End:</label>
                      <input type="time" aria-label="Shift End" value={newEmpForm.shiftEndTime} onChange={e => setNewEmpForm({ ...newEmpForm, shiftEndTime: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Grace Minutes:</label>
                      <input type="number" min="0" max="180" aria-label="Shift Grace Minutes" value={newEmpForm.shiftGraceMinutes} onChange={e => setNewEmpForm({ ...newEmpForm, shiftGraceMinutes: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Break Minutes:</label>
                      <input type="number" min="0" max="240" aria-label="Shift Break Minutes" value={newEmpForm.shiftBreakMinutes} onChange={e => setNewEmpForm({ ...newEmpForm, shiftBreakMinutes: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                      <p className="mb-2 text-[11px] font-bold text-emerald-800">Ramadan shift override <span className="font-normal text-emerald-700">(optional; dates must be set each year)</span></p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="text-[10px] font-bold text-slate-600">Start<DateField aria-label="Ramadan Start Date" value={newEmpForm.ramadanStartDate} onChange={e => setNewEmpForm({ ...newEmpForm, ramadanStartDate: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">End<DateField aria-label="Ramadan End Date" value={newEmpForm.ramadanEndDate} onChange={e => setNewEmpForm({ ...newEmpForm, ramadanEndDate: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">Start time<input type="time" aria-label="Ramadan Shift Start" value={newEmpForm.ramadanStartTime} onChange={e => setNewEmpForm({ ...newEmpForm, ramadanStartTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">End time<input type="time" aria-label="Ramadan Shift End" value={newEmpForm.ramadanEndTime} onChange={e => setNewEmpForm({ ...newEmpForm, ramadanEndTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label></div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><p className="col-span-2 text-[10px] font-bold text-emerald-800">Friday / Jumu’ah override (optional)</p><label className="text-[10px] font-bold text-slate-600">Start<input type="time" aria-label="Friday Shift Start" value={newEmpForm.fridayStartTime} onChange={e => setNewEmpForm({ ...newEmpForm, fridayStartTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">End<input type="time" aria-label="Friday Shift End" value={newEmpForm.fridayEndTime} onChange={e => setNewEmpForm({ ...newEmpForm, fridayEndTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label></div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Prior Employer Taxable Income:</label>
                      <input type="number" min="0" aria-label="Prior Employer Taxable Income" value={newEmpForm.priorEmployerTaxableIncome} onChange={e => setNewEmpForm({ ...newEmpForm, priorEmployerTaxableIncome: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Prior Employer Tax Deducted:</label>
                      <input type="number" min="0" aria-label="Prior Employer Tax Deducted" value={newEmpForm.priorEmployerTaxDeducted} onChange={e => setNewEmpForm({ ...newEmpForm, priorEmployerTaxDeducted: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Mobile Contact:</span>
                        <span className={`text-[10px] font-mono ${isValidPakMobileNumber(newEmpForm.contactNumber) ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                          {isValidPakMobileNumber(newEmpForm.contactNumber) ? '✓ Valid (9 digits)' : `${Math.max(0, 9 - (newEmpForm.contactNumber.replace(/\D/g, '').slice(3).length))} digits left`}
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type="text" required
                          aria-label="Mobile Contact Number"
                          maxLength={13}
                          placeholder="+923XXXXXXXXX"
                          value={newEmpForm.contactNumber}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, contactNumber: formatPakMobileNumber(e.target.value) })}
                          className={`w-full h-9 px-3 py-1.5 border rounded-lg font-mono text-xs text-slate-900 bg-white focus:outline-none transition-all placeholder:text-slate-400 ${
                            isValidPakMobileNumber(newEmpForm.contactNumber) 
                              ? 'border-emerald-500 focus:ring-2 focus:ring-emerald-500/20' 
                              : 'border-slate-300 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Gender:</span>
                      </label>
                      <select
                        aria-label="Gender"
                        value={newEmpForm.gender}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, gender: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Marital Status:</span>
                      </label>
                      <select
                        aria-label="Marital Status"
                        value={newEmpForm.maritalStatus}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, maritalStatus: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      >
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Date of Birth:</span>
                      </label>
                      <DateField required
                        aria-label="Date of Birth"
                        value={newEmpForm.dateOfBirth}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, dateOfBirth: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="sm:col-span-2 lg:col-span-4">
                      <div className="flex items-center justify-between mb-1 min-h-[1.25rem]">
                        <label className="font-bold text-slate-700 font-sans text-xs">
                          <span>Picture URL / Upload:</span>
                        </label>
                        {newEmpForm.pictureUrl && (
                          <button
                            type="button"
                            onClick={() => setViewImageModal({
                              open: true,
                              url: empAvatarUrl({ pictureUrl: newEmpForm.pictureUrl, gender: newEmpForm.gender }),
                              title: newEmpForm.fullName || 'Employee Picture Preview',
                              subtitle: newEmpForm.employeeCode || 'New Registration'
                            })}
                            className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <ZoomIn className="w-3 h-3" /> View Large
                          </button>
                        )}
                      </div>
                      <div className="flex space-x-2.5 items-center">
                        {/* Live Thumbnail Preview */}
                        <div 
                          className="relative w-10 h-10 rounded-lg border-2 border-slate-200 overflow-hidden bg-slate-100 flex-shrink-0 cursor-pointer group shadow-2xs"
                          onClick={() => {
                            if (newEmpForm.pictureUrl) {
                              setViewImageModal({
                                open: true,
                                url: empAvatarUrl({ pictureUrl: newEmpForm.pictureUrl, gender: newEmpForm.gender }),
                                title: newEmpForm.fullName || 'Employee Picture Preview',
                                subtitle: newEmpForm.employeeCode || 'New Registration'
                              });
                            }
                          }}
                          title={newEmpForm.pictureUrl ? 'Click to view high-resolution photo' : 'No photo uploaded'}
                        >
                          <img
                            src={empAvatarUrl({ pictureUrl: newEmpForm.pictureUrl, gender: newEmpForm.gender })}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = empAvatarUrl({ gender: newEmpForm.gender });
                            }}
                          />
                          {newEmpForm.pictureUrl && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <Eye className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        <input
                          type="text"
                          aria-label="Picture URL"
                          placeholder="Paste image URL (https://...) or click Browse to upload"
                          value={newEmpForm.pictureUrl}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, pictureUrl: e.target.value })}
                          className="flex-1 h-9 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none font-mono text-xs text-slate-900 bg-white transition-all placeholder:text-slate-400"
                        />
                        <input
                          type="file"
                          aria-label="Upload Profile Picture"
                          accept="image/*"
                          className="hidden"
                          id="add-emp-pic-file"
                          onChange={(e) => handlePictureFileChange(e, false)}
                        />
                        <label 
                          htmlFor="add-emp-pic-file"
                          className="h-9 px-4 flex items-center justify-center cursor-pointer bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg font-bold text-slate-700 text-xs whitespace-nowrap transition-colors shadow-2xs"
                        >
                          Browse...
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: ASSIGNMENT & REGIONAL GEOGRAPHY */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3.5">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-emerald-600 border-b border-slate-100 pb-2">Organization &amp; Regional Assignment</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 items-start">
                    <div className="min-w-0">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Assigned Branch:</span>
                      </label>
                      <select
                        aria-label="Assigned Branch"
                        value={newEmpForm.branchId}
                        onChange={(e) => handleAddBranchChange(e.target.value)}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      >
                        <option value="">{companyBranches.length ? 'Select Branch' : 'No branches configured in Master Data'}</option>
                        {companyBranches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Department:</span>
                      </label>
                      <select
                        aria-label="Department"
                        value={newEmpForm.departmentId}
                        onChange={(e) => handleAddDeptChange(e.target.value)}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      >
                        <option value="">{!newEmpForm.branchId ? 'Select a branch first' : localDepartments.some(d => d.branchId === newEmpForm.branchId) ? 'Select Department' : 'No departments configured in Master Data'}</option>
                        {localDepartments.filter(d => d.branchId === newEmpForm.branchId).map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Designation:</span>
                      </label>
                      <select
                        aria-label="Designation"
                        value={newEmpForm.designationId}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, designationId: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      >
                        <option value="">{!newEmpForm.departmentId ? 'Select a department first' : localDesignations.some(ds => ds.departmentId === newEmpForm.departmentId) ? 'Select Designation' : 'No designations configured in Master Data'}</option>
                        {localDesignations.filter(ds => ds.departmentId === newEmpForm.departmentId).map(ds => (
                          <option key={ds.id} value={ds.id}>{ds.title} (Grade {ds.grade})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {activeZones.length > 0 && (
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                      <div className="min-w-0">
                        <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                          <span>Zone:</span>
                        </label>
                        <select
                          aria-label="Zone"
                          value={newEmpForm.zoneId}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, zoneId: e.target.value, ucTownId: '' })}
                          className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                        >
                          <option value="">{activeZones.length ? 'Select Zone' : 'No zones configured in Master Data'}</option>
                          {activeZones.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                          <span>UC / Town Information:</span>
                        </label>
                        <select
                          aria-label="UC / Town"
                          value={newEmpForm.ucTownId}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, ucTownId: e.target.value })}
                          disabled={!newEmpForm.zoneId}
                          className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="">{!newEmpForm.zoneId ? 'Select a zone first' : ucTowns.filter(item => item.zoneId === newEmpForm.zoneId && item.status === 'Active').length ? 'Select UC / Town' : 'No UC/Towns configured in Master Data'}</option>
                          {ucTowns.filter(item => item.zoneId === newEmpForm.zoneId && item.status === 'Active').map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2 flex items-center space-x-3 pt-6">
                        <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                          <input
                            type="checkbox"
                            aria-label="Is Zone In Charge?"
                            checked={newEmpForm.isZoneInCharge}
                            onChange={(e) => setNewEmpForm({ ...newEmpForm, isZoneInCharge: e.target.checked })}
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span className="whitespace-nowrap font-bold text-slate-700 text-xs">Is Zone In Charge?</span>
                        </label>
                        {!newEmpForm.isZoneInCharge && (
                          <div className="flex-1">
                            <input
                              type="text"
                              aria-label="Zone In Charge Name"
                              placeholder="Zone In Charge Name"
                              value={newEmpForm.zoneInChargeName}
                              onChange={(e) => setNewEmpForm({ ...newEmpForm, zoneInChargeName: e.target.value })}
                              className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-sans text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 3: WAGES, ALLOWANCES & BANK */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3.5">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-emerald-600 border-b border-slate-100 pb-2">Wage &amp; Custom Allowance Configuration</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="min-w-0">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Wage Type:</span>
                      </label>
                      <select
                        aria-label="Wage Type"
                        value={newEmpForm.wageTypeId}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, wageTypeId: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      >
                        <option value="">{activeWageTypes.length ? 'Select Wage Type' : 'No wage types configured in Master Data'}</option>
                        {activeWageTypes.map(item => <option key={item.id} value={item.id}>{item.name} ({item.calculationBasis})</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[1.25rem]">
                        <label className="font-bold text-slate-700 font-sans text-xs">
                          <span>{newEmpTakeHome ? 'Target Take Home (Net PKR):' : 'Basic Monthly Wage / Daily Rate (PKR):'}</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none bg-emerald-50 hover:bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200 text-emerald-800 transition-colors" title="Check to enter target take-home pay and auto-calculate gross and FBR allowances">
                          <input
                            type="checkbox"
                            checked={newEmpTakeHome}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setNewEmpTakeHome(checked);
                              const split = calculateFbrSalarySplit(newEmpForm.basicSalary, checked, taxSlabs, (statConfig?.minimumWage || 37000));
                              setNewEmpForm(prev => ({
                                ...prev,
                                houseRentAllowance: split.houseRentAllowance,
                                conveyanceAllowance: split.conveyanceAllowance,
                                medicalAllowance: split.medicalAllowance,
                                otherAllowances: 0
                              }));
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                          />
                          <span className="text-[11px] font-bold">Take Home (FBR Auto)</span>
                        </label>
                      </div>
                      <input
                        type="number" required
                        aria-label="Basic Monthly Wage / Daily Rate (PKR)"
                        placeholder="e.g. 100000"
                        value={newEmpForm.basicSalary}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (newEmpTakeHome) {
                            const split = calculateFbrSalarySplit(val, true, taxSlabs, (statConfig?.minimumWage || 37000));
                            setNewEmpForm({
                              ...newEmpForm,
                              basicSalary: val,
                              houseRentAllowance: split.houseRentAllowance,
                              conveyanceAllowance: split.conveyanceAllowance,
                              medicalAllowance: split.medicalAllowance,
                              otherAllowances: 0
                            });
                          } else {
                            setNewEmpForm({ ...newEmpForm, basicSalary: val });
                          }
                        }}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Disbursal Bank:</span>
                      </label>
                      <div className="flex space-x-1.5 items-center h-9">
                        <select
                          aria-label="Disbursal Bank"
                          value={newEmpForm.bankName}
                          onChange={(e) => handleBankChange(e.target.value, false)}
                          className="flex-1 h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                        >
                          <option value="">-- Select Bank --</option>
                          {(selectedCountry === 'Pakistan' || !selectedCountry) ? (
                            PAKISTAN_BANKS.map(b => (
                              <option key={b.code} value={b.name}>{b.name}</option>
                            ))
                          ) : (
                            <option value={newEmpForm.bankName}>{newEmpForm.bankName}</option>
                          )}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter Custom Bank Name:");
                            if (val) {
                              handleBankChange(val, false);
                            }
                          }}
                          className="h-9 w-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg font-bold text-sm transition-colors shadow-2xs"
                          title="Add Custom Bank"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Account Number:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Bank Account Number"
                        placeholder="e.g. 12345678901234"
                        value={newEmpForm.bankAccountNumber}
                        onChange={(e) => handleAccountNumberChange(e.target.value, false)}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* FBR Live Salary & Allowance Breakdown Card */}
                  {((wageTypes.find(item => item.id === newEmpForm.wageTypeId)?.calculationBasis ?? (newEmpForm.wageType === 'Daily Wager' ? 'Daily' : 'Monthly')) === 'Monthly') && (
                    <div className="bg-gradient-to-r from-emerald-50/80 via-slate-50 to-emerald-50/50 p-3 rounded-xl border border-emerald-200/90 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span className="text-xs font-bold text-slate-800">
                            {newEmpTakeHome ? '🎯 FBR Take-Home Net Pay Mode (Auto-Calculated)' : '📋 Standard FBR Package Segregation (50/30/10/10)'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const split = calculateFbrSalarySplit(newEmpForm.basicSalary, newEmpTakeHome, taxSlabs, (statConfig?.minimumWage || 37000));
                            setNewEmpForm(prev => ({
                              ...prev,
                              houseRentAllowance: split.houseRentAllowance,
                              conveyanceAllowance: split.conveyanceAllowance,
                              medicalAllowance: split.medicalAllowance,
                              otherAllowances: 0
                            }));
                          }}
                          className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded transition shadow-2xs cursor-pointer"
                        >
                          Auto-fill FBR Allowances
                        </button>
                      </div>

                      {(() => {
                        const split = calculateFbrSalarySplit(newEmpForm.basicSalary, newEmpTakeHome, taxSlabs, (statConfig?.minimumWage || 37000));
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Gross Salary</span>
                              <span className="font-bold font-mono text-slate-900">{split.grossSalary.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Basic Pay (50%)</span>
                              <span className="font-bold font-mono text-slate-900">{split.basicWage.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">House Rent (30%)</span>
                              <span className="font-bold font-mono text-emerald-700">{split.houseRentAllowance.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Conveyance (10%)</span>
                              <span className="font-bold font-mono text-slate-700">{split.conveyanceAllowance.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Medical (10% exempt)</span>
                              <span className="font-bold font-mono text-teal-700">{split.medicalAllowance.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-rose-100 shadow-2xs">
                              <span className="block text-[10px] text-rose-500 font-medium">Est. Tax + EOBI</span>
                              <span className="font-bold font-mono text-rose-600">-{(split.monthlyTax + split.eobiDeduction).toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-emerald-600 text-white p-2 rounded-lg shadow-2xs">
                              <span className="block text-[10px] text-emerald-100 font-medium">Net Take-Home</span>
                              <span className="font-bold font-mono">{split.netTakeHome.toLocaleString()} PKR</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="sm:col-span-2">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>PKR IBAN Number:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="PKR IBAN Number"
                        placeholder="e.g. PK42HABB0012345678901234"
                        value={newEmpForm.iban}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, iban: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      {wageTypes.find(item => item.id === newEmpForm.wageTypeId)?.calculationBasis === 'Monthly' && (
                        <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
                          <h4 className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1.5">Allowance Overrides (0 to default split)</h4>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Rent:</label>
                              <input
                                type="number"
                                aria-label="House Rent Allowance"
                                placeholder="Rent"
                                value={newEmpForm.houseRentAllowance}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, houseRentAllowance: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Conveyance:</label>
                              <input
                                type="number"
                                aria-label="Conveyance Allowance"
                                placeholder="Conv"
                                value={newEmpForm.conveyanceAllowance}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, conveyanceAllowance: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Medical:</label>
                              <input
                                type="number"
                                aria-label="Medical Allowance"
                                placeholder="Med"
                                value={newEmpForm.medicalAllowance}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, medicalAllowance: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Other:</label>
                              <input
                                type="number"
                                aria-label="Other Allowances"
                                placeholder="Other"
                                value={newEmpForm.otherAllowances}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, otherAllowances: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 4: STATUTORY & TRUST FUNDS COMPLIANCE */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-emerald-600 border-b border-slate-100 pb-2">Statutory &amp; Trust Compliance</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Enable EOBI"
                          checked={newEmpForm.eobiEnabled}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, eobiEnabled: e.target.checked })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Enable EOBI</span>
                      </label>
                      {newEmpForm.eobiEnabled ? (
                        <input
                          type="text"
                          aria-label="EOBI Registration Number"
                          placeholder="EOBI No (e.g. 1090123000)"
                          value={newEmpForm.eobiNumber}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, eobiNumber: e.target.value })}
                          className="w-full h-8 px-2.5 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                        />
                      ) : (
                        <input type="text" aria-label="EOBI Exemption Reason" placeholder="Required EOBI exemption reason" value={newEmpForm.eobiExemptionReason} onChange={(e) => setNewEmpForm({ ...newEmpForm, eobiExemptionReason: e.target.value })} className="w-full h-8 px-2.5 border border-amber-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-emerald-500" />
                      )}
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Enable FBR Tax"
                          checked={newEmpForm.fbrEnabled}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, fbrEnabled: e.target.checked })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Enable FBR Tax</span>
                      </label>
                      <input
                        type="text"
                        aria-label="PESSI Social Security Number"
                        placeholder="PESSI SSN (e.g. SS-42-000)"
                        value={newEmpForm.socialSecurityNumber}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, socialSecurityNumber: e.target.value })}
                        className="w-full h-8 px-2.5 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-emerald-500"
                      />
                      {newEmpForm.fbrEnabled && <input type="text" aria-label="Employee NTN" placeholder="Employee NTN (if registered)" value={newEmpForm.ntn} onChange={(e) => setNewEmpForm({ ...newEmpForm, ntn: e.target.value })} className="w-full h-8 px-2.5 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-emerald-500" />}
                      {!newEmpForm.socialSecurityNumber && <input type="text" aria-label="Social Security Exemption Reason" placeholder="Required exemption reason if unregistered" value={newEmpForm.socialSecurityExemptionReason} onChange={(e) => setNewEmpForm({ ...newEmpForm, socialSecurityExemptionReason: e.target.value })} className="w-full h-8 px-2.5 border border-amber-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-emerald-500" />}
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-center space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Opt In Provident Fund"
                          checked={newEmpForm.providentFundOptIn}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, providentFundOptIn: e.target.checked })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Opt In PF Fund</span>
                      </label>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-center space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Opt In Gratuity"
                          checked={newEmpForm.gratuityOptIn}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, gratuityOptIn: e.target.checked })}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Opt In Gratuity</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAddEmpModal(false)}
                    className="px-5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-semibold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98]"
                  >
                    Complete Onboarding
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 1B: EDIT EMPLOYEE */}
      <AnimatePresence>
        {showEditEmpModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.96, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.96, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-6xl xl:max-w-[1220px] shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col my-auto"
            >
              <div className="px-6 py-4 bg-indigo-900 text-white flex justify-between items-center flex-shrink-0 shadow-xs">
                <span className="font-bold text-sm tracking-wider uppercase flex items-center">
                  <Users className="w-4 h-4 mr-2 text-indigo-300" /> Edit Employee Record
                </span>
                <button onClick={() => { setShowEditEmpModal(false); setEditingEmployee(null); }} className="text-indigo-200 hover:text-white font-bold text-xl leading-none px-2 py-1 rounded-lg transition-colors">×</button>
              </div>

              <form onSubmit={handleEditEmployeeSubmit} className="p-5 md:p-6 overflow-y-auto space-y-4 text-xs select-none flex-1 bg-slate-50/50">
                {/* SECTION 1: PERSONAL & CORE DETAILS */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3.5">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-indigo-600 border-b border-slate-100 pb-2">Personal &amp; Core Details</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Full Name:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Full Name"
                        placeholder="e.g. Ali Ahmed"
                        value={editEmpForm.fullName}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, fullName: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-sans text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Official Email ID:</span>
                      </label>
                      <input
                        type="email" required
                        aria-label="Official Email ID"
                        placeholder="e.g. employee@company.com"
                        value={editEmpForm.email}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, email: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-sans text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Employee Code:</span>
                      </label>
                      <div className="flex space-x-1.5 items-center h-9">
                        <input
                          type="text"
                          aria-label="Employee Code"
                          placeholder={`e.g. ${deriveCompanyPrefix(editingCompany, companyDisplayName)}-PRD-00001`}
                          disabled={autoGenEditCode}
                          value={editEmpForm.employeeCode}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, employeeCode: e.target.value })}
                          className="flex-1 h-9 px-3 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 transition-all placeholder:text-slate-400"
                        />
                        <label className="h-9 px-2.5 flex items-center space-x-1 whitespace-nowrap bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 cursor-pointer select-none transition-colors">
                          <input
                            type="checkbox"
                            aria-label="Auto-generate Employee Code"
                            checked={autoGenEditCode}
                            onChange={(e) => setAutoGenEditCode(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-bold text-slate-700">Auto</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Pakistan CNIC:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Pakistan CNIC"
                        placeholder="e.g. 42101-1234567-3"
                        value={editEmpForm.cnic}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, cnic: formatCNIC(e.target.value) })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">CNIC Expiry (NADRA):</label>
                      <DateField aria-label="Edit CNIC Expiry Date" value={editEmpForm.cnicExpiryDate} onChange={e => setEditEmpForm({ ...editEmpForm, cnicExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Contract End (if fixed-term):</label>
                      <DateField aria-label="Edit Contract End Date" value={editEmpForm.contractEndDate} onChange={e => setEditEmpForm({ ...editEmpForm, contractEndDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Probation Review Due:</label>
                      <DateField aria-label="Edit Probation Review Due Date" value={editEmpForm.probationEndDate} onChange={e => setEditEmpForm({ ...editEmpForm, probationEndDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                      <label className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-600"><input type="checkbox" checked={editEmpForm.probationConfirmed} onChange={e => setEditEmpForm({ ...editEmpForm, probationConfirmed: e.target.checked })} className="accent-indigo-600" />Probation decision recorded</label>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Driving Licence Expiry:</label>
                      <DateField aria-label="Edit Driving Licence Expiry" value={editEmpForm.drivingLicenceExpiryDate} onChange={e => setEditEmpForm({ ...editEmpForm, drivingLicenceExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Certification Expiry:</label>
                      <DateField aria-label="Edit Certification Expiry" value={editEmpForm.professionalCertificationExpiryDate} onChange={e => setEditEmpForm({ ...editEmpForm, professionalCertificationExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Work Permit / Visa Expiry:</label>
                      <DateField aria-label="Edit Work Permit / Visa Expiry" value={editEmpForm.workPermitExpiryDate} onChange={e => setEditEmpForm({ ...editEmpForm, workPermitExpiryDate: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Worker Category:</label>
                      <select aria-label="Edit Worker Category" value={editEmpForm.workerCategory} onChange={e => setEditEmpForm({ ...editEmpForm, workerCategory: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none bg-white">
                        {['Worker', 'Supervisory', 'Managerial', 'Contract', 'Apprentice'].map(category => <option key={category}>{category}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Vehicle Perquisite (PKR / month, taxable):</label>
                      <input type="number" min="0" aria-label="Edit Vehicle Perquisite" value={editEmpForm.perquisiteVehicleMonthly} onChange={e => setEditEmpForm({ ...editEmpForm, perquisiteVehicleMonthly: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Accommodation Perquisite (PKR / month, taxable):</label>
                      <input type="number" min="0" aria-label="Edit Accommodation Perquisite" value={editEmpForm.perquisiteAccommodationMonthly} onChange={e => setEditEmpForm({ ...editEmpForm, perquisiteAccommodationMonthly: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Other Perquisites (PKR / month, taxable):</label>
                      <input type="number" min="0" aria-label="Edit Other Perquisites" value={editEmpForm.perquisiteOtherMonthly} onChange={e => setEditEmpForm({ ...editEmpForm, perquisiteOtherMonthly: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Shift Start:</label>
                      <input type="time" aria-label="Edit Shift Start" value={editEmpForm.shiftStartTime} onChange={e => setEditEmpForm({ ...editEmpForm, shiftStartTime: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Shift End:</label>
                      <input type="time" aria-label="Edit Shift End" value={editEmpForm.shiftEndTime} onChange={e => setEditEmpForm({ ...editEmpForm, shiftEndTime: e.target.value })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Grace Minutes:</label>
                      <input type="number" min="0" max="180" aria-label="Edit Shift Grace Minutes" value={editEmpForm.shiftGraceMinutes} onChange={e => setEditEmpForm({ ...editEmpForm, shiftGraceMinutes: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Break Minutes:</label>
                      <input type="number" min="0" max="240" aria-label="Edit Shift Break Minutes" value={editEmpForm.shiftBreakMinutes} onChange={e => setEditEmpForm({ ...editEmpForm, shiftBreakMinutes: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                      <p className="mb-2 text-[11px] font-bold text-indigo-800">Ramadan shift override <span className="font-normal text-indigo-700">(optional; dates must be set each year)</span></p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><label className="text-[10px] font-bold text-slate-600">Start<DateField aria-label="Edit Ramadan Start Date" value={editEmpForm.ramadanStartDate} onChange={e => setEditEmpForm({ ...editEmpForm, ramadanStartDate: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">End<DateField aria-label="Edit Ramadan End Date" value={editEmpForm.ramadanEndDate} onChange={e => setEditEmpForm({ ...editEmpForm, ramadanEndDate: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">Start time<input type="time" aria-label="Edit Ramadan Shift Start" value={editEmpForm.ramadanStartTime} onChange={e => setEditEmpForm({ ...editEmpForm, ramadanStartTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">End time<input type="time" aria-label="Edit Ramadan Shift End" value={editEmpForm.ramadanEndTime} onChange={e => setEditEmpForm({ ...editEmpForm, ramadanEndTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label></div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><p className="col-span-2 text-[10px] font-bold text-indigo-800">Friday / Jumu’ah override (optional)</p><label className="text-[10px] font-bold text-slate-600">Start<input type="time" aria-label="Edit Friday Shift Start" value={editEmpForm.fridayStartTime} onChange={e => setEditEmpForm({ ...editEmpForm, fridayStartTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label><label className="text-[10px] font-bold text-slate-600">End<input type="time" aria-label="Edit Friday Shift End" value={editEmpForm.fridayEndTime} onChange={e => setEditEmpForm({ ...editEmpForm, fridayEndTime: e.target.value })} className="mt-1 h-8 w-full rounded border border-slate-300 px-2 text-xs" /></label></div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Prior Employer Taxable Income:</label>
                      <input type="number" min="0" aria-label="Edit Prior Employer Taxable Income" value={editEmpForm.priorEmployerTaxableIncome} onChange={e => setEditEmpForm({ ...editEmpForm, priorEmployerTaxableIncome: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 text-xs">Prior Employer Tax Deducted:</label>
                      <input type="number" min="0" aria-label="Edit Prior Employer Tax Deducted" value={editEmpForm.priorEmployerTaxDeducted} onChange={e => setEditEmpForm({ ...editEmpForm, priorEmployerTaxDeducted: Number(e.target.value) })} className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Mobile Contact:</span>
                        <span className={`text-[10px] font-mono ${isValidPakMobileNumber(editEmpForm.contactNumber) ? 'text-indigo-600 font-bold' : 'text-slate-400'}`}>
                          {isValidPakMobileNumber(editEmpForm.contactNumber) ? '✓ Valid (9 digits)' : `${Math.max(0, 9 - (editEmpForm.contactNumber.replace(/\D/g, '').slice(3).length))} digits left`}
                        </span>
                      </label>
                      <div className="relative">
                        <input
                          type="text" required
                          aria-label="Mobile Contact Number"
                          maxLength={13}
                          placeholder="+923XXXXXXXXX"
                          value={editEmpForm.contactNumber}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, contactNumber: formatPakMobileNumber(e.target.value) })}
                          className={`w-full h-9 px-3 py-1.5 border rounded-lg font-mono text-xs text-slate-900 bg-white focus:outline-none transition-all placeholder:text-slate-400 ${
                            isValidPakMobileNumber(editEmpForm.contactNumber) 
                              ? 'border-indigo-500 focus:ring-2 focus:ring-indigo-500/20' 
                              : 'border-slate-300 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Gender:</span>
                      </label>
                      <select
                        aria-label="Gender"
                        value={editEmpForm.gender}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, gender: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Marital Status:</span>
                      </label>
                      <select
                        aria-label="Marital Status"
                        value={editEmpForm.maritalStatus}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, maritalStatus: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      >
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Date of Birth:</span>
                      </label>
                      <DateField required
                        aria-label="Date of Birth"
                        value={editEmpForm.dateOfBirth}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, dateOfBirth: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="sm:col-span-2 lg:col-span-4">
                      <div className="flex items-center justify-between mb-1 min-h-[1.25rem]">
                        <label className="font-bold text-slate-700 font-sans text-xs">
                          <span>Picture URL / Upload:</span>
                        </label>
                        {editEmpForm.pictureUrl && (
                          <button
                            type="button"
                            onClick={() => setViewImageModal({
                              open: true,
                              url: empAvatarUrl({ pictureUrl: editEmpForm.pictureUrl, gender: editEmpForm.gender }),
                              title: editEmpForm.fullName || 'Employee Picture Preview',
                              subtitle: editEmpForm.employeeCode || 'Employee Record'
                            })}
                            className="text-[11px] text-indigo-600 hover:text-indigo-700 font-bold flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            <ZoomIn className="w-3 h-3" /> View Large
                          </button>
                        )}
                      </div>
                      <div className="flex space-x-2.5 items-center">
                        {/* Live Thumbnail Preview */}
                        <div 
                          className="relative w-10 h-10 rounded-lg border-2 border-slate-200 overflow-hidden bg-slate-100 flex-shrink-0 cursor-pointer group shadow-2xs"
                          onClick={() => {
                            if (editEmpForm.pictureUrl) {
                              setViewImageModal({
                                open: true,
                                url: empAvatarUrl({ pictureUrl: editEmpForm.pictureUrl, gender: editEmpForm.gender }),
                                title: editEmpForm.fullName || 'Employee Picture Preview',
                                subtitle: editEmpForm.employeeCode || 'Employee Record'
                              });
                            }
                          }}
                          title={editEmpForm.pictureUrl ? 'Click to view high-resolution photo' : 'No photo uploaded'}
                        >
                          <img
                            src={empAvatarUrl({ pictureUrl: editEmpForm.pictureUrl, gender: editEmpForm.gender })}
                            alt="Preview"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = empAvatarUrl({ gender: editEmpForm.gender });
                            }}
                          />
                          {editEmpForm.pictureUrl && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                              <Eye className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        <input
                          type="text"
                          aria-label="Picture URL"
                          placeholder="Paste image URL (https://...) or click Browse to upload"
                          value={editEmpForm.pictureUrl}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, pictureUrl: e.target.value })}
                          className="flex-1 h-9 px-3 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none font-mono text-xs text-slate-900 bg-white transition-all placeholder:text-slate-400"
                        />
                        <input
                          type="file"
                          aria-label="Upload Profile Picture"
                          accept="image/*"
                          className="hidden"
                          id="edit-emp-pic-file"
                          onChange={(e) => handlePictureFileChange(e, true)}
                        />
                        <label 
                          htmlFor="edit-emp-pic-file"
                          className="h-9 px-4 flex items-center justify-center cursor-pointer bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg font-bold text-slate-700 text-xs whitespace-nowrap transition-colors shadow-2xs"
                        >
                          Browse...
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: ASSIGNMENT & REGIONAL GEOGRAPHY */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3.5">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-indigo-600 border-b border-slate-100 pb-2">Organization &amp; Regional Assignment</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 items-start">
                    <div className="min-w-0">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Assigned Branch:</span>
                      </label>
                      <select
                        aria-label="Assigned Branch"
                        value={editEmpForm.branchId}
                        onChange={(e) => handleEditBranchChange(e.target.value)}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      >
                        <option value="">{editBranchOptions.length ? 'Select Branch' : 'No branches configured for this company'}</option>
                        {editBranchOptions.map(b => (
                          <option key={b.id} value={b.id}>{b.name}{getExceptionalCurrentSuffix(b, editEmpForm.branchId, editingCompanyId)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Department:</span>
                      </label>
                      <select
                        aria-label="Department"
                        value={editEmpForm.departmentId}
                        onChange={(e) => handleEditDeptChange(e.target.value)}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      >
                        <option value="">{savedDepartmentLabel && !editEmpForm.departmentId ? `Choose department (saved: ${savedDepartmentLabel})` : editDepartmentOptions.length ? 'Choose Department' : 'No departments configured for this company'}</option>
                        {editDepartmentOptions.map(d => (
                          <option key={d.id} value={d.id}>{d.name} — {localBranches.find(branch => branch.id === d.branchId)?.name || 'Unknown Branch'}{(d as Department & { status?: 'Active' | 'Inactive' }).status === 'Inactive' ? ' (Inactive — current)' : ''}</option>
                        ))}
                      </select>
                      {!editEmpForm.departmentId && savedDepartmentLabel && (
                        <p className="mt-1 text-[10px] leading-tight text-amber-700">
                          Saved: {savedDepartmentLabel}{savedEditingDepartmentBranch ? ` — ${savedEditingDepartmentBranch.name}` : ''}. Choose a Department to confirm; its Branch will be applied automatically.
                        </p>
                      )}
                      {editDepartmentMoveNotice && <p className="mt-1 text-[10px] leading-tight text-amber-700">{editDepartmentMoveNotice}</p>}
                    </div>
                    <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Designation:</span>
                      </label>
                      <select
                        aria-label="Designation"
                        value={editEmpForm.designationId}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, designationId: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      >
                        <option value="">{!editEmpForm.departmentId ? 'Choose a Department first' : savedDesignationLabel && !editEmpForm.designationId ? `Choose designation (saved: ${savedDesignationLabel})` : editDesignationOptions.length ? 'Choose Designation' : 'No designations configured for this Department'}</option>
                        {editDesignationOptions.map(ds => (
                          <option key={ds.id} value={ds.id}>{ds.title} (Grade {ds.grade}){(ds as Designation & { status?: 'Active' | 'Inactive' }).status === 'Inactive' ? ' (Inactive — current)' : ''}</option>
                        ))}
                      </select>
                      {editEmpForm.departmentId && !editEmpForm.designationId && savedDesignationLabel && <p className="mt-1 text-[10px] leading-tight text-amber-700">Saved designation: {savedDesignationLabel}. Choose a valid Designation for this Department.</p>}
                    </div>
                  </div>

                  {(editZoneOptions.length > 0 || Boolean(editEmpForm.zoneId) || Boolean(editEmpForm.zone)) && (
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                      <div className="min-w-0">
                        <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                          <span>Zone:</span>
                        </label>
                        <select
                          aria-label="Zone"
                          value={editEmpForm.zoneId}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, zoneId: e.target.value, ucTownId: '' })}
                          className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                        >
                          <option value="">{!editEmpForm.zoneId && editEmpForm.zone ? `Choose master zone (saved: ${editEmpForm.zone})` : editZoneOptions.length ? 'Choose master Zone' : 'No zones configured for this company'}</option>
                          {editZoneOptions.map(item => <option key={item.id} value={item.id}>{item.name}{getExceptionalCurrentSuffix(item, editEmpForm.zoneId, editingCompanyId)}</option>)}
                        </select>
                        {!editEmpForm.zoneId && editEmpForm.zone && <p className="mt-1 text-[10px] leading-tight text-amber-700">Saved zone “{editEmpForm.zone}” is not linked to current Master Data. Choose its replacement.</p>}
                      </div>
                      <div className="min-w-0">
                        <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                          <span>UC / Town Information:</span>
                        </label>
                        <select
                          aria-label="UC / Town"
                          value={editEmpForm.ucTownId}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, ucTownId: e.target.value })}
                          disabled={!editEmpForm.zoneId}
                          className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          <option value="">{!editEmpForm.zoneId ? 'Choose a master Zone first' : !editEmpForm.ucTownId && editEmpForm.ucTown ? `Choose UC / Town (saved: ${editEmpForm.ucTown})` : editUcTownOptions.length ? 'Choose UC / Town' : 'No UC/Towns configured for this Zone'}</option>
                          {editUcTownOptions.map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'Inactive' ? ' (Inactive — current)' : ''}</option>)}
                        </select>
                        {!editEmpForm.zoneId && <p className="mt-1 text-[10px] leading-tight text-amber-700">Select a Zone to enable UC / Town.</p>}
                        {editEmpForm.zoneId && !editEmpForm.ucTownId && editEmpForm.ucTown && <p className="mt-1 text-[10px] leading-tight text-amber-700">Saved UC / Town “{editEmpForm.ucTown}” is not linked to this Zone. Choose its replacement.</p>}
                        {editEmpForm.zoneId && editUcTownOptions.length === 0 && <p className="mt-1 text-[10px] leading-tight text-amber-700">No UC / Town records are configured for this Zone.</p>}
                      </div>
                      <div className="sm:col-span-2 flex items-center space-x-3 pt-6">
                        <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                          <input
                            type="checkbox"
                            aria-label="Is Zone In Charge?"
                            checked={editEmpForm.isZoneInCharge}
                            onChange={(e) => setEditEmpForm({ ...editEmpForm, isZoneInCharge: e.target.checked })}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                          />
                          <span className="whitespace-nowrap font-bold text-slate-700 text-xs">Is Zone In Charge?</span>
                        </label>
                        {!editEmpForm.isZoneInCharge && (
                          <div className="flex-1">
                            <input
                              type="text"
                              aria-label="Zone In Charge Name"
                              placeholder="Zone In Charge Name"
                              value={editEmpForm.zoneInChargeName || ''}
                              onChange={(e) => setEditEmpForm({ ...editEmpForm, zoneInChargeName: e.target.value })}
                              className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-sans text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 3: WAGES, ALLOWANCES & BANK */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3.5">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-indigo-600 border-b border-slate-100 pb-2">Wage &amp; Custom Allowance Configuration</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="min-w-0">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Wage Type:</span>
                      </label>
                      <select
                        aria-label="Wage Type"
                        value={editEmpForm.wageTypeId}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, wageTypeId: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      >
                        <option value="">{!editEmpForm.wageTypeId && editEmpForm.wageType ? `Choose wage type (saved: ${editEmpForm.wageType})` : editWageTypeOptions.length ? 'Choose Wage Type' : 'No wage types configured for this company'}</option>
                        {editWageTypeOptions.map(item => <option key={item.id} value={item.id}>{item.name} ({item.calculationBasis}){getExceptionalCurrentSuffix(item, editEmpForm.wageTypeId, editingCompanyId)}</option>)}
                      </select>
                      {!editEmpForm.wageTypeId && editEmpForm.wageType && <p className="mt-1 text-[10px] leading-tight text-amber-700">Saved wage type “{editEmpForm.wageType}” is not linked to current Master Data. Choose its replacement.</p>}
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1 min-h-[1.25rem]">
                        <label className="font-bold text-slate-700 font-sans text-xs">
                          <span>{editEmpTakeHome ? 'Target Take Home (Net PKR):' : 'Basic Monthly Wage / Daily Rate (PKR):'}</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none bg-indigo-50 hover:bg-indigo-100/80 px-2 py-0.5 rounded border border-indigo-200 text-indigo-800 transition-colors" title="Check to enter target take-home pay and auto-calculate gross and FBR allowances">
                          <input
                            type="checkbox"
                            checked={editEmpTakeHome}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setEditEmpTakeHome(checked);
                              const split = calculateFbrSalarySplit(editEmpForm.basicSalary, checked, taxSlabs, (statConfig?.minimumWage || 37000));
                              setEditEmpForm(prev => ({
                                ...prev,
                                houseRentAllowance: split.houseRentAllowance,
                                conveyanceAllowance: split.conveyanceAllowance,
                                medicalAllowance: split.medicalAllowance,
                                otherAllowances: 0
                              }));
                            }}
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                          />
                          <span className="text-[11px] font-bold">Take Home (FBR Auto)</span>
                        </label>
                      </div>
                      <input
                        type="number" required
                        aria-label="Basic Monthly Wage / Daily Rate (PKR)"
                        placeholder="e.g. 100000"
                        value={editEmpForm.basicSalary}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (editEmpTakeHome) {
                            const split = calculateFbrSalarySplit(val, true, taxSlabs, (statConfig?.minimumWage || 37000));
                            setEditEmpForm({
                              ...editEmpForm,
                              basicSalary: val,
                              houseRentAllowance: split.houseRentAllowance,
                              conveyanceAllowance: split.conveyanceAllowance,
                              medicalAllowance: split.medicalAllowance,
                              otherAllowances: 0
                            });
                          } else {
                            setEditEmpForm({ ...editEmpForm, basicSalary: val });
                          }
                        }}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Disbursal Bank:</span>
                      </label>
                      <div className="flex space-x-1.5 items-center h-9">
                        <select
                          aria-label="Disbursal Bank"
                          value={editEmpForm.bankName}
                          onChange={(e) => handleBankChange(e.target.value, true)}
                          className="flex-1 h-9 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                        >
                          <option value="">-- Select Bank --</option>
                          {(selectedCountry === 'Pakistan' || !selectedCountry) ? (
                            PAKISTAN_BANKS.map(b => (
                              <option key={b.code} value={b.name}>{b.name}</option>
                            ))
                          ) : (
                            <option value={editEmpForm.bankName}>{editEmpForm.bankName}</option>
                          )}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter Custom Bank Name:");
                            if (val) {
                              handleBankChange(val, true);
                            }
                          }}
                          className="h-9 w-9 flex items-center justify-center bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 rounded-lg font-bold text-sm transition-colors shadow-2xs"
                          title="Add Custom Bank"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Account Number:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Bank Account Number"
                        placeholder="e.g. 12345678901234"
                        value={editEmpForm.bankAccountNumber}
                        onChange={(e) => handleAccountNumberChange(e.target.value, true)}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* FBR Live Salary & Allowance Breakdown Card */}
                  {((wageTypes.find(item => item.id === editEmpForm.wageTypeId)?.calculationBasis ?? (editEmpForm.wageType === 'Daily Wager' ? 'Daily' : 'Monthly')) === 'Monthly') && (
                    <div className="bg-gradient-to-r from-indigo-50/80 via-slate-50 to-indigo-50/50 p-3 rounded-xl border border-indigo-200/90 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                          <span className="text-xs font-bold text-slate-800">
                            {editEmpTakeHome ? '🎯 FBR Take-Home Net Pay Mode (Auto-Calculated)' : '📋 Standard FBR Package Segregation (50/30/10/10)'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const split = calculateFbrSalarySplit(editEmpForm.basicSalary, editEmpTakeHome, taxSlabs, (statConfig?.minimumWage || 37000));
                            setEditEmpForm(prev => ({
                              ...prev,
                              houseRentAllowance: split.houseRentAllowance,
                              conveyanceAllowance: split.conveyanceAllowance,
                              medicalAllowance: split.medicalAllowance,
                              otherAllowances: 0
                            }));
                          }}
                          className="text-[10px] font-bold text-indigo-700 hover:text-indigo-800 bg-white hover:bg-indigo-50 border border-indigo-300 px-2 py-0.5 rounded transition shadow-2xs cursor-pointer"
                        >
                          Auto-fill FBR Allowances
                        </button>
                      </div>

                      {(() => {
                        const split = calculateFbrSalarySplit(editEmpForm.basicSalary, editEmpTakeHome, taxSlabs, (statConfig?.minimumWage || 37000));
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs">
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Gross Salary</span>
                              <span className="font-bold font-mono text-slate-900">{split.grossSalary.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Basic Pay (50%)</span>
                              <span className="font-bold font-mono text-slate-900">{split.basicWage.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">House Rent (30%)</span>
                              <span className="font-bold font-mono text-indigo-700">{split.houseRentAllowance.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Conveyance (10%)</span>
                              <span className="font-bold font-mono text-slate-700">{split.conveyanceAllowance.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                              <span className="block text-[10px] text-slate-500 font-medium">Medical (10% exempt)</span>
                              <span className="font-bold font-mono text-teal-700">{split.medicalAllowance.toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-white p-2 rounded-lg border border-rose-100 shadow-2xs">
                              <span className="block text-[10px] text-rose-500 font-medium">Est. Tax + EOBI</span>
                              <span className="font-bold font-mono text-rose-600">-{(split.monthlyTax + split.eobiDeduction).toLocaleString()} PKR</span>
                            </div>
                            <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-2xs">
                              <span className="block text-[10px] text-indigo-100 font-medium">Net Take-Home</span>
                              <span className="font-bold font-mono">{split.netTakeHome.toLocaleString()} PKR</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="sm:col-span-2">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>PKR IBAN Number:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="PKR IBAN Number"
                        placeholder="e.g. PK42HABB0012345678901234"
                        value={editEmpForm.iban}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, iban: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      {(wageTypes.find(item => item.id === editEmpForm.wageTypeId)?.calculationBasis ?? (editEmpForm.wageType === 'Daily Wager' ? 'Daily' : 'Monthly')) === 'Monthly' && (
                        <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/90 shadow-2xs">
                          <h4 className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1.5">Allowance Overrides (0 to default split)</h4>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Rent:</label>
                              <input
                                type="number"
                                aria-label="House Rent Allowance"
                                placeholder="Rent"
                                value={editEmpForm.houseRentAllowance}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, houseRentAllowance: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Conveyance:</label>
                              <input
                                type="number"
                                aria-label="Conveyance Allowance"
                                placeholder="Conv"
                                value={editEmpForm.conveyanceAllowance}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, conveyanceAllowance: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Medical:</label>
                              <input
                                type="number"
                                aria-label="Medical Allowance"
                                placeholder="Med"
                                value={editEmpForm.medicalAllowance}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, medicalAllowance: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Other:</label>
                              <input
                                type="number"
                                aria-label="Other Allowances"
                                placeholder="Other"
                                value={editEmpForm.otherAllowances}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, otherAllowances: Number(e.target.value) })}
                                className="w-full h-8 px-2 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 4: STATUTORY & TRUST FUNDS COMPLIANCE */}
                <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs space-y-3">
                  <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center text-indigo-600 border-b border-slate-100 pb-2">Statutory &amp; Trust Compliance</h3>
                  
                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Enable EOBI"
                          checked={editEmpForm.eobiEnabled}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, eobiEnabled: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Enable EOBI</span>
                      </label>
                      {editEmpForm.eobiEnabled ? (
                        <input
                          type="text"
                          aria-label="EOBI Registration Number"
                          placeholder="EOBI No (e.g. 1090123000)"
                          value={editEmpForm.eobiNumber}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, eobiNumber: e.target.value })}
                          className="w-full h-8 px-2.5 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                        />
                      ) : (
                        <input type="text" aria-label="Edit EOBI Exemption Reason" placeholder="Required EOBI exemption reason" value={editEmpForm.eobiExemptionReason} onChange={(e) => setEditEmpForm({ ...editEmpForm, eobiExemptionReason: e.target.value })} className="w-full h-8 px-2.5 border border-amber-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500" />
                      )}
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Enable FBR Tax"
                          checked={editEmpForm.fbrEnabled}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, fbrEnabled: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Enable FBR Tax</span>
                      </label>
                      <input
                        type="text"
                        aria-label="PESSI Social Security Number"
                        placeholder="PESSI SSN (e.g. SS-42-000)"
                        value={editEmpForm.socialSecurityNumber}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, socialSecurityNumber: e.target.value })}
                        className="w-full h-8 px-2.5 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500"
                      />
                      {editEmpForm.fbrEnabled && <input type="text" aria-label="Edit Employee NTN" placeholder="Employee NTN (if registered)" value={editEmpForm.ntn} onChange={(e) => setEditEmpForm({ ...editEmpForm, ntn: e.target.value })} className="w-full h-8 px-2.5 border border-slate-300 rounded-lg font-mono text-xs bg-white focus:ring-1 focus:ring-indigo-500" />}
                      {!editEmpForm.socialSecurityNumber && <input type="text" aria-label="Edit Social Security Exemption Reason" placeholder="Required exemption reason if unregistered" value={editEmpForm.socialSecurityExemptionReason} onChange={(e) => setEditEmpForm({ ...editEmpForm, socialSecurityExemptionReason: e.target.value })} className="w-full h-8 px-2.5 border border-amber-300 rounded-lg text-xs bg-white focus:ring-1 focus:ring-indigo-500" />}
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-center space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Opt In Provident Fund"
                          checked={editEmpForm.providentFundOptIn}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, providentFundOptIn: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Opt In PF Fund</span>
                      </label>
                    </div>

                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col justify-center space-y-2 h-full">
                      <label className="flex items-center space-x-2 font-medium select-none cursor-pointer">
                        <input
                          type="checkbox"
                          aria-label="Opt In Gratuity"
                          checked={editEmpForm.gratuityOptIn}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, gratuityOptIn: e.target.checked })}
                          className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span className="font-bold text-slate-700 text-xs">Opt In Gratuity</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200 flex-shrink-0">
                  <button 
                    type="button"
                    onClick={() => { setShowEditEmpModal(false); setEditingEmployee(null); }}
                    className="px-5 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-semibold text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md transition-all active:scale-[0.98]"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 1C: EMPLOYEE EXIT CLEARANCE & SETTLEMENT */}
      <AnimatePresence>
        {showOffboardModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 bg-rose-900 text-white flex justify-between items-center flex-shrink-0">
                <span className="font-bold text-sm tracking-wider uppercase flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-1.5 text-rose-400 animate-pulse" /> Employee Exit Clearance &amp; Settlement
                </span>
                <button onClick={() => setShowOffboardModal(null)} className="text-white hover:text-slate-200 font-bold text-lg">×</button>
              </div>

              <div className="p-5 space-y-4 text-xs select-none">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2">
                  <div className="flex items-center space-x-3">
                    <img 
                      src={empAvatarUrl(showOffboardModal)}
                      alt="" 
                      className="w-10 h-10 rounded-full object-cover border border-slate-200" 
                    />
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{showOffboardModal.fullName}</h4>
                      <p className="text-[10px] text-slate-505 font-mono">{showOffboardModal.employeeCode} • {showOffboardModal.email}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-[10px] text-slate-650 font-sans">
                    <div>
                      <span className="font-bold">Wage Type:</span> {resolveWageTypeName(showOffboardModal, wageTypes)}
                    </div>
                    <div>
                      <span className="font-bold">Basic Rate:</span> PKR {(showOffboardModal.basicSalary || 0).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-bold">Gratuity Status:</span> {showOffboardModal.gratuityOptIn ? 'Opted In' : 'Not Opted In'}
                    </div>
                    <div>
                      <span className="font-bold">Provident Fund:</span> {showOffboardModal.providentFundOptIn ? 'Opted In' : 'Not Opted In'}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block font-bold text-slate-700">Separation type:
                      <select value={settlementType} onChange={event => setSettlementType(event.target.value as GratuitySettlement['separationType'])} className="mt-1 w-full rounded border border-slate-300 p-2 font-normal"><option>Resignation</option><option>Termination</option><option>Retirement</option><option>Death</option><option>Redundancy</option></select>
                    </label>
                    <label className="block font-bold text-slate-700">Effective / last working date:
                      <DateField value={settlementDate} onChange={event => setSettlementDate(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2 font-normal" />
                    </label>
                  </div>
                  <label className="block font-bold text-slate-700">Separation reason / approval note:
                    <textarea value={settlementReason} onChange={event => setSettlementReason(event.target.value)} rows={2} placeholder="Required for audit and final settlement" className="mt-1 w-full rounded border border-slate-300 p-2 font-normal" />
                  </label>
                  <label className="block font-bold text-slate-700">Notice pay days:
                    <input type="number" min="0" max="180" value={settlementNoticeDays} onChange={event => setSettlementNoticeDays(Number(event.target.value))} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono font-normal" />
                  </label>
                  <div>
                    <label htmlFor="encashable-leaves" className="block font-bold text-slate-700 mb-1">Encashable Leaves (Days):</label>
                    <input 
                      id="encashable-leaves"
                      type="number"
                      min="0"
                      max="30"
                      value={settlementLeavesEncash}
                      onChange={(e) => setSettlementLeavesEncash(Number(e.target.value))}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-rose-500 focus:outline-none font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Specify the number of annual leaves left to encash in final settlement.</span>
                  </div>

                  <div className="bg-rose-50/50 p-3 rounded-lg border border-rose-100 space-y-2">
                    <h5 className="font-bold text-rose-800 uppercase tracking-wider text-[9px]">Calculated Settlement Values</h5>
                    
                    {(() => {
                      const baseBasic = resolveWageBasis(showOffboardModal, wageTypes) === 'Daily' ? showOffboardModal.basicSalary * 26 : showOffboardModal.basicSalary;
                      const completedYears = Math.max(0, Math.floor((new Date(`${settlementDate}T00:00:00`).getTime() - new Date(`${showOffboardModal.dateOfJoining}T00:00:00`).getTime()) / (365.2425 * 86_400_000)));
                      const gratuityCalculated = showOffboardModal.gratuityOptIn 
                        ? Math.round((baseBasic / 30) * statConfig.gratuityRateDaysPerYear * completedYears)
                        : 0;
                      const leaveEncashAmount = Math.round((baseBasic / 30) * settlementLeavesEncash);
                      const noticePayAmount = Math.round((baseBasic / 30) * settlementNoticeDays);
                      const totalSettlement = gratuityCalculated + leaveEncashAmount + noticePayAmount;

                      return (
                        <div className="space-y-1.5 text-slate-700">
                          <div className="flex justify-between">
                            <span>Gratuity Benefit ({completedYears} Yrs service):</span>
                            <span className="font-mono font-bold">PKR {gratuityCalculated.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Leave Encashment Amount ({settlementLeavesEncash} days):</span>
                            <span className="font-mono font-bold">PKR {leaveEncashAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Notice Pay ({settlementNoticeDays} days):</span>
                            <span className="font-mono font-bold">PKR {noticePayAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-rose-200/60 pt-1.5 font-bold text-slate-900 text-xs">
                            <span className="text-rose-900">Total Final Settlement:</span>
                            <span className="font-mono text-rose-900">PKR {totalSettlement.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2.5 border-t border-slate-200">
                  <button 
                    type="button"
                    onClick={() => setShowOffboardModal(null)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={executeOffboarding}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shadow-xs flex items-center space-x-1"
                  >
                    <span>Finalize Exit &amp; Disbursal</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: DETAILED PAYSLIP DOWNLOAD WINDOW */}
      <AnimatePresence>
        {paymentExceptionRun && (
          <PaymentExceptionsModal
            run={paymentExceptionRun}
            payslips={payrollPayslips}
            employees={employees}
            onClose={() => setPaymentExceptionRun(null)}
            onMarkFailed={onMarkPaymentFailed}
            onRecordRetry={onRecordPaymentRetry}
          />
        )}

        {showPayslipModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-xl shadow-xl pointer-events-auto border border-slate-200 overflow-hidden text-xs"
            >
              <div className="px-6 py-4 bg-emerald-850 text-white flex justify-between items-center bg-slate-900">
                <span className="font-bold text-xs uppercase tracking-widest font-mono">
                  Calculated Pakistan Payslip Archive
                </span>
                <button onClick={() => setShowPayslipModal(null)} className="text-white hover:text-slate-100 font-bold text-lg select-none">×</button>
              </div>

              <div className="p-6 space-y-4" id="payslip-pdf-view">
                
                {/* Header info */}
                <div className="flex justify-between border-b pb-3 items-start">
                  <div>
                    <h4 className="font-bold text-base text-slate-900 uppercase">{companyLegalName}</h4>
                    {companyAddressLine && <p className="text-slate-500 font-mono text-[10px]">{companyAddressLine}</p>}
                    {companyRegistrationLine && <p className="text-slate-400 font-mono text-[10px]">{companyRegistrationLine}</p>}
                  </div>
                  <div className="text-right font-mono text-[10px] text-slate-500">
                    <p><strong>Payslip Reference ID:</strong></p>
                    <p className="text-slate-800 font-bold">{showPayslipModal.id}</p>
                    <p className="mt-1">Period: {showPayslipModal.periodMonth && showPayslipModal.periodYear ? new Date(showPayslipModal.periodYear, showPayslipModal.periodMonth - 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' }) : 'Payroll preview'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b pb-3 font-mono text-[11px] text-slate-600">
                  <div>
                    <p>Employee Name: <strong className="text-slate-900 font-sans">{showPayslipModal.employeeName}</strong></p>
                    <p>Employee Code: <strong className="text-slate-900">{showPayslipModal.employeeCode}</strong></p>
                    <p>CNIC Number: <strong className="text-slate-900">{showPayslipModal.cnic}</strong></p>
                  </div>
                  {(() => {
                    const pe = employees.find(e => e.id === showPayslipModal.employeeId);
                    return (
                      <div>
                        <p>Bank: <strong className="text-slate-900 font-sans">{pe?.bankName || '—'}</strong></p>
                        <p>IBAN: <strong className="text-slate-900">{pe?.iban || '—'}</strong></p>
                        <p>Joining Date: <strong className="text-slate-900">{pe?.dateOfJoining || '—'}</strong></p>
                        <p>Branch: <strong className="text-slate-900">{showPayslipModal.branchName}</strong></p>
                        <p>Dept: <strong className="text-slate-900">{showPayslipModal.departmentName}</strong></p>
                      </div>
                    );
                  })()}
                </div>

                {/* Earnings & Deductions breakdown side by side */}
                {(() => {
                  const payslipEmp = employees.find(e => e.id === showPayslipModal.employeeId);
                  const isCustom = payslipEmp?.houseRentAllowance !== undefined || payslipEmp?.medicalAllowance !== undefined || payslipEmp?.conveyanceAllowance !== undefined || payslipEmp?.otherAllowances !== undefined;
                  return (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                      
                      {/* Earnings column */}
                      <div className="space-y-2 border-r pr-6">
                        <h5 className="font-bold text-slate-800 uppercase text-[10px] tracking-wider border-b pb-1">Earnings components</h5>
                        
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between">
                            <span className="text-slate-500">{bilingual('Basic Pay:', 'بنیادی تنخواہ')}</span>
                            <span className="text-slate-900 font-bold">{showPayslipModal.basicEarnings.toLocaleString()} PKR</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isCustom ? 'House Rent:' : 'House Rent (30%):'}</span>
                            <span className="text-slate-900">{showPayslipModal.houseRentAllowance.toLocaleString()} PKR</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isCustom ? 'Medical:' : 'Medical (10%):'}</span>
                            <span className="text-slate-900">{showPayslipModal.medicalAllowance.toLocaleString()} PKR</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{isCustom ? 'Conveyance:' : 'Conveyance (10%):'}</span>
                            <span className="text-slate-900">{showPayslipModal.conveyanceAllowance.toLocaleString()} PKR</span>
                          </div>
                          {showPayslipModal.otherAllowances > 0 && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Other Allowances:</span>
                              <span className="text-emerald-700 font-semibold">+{showPayslipModal.otherAllowances.toLocaleString()} PKR</span>
                            </div>
                          )}
                          {showPayslipModal.overtimePay > 0 && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Overtime ({showPayslipModal.overtimeHours}h):</span>
                              <span className="text-emerald-700 font-semibold">+{showPayslipModal.overtimePay.toLocaleString()} PKR</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Deductions column */}
                      <div className="space-y-2">
                        <h5 className="font-bold text-slate-800 uppercase text-[10px] tracking-wider border-b pb-1">Statutory deductions</h5>
                        
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-slate-500">{bilingual('FBR Income Tax:', 'انکم ٹیکس')}</span>
                            <div className="flex items-center space-x-1">
                              <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${payslipEmp?.fbrEnabled !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-850'}`}>
                                {payslipEmp?.fbrEnabled !== false ? 'FBR: Active' : 'FBR: Exempt'}
                              </span>
                              <span className="text-rose-700 font-bold">-{showPayslipModal.incomeTaxDeduction.toLocaleString()} PKR</span>
                            </div>
                          </div>
                          {showPayslipModal.taxYear && (
                            <div className="my-2 rounded border border-slate-200 bg-slate-50 p-2 text-[9px] leading-relaxed text-slate-500">
                              <div className="flex justify-between"><span>Tax Year</span><strong className="text-slate-700">{showPayslipModal.taxYear}</strong></div>
                              <div className="flex justify-between"><span>Taxable income YTD</span><span>PKR {(showPayslipModal.taxableIncomeYtd || 0).toLocaleString()}</span></div>
                              <div className="flex justify-between"><span>Tax deducted previously</span><span>PKR {(showPayslipModal.taxDeductedBeforeCurrentPeriod || 0).toLocaleString()}</span></div>
                              <div className="flex justify-between"><span>Projected annual income</span><span>PKR {(showPayslipModal.projectedAnnualTaxableIncome || 0).toLocaleString()}</span></div>
                            </div>
                          )}
                          {([['Bonus', showPayslipModal.bonusEarnings], ['Commission', showPayslipModal.commissionEarnings], ['Arrears', showPayslipModal.arrearsEarnings], ['Reimbursement', showPayslipModal.reimbursements]] as const).map(([label, amount]) => Boolean(amount) && (
                            <div key={label} className="flex justify-between">
                              <span className="text-slate-500">{label}:</span>
                              <span className="text-emerald-700 font-semibold">+{(amount || 0).toLocaleString()} PKR</span>
                            </div>
                          ))}
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">{bilingual('EOBI Employee:', 'ای او بی آئی')}</span>
                            <div className="flex items-center space-x-1">
                              <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${payslipEmp?.eobiEnabled !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-850'}`}>
                                {payslipEmp?.eobiEnabled !== false ? 'EOBI: Active' : 'EOBI: Exempt'}
                              </span>
                              <span className="text-rose-750 font-semibold">-{showPayslipModal.eobiEmployeeDeduction.toLocaleString()} PKR</span>
                            </div>
                          </div>
                          {showPayslipModal.providentFundDeduction > 0 && (
                            <div className="flex justify-between mt-1">
                              <span className="text-slate-500">Provident Fund (5%):</span>
                              <span className="text-slate-900">-{showPayslipModal.providentFundDeduction.toLocaleString()} PKR</span>
                            </div>
                          )}
                          {showPayslipModal.unpaidLeaveDeduction > 0 && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">{bilingual('Unpaid Leaves:', 'بلا تنخواہ چھٹیاں')}</span>
                              <span className="text-rose-700">-{showPayslipModal.unpaidLeaveDeduction.toLocaleString()} PKR</span>
                            </div>
                          )}
                          {(showPayslipModal.otherAdjustmentsDeduction || 0) > 0 && <div className="flex justify-between"><span className="text-slate-500">Other deductions:</span><span className="text-rose-700">-{(showPayslipModal.otherAdjustmentsDeduction || 0).toLocaleString()} PKR</span></div>}
                          {(showPayslipModal.manualTaxAdjustment || 0) > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax adjustment:</span><span className="text-rose-700">-{(showPayslipModal.manualTaxAdjustment || 0).toLocaleString()} PKR</span></div>}
                        </div>
                      </div>

                    </div>
                  );
                })()}

                {/* Subtotals & Net Pay */}
                <div className="border-t border-slate-200 mt-4 pt-4 space-y-2 select-none">
                  <div className="flex justify-between font-mono text-xs">
                    <span className="text-slate-500">{bilingual('Calculated Gross:', 'کل تنخواہ')}</span>
                    <span className="text-slate-800 font-bold">{showPayslipModal.grossSalary.toLocaleString()} PKR</span>
                  </div>
                  <div className="flex justify-between font-mono text-xs text-rose-800">
                    <span>{bilingual('Total Deducted:', 'کل کٹوتی')}</span>
                    <span>-{showPayslipModal.totalDeductions.toLocaleString()} PKR</span>
                  </div>
                  <div className="flex justify-between bg-emerald-50 text-emerald-900 font-bold p-3.5 rounded-lg text-lg border border-emerald-100 shadow-inner">
                    <span>{bilingual('Net Take-home pay:', 'قابلِ ادائیگی تنخواہ')}</span>
                    <span className="font-mono">{showPayslipModal.netSalary.toLocaleString()} PKR</span>
                  </div>
                </div>

                {/* Audit & declaration compliance footnote */}
                <div className="bg-slate-50 p-2.5 rounded-lg text-[10px] text-slate-400 font-serif leading-relaxed mt-4 border-t">
                  * Generated by {companyLegalName} under the Shops &amp; Establishments Ordinance. Salary disbursed via bank advice file. Statutory values are calculated from the configured rate tables and should be reconciled with FBR, EOBI and provincial filings.
                </div>

              </div>

              <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPayslipModal(null)}
                    className="text-slate-500 hover:text-slate-700 text-xs font-semibold px-4 py-2 rounded border border-slate-300 hover:bg-slate-100 transition"
                  >
                    Close
                  </button>
                  <button type="button" onClick={() => setPayslipUrdu(value => !value)} className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">{payslipUrdu ? 'English only' : 'English + اردو'}</button>
                  <button type="button" onClick={() => downloadPayslipPdf(showPayslipModal, companyLegalName)} className="flex items-center gap-1 rounded border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><Download size={13} />PDF</button>
                </div>
                <button
                  onClick={() => {
                    const style = document.createElement('style');
                    style.id = '__payslip-print-style';
                    style.innerHTML = `
                      @media print {
                        body > *:not(.fixed) { display: none !important; }
                        .fixed { display: none !important; }
                        #payslip-print-root { display: block !important; position: fixed; inset: 0; background: white; z-index: 99999; padding: 24px; }
                      }
                    `;
                    document.head.appendChild(style);
                    const root = document.createElement('div');
                    root.id = 'payslip-print-root';
                    root.style.display = 'none';
                    const src = document.getElementById('payslip-pdf-view');
                    if (src) root.innerHTML = src.innerHTML;
                    document.body.appendChild(root);
                    window.print();
                    setTimeout(() => {
                      document.body.removeChild(root);
                      const s = document.getElementById('__payslip-print-style');
                      if (s) document.head.removeChild(s);
                    }, 1000);
                  }}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded shadow transition"
                >
                  <Download size={13} /> Print / Save as PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: BANK DISBURSEMENT ADVICE FILE PREVIEW */}
      <AnimatePresence>
        {showBankFileModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border border-slate-200 overflow-hidden text-xs"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center">
                <span className="font-bold text-xs uppercase tracking-widest font-mono">
                  Bank Advice Bulk Disbursal Document
                </span>
                <button onClick={() => setShowBankFileModal(null)} className="text-white hover:text-slate-100 font-bold text-lg select-none">×</button>
              </div>

              <div className="p-6 space-y-4">
                <div className="flex justify-between text-[11px] bg-slate-55 mb-2 p-3 rounded-lg border border-slate-200 font-mono text-slate-600 leading-relaxed">
                  <div>
                    <h5 className="font-bold text-slate-900 text-xs">Debit Authorization account info</h5>
                    <p>Paying Account Name: {companyLegalName}</p>
                    {primaryBranch && <p>Originating Branch: {primaryBranch.name}</p>}
                    <p>Source account: selected and authorized in the bank portal</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-700">Not bank-authorized until uploaded and approved in the bank portal</p>
                    <p>Total Staff: {payrollPayslips.filter(p => p.payrollRunId === showBankFileModal.id).length}</p>
                    <p>Disbursal Amount: <strong>PKR {showBankFileModal.totalNetPay.toLocaleString()}</strong></p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <label className="block text-[11px] font-bold text-amber-950">Bank file template</label>
                  <select aria-label="Bank file template" value={selectedBankTemplate?.id || ''} onChange={event => setBankAdviceProfile(event.target.value)} className="mt-1 h-9 w-full rounded border border-amber-300 bg-white px-2 text-xs text-slate-900">
                    {bankTemplates.map(item => <option key={item.id} value={item.id}>{item.verified ? '✓ Verified — ' : '⚠ Not verified — '}{item.name}</option>)}
                  </select>
                  <label className="mt-2 block text-[11px] font-bold text-amber-950">Value date
                    <DateField value={bankValueDate} onChange={event => setBankValueDate(event.target.value)} className="mt-1 h-9 w-full rounded border border-amber-300 bg-white px-2 text-xs text-slate-900" />
                  </label>
                  {selectedBankTemplate && <p className="mt-2 text-[10px] text-amber-900">Batch {batchReferenceFor(showBankFileModal)} · debit account {selectedBankTemplate.debitAccount || 'not set'} · spec: {selectedBankTemplate.specReference || 'not recorded'}</p>}
                  <p className="mt-2 text-[10px] leading-relaxed text-amber-900">This application does not claim this generic file is accepted by a bank. Upload only after your bank confirms the corporate file specification and finance validates a test batch.</p>
                </div>

                <div className="overflow-y-auto max-h-60 border border-slate-200 rounded-lg">
                  <table className="min-w-full text-[11px] text-left font-mono divide-y divide-slate-100">
                    <thead className="bg-slate-50 sticky top-0 text-slate-500 font-semibold">
                      <tr>
                        <th className="px-3 py-2">Beneficiary Name</th>
                        <th className="px-3 py-2">IBAN</th>
                        <th className="px-3 py-2">Bank</th>
                        <th className="px-3 py-2 text-right">Net Transferred (PKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-705">
                      {payrollPayslips.filter(p => p.payrollRunId === showBankFileModal.id).map(sheet => {
                        return (
                          <tr key={sheet.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-sans font-medium">{sheet.employeeName}</td>
                            <td className="px-3 py-2">{sheet.iban}</td>
                            <td className="px-3 py-2 text-slate-400 font-sans text-[10px]">{sheet.bankName}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-900">{sheet.netSalary.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-emerald-50 rounded-lg p-3 text-[11px] text-emerald-900 border border-emerald-100 italic leading-relaxed select-none">
                  Bank advice is generated from the approved payroll snapshot. Confirm the import layout with your bank before uploading; bank schemas can differ by institution and corporate arrangement.
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t flex justify-end space-x-2">
                <button 
                  onClick={async () => {
                    const rows = payrollPayslips.filter(p => p.payrollRunId === showBankFileModal.id);
                    if (!selectedBankTemplate) { alert('Configure a bank file template in Statutory Config first.'); return; }
                    const invalidRows = rows.filter(p => !/^PK\d{2}[A-Z0-9]{20}$/i.test((p.iban || '').replace(/\s/g, '')) || !Number.isFinite(p.netSalary) || p.netSalary <= 0);
                    if (invalidRows.length) { alert(`Export blocked: ${invalidRows.length} beneficiary row(s) have an invalid Pakistan IBAN or non-positive amount.`); return; }
                    const batchReference = batchReferenceFor(showBankFileModal);
                    const file = renderExport(selectedBankTemplate, rows, { run: showBankFileModal, companyName: companyLegalName, valueDate: bankValueDate, batchReference, employees });
                    if (file.errors.length) { alert(`Bank file blocked — ${file.errors.length} problem(s):\n• ${file.errors.slice(0, 10).join('\n• ')}`); return; }
                    if (!selectedBankTemplate.verified && !window.confirm(`${file.warnings.join(' ')}\n\nDownload anyway for a test batch?`)) return;
                    const checksum = await bankAdviceChecksum(rows);
                    await onRecordBankAdvice(showBankFileModal.id, checksum, rows.length, rows.reduce((sum, row) => sum + row.netSalary, 0), selectedBankTemplate.name, { batchReference, controlHash: file.controlHash, verified: Boolean(selectedBankTemplate.verified) });
                    downloadText(file.content, file.filename);
                    setShowBankFileModal(null);
                    showToast(`Bank file generated · ${file.recordCount} rows · PKR ${file.totalAmount.toLocaleString()} · control ${file.controlHash}`);
                  }}
                  className="bg-slate-900 text-white font-semibold text-xs px-4 py-2 rounded-lg"
                >
                  Download bank file
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {documentVaultEmployee && <EmployeeDocumentVault employee={documentVaultEmployee} canManage={hasPermission('employees')} onClose={() => setDocumentVaultEmployee(null)} />}

      {/* MODAL 4: ADD ATTENDANCE LOG */}
      <AnimatePresence>
        {showAddAttendanceModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden text-xs text-left"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center flex-shrink-0">
                <span className="font-bold text-xs uppercase tracking-wider flex items-center">
                  <Calendar className="w-4 h-4 mr-1.5 text-emerald-400" /> Log Attendance Punch
                </span>
                <button onClick={() => setShowAddAttendanceModal(false)} className="text-white hover:text-slate-100 font-bold text-lg select-none">×</button>
              </div>

              <form onSubmit={handleCreateAttendanceSubmit} className="p-6 space-y-4 text-slate-700">
                <div>
                  <label className="block font-bold mb-1 text-slate-650">Select Employee:</label>
                  <select
                    aria-label="Select Employee"
                    value={newAttendanceForm.employeeId}
                    onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, employeeId: e.target.value })}
                    required
                    className="w-full p-2 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold mb-1 text-slate-650">Date:</label>
                    <DateField required
                      aria-label="Attendance Date"
                      value={newAttendanceForm.date}
                      onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, date: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-655">Punch Status:</label>
                    <select
                      aria-label="Punch Status"
                      value={newAttendanceForm.status}
                      onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, status: e.target.value as any })}
                      className="w-full p-2 bg-white border border-slate-300 rounded focus:ring-1"
                    >
                      <option value="Present">Present</option>
                      <option value="Late">Late</option>
                      <option value="Half Day">Half Day</option>
                      <option value="Absent">Absent</option>
                      <option value="On Leave">On Leave</option>
                      <option value="Holiday">Holiday</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold mb-1 text-slate-650">Punch In Time (Optional):</label>
                    <input
                      type="time"
                      aria-label="Punch In Time"
                      value={newAttendanceForm.punchIn}
                      onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, punchIn: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-650">Punch Out Time (Optional):</label>
                    <input
                      type="time"
                      aria-label="Punch Out Time"
                      value={newAttendanceForm.punchOut}
                      onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, punchOut: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-655">Attendance Method:</label>
                  <select
                    aria-label="Attendance Method"
                    value={newAttendanceForm.method}
                    onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, method: e.target.value as any })}
                    className="w-full p-2 bg-white border border-slate-300 rounded focus:ring-1"
                  >
                    <option value="Manual">Manual Entry</option>
                    <option value="Biometric">Biometric Device</option>
                    <option value="Mobile GPS">Mobile GPS Geofence</option>
                    <option value="RFID">RFID Card</option>
                    <option value="Web Punch">Web Punch</option>
                  </select>
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button 
                    type="button"
                    onClick={() => setShowAddAttendanceModal(false)}
                    className="px-4 py-2 border rounded text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow-xs"
                  >
                    Save Punch Log
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 5: ADD LEAVE LOG */}
      <AnimatePresence>
        {showAddLeaveModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden text-xs text-left"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center flex-shrink-0">
                <span className="font-bold text-xs uppercase tracking-wider flex items-center">
                  <FileText className="w-4 h-4 mr-1.5 text-emerald-400" /> Record Leave Entry
                </span>
                <button onClick={() => setShowAddLeaveModal(false)} className="text-white hover:text-slate-100 font-bold text-lg select-none">×</button>
              </div>

              <form onSubmit={handleCreateLeaveSubmit} className="p-6 space-y-4 text-slate-700">
                <div>
                  <label className="block font-bold mb-1 text-slate-650">Select Employee:</label>
                  <select
                    aria-label="Select Employee for Leave"
                    value={newLeaveForm.employeeId}
                    onChange={(e) => setNewLeaveForm({ ...newLeaveForm, employeeId: e.target.value })}
                    required
                    className="w-full p-2 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-655">Leave Type:</label>
                  <select
                    aria-label="Leave Type"
                    value={newLeaveForm.leaveType}
                    onChange={(e) => setNewLeaveForm({ ...newLeaveForm, leaveType: e.target.value as any })}
                    className="w-full p-2 bg-white border border-slate-300 rounded focus:ring-1"
                  >
                    <option value="Casual">Casual Leave</option>
                    <option value="Sick">Sick Leave</option>
                    <option value="Annual">Annual Leave</option>
                    <option value="Maternity">Maternity Leave</option>
                    <option value="Paternity">Paternity Leave</option>
                    <option value="Hajj">Hajj Leave</option>
                    <option value="Unpaid">Unpaid Leave</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold mb-1 text-slate-655">Start Date:</label>
                    <DateField required
                      aria-label="Leave Start Date"
                      value={newLeaveForm.startDate}
                      onChange={(e) => setNewLeaveForm({ ...newLeaveForm, startDate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-655">End Date:</label>
                    <DateField required
                      aria-label="Leave End Date"
                      value={newLeaveForm.endDate}
                      onChange={(e) => setNewLeaveForm({ ...newLeaveForm, endDate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-650">Reason / Description:</label>
                  <textarea required
                    aria-label="Reason / Description"
                    rows={3}
                    placeholder="Provide justification..."
                    value={newLeaveForm.reason}
                    onChange={(e) => setNewLeaveForm({ ...newLeaveForm, reason: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4 border-t">
                  <button 
                    type="button"
                    onClick={() => setShowAddLeaveModal(false)}
                    className="px-4 py-2 border rounded text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold shadow-xs"
                  >
                    Approve &amp; Log Leave
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Friendly build Guide Modal (#helpm) ── */}
      {showGuideModal && (
        <div
          className="modal-overlay"
          id="helpm"
          onClick={e => {
            if (e.target === e.currentTarget) setShowGuideModal(false);
          }}
        >
          <div className="dlg">
            <h2>{TAB_WORKFLOW_META[activeTab]?.guideTitle || `Guide for ${activeTab}`}</h2>
            <p className="sub">What this screen is for and what happens next.</p>
            <p style={{ fontSize: '13.5px', lineHeight: '1.6', color: '#334155', marginBottom: '14px' }}>
              {TAB_WORKFLOW_META[activeTab]?.guideContent}
            </p>
            <p style={{ fontSize: '12px', color: '#64748B' }}>
              Press <span className="kbd">Esc</span> to close any window. Nothing is deleted without a confirmation, and every change is logged with your name and the time.
            </p>
            <div className="ft">
              <button className="btn" onClick={() => setShowGuideModal(false)}>Cancel</button>
              <button className="btn p" onClick={() => { setShowGuideModal(false); showToast('Guide closed'); }}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Friendly build Quick Search Modal (#quick-search-modal) ── */}
      {showQuickSearch && (
        <div
          className="modal-overlay"
          id="quick-search-modal"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setShowQuickSearch(false);
              setSearchQuery('');
            }
          }}
        >
          <div className="dlg" style={{ maxWidth: '560px' }}>
            <div className="flex items-center justify-between mb-2">
              <h2>Find Anything</h2>
              <span className="text-xs text-slate-400">Press <span className="kbd">Esc</span> to close</span>
            </div>
            <p className="sub">Quickly jump to any setup screen, payroll tool, or staff record.</p>

            <div className="relative mb-3">
              <input
                type="text"
                autoFocus
                placeholder="Type to search: a person, a payslip, a setting…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-3 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-1 py-1">Pages &amp; Compliance Workflow</div>
              {searchFilteredPages.map(page => (
                <button
                  key={page.tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(page.tab);
                    setShowQuickSearch(false);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 flex items-center justify-between text-sm text-slate-800 transition"
                >
                  <span className="font-semibold text-slate-900">{page.label}</span>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{page.category}</span>
                </button>
              ))}

              {searchFilteredEmployees.length > 0 && (
                <>
                  <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-1 pt-3 pb-1">Employees</div>
                  {searchFilteredEmployees.map(emp => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        setActiveTab('employees');
                        setShowQuickSearch(false);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 flex items-center justify-between text-sm text-slate-800 transition"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{emp.fullName}</div>
                        <div className="text-xs text-slate-500">{emp.employeeCode || emp.id} • {(designations.find(d => d.id === emp.designationId)?.title || '')}</div>
                      </div>
                      <span className="chip c-g text-xs">Jump to record</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── High-Resolution Image Viewer Modal ── */}
      {viewImageModal?.open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setViewImageModal(null)}
        >
          <div
            className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 text-white">
              <div>
                <h3 className="font-bold text-sm tracking-wide flex items-center gap-2">
                  <span>{viewImageModal.title}</span>
                </h3>
                {viewImageModal.subtitle && (
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{viewImageModal.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={viewImageModal.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Open full image in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setViewImageModal(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                  title="Close viewer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body / Image Stage */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950 min-h-[300px]">
              <img
                src={viewImageModal.url}
                alt={viewImageModal.title}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-lg border border-slate-800"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = empAvatarUrl({ gender: 'Male' });
                }}
              />
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-2.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono text-[11px] truncate max-w-md">{viewImageModal.url}</span>
              <button
                type="button"
                onClick={() => setViewImageModal(null)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Friendly build Toast Notification (#toast) ── */}
      {toastMessage && (
        <div className="toast-msg" id="toast">
          {toastMessage}
        </div>
      )}

    </div>
  );
}

