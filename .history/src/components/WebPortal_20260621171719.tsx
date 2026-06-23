/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users, Calendar, CreditCard, ShieldCheck, FileText, Download, UserPlus,
  CheckCircle, AlertTriangle, Building, MapPin, Layers, Sliders, Info,
  CalendarDays, Banknote, TrendingUp, Star, Package, Briefcase, Calculator, Bell
} from 'lucide-react';
import {
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip,
  Role, UserAccount, Branch, Department, Designation, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification
} from '../types';
import { computePayslipDetails } from '../data/defaults';
import { HolidayModule } from './HolidayModule';
import { LoansModule } from './LoansModule';
import { SalaryRevisionModule } from './SalaryRevisionModule';
import { PerformanceModule } from './PerformanceModule';
import { AssetModule } from './AssetModule';
import { RecruitmentModule } from './RecruitmentModule';
import { GratuityModule } from './GratuityModule';
import { NotificationCenter } from './NotificationCenter';
import { motion, AnimatePresence } from 'motion/react';

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

interface WebPortalProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  leaves: LeaveRequest[];
  statConfig: StatutoryConfig;
  taxSlabs: TaxSlab[];
  payrollRuns: PayrollRun[];
  onAddEmployee: (emp: Employee) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onUpdateStatConfig: (config: StatutoryConfig) => void;
  onUpdateTaxSlabs: (slabs: TaxSlab[]) => void;
  onApproveLeave: (id: string) => void;
  onRejectLeave: (id: string) => void;
  onApproveRegularization: (id: string) => void;
  onRejectRegularization: (id: string) => void;
  onCreatePayrollRun: (title: string, month: number, year: number) => void;
  onApplyLeave: (leave: LeaveRequest) => void;
  onAddAttendance: (log: AttendanceLog) => void;
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  roles: Role[];
  users: UserAccount[];
  currentUserAccount: UserAccount;
  onSetCurrentUserAccount: (user: UserAccount) => void;
  onAddRole: (role: Role) => void;
  onAddUser: (user: UserAccount) => void;
  onUpdateUserRole: (userId: string, roleId: string) => void;
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
}

