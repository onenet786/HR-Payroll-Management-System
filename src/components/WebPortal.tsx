/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { empAvatarUrl } from '../utils/avatar';
import {
  Users, Calendar, CreditCard, ShieldCheck, FileText, Download, UserPlus,
  CheckCircle, AlertTriangle, Building, MapPin, Layers, Sliders, Info,
  CalendarDays, Banknote, TrendingUp, Star, Package, Briefcase, Calculator, Bell, Fingerprint,
  Database, BookOpen, Menu, X, ChevronDown, ListTree
} from 'lucide-react';
import {
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip,
  Role, UserAccount, NewUserAccount, Branch, Department, Designation, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification, Company, CompanySetupPayload, Zone, UcTown, WageType, MobileDutyAuthorization, MobileDutyType
} from '../types';
import { computePayslipDetails } from '../data/defaults';
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
import { motion, AnimatePresence } from 'motion/react';
import type { FirestoreSyncStatus } from '../App';

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

interface WebPortalProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  mobileDutyAuthorizations: MobileDutyAuthorization[];
  leaves: LeaveRequest[];
  statConfig: StatutoryConfig;
  taxSlabs: TaxSlab[];
  payrollRuns: PayrollRun[];
  payrollPayslips: Payslip[];
  onAddEmployee: (emp: Employee) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onUpdateStatConfig: (config: StatutoryConfig) => void;
  onUpdateTaxSlabs: (slabs: TaxSlab[]) => void;
  onApproveLeave: (id: string) => void;
  onRejectLeave: (id: string) => void;
  onApproveRegularization: (id: string) => void;
  onRejectRegularization: (id: string) => void;
  onCreatePayrollRun: (title: string, month: number, year: number) => void;
  onUpdatePayrollStatus: (runId: string, status: 'Approved' | 'Disbursed') => void;
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

type PortalTab = 'dashboard' | 'employees' | 'attendance' | 'leaves' | 'payroll' | 'settings' | 'company-setup' | 'master-data' | 'access' | 'maintenance' | 'holidays' | 'loans' | 'revisions' | 'performance' | 'assets' | 'recruitment' | 'gratuity' | 'notifications' | 'biometric' | 'help';
type NavGroupKey = 'people' | 'time' | 'payroll' | 'system';