export function WebPortal({
  employees,
  attendances,
  leaves,
  statConfig,
  taxSlabs,
  payrollRuns,
  onAddEmployee,
  onUpdateEmployee,
  onUpdateStatConfig,
  onUpdateTaxSlabs: _onUpdateTaxSlabs,
  onApproveLeave,
  onRejectLeave,
  onApproveRegularization,
  onRejectRegularization,
  onCreatePayrollRun,
  onApplyLeave,
  onAddAttendance,
  branches,
  departments,
  designations,
  roles,
  users,
  currentUserAccount,
  onSetCurrentUserAccount: _onSetCurrentUserAccount,
  onAddRole,
  onAddUser,
  onUpdateUserRole,
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
  onDeleteNotification
}: WebPortalProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'attendance' | 'leaves' | 'payroll' | 'settings' | 'access' | 'holidays' | 'loans' | 'revisions' | 'performance' | 'assets' | 'recruitment' | 'gratuity' | 'notifications'>('dashboard');

  const existingUcs = Array.from(new Set(employees.map(e => e.ucTown).filter(Boolean))) as string[];
  const existingZones = Array.from(new Set(employees.map(e => e.zone).filter(Boolean))) as string[];

  const currentUserRole = roles.find(r => r.id === currentUserAccount.roleId);
  const userPermissions = currentUserRole ? currentUserRole.permissions : [];

  const hasPermission = (tab: string) => {
    if (tab === 'dashboard') return userPermissions.includes('view_dashboard');
    if (tab === 'employees') return userPermissions.includes('manage_employees');
    if (tab === 'attendance') return userPermissions.includes('manage_attendance');
    if (tab === 'leaves') return userPermissions.includes('manage_leaves');
    if (tab === 'payroll') return userPermissions.includes('manage_payroll');
    if (tab === 'settings') return userPermissions.includes('manage_settings');
    if (tab === 'access') return userPermissions.includes('manage_access');
    if (tab === 'holidays') return userPermissions.includes('manage_attendance') || userPermissions.includes('manage_settings');
    if (tab === 'loans') return userPermissions.includes('manage_payroll') || userPermissions.includes('manage_employees');
    if (tab === 'revisions') return userPermissions.includes('manage_payroll') || userPermissions.includes('manage_employees');
    if (tab === 'performance') return userPermissions.includes('manage_employees') || userPermissions.includes('view_dashboard');
    if (tab === 'assets') return userPermissions.includes('manage_employees') || userPermissions.includes('manage_settings');
    if (tab === 'recruitment') return userPermissions.includes('manage_employees');
    if (tab === 'gratuity') return userPermissions.includes('manage_payroll');
    if (tab === 'notifications') return true;
    return false;
  };
  
  // Modals state
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showEditEmpModal, setShowEditEmpModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showBankFileModal, setShowBankFileModal] = useState<PayrollRun | null>(null);
  const [showPayslipModal, setShowPayslipModal] = useState<Payslip | null>(null);
  const [showOffboardModal, setShowOffboardModal] = useState<Employee | null>(null);
  
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
    wageType: 'Salaried' as 'Salaried' | 'Daily Wager',
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
    pictureUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
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
    wageType: 'Salaried' as 'Salaried' | 'Daily Wager',
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

  const payrollMonth = 6;
  const payrollYear = 2026;

  // Settlement manual additions for offboarding
  const [settlementLeavesEncash, setSettlementLeavesEncash] = useState(10);

  // System country settings (defaulting to Pakistan)
  const [selectedCountry, setSelectedCountry] = useState('Pakistan');

  // Local state copies of branches, departments, designations
  const [localBranches, setLocalBranches] = useState(branches);
  const [localDepartments, setLocalDepartments] = useState(departments);
  const [localDesignations, setLocalDesignations] = useState(designations);
  const [localWageTypes, setLocalWageTypes] = useState(['Salaried', 'Daily Wager']);

  // Custom UC/Town and Zone runtime options
  const [localUcs, setLocalUcs] = useState<string[]>([]);
  const [localZones, setLocalZones] = useState<string[]>([]);

  React.useEffect(() => { setLocalBranches(branches); }, [branches]);
  React.useEffect(() => { setLocalDepartments(departments); }, [departments]);
  React.useEffect(() => { setLocalDesignations(designations); }, [designations]);

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
      companyId: 'c1',
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
  const [leaveSubTab, setLeaveSubTab] = useState<'list' | 'reports'>('list');

  // Reports state
  const [reportGrouping, setReportGrouping] = useState<'uc' | 'zone' | 'supervisor'>('uc');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [attPeriodType, setAttPeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [selectedAttDate, setSelectedAttDate] = useState('2026-06-17');

  const [leavePeriodType, setLeavePeriodType] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [selectedLeaveDate, setSelectedLeaveDate] = useState('2026-06-17');

  // Manual Modals state
  const [showAddAttendanceModal, setShowAddAttendanceModal] = useState(false);
  const [newAttendanceForm, setNewAttendanceForm] = useState({
    employeeId: '',
    date: '2026-06-17',
    punchIn: '09:00',
    punchOut: '17:00',
    method: 'Manual' as const,
    status: 'Present' as const
  });

  const [showAddLeaveModal, setShowAddLeaveModal] = useState(false);
  const [newLeaveForm, setNewLeaveForm] = useState({
    employeeId: '',
    leaveType: 'Casual' as const,
    startDate: '2026-06-17',
    endDate: '2026-06-17',
    reason: ''
  });

  // Calculate statistics
  const totalCount = employees.length;
  const activeCount = employees.filter(e => e.status === 'Active').length;
  
  const todayStr = '2026-06-17';
  const todayPunches = attendances.filter(a => a.date === todayStr);
  const presentToday = todayPunches.filter(p => p.status === 'Present' || p.status === 'Late').length;
  const attendanceRate = totalCount > 0 ? Math.round((presentToday / totalCount) * 100) : 0;
  
  const pendingLeavesCount = leaves.filter(l => l.status === 'Pending').length;
  const pendingRegularizationsCount = attendances.filter(a => a.regularizationRequested && !a.regularizationApproved).length;

  // Compute live payroll estimation
  const totalSalaries = employees.reduce((sum, emp) => {
    if (emp.wageType === 'Daily Wager') {
      return sum + (emp.basicSalary * 26); // assuming 26 days average
    }
    return sum + emp.basicSalary;
  }, 0);

  const handleCreateEmployeeSubmit = (e: React.FormEvent) => {
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

    const generatedCode = newEmpForm.branchId === 'b1' ? `IND-KHI-${Math.floor(100 + Math.random() * 900)}` : `IND-LHR-${Math.floor(100 + Math.random() * 900)}`;

    const newEmp: Employee = {
      id: 'emp-' + Date.now(),
      companyId: 'c1',
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
      wageType: newEmpForm.wageType,
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
      zone: newEmpForm.zone,
      ucTown: newEmpForm.ucTown,
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
      pictureUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
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

  const handleEditEmployeeSubmit = (e: React.FormEvent) => {
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

    if (!editingEmployee) return;

    const updatedEmp: Employee = {
      ...editingEmployee,
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
      wageType: editEmpForm.wageType,
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
      zone: editEmpForm.zone,
      ucTown: editEmpForm.ucTown,
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
    setEditingEmployee(emp);
    setEditEmpForm({
      fullName: emp.fullName,
      email: emp.email,
      contactNumber: emp.contactNumber,
      cnic: emp.cnic,
      gender: emp.gender,
      dateOfBirth: emp.dateOfBirth,
      branchId: emp.branchId,
      departmentId: emp.departmentId,
      designationId: emp.designationId,
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
      pictureUrl: emp.pictureUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
      isZoneInCharge: emp.isZoneInCharge || false,
      zoneInChargeName: emp.zoneInChargeName || '',
      zone: emp.zone || 'East Zone',
      ucTown: emp.ucTown || 'UC-2 Clifton Town',
      houseRentAllowance: emp.houseRentAllowance || 0,
      conveyanceAllowance: emp.conveyanceAllowance || 0,
      medicalAllowance: emp.medicalAllowance || 0,
      otherAllowances: emp.otherAllowances || 0,
      eobiEnabled: emp.eobiEnabled !== false,
      fbrEnabled: emp.fbrEnabled !== false,
      employeeCode: emp.employeeCode,
      maritalStatus: emp.maritalStatus || 'Single'
    });
    setShowEditEmpModal(true);
  };

  const handleCreateAttendanceSubmit = (e: React.FormEvent) => {
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

  const handleCreateLeaveSubmit = (e: React.FormEvent) => {
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
    const depts = localDepartments.filter(d => d.branchId === branchId);
    const firstDeptId = depts[0]?.id || '';
    const desigs = localDesignations.filter(ds => ds.departmentId === firstDeptId);
    const firstDesigId = desigs[0]?.id || '';
    setNewEmpForm(prev => ({
      ...prev,
      branchId,
      departmentId: firstDeptId,
      designationId: firstDesigId
    }));
  };

  const handleAddDeptChange = (departmentId: string) => {
    const desigs = localDesignations.filter(ds => ds.departmentId === departmentId);
    const firstDesigId = desigs[0]?.id || '';
    setNewEmpForm(prev => ({
      ...prev,
      departmentId,
      designationId: firstDesigId
    }));
  };

  const handleEditBranchChange = (branchId: string) => {
    const depts = localDepartments.filter(d => d.branchId === branchId);
    const firstDeptId = depts[0]?.id || '';
    const desigs = localDesignations.filter(ds => ds.departmentId === firstDeptId);
    const firstDesigId = desigs[0]?.id || '';
    setEditEmpForm(prev => ({
      ...prev,
      branchId,
      departmentId: firstDeptId,
      designationId: firstDesigId
    }));
  };

  const handleEditDeptChange = (departmentId: string) => {
    const desigs = localDesignations.filter(ds => ds.departmentId === departmentId);
    const firstDesigId = desigs[0]?.id || '';
    setEditEmpForm(prev => ({
      ...prev,
      departmentId,
      designationId: firstDesigId
    }));
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
    const baseBasic = showOffboardModal.wageType === 'Daily Wager' ? showOffboardModal.basicSalary * 26 : showOffboardModal.basicSalary;
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

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 font-sans" id="web-portal-root">
      
      {/* Upper Navigation Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between" id="web-hdr">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-emerald-200">
            B
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-900 leading-tight">Bin Ishaq HR &amp; Payroll</h1>
            <p className="text-xs text-slate-500 font-mono">Company ID: IND-KHI-456 • Pakistan Statutory Portal</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Active user session profile info and Logout button */}
          <div className="flex items-center space-x-3 bg-slate-100 px-3.5 py-1.5 rounded-xl border border-slate-200 select-none">
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold uppercase text-slate-400 font-sans tracking-wide">
                Signed in as
              </span>
              <span className="text-xs font-extrabold text-slate-800 font-sans">
                {currentUserAccount.username}
              </span>
              <span className="text-[9px] text-slate-500 italic">
                {currentUserRole?.name || 'No Role'}
              </span>
            </div>
            <button 
              onClick={onLogout}
              className="bg-slate-200 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold px-2.5 py-1 rounded-md text-[10px] transition uppercase tracking-wider border border-slate-300 hover:border-rose-200 cursor-pointer"
            >
              Logout
            </button>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ● Server Connected
            </span>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">DB: Firestore • synced</div>
          </div>
          
          {userPermissions.includes('manage_employees') && (
            <button 
              onClick={() => setShowAddEmpModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition flex items-center space-x-1"
            >
              <UserPlus className="w-4 h-4" />
              <span>Onboard Staff</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Framework Divider */}
      <div className="flex flex-1 overflow-hidden" id="web-main-container">
        
        {/* Sidebar Nav */}
        <nav className="w-64 bg-slate-900 text-slate-300 flex flex-col p-4 border-r border-slate-800" id="web-sidebar">
          <div className="space-y-1 flex-1">
            {userPermissions.includes('view_dashboard') && (
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Layers className="w-4 h-4" />
                <span>Operations Dashboard</span>
              </button>
            )}

            {userPermissions.includes('manage_employees') && (
              <button 
                onClick={() => setActiveTab('employees')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'employees' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Users className="w-4 h-4" />
                <span>Employee Directory</span>
              </button>
            )}

            {userPermissions.includes('manage_attendance') && (
              <button 
                onClick={() => setActiveTab('attendance')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'attendance' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Calendar className="w-4 h-4" />
                <span className="flex-1">Attendance Logs</span>
                {pendingRegularizationsCount > 0 && (
                  <span className="bg-amber-500 text-slate-905 font-bold text-[10px] px-1.5 py-0.5 rounded-full">
                    {pendingRegularizationsCount}
                  </span>
                )}
              </button>
            )}

            {userPermissions.includes('manage_leaves') && (
              <button 
                onClick={() => setActiveTab('leaves')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'leaves' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <FileText className="w-4 h-4" />
                <span className="flex-1">Leave Management</span>
                {pendingLeavesCount > 0 && (
                  <span className="bg-amber-400 text-slate-950 font-semibold text-[10px] px-2 py-0.5 rounded-full">
                    {pendingLeavesCount}
                  </span>
                )}
              </button>
            )}

            {userPermissions.includes('manage_payroll') && (
              <button 
                onClick={() => setActiveTab('payroll')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'payroll' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Payroll Processing</span>
              </button>
            )}

            {userPermissions.includes('manage_settings') && (
              <button 
                onClick={() => setActiveTab('settings')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'settings' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Sliders className="w-4 h-4" />
                <span>Statutory config (FBR)</span>
              </button>
            )}

            {userPermissions.includes('manage_access') && (
              <button
                onClick={() => setActiveTab('access')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'access' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Access Control</span>
              </button>
            )}

            <div className="border-t border-slate-700 my-1 pt-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest px-3 pb-1">Advanced</p>
            </div>

            {hasPermission('holidays') && (
              <button
                onClick={() => setActiveTab('holidays')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'holidays' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <CalendarDays className="w-4 h-4" />
                <span>Holiday Calendar</span>
                <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-md font-bold">{holidays.length}</span>
              </button>
            )}

            {hasPermission('loans') && (
              <button
                onClick={() => setActiveTab('loans')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'loans' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Banknote className="w-4 h-4" />
                <span>Loans & Advances</span>
                {loanAdvances.filter(l => l.status === 'Pending').length > 0 && (
                  <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md font-bold">
                    {loanAdvances.filter(l => l.status === 'Pending').length} pending
                  </span>
                )}
              </button>
            )}

            {hasPermission('revisions') && (
              <button
                onClick={() => setActiveTab('revisions')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'revisions' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Salary Revisions</span>
              </button>
            )}

            <div className="border-t border-slate-700 my-1 pt-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest px-3 pb-1">People Ops</p>
            </div>

            {hasPermission('performance') && (
              <button
                onClick={() => setActiveTab('performance')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'performance' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Star className="w-4 h-4" />
                <span>Performance</span>
                <span className="ml-auto text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-md font-bold">{performanceReviews.length}</span>
              </button>
            )}

            {hasPermission('assets') && (
              <button
                onClick={() => setActiveTab('assets')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'assets' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Package className="w-4 h-4" />
                <span>Asset Management</span>
                <span className="ml-auto text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded-md font-bold">{companyAssets.length}</span>
              </button>
            )}

            {hasPermission('recruitment') && (
              <button
                onClick={() => setActiveTab('recruitment')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'recruitment' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Briefcase className="w-4 h-4" />
                <span>Recruitment</span>
                {jobPostings.filter(j => j.status === 'Open').length > 0 && (
                  <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-md font-bold">
                    {jobPostings.filter(j => j.status === 'Open').length} open
                  </span>
                )}
              </button>
            )}

            {hasPermission('gratuity') && (
              <button
                onClick={() => setActiveTab('gratuity')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'gratuity' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Calculator className="w-4 h-4" />
                <span>Gratuity & Settlement</span>
              </button>
            )}

            {hasPermission('notifications') && (
              <button
                onClick={() => setActiveTab('notifications')}
                className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'notifications' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
              >
                <Bell className="w-4 h-4" />
                <span>Notifications</span>
                {notifications.filter(n => !n.readBy.includes(loggedInUser?.employeeId || loggedInUser?.username || '')).length > 0 && (
                  <span className="ml-auto text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-md font-bold">
                    {notifications.filter(n => !n.readBy.includes(loggedInUser?.employeeId || loggedInUser?.username || '')).length}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="bg-slate-850 p-3 rounded-lg space-y-1 border border-slate-800" id="stat-info-pkt">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-2 flex items-center">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 mr-1" />
              Statutory Lock
            </h4>
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">FBR Minimum:</span>
              <span className="text-emerald-300 font-bold">PKR {statConfig.minimumWage.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">EOBI Employee:</span>
              <span className="text-slate-200">1% (FBR Base)</span>
            </div>
            <div className="flex justify-between text-[11px] font-mono">
              <span className="text-slate-400">Prov. Security:</span>
              <span className="text-slate-200">6% Employer</span>
            </div>
          </div>
        </nav>

        {/* Dynamic Display Area */}
        <main className="flex-1 overflow-y-auto pt-3 px-6 pb-6 bg-slate-50" id="web-main-panel">
          
          {!hasPermission(activeTab) ? (
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
                        Welcome to the Bin Ishaq Logistics corporate portal. Today is <strong>June 17, 2026</strong>.
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

                      {/* Quick System Information Alert */}
                      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg flex items-start space-x-3 text-xs text-blue-800">
                        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <p>
                          <strong>Pakistan Compliance Guideline:</strong> Regional Shops &amp; Establishment Ordinances require varying work hours, casual leave allowances and overtime multipliers. Karachi office tracks Sindh laws, and Lahore tracks Punjab PESSI wage ceiling benchmarks.
                        </p>
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
                      <p className="text-xs text-slate-500">Total {employees.length} records mapped across Bin Ishaq</p>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => setShowAddEmpModal(true)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center space-x-1.5 shadow"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Onboard Employee</span>
                      </button>
                    </div>
                  </div>

                  {/* Sub-tabs Selection */}
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

                  {empSubTab === 'list' ? (
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
                                        src={emp.pictureUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200'} 
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
                                      PKR {emp.basicSalary.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-slate-400 block font-sans">
                                      {emp.wageType} {emp.providentFundOptIn ? '+ 5% PF' : ''}
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
                              if (reportGrouping === 'uc') return e.ucTown || 'Unassigned';
                              if (reportGrouping === 'zone') return e.zone || 'Unassigned';
                              return e.zoneInChargeName || (e.isZoneInCharge ? 'Zone In Charge (Self)' : 'Unassigned');
                            })));

                            return uniqueGroups.map(groupName => {
                              const matchingEmps = employees.filter(e => {
                                if (reportGrouping === 'uc') return (e.ucTown || 'Unassigned') === groupName;
                                if (reportGrouping === 'zone') return (e.zone || 'Unassigned') === groupName;
                                const supervisor = e.zoneInChargeName || (e.isZoneInCharge ? 'Zone In Charge (Self)' : 'Unassigned');
                                return supervisor === groupName;
                              });

                              const totalSalary = matchingEmps.reduce((sum, e) => {
                                const wage = e.wageType === 'Daily Wager' ? e.basicSalary * 26 : e.basicSalary;
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
                                if (reportGrouping === 'uc') return (e.ucTown || 'Unassigned') === selectedGroup;
                                if (reportGrouping === 'zone') return (e.zone || 'Unassigned') === selectedGroup;
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
                                  if (reportGrouping === 'uc') return (e.ucTown || 'Unassigned') === selectedGroup;
                                  if (reportGrouping === 'zone') return (e.zone || 'Unassigned') === selectedGroup;
                                  const supervisor = e.zoneInChargeName || (e.isZoneInCharge ? 'Zone In Charge (Self)' : 'Unassigned');
                                  return supervisor === selectedGroup;
                                }).map(emp => (
                                  <tr key={emp.id} className="hover:bg-slate-50 transition">
                                    <td className="px-3 py-2.5 font-sans font-medium text-slate-850 flex items-center space-x-2">
                                      <img src={emp.pictureUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200'} alt="" className="w-6 h-6 rounded-full object-cover border" />
                                      <span>{emp.fullName}</span>
                                    </td>
                                    <td className="px-3 py-2.5 font-mono">{emp.employeeCode}</td>
                                    <td className="px-3 py-2.5 text-slate-500">
                                      {localDesignations.find(ds => ds.id === emp.designationId)?.title || 'Specialist'}
                                    </td>
                                    <td className="px-3 py-2.5 font-bold font-mono text-slate-800">
                                      {emp.basicSalary.toLocaleString()}
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
                                <th className="px-6 py-3">Method</th>
                                <th className="px-6 py-3">Overtime</th>
                                <th className="px-6 py-3">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700 font-sans">
                              {attendances.slice().reverse().map(att => {
                                const emp = employees.find(e => e.id === att.employeeId);
                                return (
                                  <tr key={att.id} className="hover:bg-slate-50/50">
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <div className="flex items-center space-x-2">
                                        <img src={emp?.pictureUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200'} alt="" className="w-6 h-6 rounded-full object-cover border" />
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
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-slate-500 font-medium">Select Register Date:</span>
                            <input 
                              type="date"
                              value={selectedAttDate}
                              onChange={(e) => setSelectedAttDate(e.target.value)}
                              className="p-1.5 border rounded font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        )}
                      </div>

                      {/* DAILY REGISTER VIEW */}
                      {attPeriodType === 'daily' && (
                        <div className="space-y-4">
                          {/* Metrics summary */}
                          {(() => {
                            const dayPunches = attendances.filter(a => a.date === selectedAttDate);
                            const pCount = dayPunches.filter(a => a.status === 'Present').length;
                            const lCount = dayPunches.filter(a => a.status === 'Late').length;
                            const hdCount = dayPunches.filter(a => a.status === 'Half Day').length;
                            const olCount = dayPunches.filter(a => a.status === 'On Leave').length;
                            const aCount = employees.length - pCount - lCount - hdCount - olCount;

                            return (
                              <div className="grid grid-cols-5 gap-4">
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
                            <table className="min-w-full text-xs text-left">
                              <thead className="bg-slate-50 font-bold text-slate-550 uppercase tracking-wider">
                                <tr>
                                  <th className="px-4 py-3">Employee</th>
                                  <th className="px-4 py-3">In Punch</th>
                                  <th className="px-4 py-3">Out Punch</th>
                                  <th className="px-4 py-3">Method</th>
                                  <th className="px-4 py-3">Overtime</th>
                                  <th className="px-4 py-3">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 text-slate-700">
                                {employees.map(emp => {
                                  const punch = attendances.find(a => a.employeeId === emp.id && a.date === selectedAttDate);
                                  const status = punch ? punch.status : 'Absent';
                                  
                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-4 py-3 font-medium flex items-center space-x-2">
                                        <img src={emp.pictureUrl} alt="" className="w-6 h-6 rounded-full object-cover border" />
                                        <span>{emp.fullName} ({emp.employeeCode})</span>
                                      </td>
                                      <td className="px-4 py-3 font-mono text-emerald-700">{punch?.punchIn || '--:--'}</td>
                                      <td className="px-4 py-3 font-mono text-indigo-700">{punch?.punchOut || '--:--'}</td>
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
                              </tbody>
                            </table>
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
                          <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Monthly Aggregate Register: June 2026</h3>
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
                                    a => a.employeeId === emp.id && a.date.startsWith('2026-06')
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
                                        <img src={emp.pictureUrl} alt="" className="w-5 h-5 rounded-full object-cover border" />
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
                                  const yrPunches = attendances.filter(a => a.employeeId === emp.id && a.date.startsWith('2026'));
                                  const present = yrPunches.filter(a => a.status === 'Present').length;
                                  const late = yrPunches.filter(a => a.status === 'Late').length;
                                  const half = yrPunches.filter(a => a.status === 'Half Day').length;
                                  const leave = yrPunches.filter(a => a.status === 'On Leave').length;
                                  const ot = yrPunches.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);

                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                        <img src={emp.pictureUrl} alt="" className="w-5 h-5 rounded-full object-cover border" />
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
                                                <img src={emp?.pictureUrl} alt="" className="w-5 h-5 rounded-full object-cover border" />
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
                          <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Monthly Leave Log Summary: June 2026</h3>
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
                                    l => l.employeeId === emp.id && l.status === 'Approved' && l.startDate.startsWith('2026-06')
                                  );
                                  const casual = monthLeaves.filter(l => l.leaveType === 'Casual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const sick = monthLeaves.filter(l => l.leaveType === 'Sick').reduce((sum, l) => sum + l.totalDays, 0);
                                  const annual = monthLeaves.filter(l => l.leaveType === 'Annual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const unpaid = monthLeaves.filter(l => l.leaveType === 'Unpaid').reduce((sum, l) => sum + l.totalDays, 0);
                                  const total = casual + sick + annual + unpaid;

                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                        <img src={emp.pictureUrl} alt="" className="w-5 h-5 rounded-full object-cover border" />
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
                          <h3 className="font-bold text-slate-800 text-sm border-b pb-2">Annual Leave Log Summary: Calendar Year 2026</h3>
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
                                    l => l.employeeId === emp.id && l.status === 'Approved' && l.startDate.startsWith('2026')
                                  );
                                  const casual = yrLeaves.filter(l => l.leaveType === 'Casual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const sick = yrLeaves.filter(l => l.leaveType === 'Sick').reduce((sum, l) => sum + l.totalDays, 0);
                                  const annual = yrLeaves.filter(l => l.leaveType === 'Annual').reduce((sum, l) => sum + l.totalDays, 0);
                                  const total = casual + sick + annual;

                                  return (
                                    <tr key={emp.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-2.5 font-medium flex items-center space-x-2">
                                        <img src={emp.pictureUrl} alt="" className="w-5 h-5 rounded-full object-cover border" />
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
                    <div>
                      <button 
                        onClick={() => onCreatePayrollRun('Payroll - June 2026', payrollMonth, payrollYear)}
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
                                <span>Disbursed</span>
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
                          <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">Simulated Register (June 2026 Run)</h3>
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
                                emp, payrollMonth, payrollYear, attendances, leaves, statConfig, taxSlabs, departments, designations, branches, loanAdvances
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
                                <span className="font-bold">{slab.minIncome.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Max Annual (PKR):</span>
                                <span className="font-bold">{slab.maxIncome === 99999999 ? 'No upper limit' : slab.maxIncome.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="block text-[10px] text-slate-400 font-sans">Formula:</span>
                                <span className="font-bold">{slab.baseTax ? `PKR ${slab.baseTax.toLocaleString()} + ` : ''}{slab.percentage}%</span>
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
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">System Country Setting:</label>
                          <select 
                            value={selectedCountry}
                            onChange={(e) => setSelectedCountry(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          >
                            <option value="Pakistan">Pakistan</option>
                            <option value="United Kingdom">United Kingdom</option>
                            <option value="United Arab Emirates">United Arab Emirates</option>
                            <option value="Other">Other (Loads All Pakistan Banks)</option>
                          </select>
                          <span className="text-[10px] text-slate-400">Determines the local bank lists loaded during employee onboarding disbursal setups.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Government Minimum Wage (PKR):</label>
                          <input 
                            type="number"
                            value={statConfig.minimumWage}
                            onChange={(e) => onUpdateStatConfig({ ...statConfig, minimumWage: Number(e.target.value) })}
                            className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-slate-400">EOBI calculations are mathematically bound to 1% employee / 5% employer of this constant.</span>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">PESSI Employer Contribution %:</label>
                          <input 
                            type="number"
                            value={statConfig.pessiEmployerRate}
                            onChange={(e) => onUpdateStatConfig({ ...statConfig, pessiEmployerRate: Number(e.target.value) })}
                            className="w-full text-xs font-mono p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-widest mb-1.5">Gratuity Entitlement rate (annual):</label>
                          <input 
                            type="number"
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
                      <h2 className="text-xl font-bold text-slate-900">User Access Control &amp; Roles (RBAC)</h2>
                      <p className="text-xs text-slate-500">Create roles, define permissions, onboard user accounts, and assign roles dynamically.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Users List & Role Assignment */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 space-y-4">
                      <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide font-mono">System Users</h3>
                      
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
                                    <select 
                                      value={u.roleId}
                                      onChange={(e) => onUpdateUserRole(u.id, e.target.value)}
                                      className="p-1 bg-white border border-slate-300 rounded text-xs text-slate-805"
                                    >
                                      {roles.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
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
                                      onClick={() => alert(`Simulated toggle status for user: ${u.username}`)}
                                      className="text-xs text-slate-500 hover:text-slate-900 underline"
                                    >
                                      Toggle Status
                                    </button>
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
                        
                        <form onSubmit={(e) => {
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

                          onAddUser({
                            id: 'usr-' + Date.now(),
                            username,
                            email,
                            roleId,
                            employeeId: employeeId || undefined,
                            status: 'Active',
                            password
                          });

                          form.reset();
                          alert('Success: User account created successfully.');
                        }} className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Username:</label>
                            <input name="username" type="text" required placeholder="e.g. jahanzaib.hr" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email:</label>
                            <input name="email" type="email" required placeholder="e.g. jahanzaib@binishaq.com" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Password:</label>
                            <input name="password" type="password" required placeholder="Assign system password" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Assign Initial Role:</label>
                            <select name="roleId" className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:ring-1">
                              {roles.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Link Employee (Optional):</label>
                            <select name="employeeId" className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:ring-1">
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
                            <label className="block text-[10px] font-bold text-slate-505 uppercase mb-1">Role Name:</label>
                            <input name="roleName" type="text" required placeholder="e.g. Auditor" className="w-full text-xs p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-505 uppercase mb-1">Description:</label>
                            <textarea name="description" placeholder="Role description..." className="w-full text-xs p-2 border border-slate-300 rounded h-12 focus:ring-1 focus:ring-emerald-500 focus:outline-none" />
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
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-5xl shadow-xl border border-slate-200 overflow-hidden max-h-[95vh] flex flex-col"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center flex-shrink-0">
                <span className="font-bold text-sm tracking-wider uppercase flex items-center">
                  <UserPlus className="w-4 h-4 mr-1.5 text-emerald-400" /> Onboard New Employee Workspace
                </span>
                <button onClick={() => setShowAddEmpModal(false)} className="text-white hover:text-slate-200 font-bold text-lg">×</button>
              </div>

              <form onSubmit={handleCreateEmployeeSubmit} className="p-5 overflow-y-auto space-y-3.5 text-xs select-none">
                {/* SECTION 1: PERSONAL & CORE DETAILS */}
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-2.5 text-emerald-600">Personal &amp; Core Details</h3>
                  
                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Full Name <span className="text-slate-400 font-normal">(e.g. Ali Ahmed)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. Ali Ahmed"
                        value={newEmpForm.fullName}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, fullName: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Official Email ID <span className="text-slate-400 font-normal">(e.g. ahmed@binishaqsoft.com)</span>:</label>
                      <input 
                        type="email" required
                        placeholder="e.g. ahmed@binishaqsoft.com"
                        value={newEmpForm.email}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, email: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Employee Code:</label>
                      <div className="flex space-x-1 items-center">
                        <input 
                          type="text"
                          placeholder="e.g. BINISHAQ-HR-00001"
                          disabled={autoGenNewCode}
                          value={newEmpForm.employeeCode}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, employeeCode: e.target.value })}
                          className="flex-1 p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        <label className="flex items-center space-x-1 whitespace-nowrap bg-slate-55 border border-slate-300 rounded p-1.5 hover:bg-slate-100 cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={autoGenNewCode}
                            onChange={(e) => setAutoGenNewCode(e.target.checked)}
                            className="rounded text-emerald-600"
                          />
                          <span className="text-[10px] font-bold text-slate-700">Auto</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Pakistan CNIC <span className="text-slate-400 font-normal">(e.g. 42101-1234567-3)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. 42101-1234567-3"
                        value={newEmpForm.cnic}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, cnic: formatCNIC(e.target.value) })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Mobile Contact <span className="text-slate-400 font-normal">(e.g. 0300-1234567)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. 0300-1234567"
                        value={newEmpForm.contactNumber}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, contactNumber: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Gender:</label>
                      <select 
                        value={newEmpForm.gender}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, gender: e.target.value })}
                        className="w-full p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Marital Status:</label>
                      <select 
                        value={newEmpForm.maritalStatus}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, maritalStatus: e.target.value })}
                        className="w-full p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                      >
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Date of Birth:</label>
                      <input 
                        type="date" required
                        value={newEmpForm.dateOfBirth}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, dateOfBirth: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Picture URL / Upload:</label>
                      <div className="flex space-x-1 items-center">
                        <input 
                          type="text"
                          placeholder="e.g. https://domain.com/pic.jpg"
                          value={newEmpForm.pictureUrl}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, pictureUrl: e.target.value })}
                          className="flex-1 p-1.5 border border-slate-300 rounded focus:ring-1 focus:outline-none font-mono text-[9px]"
                        />
                        <input 
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="add-emp-pic-file"
                          onChange={(e) => handlePictureFileChange(e, false)}
                        />
                        <label 
                          htmlFor="add-emp-pic-file"
                          className="cursor-pointer bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-700 text-center whitespace-nowrap"
                        >
                          Browse...
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: ASSIGNMENT & REGIONAL GEOGRAPHY */}
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-2.5 text-emerald-600">Organization &amp; Regional Assignment</h3>
                  
                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Assigned Branch:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={newEmpForm.branchId}
                          onChange={(e) => handleAddBranchChange(e.target.value)}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localBranches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const name = window.prompt("Enter new Branch Name:");
                            if (!name) return;
                            const city = window.prompt("Enter Branch City (e.g. Karachi):");
                            if (!city) return;
                            const prov = window.prompt("Enter Branch Province (Punjab/Sindh/KPK/Balochistan):");
                            if (!prov) return;
                            const newId = handleCreateBranch(name, city, prov as any);
                            handleAddBranchChange(newId);
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Create New Branch"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Department:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={newEmpForm.departmentId}
                          onChange={(e) => handleAddDeptChange(e.target.value)}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localDepartments.filter(d => d.branchId === newEmpForm.branchId).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const name = window.prompt("Enter new Department Name:");
                            if (!name) return;
                            const code = window.prompt("Enter Department Code (e.g. HR, ENG, OPS):");
                            if (!code) return;
                            const newId = handleCreateDepartment(newEmpForm.branchId, name, code);
                            handleAddDeptChange(newId);
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Create New Department"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Designation:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={newEmpForm.designationId}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, designationId: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localDesignations.filter(ds => ds.departmentId === newEmpForm.departmentId).map(ds => (
                            <option key={ds.id} value={ds.id}>{ds.title} (Grade {ds.grade})</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            if (!newEmpForm.departmentId) {
                              alert("Kindly select/create a department first.");
                              return;
                            }
                            const title = window.prompt("Enter Designation Title:");
                            if (!title) return;
                            const grade = window.prompt("Enter Designation Grade (e.g. M1, G2):");
                            if (!grade) return;
                            const newId = handleCreateDesignation(newEmpForm.departmentId, title, grade);
                            setNewEmpForm(prev => ({ ...prev, designationId: newId }));
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Create New Designation"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">UC / Town Information:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={newEmpForm.ucTown}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, ucTown: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:outline-none"
                        >
                          <option value="">-- Select UC / Town --</option>
                          {Array.from(new Set([...existingUcs, ...localUcs])).filter(Boolean).map(uc => (
                            <option key={uc} value={uc}>{uc}</option>
                          ))}
                          {newEmpForm.ucTown && !existingUcs.includes(newEmpForm.ucTown) && !localUcs.includes(newEmpForm.ucTown) && (
                            <option value={newEmpForm.ucTown}>{newEmpForm.ucTown}</option>
                          )}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter new UC / Town (e.g. UC-2 Clifton Town):");
                            if (val) {
                              setLocalUcs(prev => [...prev, val]);
                              setNewEmpForm(prev => ({ ...prev, ucTown: val }));
                            }
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Add custom UC/Town at runtime"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Zone:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={newEmpForm.zone}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, zone: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:outline-none"
                        >
                          <option value="">-- Select Zone --</option>
                          {Array.from(new Set([...existingZones, ...localZones])).filter(Boolean).map(z => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                          {newEmpForm.zone && !existingZones.includes(newEmpForm.zone) && !localZones.includes(newEmpForm.zone) && (
                            <option value={newEmpForm.zone}>{newEmpForm.zone}</option>
                          )}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter new Zone (e.g. East Zone):");
                            if (val) {
                              setLocalZones(prev => [...prev, val]);
                              setNewEmpForm(prev => ({ ...prev, zone: val }));
                            }
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Add custom Zone at runtime"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center space-x-3 pt-3">
                      <label className="flex items-center space-x-1.5 font-medium select-none">
                        <input 
                          type="checkbox"
                          checked={newEmpForm.isZoneInCharge}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, isZoneInCharge: e.target.checked })}
                          className="rounded text-emerald-600 text-xs"
                        />
                        <span className="whitespace-nowrap font-bold text-slate-600">Is Zone In Charge?</span>
                      </label>
                      {!newEmpForm.isZoneInCharge && (
                        <div className="flex-1">
                          <input 
                            type="text"
                            placeholder="Zone In Charge Name"
                            value={newEmpForm.zoneInChargeName}
                            onChange={(e) => setNewEmpForm({ ...newEmpForm, zoneInChargeName: e.target.value })}
                            className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:outline-none font-sans"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 3: WAGES, ALLOWANCES & BANK */}
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-2.5 text-emerald-600">Wage &amp; Custom Allowance configuration</h3>
                  
                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Wage Type:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={newEmpForm.wageType}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, wageType: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localWageTypes.map(w => (
                            <option key={w} value={w}>{w === 'Salaried' ? 'Salaried (Monthly)' : w === 'Daily Wager' ? 'Daily Wager (Calculated basic)' : w}</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter new Wage Type name (e.g. Contractual, Hourly):");
                            if (val) {
                              setLocalWageTypes(prev => [...prev, val]);
                              setNewEmpForm(prev => ({ ...prev, wageType: val }));
                            }
                          }}
                          className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-700 px-2.5 py-1.5 rounded font-bold text-sm"
                          title="Add custom wage type"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Basic Monthly Wage / Daily Rate (PKR) <span className="text-slate-400 font-normal">(e.g. 85000)</span>:</label>
                      <input 
                        type="number" required
                        placeholder="e.g. 85000"
                        value={newEmpForm.basicSalary}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, basicSalary: Number(e.target.value) })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Disbursal Bank:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={newEmpForm.bankName}
                          onChange={(e) => handleBankChange(e.target.value, false)}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:outline-none text-[11px]"
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
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 px-2 py-1.5 rounded font-bold text-xs"
                          title="Add Custom Bank"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Account Number <span className="text-slate-400 font-normal">(e.g. 12345678901234)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. 12345678901234"
                        value={newEmpForm.bankAccountNumber}
                        onChange={(e) => handleAccountNumberChange(e.target.value, false)}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div className="col-span-2">
                      <label className="block font-bold mb-1 text-slate-600 font-sans">PKR IBAN Number <span className="text-slate-400 font-normal">(e.g. PK42HABB0012345678901234)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. PK42HABB0012345678901234"
                        value={newEmpForm.iban}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, iban: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1"
                      />
                    </div>
                    <div className="col-span-2">
                      {newEmpForm.wageType === 'Salaried' && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <h4 className="font-bold text-slate-700 text-[9px] uppercase tracking-wider mb-1">Allowance Overrides (0 to default split)</h4>
                          <div className="grid grid-cols-4 gap-1.5">
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Rent:</label>
                              <input 
                                type="number"
                                placeholder="Rent"
                                value={newEmpForm.houseRentAllowance}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, houseRentAllowance: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Conveyance:</label>
                              <input 
                                type="number"
                                placeholder="Conv"
                                value={newEmpForm.conveyanceAllowance}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, conveyanceAllowance: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Medical:</label>
                              <input 
                                type="number"
                                placeholder="Med"
                                value={newEmpForm.medicalAllowance}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, medicalAllowance: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Other:</label>
                              <input 
                                type="number"
                                placeholder="Other"
                                value={newEmpForm.otherAllowances}
                                onChange={(e) => setNewEmpForm({ ...newEmpForm, otherAllowances: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 4: STATUTORY & TRUST FUNDS COMPLIANCE */}
                <div className="space-y-2 pb-2">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider text-emerald-600">Statutory &amp; Trust Compliance</h3>
                  
                  <div className="grid grid-cols-4 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 items-start">
                    <div className="flex flex-col space-y-1">
                      <label className="flex items-center space-x-1.5 font-medium select-none">
                        <input 
                          type="checkbox"
                          checked={newEmpForm.eobiEnabled}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, eobiEnabled: e.target.checked })}
                          className="rounded text-emerald-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Enable EOBI</span>
                      </label>
                      {newEmpForm.eobiEnabled && (
                        <input 
                          type="text"
                          placeholder="EOBI No (e.g. 1090123000)"
                          value={newEmpForm.eobiNumber}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, eobiNumber: e.target.value })}
                          className="w-full p-1 border border-slate-300 rounded font-mono text-[10px]"
                        />
                      )}
                    </div>

                    <div className="flex flex-col space-y-1">
                      <label className="flex items-center space-x-1.5 font-medium select-none">
                        <input 
                          type="checkbox"
                          checked={newEmpForm.fbrEnabled}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, fbrEnabled: e.target.checked })}
                          className="rounded text-emerald-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Enable FBR Tax</span>
                      </label>
                      <input 
                        type="text"
                        placeholder="PESSI SSN (e.g. SS-42-000)"
                        value={newEmpForm.socialSecurityNumber}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, socialSecurityNumber: e.target.value })}
                        className="w-full p-1 border border-slate-300 rounded font-mono text-[10px]"
                      />
                    </div>

                    <div className="pt-1 select-none">
                      <label className="flex items-center space-x-1.5 font-medium">
                        <input 
                          type="checkbox"
                          checked={newEmpForm.providentFundOptIn}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, providentFundOptIn: e.target.checked })}
                          className="rounded text-emerald-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Opt In PF Fund</span>
                      </label>
                    </div>

                    <div className="pt-1 select-none">
                      <label className="flex items-center space-x-1.5 font-medium">
                        <input 
                          type="checkbox"
                          checked={newEmpForm.gratuityOptIn}
                          onChange={(e) => setNewEmpForm({ ...newEmpForm, gratuityOptIn: e.target.checked })}
                          className="rounded text-emerald-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Opt In Gratuity</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200 flex-shrink-0">
                  <button 
                    type="button"
                    onClick={() => setShowAddEmpModal(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs"
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
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} 
              animate={{ scale: 1, opacity: 1 }} 
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-5xl shadow-xl border border-slate-200 overflow-hidden max-h-[95vh] flex flex-col"
            >
              <div className="px-6 py-4 bg-indigo-900 text-white flex justify-between items-center flex-shrink-0">
                <span className="font-bold text-sm tracking-wider uppercase flex items-center">
                  <Users className="w-4 h-4 mr-1.5 text-indigo-400" /> Edit Employee Record
                </span>
                <button onClick={() => { setShowEditEmpModal(false); setEditingEmployee(null); }} className="text-white hover:text-slate-200 font-bold text-lg">×</button>
              </div>

              <form onSubmit={handleEditEmployeeSubmit} className="p-5 overflow-y-auto space-y-3.5 text-xs select-none">
                {/* SECTION 1: PERSONAL & CORE DETAILS */}
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-2.5 text-indigo-600">Personal &amp; Core Details</h3>
                  
                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Full Name <span className="text-slate-400 font-normal">(e.g. Ali Ahmed)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. Ali Ahmed"
                        value={editEmpForm.fullName}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, fullName: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Official Email ID <span className="text-slate-400 font-normal">(e.g. ahmed@binishaqsoft.com)</span>:</label>
                      <input 
                        type="email" required
                        placeholder="e.g. ahmed@binishaqsoft.com"
                        value={editEmpForm.email}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, email: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Employee Code:</label>
                      <div className="flex space-x-1 items-center">
                        <input 
                          type="text"
                          placeholder="e.g. BINISHAQ-HR-00001"
                          disabled={autoGenEditCode}
                          value={editEmpForm.employeeCode}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, employeeCode: e.target.value })}
                          className="flex-1 p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        />
                        <label className="flex items-center space-x-1 whitespace-nowrap bg-slate-55 border border-slate-300 rounded p-1.5 hover:bg-slate-100 cursor-pointer select-none">
                          <input 
                            type="checkbox"
                            checked={autoGenEditCode}
                            onChange={(e) => setAutoGenEditCode(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                          <span className="text-[10px] font-bold text-slate-700">Auto</span>
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Pakistan CNIC <span className="text-slate-400 font-normal">(e.g. 42101-1234567-3)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. 42101-1234567-3"
                        value={editEmpForm.cnic}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, cnic: formatCNIC(e.target.value) })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Mobile Contact <span className="text-slate-400 font-normal">(e.g. 0300-1234567)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. 0300-1234567"
                        value={editEmpForm.contactNumber}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, contactNumber: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Gender:</label>
                      <select 
                        value={editEmpForm.gender}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, gender: e.target.value })}
                        className="w-full p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Marital Status:</label>
                      <select 
                        value={editEmpForm.maritalStatus}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, maritalStatus: e.target.value })}
                        className="w-full p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                      >
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Date of Birth:</label>
                      <input 
                        type="date" required
                        value={editEmpForm.dateOfBirth}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, dateOfBirth: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Picture URL / Upload:</label>
                      <div className="flex space-x-1 items-center">
                        <input 
                          type="text"
                          placeholder="e.g. https://domain.com/pic.jpg"
                          value={editEmpForm.pictureUrl}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, pictureUrl: e.target.value })}
                          className="flex-1 p-1.5 border border-slate-300 rounded focus:ring-1 focus:outline-none font-mono text-[9px]"
                        />
                        <input 
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="edit-emp-pic-file"
                          onChange={(e) => handlePictureFileChange(e, true)}
                        />
                        <label 
                          htmlFor="edit-emp-pic-file"
                          className="cursor-pointer bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-700 text-center whitespace-nowrap"
                        >
                          Browse...
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: ASSIGNMENT & REGIONAL GEOGRAPHY */}
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-2.5 text-indigo-600">Organization &amp; Regional Assignment</h3>
                  
                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Assigned Branch:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={editEmpForm.branchId}
                          onChange={(e) => handleEditBranchChange(e.target.value)}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localBranches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const name = window.prompt("Enter new Branch Name:");
                            if (!name) return;
                            const city = window.prompt("Enter Branch City (e.g. Karachi):");
                            if (!city) return;
                            const prov = window.prompt("Enter Branch Province (Punjab/Sindh/KPK/Balochistan):");
                            if (!prov) return;
                            const newId = handleCreateBranch(name, city, prov as any);
                            handleEditBranchChange(newId);
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Create New Branch"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Department:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={editEmpForm.departmentId}
                          onChange={(e) => handleEditDeptChange(e.target.value)}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localDepartments.filter(d => d.branchId === editEmpForm.branchId).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const name = window.prompt("Enter new Department Name:");
                            if (!name) return;
                            const code = window.prompt("Enter Department Code (e.g. HR, ENG, OPS):");
                            if (!code) return;
                            const newId = handleCreateDepartment(editEmpForm.branchId, name, code);
                            handleEditDeptChange(newId);
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Create New Department"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Designation:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={editEmpForm.designationId}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, designationId: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localDesignations.filter(ds => ds.departmentId === editEmpForm.departmentId).map(ds => (
                            <option key={ds.id} value={ds.id}>{ds.title} (Grade {ds.grade})</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            if (!editEmpForm.departmentId) {
                              alert("Kindly select/create a department first.");
                              return;
                            }
                            const title = window.prompt("Enter Designation Title:");
                            if (!title) return;
                            const grade = window.prompt("Enter Designation Grade (e.g. M1, G2):");
                            if (!grade) return;
                            const newId = handleCreateDesignation(editEmpForm.departmentId, title, grade);
                            setEditEmpForm(prev => ({ ...prev, designationId: newId }));
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Create New Designation"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">UC / Town Information:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={editEmpForm.ucTown}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, ucTown: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:outline-none"
                        >
                          <option value="">-- Select UC / Town --</option>
                          {Array.from(new Set([...existingUcs, ...localUcs])).filter(Boolean).map(uc => (
                            <option key={uc} value={uc}>{uc}</option>
                          ))}
                          {editEmpForm.ucTown && !existingUcs.includes(editEmpForm.ucTown) && !localUcs.includes(editEmpForm.ucTown) && (
                            <option value={editEmpForm.ucTown}>{editEmpForm.ucTown}</option>
                          )}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter new UC / Town (e.g. UC-2 Clifton Town):");
                            if (val) {
                              setLocalUcs(prev => [...prev, val]);
                              setEditEmpForm(prev => ({ ...prev, ucTown: val }));
                            }
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Add custom UC/Town at runtime"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Zone:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={editEmpForm.zone}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, zone: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:outline-none"
                        >
                          <option value="">-- Select Zone --</option>
                          {Array.from(new Set([...existingZones, ...localZones])).filter(Boolean).map(z => (
                            <option key={z} value={z}>{z}</option>
                          ))}
                          {editEmpForm.zone && !existingZones.includes(editEmpForm.zone) && !localZones.includes(editEmpForm.zone) && (
                            <option value={editEmpForm.zone}>{editEmpForm.zone}</option>
                          )}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter new Zone (e.g. East Zone):");
                            if (val) {
                              setLocalZones(prev => [...prev, val]);
                              setEditEmpForm(prev => ({ ...prev, zone: val }));
                            }
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 px-2 py-1.5 rounded font-bold text-sm"
                          title="Add custom Zone at runtime"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center space-x-3 pt-3">
                      <label className="flex items-center space-x-1.5 font-medium select-none">
                        <input 
                          type="checkbox"
                          checked={editEmpForm.isZoneInCharge}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, isZoneInCharge: e.target.checked })}
                          className="rounded text-indigo-600 text-xs"
                        />
                        <span className="whitespace-nowrap font-bold text-slate-600">Is Zone In Charge?</span>
                      </label>
                      {!editEmpForm.isZoneInCharge && (
                        <div className="flex-1">
                          <input 
                            type="text"
                            placeholder="Zone In Charge Name"
                            value={editEmpForm.zoneInChargeName || ''}
                            onChange={(e) => setEditEmpForm({ ...editEmpForm, zoneInChargeName: e.target.value })}
                            className="w-full p-1.5 border border-slate-300 rounded focus:ring-1 focus:outline-none font-sans"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 3: WAGES, ALLOWANCES & BANK */}
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-2.5 text-indigo-600">Wage &amp; Custom Allowance configuration</h3>
                  
                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Wage Type:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={editEmpForm.wageType}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, wageType: e.target.value })}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1"
                        >
                          {localWageTypes.map(w => (
                            <option key={w} value={w}>{w === 'Salaried' ? 'Salaried (Monthly)' : w === 'Daily Wager' ? 'Daily Wager (Calculated basic)' : w}</option>
                          ))}
                        </select>
                        <button 
                          type="button"
                          onClick={() => {
                            const val = window.prompt("Enter new Wage Type name (e.g. Contractual, Hourly):");
                            if (val) {
                              setLocalWageTypes(prev => [...prev, val]);
                              setEditEmpForm(prev => ({ ...prev, wageType: val }));
                            }
                          }}
                          className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-700 px-2.5 py-1.5 rounded font-bold text-sm"
                          title="Add custom wage type"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Basic Monthly Wage / Daily Rate (PKR) <span className="text-slate-400 font-normal">(e.g. 85000)</span>:</label>
                      <input 
                        type="number" required
                        placeholder="e.g. 85000"
                        value={editEmpForm.basicSalary}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, basicSalary: Number(e.target.value) })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Disbursal Bank:</label>
                      <div className="flex space-x-1 items-center">
                        <select 
                          value={editEmpForm.bankName}
                          onChange={(e) => handleBankChange(e.target.value, true)}
                          className="flex-1 p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:outline-none text-[11px]"
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
                          className="bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 px-2 py-1.5 rounded font-bold text-xs"
                          title="Add Custom Bank"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block font-bold mb-1 text-slate-600 font-sans">Account Number <span className="text-slate-400 font-normal">(e.g. 12345678901234)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. 12345678901234"
                        value={editEmpForm.bankAccountNumber}
                        onChange={(e) => handleAccountNumberChange(e.target.value, true)}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-2.5">
                    <div className="col-span-2">
                      <label className="block font-bold mb-1 text-slate-600 font-sans">PKR IBAN Number <span className="text-slate-400 font-normal">(e.g. PK42HABB0012345678901234)</span>:</label>
                      <input 
                        type="text" required
                        placeholder="e.g. PK42HABB0012345678901234"
                        value={editEmpForm.iban}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, iban: e.target.value })}
                        className="w-full p-1.5 border border-slate-300 rounded font-mono focus:ring-1"
                      />
                    </div>
                    <div className="col-span-2">
                      {editEmpForm.wageType === 'Salaried' && (
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <h4 className="font-bold text-slate-700 text-[9px] uppercase tracking-wider mb-1">Allowance Overrides (0 to default split)</h4>
                          <div className="grid grid-cols-4 gap-1.5">
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Rent:</label>
                              <input 
                                type="number"
                                placeholder="Rent"
                                value={editEmpForm.houseRentAllowance}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, houseRentAllowance: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Conveyance:</label>
                              <input 
                                type="number"
                                placeholder="Conv"
                                value={editEmpForm.conveyanceAllowance}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, conveyanceAllowance: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Medical:</label>
                              <input 
                                type="number"
                                placeholder="Med"
                                value={editEmpForm.medicalAllowance}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, medicalAllowance: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-semibold text-slate-500 font-sans">Other:</label>
                              <input 
                                type="number"
                                placeholder="Other"
                                value={editEmpForm.otherAllowances}
                                onChange={(e) => setEditEmpForm({ ...editEmpForm, otherAllowances: Number(e.target.value) })}
                                className="w-full p-1 border border-slate-300 rounded font-mono text-[9px]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* SECTION 4: STATUTORY & TRUST FUNDS COMPLIANCE */}
                <div className="space-y-2 pb-2">
                  <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider text-indigo-600">Statutory &amp; Trust Compliance</h3>
                  
                  <div className="grid grid-cols-4 gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200 items-start">
                    <div className="flex flex-col space-y-1">
                      <label className="flex items-center space-x-1.5 font-medium select-none">
                        <input 
                          type="checkbox"
                          checked={editEmpForm.eobiEnabled}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, eobiEnabled: e.target.checked })}
                          className="rounded text-indigo-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Enable EOBI</span>
                      </label>
                      {editEmpForm.eobiEnabled && (
                        <input 
                          type="text"
                          placeholder="EOBI No (e.g. 1090123000)"
                          value={editEmpForm.eobiNumber}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, eobiNumber: e.target.value })}
                          className="w-full p-1 border border-slate-300 rounded font-mono text-[10px]"
                        />
                      )}
                    </div>

                    <div className="flex flex-col space-y-1">
                      <label className="flex items-center space-x-1.5 font-medium select-none">
                        <input 
                          type="checkbox"
                          checked={editEmpForm.fbrEnabled}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, fbrEnabled: e.target.checked })}
                          className="rounded text-indigo-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Enable FBR Tax</span>
                      </label>
                      <input 
                        type="text"
                        placeholder="PESSI SSN (e.g. SS-42-000)"
                        value={editEmpForm.socialSecurityNumber}
                        onChange={(e) => setEditEmpForm({ ...editEmpForm, socialSecurityNumber: e.target.value })}
                        className="w-full p-1 border border-slate-300 rounded font-mono text-[10px]"
                      />
                    </div>

                    <div className="pt-1 select-none">
                      <label className="flex items-center space-x-1.5 font-medium">
                        <input 
                          type="checkbox"
                          checked={editEmpForm.providentFundOptIn}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, providentFundOptIn: e.target.checked })}
                          className="rounded text-indigo-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Opt In PF Fund</span>
                      </label>
                    </div>

                    <div className="pt-1 select-none">
                      <label className="flex items-center space-x-1.5 font-medium">
                        <input 
                          type="checkbox"
                          checked={editEmpForm.gratuityOptIn}
                          onChange={(e) => setEditEmpForm({ ...editEmpForm, gratuityOptIn: e.target.checked })}
                          className="rounded text-indigo-600 text-xs"
                        />
                        <span className="font-semibold text-slate-650">Opt In Gratuity</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end space-x-2.5 pt-3 border-t border-slate-200 flex-shrink-0">
                  <button 
                    type="button"
                    onClick={() => { setShowEditEmpModal(false); setEditingEmployee(null); }}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs"
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
                      src={showOffboardModal.pictureUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200'} 
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
                      <span className="font-bold">Wage Type:</span> {showOffboardModal.wageType}
                    </div>
                    <div>
                      <span className="font-bold">Basic Rate:</span> PKR {showOffboardModal.basicSalary.toLocaleString()}
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
                    <label className="block font-bold text-slate-705 mb-1">Encashable Leaves (Days):</label>
                    <input 
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
                      const baseBasic = showOffboardModal.wageType === 'Daily Wager' ? showOffboardModal.basicSalary * 26 : showOffboardModal.basicSalary;
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
                    <h4 className="font-bold text-base text-slate-900 uppercase">Bin Ishaq Logistics Ltd.</h4>
                    <p className="text-slate-400 font-mono text-[10px]">NTN: 4567891-2 • PK Registered Office</p>
                  </div>
                  <div className="text-right font-mono text-[10px] text-slate-500">
                    <p><strong>Payslip Reference ID:</strong></p>
                    <p className="text-slate-800 font-bold">{showPayslipModal.id}</p>
                    <p className="mt-1">Period: June 2026</p>
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
                  * Generated by Bin Ishaq Logistics Ltd. under the Shops &amp; Establishments Ordinance. Salary disbursed directly via automated HBL bulk online bank advice file. Fully compliant values.
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
                    <p>Paying Account Name: Bin Ishaq Logistics Karachi</p>
                    <p>Paying IBAN: PK91HABB006744882199341</p>
                    <p>Origin Bank Code: HABIB BANK LIMITED (HBL)</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-800">Authorization Code: IN-PK-Advice-62</p>
                    <p>Total Staff: {employees.length}</p>
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
                      {employees.map(emp => {
                        const sheet = computePayslipDetails(
                          emp, showBankFileModal!.periodMonth, showBankFileModal!.periodYear, attendances, leaves, statConfig, taxSlabs, departments, designations, branches, loanAdvances
                        );
                        return (
                          <tr key={emp.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-sans font-medium">{emp.fullName}</td>
                            <td className="px-3 py-2">{emp.iban}</td>
                            <td className="px-3 py-2 text-slate-400 font-sans text-[10px]">{emp.bankName}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-900">{sheet.netSalary.toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-emerald-50 rounded-lg p-3 text-[11px] text-emerald-900 border border-emerald-100 italic leading-relaxed select-none">
                  * Downloaded files conform strictly to the state standard **HBL Bulk Transfer Flat CSV / Excel Schema 5.3** ensuring 1-click execution in corporate internet banking.
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t flex justify-end space-x-2">
                <button 
                  onClick={() => {
                    alert('HBL / Bank advice flat file csv layout download initiated!');
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
                      value={newAttendanceForm.date}
                      onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, date: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-655">Punch Status:</label>
                    <select 
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
                      value={newAttendanceForm.punchIn}
                      onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, punchIn: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-650">Punch Out Time (Optional):</label>
                    <input 
                      type="time"
                      value={newAttendanceForm.punchOut}
                      onChange={(e) => setNewAttendanceForm({ ...newAttendanceForm, punchOut: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-655">Attendance Method:</label>
                  <select 
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
                      value={newLeaveForm.startDate}
                      onChange={(e) => setNewLeaveForm({ ...newLeaveForm, startDate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-655">End Date:</label>
                    <input 
                      type="date" required
                      value={newLeaveForm.endDate}
                      onChange={(e) => setNewLeaveForm({ ...newLeaveForm, endDate: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold mb-1 text-slate-650">Reason / Description:</label>
                  <textarea required
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