export function WebPortal({
  employees,
  attendances,
  mobileDutyAuthorizations,
  leaves,
  statConfig,
  taxSlabs,
  payrollRuns,
  payrollPayslips,
  onAddEmployee,
  onUpdateEmployee,
  onUpdateStatConfig,
  onUpdateTaxSlabs,
  onApproveLeave,
  onRejectLeave,
  onApproveRegularization,
  onRejectRegularization,
  onCreatePayrollRun,
  onUpdatePayrollStatus,
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
  const closeSidebar = () => setSidebarOpen(false);
  const updateTaxSlab = (id: string, field: keyof Pick<TaxSlab, 'minIncome' | 'maxIncome' | 'baseTax' | 'percentage'>, value: number) =>
    onUpdateTaxSlabs(taxSlabs.map(slab => slab.id === id ? { ...slab, [field]: value } : slab));

  const primaryCompany = companies[0];
  const companyDisplayName = primaryCompany?.name || 'Bin Ishaq';
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
  // Older Firestore Super Admin role documents may predate manage_access.
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
    contactNumber: '0300-1234567',
    cnic: '42101-1234567-3',
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
    providentFundOptIn: true,
    providentFundRate: 5.0,
    gratuityOptIn: true,
    bankName: 'Habib Bank Limited (HBL)',
    bankAccountNumber: '12345678901234',
    iban: 'PK42HABB0012345678901234',
    eobiNumber: '1090123000',
    socialSecurityNumber: 'SS-42-000111',
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
    employeeCode: '',
    maritalStatus: 'Single'
  });

  const [editEmpForm, setEditEmpForm] = useState({
    fullName: '',
    email: '',
    contactNumber: '',
    cnic: '',
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
    providentFundOptIn: true,
    providentFundRate: 5.0,
    gratuityOptIn: true,
    bankName: '',
    bankAccountNumber: '',
    iban: '',
    eobiNumber: '',
    socialSecurityNumber: '',
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
    employeeCode: '',
    maritalStatus: 'Single'
  });

  const now = new Date();
  const [payrollMonth, setPayrollMonth] = useState(now.getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(now.getFullYear());

  // Settlement manual additions for offboarding
  const [settlementLeavesEncash, setSettlementLeavesEncash] = useState(10);

  // System country settings (defaulting to Pakistan)
  const selectedCountry = 'Pakistan';

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

  const getAutoEmployeeCode = (_branchId: string, departmentId: string) => {
    const dept = localDepartments.find(d => d.id === departmentId);
    const deptCode = dept?.code || 'GEN';
    const matchingCount = employees.filter(e => e.departmentId === departmentId).length;
    const nextSeq = String(matchingCount + 1).padStart(5, '0');
    return `BINISHAQ-${deptCode.toUpperCase()}-${nextSeq}`;
  };

  React.useEffect(() => {
    if (autoGenNewCode) {
      setNewEmpForm(prev => ({
        ...prev,
        employeeCode: getAutoEmployeeCode(prev.branchId, prev.departmentId)
      }));
    }
  }, [autoGenNewCode, newEmpForm.branchId, newEmpForm.departmentId, localDepartments, employees]);

  React.useEffect(() => {
    if (autoGenEditCode) {
      setEditEmpForm(prev => ({
        ...prev,
        employeeCode: getAutoEmployeeCode(prev.branchId, prev.departmentId)
      }));
    }
  }, [autoGenEditCode, editEmpForm.branchId, editEmpForm.departmentId, localDepartments, employees]);

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
    const masterErrors = validateEmployeeMasterSelection(newEmpForm, { branches: companyBranches, departments: localDepartments, designations: localDesignations, zones, ucTowns, wageTypes });
    if (masterErrors.length) { alert(`Please correct the employee assignment:\n• ${masterErrors.join('\n• ')}`); return; }

    const generatedCode = newEmpForm.branchId === 'b1' ? `IND-KHI-${Math.floor(100 + Math.random() * 900)}` : `IND-LHR-${Math.floor(100 + Math.random() * 900)}`;

    const selectedZone = zones.find(item => item.id === newEmpForm.zoneId);
    const selectedUcTown = ucTowns.find(item => item.id === newEmpForm.ucTownId);
    const selectedWageType = wageTypes.find(item => item.id === newEmpForm.wageTypeId);
    const newEmp: Employee = {
      id: 'emp-' + Date.now(),
      companyId: deriveEmployeeCompanyId(newEmpForm.branchId, localBranches, primaryCompany?.id),
      branchId: newEmpForm.branchId,
      departmentId: newEmpForm.departmentId,
      designationId: newEmpForm.designationId,
      employeeCode: newEmpForm.employeeCode.trim() || generatedCode,
      fullName: newEmpForm.fullName,
      email: newEmpForm.email,
      contactNumber: newEmpForm.contactNumber,
      cnic: newEmpForm.cnic,
      gender: newEmpForm.gender,
      dateOfBirth: newEmpForm.dateOfBirth,
      dateOfJoining: todayStr,
      status: 'Active',
      wageTypeId: selectedWageType?.id,
      wageType: selectedWageType?.name ?? newEmpForm.wageType,
      basicSalary: Number(newEmpForm.basicSalary),
      providentFundOptIn: newEmpForm.providentFundOptIn,
      providentFundRate: Number(newEmpForm.providentFundRate),
      gratuityOptIn: newEmpForm.gratuityOptIn,
      bankName: newEmpForm.bankName,
      bankBranchName: 'Main Corporate Branch',
      bankAccountNumber: newEmpForm.bankAccountNumber,
      iban: newEmpForm.iban,
      eobiNumber: newEmpForm.eobiNumber,
      socialSecurityNumber: newEmpForm.socialSecurityNumber,
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
      maritalStatus: newEmpForm.maritalStatus as 'Single' | 'Married' | 'Divorced' | 'Widowed'
    };

    onAddEmployee(newEmp);
    setShowAddEmpModal(false);
    // Reset
    setNewEmpForm({
      fullName: '',
      email: '',
      contactNumber: '0300-1234567',
      cnic: '42101-1234567-3',
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
      providentFundOptIn: true,
      providentFundRate: 5.0,
      gratuityOptIn: true,
      bankName: 'Habib Bank Limited (HBL)',
      bankAccountNumber: '12345678901234',
      iban: 'PK42HABB0012345678901234',
      eobiNumber: '1090123000',
      socialSecurityNumber: 'SS-42-000111',
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
      employeeCode: editEmpForm.employeeCode.trim() || editingEmployee.employeeCode,
      fullName: editEmpForm.fullName,
      email: editEmpForm.email,
      contactNumber: editEmpForm.contactNumber,
      cnic: editEmpForm.cnic,
      gender: editEmpForm.gender,
      dateOfBirth: editEmpForm.dateOfBirth,
      wageTypeId: selectedWageType?.id,
      wageType: selectedWageType?.name ?? editEmpForm.wageType,
      basicSalary: Number(editEmpForm.basicSalary),
      providentFundOptIn: editEmpForm.providentFundOptIn,
      providentFundRate: Number(editEmpForm.providentFundRate),
      gratuityOptIn: editEmpForm.gratuityOptIn,
      bankName: editEmpForm.bankName,
      bankAccountNumber: editEmpForm.bankAccountNumber,
      iban: editEmpForm.iban,
      eobiNumber: editEmpForm.eobiNumber,
      socialSecurityNumber: editEmpForm.socialSecurityNumber,
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
      maritalStatus: editEmpForm.maritalStatus as 'Single' | 'Married' | 'Divorced' | 'Widowed'
    };

    onUpdateEmployee(updatedEmp);
    setShowEditEmpModal(false);
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
      contactNumber: emp.contactNumber,
      cnic: emp.cnic,
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
      providentFundOptIn: emp.providentFundOptIn,
      providentFundRate: emp.providentFundRate,
      gratuityOptIn: emp.gratuityOptIn,
      bankName: emp.bankName,
      bankAccountNumber: emp.bankAccountNumber,
      iban: emp.iban,
      eobiNumber: emp.eobiNumber || '',
      socialSecurityNumber: emp.socialSecurityNumber || '',
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
      employeeCode: emp.employeeCode,
      maritalStatus: emp.maritalStatus || 'Single'
    });
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

  const executeOffboarding = () => {
    if (!showOffboardModal) return;
    const updated = {
      ...showOffboardModal,
      status: 'Terminated' as const
    };
    onUpdateEmployee(updated);
    
    // Calculate final settlement amount
    const completedYears = 3; // mock completed scale
    const baseBasic = resolveWageBasis(showOffboardModal, wageTypes) === 'Daily' ? showOffboardModal.basicSalary * 26 : showOffboardModal.basicSalary;
    const gratuityCalculated = showOffboardModal.gratuityOptIn 
      ? Math.round((baseBasic / 30) * statConfig.gratuityRateDaysPerYear * completedYears)
      : 0;
    const leaveEncashAmount = Math.round((baseBasic / 30) * settlementLeavesEncash);
    const finalSettlementAmount = gratuityCalculated + leaveEncashAmount;

    alert(`Offboarding complete for ${showOffboardModal.fullName}!\n` + 
          `- status updated to Exited\n` +
          `- Gratuity entitlement calculated (${completedYears} years service): PKR ${gratuityCalculated.toLocaleString()}\n` +
          `- Leave Encashment calculated (${settlementLeavesEncash} days): PKR ${leaveEncashAmount.toLocaleString()}\n` +
          `- Total Final Net Settlement to disburse: PKR ${finalSettlementAmount.toLocaleString()}`);

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

  const navGroups: Array<{
    key: NavGroupKey;
    label: string;
    icon: React.ElementType;
    items: Array<{ tab: PortalTab; label: string; icon: React.ElementType; badge?: React.ReactNode }>;
  }> = [
    {
      key: 'people', label: 'People', icon: Users,
      items: [
        { tab: 'employees', label: 'Employee Directory', icon: Users },
        { tab: 'recruitment', label: 'Recruitment', icon: Briefcase, badge: jobPostings.filter(j => j.status === 'Open').length > 0 ? `${jobPostings.filter(j => j.status === 'Open').length} open` : undefined },
        { tab: 'performance', label: 'Performance', icon: Star, badge: performanceReviews.length },
        { tab: 'assets', label: 'Asset Management', icon: Package, badge: companyAssets.length }
      ]
    },
    {
      key: 'time', label: 'Time & Attendance', icon: CalendarDays,
      items: [
        { tab: 'attendance', label: 'Attendance Logs', icon: Calendar, badge: pendingRegularizationsCount || undefined },
        { tab: 'leaves', label: 'Leave Management', icon: FileText, badge: pendingLeavesCount || undefined },
        { tab: 'holidays', label: 'Holiday Calendar', icon: CalendarDays, badge: holidays.length },
        { tab: 'biometric', label: 'Biometric Enrollment', icon: Fingerprint, badge: 'Face + Fingerprint' }
      ]
    },
    {
      key: 'payroll', label: 'Payroll & Benefits', icon: CreditCard,
      items: [
        { tab: 'payroll', label: 'Payroll Processing', icon: CreditCard },
        { tab: 'revisions', label: 'Salary Revisions', icon: TrendingUp },
        { tab: 'loans', label: 'Loans & Advances', icon: Banknote, badge: loanAdvances.filter(l => l.status === 'Pending').length > 0 ? `${loanAdvances.filter(l => l.status === 'Pending').length} pending` : undefined },
        { tab: 'gratuity', label: 'Gratuity & Settlement', icon: Calculator },
        { tab: 'settings', label: 'Statutory Config (FBR)', icon: Sliders }
      ]
    },
    {
      key: 'system', label: 'System', icon: ShieldCheck,
      items: [
        { tab: 'company-setup', label: 'Company Setup', icon: Building },
        { tab: 'master-data', label: 'Master Data', icon: ListTree },
        { tab: 'access', label: 'User Management', icon: Users, badge: users.length || undefined },
        { tab: 'maintenance', label: 'Data Backup', icon: Database },
        { tab: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.filter(n => !n.readBy.includes(loggedInUser?.employeeId || loggedInUser?.username || '')).length || undefined },
        { tab: 'help', label: 'User Guide', icon: BookOpen, badge: 'NEW' }
      ]
    }
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans" id="web-portal-root">
      
      {/* Upper Navigation Header */}
      <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-3 flex items-center justify-between gap-2 flex-shrink-0" id="web-hdr">
        {/* Hamburger — mobile only */}
        <button
          className="md:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600 flex-shrink-0"
          onClick={() => setSidebarOpen(v => !v)}
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-base sm:text-xl shadow-md shadow-emerald-200 flex-shrink-0">
            {companyDisplayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-lg text-slate-900 leading-tight truncate">{companyDisplayName} HR &amp; Payroll</h1>
            <p className="text-xs text-slate-500 font-mono hidden sm:block">Company ID: {companyCode} • Pakistan Statutory Portal</p>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Sync badge — hidden on mobile */}
          <div className="hidden lg:block text-right">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${syncBadgeClass}`}>
              ● {syncLabel}
            </span>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{firestoreSyncStatus.message}</div>
          </div>

          {/* User chip */}
          <div className="flex items-center gap-2 bg-slate-100 px-2 sm:px-3.5 py-1.5 rounded-xl border border-slate-200 select-none">
            <div className="flex flex-col text-left hidden sm:flex">
              <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wide">Signed in as</span>
              <span className="text-xs font-extrabold text-slate-800">{currentUserAccount.username}</span>
              <span className="text-[9px] text-slate-500 italic">{currentUserRole?.name || (isRoleResolving ? 'Loading…' : 'No Role')}</span>
            </div>
            <span className="text-xs font-extrabold text-slate-800 sm:hidden">{currentUserAccount.username}</span>
            <button
              onClick={onLogout}
              className="bg-slate-200 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold px-2 sm:px-2.5 py-1 rounded-md text-[10px] transition uppercase tracking-wider border border-slate-300 hover:border-rose-200 cursor-pointer whitespace-nowrap"
            >
              Logout
            </button>
          </div>

          {/* Onboard — icon-only on mobile */}
          {userPermissions.includes('manage_employees') && (
            <button
              onClick={openAddEmployee}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-2 sm:px-4 py-2 rounded-lg shadow-sm transition flex items-center space-x-1"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Onboard Staff</span>
            </button>
          )}
        </div>
      </header>

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
          className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-slate-300 flex flex-col p-4 border-r border-slate-800 transition-transform duration-300 ease-in-out
            md:static md:z-auto md:w-52 xl:w-64 md:p-3 xl:p-4 md:flex-shrink-0 md:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
          id="web-sidebar"
        >
          {/* Close button — mobile only */}
          <div className="flex items-center justify-between mb-3 md:hidden">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Menu</span>
            <button onClick={closeSidebar} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pr-1 space-y-2" aria-label="HR portal navigation">
            {hasPermission('dashboard') && (
              <button
                type="button"
                onClick={() => navigateFromSidebar('dashboard')}
                aria-current={activeTab === 'dashboard' ? 'page' : undefined}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span>Operations Dashboard</span>
              </button>
            )}

            <div className="border-t border-slate-800" />

            {navGroups.map(group => {
              const permittedItems = group.items.filter(item => hasPermission(item.tab));
              if (permittedItems.length === 0) return null;
              const isExpanded = expandedNavGroup === group.key;
              const containsActiveTab = permittedItems.some(item => item.tab === activeTab);
              const GroupIcon = group.icon;
              const panelId = `sidebar-group-${group.key}`;

              return (
                <section key={group.key} aria-labelledby={`${panelId}-toggle`}>
                  <button
                    id={`${panelId}-toggle`}
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() => setExpandedNavGroup(current => current === group.key ? null : group.key)}
                    className={`w-full min-h-10 px-3 py-2 rounded-lg flex items-center gap-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${containsActiveTab ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
                  >
                    <GroupIcon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-[11px] font-bold uppercase tracking-[0.12em]">{group.label}</span>
                    <span className="sr-only">{isExpanded ? 'Collapse' : 'Expand'} {group.label}</span>
                    <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </button>

                  {isExpanded && (
                    <div id={panelId} className="relative ml-5 mt-1 space-y-0.5 border-l border-slate-700/80 pl-2">
                      {permittedItems.map(item => {
                        const ItemIcon = item.icon;
                        const isActive = item.tab === activeTab;
                        return (
                          <button
                            key={item.tab}
                            type="button"
                            onClick={() => navigateFromSidebar(item.tab, group.key)}
                            aria-current={isActive ? 'page' : undefined}
                            className={`group/item w-full min-h-10 text-left px-2.5 py-2 rounded-md text-[12px] font-medium flex items-center gap-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${isActive ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                          >
                            <ItemIcon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-100' : 'text-slate-500 group-hover/item:text-slate-300'}`} />
                            <span className="flex-1 leading-tight">{item.label}</span>
                            {item.badge !== undefined && (
                              <span className={`shrink-0 max-w-24 truncate rounded px-1.5 py-0.5 text-[9px] font-bold leading-tight ${isActive ? 'bg-white/15 text-white' : item.tab === 'attendance' || item.tab === 'leaves' || item.tab === 'loans' ? 'bg-amber-500/15 text-amber-300' : item.tab === 'notifications' ? 'bg-rose-500/15 text-rose-300' : 'bg-slate-700 text-slate-300'}`}>
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
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
              {/* TAB 1: DASHBOARD */}
              {activeTab === 'dashboard' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                  
                  {/* Pakistan Banner notification */}
                  <div className="bg-gradient-to-r from-emerald-800 to-green-700 text-white pt-1 pb-2 px-4 rounded-lg flex flex-col md:flex-row justify-between items-start md:items-center shadow-sm shadow-emerald-950/5">
                    <div className="space-y-0">
                      <h2 className="text-sm font-bold tracking-tight">Assalam-o-Alaikum!</h2>
                      <p className="text-emerald-100 text-[10px] max-w-xl">
                        Welcome to the {companyDisplayName} corporate portal. Today is <strong>June 17, 2026</strong>.
                      </p>
                    </div>
                    <div className="mt-1.5 md:mt-0 flex space-x-1.5 bg-emerald-900/40 py-0.5 px-2 rounded border border-emerald-500/20 font-mono text-[10px]">
                      <span>Current Zone: PK (GMT+5)</span>
                    </div>
                  </div>

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
                        <h3 className="text-2xl font-bold text-slate-900">{(pendingLeavesCount + pendingRegularizationsCount)}</h3>
                        <p className="text-[11px] text-amber-500 font-semibold">{pendingLeavesCount} Leaves, {pendingRegularizationsCount} Regularizations</p>
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
                      <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wide">Recent Pending Leaves</h3>
                      
                      <div className="space-y-3">
                        {leaves.filter(l => l.status === 'Pending').length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-6">No pending leaves remaining to review.</p>
                        ) : (
                          leaves.filter(l => l.status === 'Pending').slice(0, 3).map(lv => {
                            const emp = employees.find(e => e.id === lv.employeeId) || employees.find(e => e.fullName.toLowerCase().includes('aqeel'));
                            return (
                              <div key={lv.id} className="p-3 bg-amber-50/50 border border-amber-205/55 rounded-lg space-y-2 text-xs">
                                <div className="flex justify-between font-bold">
                                  <span className="text-slate-800">{emp?.fullName || 'Employee'}</span>
                                  <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-mono">{lv.leaveType}</span>
                                </div>
                                <p className="text-slate-505 italic">"{lv.reason}"</p>
                                <p className="text-[10px] text-slate-400">Period: {lv.startDate} to {lv.endDate} ({lv.totalDays} Days)</p>
                                
                                <div className="flex space-x-2 pt-1.5 border-t border-slate-200/50 justify-end">
                                  {userPermissions.includes('manage_leaves') && (
                                    <>
                                      <button 
                                        onClick={() => onRejectLeave(lv.id)}
                                        className="px-2 py-1 border border-slate-300 hover:bg-slate-100 rounded text-slate-700 font-medium"
                                      >
                                        Reject
                                      </button>
                                      <button 
                                        onClick={() => onApproveLeave(lv.id)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium shadow-xs"
                                      >
                                        Approve
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
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
                                      <img 
                                        src={empAvatarUrl(emp)}
                                        alt={emp.fullName} 
                                        className="w-9 h-9 rounded-full object-cover border border-slate-200" 
                                      />
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
                                      onClick={() => openEditEmployee(emp)}
                                      className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded border border-indigo-200 transition cursor-pointer"
                                    >
                                      Edit Record
                                    </button>
                                    {emp.status === 'Active' ? (
                                      <button 
                                        onClick={() => {
                                          setShowOffboardModal(emp);
                                          setSettlementLeavesEncash(12);
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
                            <input type="date" required value={mobileDutyForm.validFrom} onChange={e => setMobileDutyForm(p => ({ ...p, validFrom: e.target.value }))} className="rounded-lg border border-indigo-200 bg-white p-2 text-xs" aria-label="Mobile duty valid from" />
                            <input type="date" required value={mobileDutyForm.validTo} onChange={e => setMobileDutyForm(p => ({ ...p, validTo: e.target.value }))} className="rounded-lg border border-indigo-200 bg-white p-2 text-xs" aria-label="Mobile duty valid to" />
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
                                    <p className="text-slate-600"><strong>Requested Status:</strong> Present &amp; Regularized</p>
                                    <p className="text-slate-550 italic bg-amber-50/50 p-2 rounded">
                                      "Reason: {att.regularizationReason || 'Forgot card contact error'}"
                                    </p>
                                    <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                                      <button 
                                        onClick={() => onRejectRegularization(att.id)}
                                        className="px-2.5 py-1 text-slate-600 border border-slate-355 hover:bg-slate-100 rounded"
                                      >
                                        Decline
                                      </button>
                                      <button 
                                        onClick={() => onApproveRegularization(att.id)}
                                        className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold shadow-xs flex items-center"
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
                              <input
                                type="date"
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
                            <input
                              type="date"
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
                      <button 
                        onClick={() => onCreatePayrollRun(`Payroll - ${new Date(payrollYear, payrollMonth - 1).toLocaleString('en-PK', { month: 'long', year: 'numeric' })}`, payrollMonth, payrollYear)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-lg flex items-center space-x-1 shadow transition"
                      >
                        <span>Run New Payroll Cycle</span>
                      </button>
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
                                <span className="font-bold text-slate-900">{run.title}</span>
                                <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[10px]">
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
                              
                              <div className="border-t border-slate-200 pt-2 flex justify-between space-x-1.5 text-[11px]">
                                <button 
                                  onClick={() => setShowBankFileModal(run)}
                                  className="text-emerald-750 hover:underline flex items-center"
                                >
                                  <Download className="w-3 h-3 mr-0.5" /> Bank Advice File
                                </button>
                                {run.status === 'Draft' && <button onClick={() => onUpdatePayrollStatus(run.id, 'Approved')} className="text-blue-700 hover:underline">Approve</button>}
                                {run.status === 'Approved' && <button onClick={() => onUpdatePayrollStatus(run.id, 'Disbursed')} className="text-emerald-700 hover:underline">Mark Disbursed</button>}
                              </div>
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
                                emp, payrollMonth, payrollYear, attendances, leaves, statConfig, taxSlabs, departments, designations, branches, loanAdvances, wageTypes
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
                  
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">FBR Individual Tax Slabs settings</h2>
                      <p className="text-xs text-slate-500">Easily update tax matrices annually without code migration</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Tax slabs table editor */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">Current FBR Income Tax Slabs Table</h3>
                      
                      <div className="space-y-3">
                        {taxSlabs.map((slab, idx) => (
                          <div key={slab.id} className="flex space-x-3 items-center bg-slate-50 p-2.5 rounded-lg text-xs font-mono">
                            <span className="font-bold text-slate-400">Slab #{idx + 1}</span>
                            <div className="flex-1 grid grid-cols-3 gap-2">
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Min Annual (PKR):</span>
                                <input aria-label={`Slab ${idx + 1} minimum`} type="number" value={slab.minIncome} onChange={e => updateTaxSlab(slab.id, 'minIncome', Number(e.target.value))} className="w-full font-bold bg-white border border-slate-200 rounded px-1 py-0.5" />
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Max Annual (PKR):</span>
                                <input aria-label={`Slab ${idx + 1} maximum`} type="number" value={slab.maxIncome} onChange={e => updateTaxSlab(slab.id, 'maxIncome', Number(e.target.value))} className="w-full font-bold bg-white border border-slate-200 rounded px-1 py-0.5" />
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Formula:</span>
                                <div className="flex gap-1"><input aria-label={`Slab ${idx + 1} base tax`} type="number" value={slab.baseTax} onChange={e => updateTaxSlab(slab.id, 'baseTax', Number(e.target.value))} className="w-2/3 font-bold bg-white border border-slate-200 rounded px-1 py-0.5" /><input aria-label={`Slab ${idx + 1} percentage`} type="number" step="0.01" value={slab.percentage} onChange={e => updateTaxSlab(slab.id, 'percentage', Number(e.target.value))} className="w-1/3 font-bold bg-white border border-slate-200 rounded px-1 py-0.5" /></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-slate-50 p-4 rounded-lg text-xs text-slate-500 border border-dashed border-slate-300">
                        Slab parameters automatically recalculate basic payroll registers on fly. You can safely simulate different fiscal year slabs.
                      </div>
                    </div>

                    {/* EOBI & Social Security Config */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">Regional Contribution Configurations</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Tax year / effective date:</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input aria-label="FBR tax year" value={statConfig.taxYear || ''} onChange={e => onUpdateStatConfig({ ...statConfig, taxYear: e.target.value, updatedAt: new Date().toISOString() })} placeholder="2027" className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
                            <input aria-label="Statutory effective from" type="date" value={statConfig.effectiveFrom || ''} onChange={e => onUpdateStatConfig({ ...statConfig, effectiveFrom: e.target.value, updatedAt: new Date().toISOString() })} className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
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
                            value={statConfig.minimumWage}
                            onChange={(e) => onUpdateStatConfig({ ...statConfig, minimumWage: Number(e.target.value) })}
                            className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400">EOBI calculations are mathematically bound to 1% employee / 5% employer of this constant.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Provincial social security employer %:</label>
                          <div className="grid grid-cols-2 gap-2">
                            {(['Punjab', 'Sindh', 'KPK', 'Balochistan'] as const).map(province => <label key={province} className="text-[10px] text-slate-500">{province}<input type="number" min="0" step="0.01" value={statConfig.provincialSocialSecurityRates?.[province] ?? statConfig.pessiEmployerRate} onChange={e => onUpdateStatConfig({ ...statConfig, provincialSocialSecurityRates: { ...statConfig.provincialSocialSecurityRates, [province]: Number(e.target.value) }, updatedAt: new Date().toISOString() })} className="mt-1 w-full text-xs font-mono p-2 border border-slate-300 rounded" /></label>)}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Social security wage ceiling (PKR):</label>
                          <input type="number" value={statConfig.socialSecurityWageCeiling || 0} onChange={e => onUpdateStatConfig({ ...statConfig, socialSecurityWageCeiling: Number(e.target.value), updatedAt: new Date().toISOString() })} className="w-full text-xs font-mono p-2 border border-slate-300 rounded" />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Gratuity Entitlement rate (annual):</label>
                          <input
                            type="number"
                            aria-label="Gratuity Entitlement Rate (annual days)"
                            min="1"
                            max="365"
                            value={statConfig.gratuityRateDaysPerYear}
                            onChange={(e) => onUpdateStatConfig({ ...statConfig, gratuityRateDaysPerYear: Number(e.target.value) })}
                            className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400">Days of basic salary earned per completed year of employment on exit clearance.</span>
                        </div>
                      </div>
                    </div>

                  </div>

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
                            alert('Success: Firebase Authentication account and HR profile created.');
                          } catch (error) {
                            const code = typeof error === 'object' && error && 'code' in error
                              ? String((error as { code?: unknown }).code)
                              : '';
                            const message = code === 'auth/email-already-in-use'
                              ? 'An Authentication account already uses this email.'
                              : code === 'auth/weak-password'
                                ? 'Firebase rejected this password as too weak.'
                                : 'Unable to create the user account. No partial HR profile was saved.';
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
                            <span className="mt-1 block text-[10px] font-normal text-slate-400">Email changes require a separate Firebase Auth workflow.</span>
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
                    onAddSettlement={onAddGratuitySettlement}
                    onUpdateSettlement={onUpdateGratuitySettlement}
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
                    title="Bin Ishaq HR Suite — User Guide"
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
                        placeholder="e.g. ahmed@binishaq.com"
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
                          placeholder="e.g. BINISHAQ-HR-00001"
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
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Mobile Contact:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Mobile Contact Number"
                        placeholder="e.g. 0300-1234567"
                        value={newEmpForm.contactNumber}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, contactNumber: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
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
                      <input
                        type="date" required
                        aria-label="Date of Birth"
                        value={newEmpForm.dateOfBirth}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, dateOfBirth: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Picture URL / Upload:</span>
                      </label>
                      <div className="flex space-x-2 items-center h-9">
                        <input
                          type="text"
                          aria-label="Picture URL"
                          placeholder="e.g. https://domain.com/pic.jpg"
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
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Basic Monthly Wage / Daily Rate (PKR):</span>
                      </label>
                      <input
                        type="number" required
                        aria-label="Basic Monthly Wage / Daily Rate (PKR)"
                        placeholder="e.g. 85000"
                        value={newEmpForm.basicSalary}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, basicSalary: Number(e.target.value) })}
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
                        <div className="h-8 text-[11px] text-slate-400 italic flex items-center">EOBI Disabled</div>
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
                        placeholder="e.g. ahmed@binishaq.com"
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
                          placeholder="e.g. BINISHAQ-HR-00001"
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
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div>
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Mobile Contact:</span>
                      </label>
                      <input
                        type="text" required
                        aria-label="Mobile Contact Number"
                        placeholder="e.g. 0300-1234567"
                        value={editEmpForm.contactNumber}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, contactNumber: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg font-mono text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none placeholder:text-slate-400"
                      />
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
                      <input
                        type="date" required
                        aria-label="Date of Birth"
                        value={editEmpForm.dateOfBirth}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, dateOfBirth: e.target.value })}
                        className="w-full h-9 px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-start">
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Picture URL / Upload:</span>
                      </label>
                      <div className="flex space-x-2 items-center h-9">
                        <input
                          type="text"
                          aria-label="Picture URL"
                          placeholder="e.g. https://domain.com/pic.jpg"
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
                      <label className="block font-bold mb-1 text-slate-700 font-sans text-xs min-h-[1.25rem] flex items-center justify-between">
                        <span>Basic Monthly Wage / Daily Rate (PKR):</span>
                      </label>
                      <input
                        type="number" required
                        aria-label="Basic Monthly Wage / Daily Rate (PKR)"
                        placeholder="e.g. 85000"
                        value={editEmpForm.basicSalary}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, basicSalary: Number(e.target.value) })}
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
                        <div className="h-8 text-[11px] text-slate-400 italic flex items-center">EOBI Disabled</div>
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
                      const completedYears = 3; // mock scale
                      const gratuityCalculated = showOffboardModal.gratuityOptIn 
                        ? Math.round((baseBasic / 30) * statConfig.gratuityRateDaysPerYear * completedYears)
                        : 0;
                      const leaveEncashAmount = Math.round((baseBasic / 30) * settlementLeavesEncash);
                      const totalSettlement = gratuityCalculated + leaveEncashAmount;

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
                            <span className="text-slate-500">Basic Pay:</span>
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
                            <span className="text-slate-500">FBR Income Tax:</span>
                            <div className="flex items-center space-x-1">
                              <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${payslipEmp?.fbrEnabled !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-850'}`}>
                                {payslipEmp?.fbrEnabled !== false ? 'FBR: Active' : 'FBR: Exempt'}
                              </span>
                              <span className="text-rose-700 font-bold">-{showPayslipModal.incomeTaxDeduction.toLocaleString()} PKR</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">EOBI Employee:</span>
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
                              <span className="text-slate-500">Unpaid Leaves:</span>
                              <span className="text-rose-700">-{showPayslipModal.unpaidLeaveDeduction.toLocaleString()} PKR</span>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })()}

                {/* Subtotals & Net Pay */}
                <div className="border-t border-slate-200 mt-4 pt-4 space-y-2 select-none">
                  <div className="flex justify-between font-mono text-xs">
                    <span className="text-slate-500">Calculated Gross:</span>
                    <span className="text-slate-800 font-bold">{showPayslipModal.grossSalary.toLocaleString()} PKR</span>
                  </div>
                  <div className="flex justify-between font-mono text-xs text-rose-800">
                    <span>Total Deducted:</span>
                    <span>-{showPayslipModal.totalDeductions.toLocaleString()} PKR</span>
                  </div>
                  <div className="flex justify-between bg-emerald-50 text-emerald-900 font-bold p-3.5 rounded-lg text-lg border border-emerald-100 shadow-inner">
                    <span>Net Take-home pay:</span>
                    <span className="font-mono">{showPayslipModal.netSalary.toLocaleString()} PKR</span>
                  </div>
                </div>

                {/* Audit & declaration compliance footnote */}
                <div className="bg-slate-50 p-2.5 rounded-lg text-[10px] text-slate-400 font-serif leading-relaxed mt-4 border-t">
                  * Generated by {companyLegalName} under the Shops &amp; Establishments Ordinance. Salary disbursed directly via automated HBL bulk online bank advice file. Fully compliant values.
                </div>

              </div>

              <div className="px-6 py-4 bg-slate-50 border-t flex justify-between items-center">
                <button
                  onClick={() => setShowPayslipModal(null)}
                  className="text-slate-500 hover:text-slate-700 text-xs font-semibold px-4 py-2 rounded border border-slate-300 hover:bg-slate-100 transition"
                >
                  Close
                </button>
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
                  onClick={() => {
                    const rows = payrollPayslips.filter(p => p.payrollRunId === showBankFileModal.id);
                    const csvCell = (value: string | number | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
                    const csv = [
                      ['Employee Code', 'Beneficiary Name', 'Bank', 'IBAN', 'Account Number', 'Net Amount PKR'].map(csvCell).join(','),
                      ...rows.map(p => [p.employeeCode, p.employeeName, p.bankName, p.iban, p.bankAccountNumber, p.netSalary].map(csvCell).join(','))
                    ].join('\r\n');
                    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `bank-advice-${showBankFileModal.periodYear}-${String(showBankFileModal.periodMonth).padStart(2, '0')}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                    setShowBankFileModal(null);
                  }}
                  className="bg-slate-900 text-white font-semibold text-xs px-4 py-2 rounded-lg"
                >
                  Download Bank Advice Flat File (Excel/CSV)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                    <input
                      type="date" required
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
                    <input
                      type="date" required
                      aria-label="Leave Start Date"
                      value={newLeaveForm.startDate}
                      onChange={(e) => setNewLeaveForm({ ...newLeaveForm, startDate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-655">End Date:</label>
                    <input
                      type="date" required
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

    </div>
  );
}

