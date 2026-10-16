/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Eye, EyeOff, Mail, Lock, ArrowRight, ShieldCheck, Sparkles,
  Clock, TrendingUp, Database, AlertCircle, HelpCircle
} from 'lucide-react';
import { computePayslipDetails, DEFAULT_TAX_SLABS } from './data/defaults';
import {
  Employee, AttendanceLog, AttendancePeriod, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, PayrollAdjustment, Payslip, MobilePunchDetails,
  Role, UserAccount, Branch, Department, Designation, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification, Company, CompanySetupPayload, Zone, UcTown, WageType, NewUserAccount, MobileDutyAuthorization,
  StatutoryChangeRequest, LifecycleRequest, ParallelRunRecord
} from './types';
import { attendancePeriodId, createAttendancePeriod, isAttendancePeriodValid, reopenAttendancePeriod } from './data/attendancePeriod';
import { evaluateAttendanceTimes, isDuplicatePunch } from './data/attendanceRules';
import { attendanceLocations, evaluateBranchGeofence, impossibleTravel, validateLocationEvidence } from './data/geofence';
import { applyLifecycleRequest, lifecycleRequestError, lifecycleReviewError } from './data/lifecycle';
import { leaveBalanceError } from './data/leavePolicy';
import { computeFinalSettlementPayslip, computeSupplementaryPayslip, retroRecalculationAdjustment } from './data/offCyclePayroll';
import { attendanceReviewError, isRegularizationOverdue, lineManagerReviewer, payrollCancellationError, payrollTransitionError, salaryRevisionApprovalError, salaryRevisionArrears, statutoryChangedFields, statutoryReviewError } from './data/approvalRules';
import { payrollPreflight } from './data/payrollPreflight';
import { DeviceEmulator } from './components/DeviceEmulator';
import {
  db, collection, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc, onSnapshot, writeBatch, query, where, setAuthToken, getAuthToken, authenticatedApiRequest
} from './data/postgresStore';

// HR and payroll records must never be persisted in browser-accessible storage.
// Application state is stored securely in PostgreSQL server backend and memory only.
const privacyStorage = {
  getItem: (_key: string): string | null => null,
  setItem: (_key: string, _value: string): void => undefined,
  removeItem: (key: string): void => localStorage.removeItem(key),
};

const publicUser = ({ passwordHash: _passwordHash, ...profile }: UserAccount): UserAccount => profile;

const retainedBrowserKeys = new Set(['hr_auth_token', 'hr_remembered_email']);
for (let index = localStorage.length - 1; index >= 0; index -= 1) {
  const key = localStorage.key(index);
  if ((key?.startsWith('hr_') && !retainedBrowserKeys.has(key)) || key?.startsWith('webauthn_')) localStorage.removeItem(key);
}

type BiometricTemplateRecord = {
  id: string;
  employeeId?: string;
  employeeCode?: string;
  fullName?: string;
  fingerprintTemplates?: string[];
};

export type FirestoreSyncStatus = {
  state: 'local' | 'syncing' | 'synced' | 'warning';
  message: string;
};

export default function App() {
  const cleanData = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

  const normalizeFingerprintTemplate = (template: unknown): string => {
    if (!template) return '';
    if (typeof template === 'string') return template.trim();
    if (typeof template !== 'object') return '';
    const record = template as Record<string, unknown>;
    return String(
      record.template ||
      record.sample ||
      record.data ||
      record.fmd ||
      record.value ||
      record.base64 ||
      ''
    ).trim();
  };

  const getFingerprintTemplates = (record: unknown): string[] => {
    const source =
      (record as any)?.fingerprintTemplates ||
      (record as any)?.fingerprints ||
      (record as any)?.biometricTemplates ||
      (record as any)?.biometrics?.fingerprintTemplates ||
      (record as any)?.biometric?.fingerprintTemplates ||
      [];
    const list = Array.isArray(source) ? source : [source];
    return list.map(normalizeFingerprintTemplate).filter(Boolean);
  };

  const mergeEmployeeFingerprintTemplates = (
    employeeList: Employee[],
    templateRecords: BiometricTemplateRecord[]
  ): Employee[] => {
    if (!templateRecords.length) {
      return employeeList.map(emp => ({
        ...emp,
        fingerprintTemplates: getFingerprintTemplates(emp),
      }));
    }

    const byEmployeeId = new Map<string, BiometricTemplateRecord>();
    const byEmployeeCode = new Map<string, BiometricTemplateRecord>();
    for (const record of templateRecords) {
      const templates = getFingerprintTemplates(record);
      if (!templates.length) continue;
      const normalized = { ...record, fingerprintTemplates: templates };
      if (record.employeeId || record.id) byEmployeeId.set(String(record.employeeId || record.id), normalized);
      if (record.employeeCode) byEmployeeCode.set(String(record.employeeCode).toLowerCase(), normalized);
    }

    return employeeList.map(emp => {
      const existingTemplates = getFingerprintTemplates(emp);
      if (existingTemplates.length) return { ...emp, fingerprintTemplates: existingTemplates };
      const match =
        byEmployeeId.get(String(emp.id)) ||
        byEmployeeCode.get(String(emp.employeeCode || '').toLowerCase());
      return match ? { ...emp, fingerprintTemplates: getFingerprintTemplates(match) } : emp;
    });
  };

  const emptyStatConfig: StatutoryConfig = {
    id: 'stat-config',
    minimumWage: 0,
    eobiEmployerRate: 0,
    eobiEmployeeRate: 0,
    pessiEmployerRate: 0,
    gratuityRateDaysPerYear: 0,
    providentFundMaxEmployeeContribution: 0,
    updatedAt: '',
    effectiveFrom: '',
    taxYear: '',
    socialSecurityWageCeiling: 0,
    provincialSocialSecurityRates: { Punjab: 6, Sindh: 6, KPK: 6, Balochistan: 6, ICT: 6 },
    overtimeMultiplier: 2,
    standardMonthlyHours: 208
  };

  const emptyUserAccount: UserAccount = {
    id: '',
    username: '',
    email: '',
    roleId: '',
    status: 'Inactive'
  };

  const getInitialValue = <T,>(key: string, fallback: T): T => {
    try {
      const saved = privacyStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(`localStorage read error for ${key}:`);
    }
    return fallback;
  };

  const todayStr = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // Application Data States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [biometricTemplates, setBiometricTemplates] = useState<BiometricTemplateRecord[]>(() => getInitialValue('hr_biometric_templates', []));
  const [attendances, setAttendances] = useState<AttendanceLog[]>([]);
  const [attendancePeriods, setAttendancePeriods] = useState<AttendancePeriod[]>([]);
  const [mobileDutyAuthorizations, setMobileDutyAuthorizations] = useState<MobileDutyAuthorization[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [statConfig, setStatConfig] = useState<StatutoryConfig>(emptyStatConfig);
  const [taxSlabs, setTaxSlabs] = useState<TaxSlab[]>(() => getInitialValue('hr_tax_slabs', DEFAULT_TAX_SLABS));
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companies, setCompanies] = useState<Company[]>(() => getInitialValue('hr_companies', []));
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [zones, setZones] = useState<Zone[]>(() => getInitialValue('hr_zones', []));
  const [ucTowns, setUcTowns] = useState<UcTown[]>(() => getInitialValue('hr_uc_towns', []));
  const [wageTypes, setWageTypes] = useState<WageType[]>(() => getInitialValue('hr_wage_types', []));
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loanAdvances, setLoanAdvances] = useState<LoanAdvance[]>([]);
  const [salaryRevisions, setSalaryRevisions] = useState<SalaryRevision[]>([]);
  const [performanceReviews, setPerformanceReviews] = useState<PerformanceReview[]>([]);
  const [companyAssets, setCompanyAssets] = useState<CompanyAsset[]>([]);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [jobApplications, setJobApplications] = useState<JobApplication[]>([]);
  const [gratuitySettlements, setGratuitySettlements] = useState<GratuitySettlement[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [payrollPayslips, setPayrollPayslips] = useState<Payslip[]>([]);
  const [statutoryChangeRequests, setStatutoryChangeRequests] = useState<StatutoryChangeRequest[]>([]);
  const [lifecycleRequests, setLifecycleRequests] = useState<LifecycleRequest[]>([]);
  const [payrollAdjustments, setPayrollAdjustments] = useState<PayrollAdjustment[]>([]);

  // User & RBAC States
  const [loggedInUser, setLoggedInUser] = useState<UserAccount | null>(() => getInitialValue('hr_logged_in_user', null));
  const [roles, setRoles] = useState<Role[]>(() => getInitialValue('hr_roles', []));
  const [users, setUsers] = useState<UserAccount[]>(() => getInitialValue('hr_users', []));
  const [rolesLoaded, setRolesLoaded] = useState(true);
  const [usersLoaded, setUsersLoaded] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [firestoreSyncStatus, setFirestoreSyncStatus] = useState<FirestoreSyncStatus>({
    state: 'synced',
    message: 'Connected.'
  });
  const [currentUserAccount, setCurrentUserAccount] = useState<UserAccount>(() => {
    const storedCurrent = getInitialValue<UserAccount | null>('hr_current_user', null);
    const storedLoggedIn = getInitialValue<UserAccount | null>('hr_logged_in_user', null);
    return storedCurrent || storedLoggedIn || emptyUserAccount;
  });

  useEffect(() => {
    let active = true;
    const restoreSession = async () => {
      if (!getAuthToken()) { if (active) setAuthReady(true); return; }
      try {
        const data = await authenticatedApiRequest('/api/auth/session') as { user: UserAccount };
        if (!active || !data.user?.id) return;
        const restored = publicUser(data.user);
        setLoggedInUser(restored);
        setCurrentUserAccount(restored);
      } catch {
        setAuthToken(null);
      } finally {
        if (active) setAuthReady(true);
      }
    };
    void restoreSession();
    return () => { active = false; };
  }, []);

  const handleLogin = async (email: string, password: string, mfaChallenge?: string, mfaCode?: string, mfaMethod: 'totp' | 'email' = 'totp', rememberMe = false): Promise<{ mfaChallenge?: string; mfaMethods?: Array<'totp' | 'email'> } | void> => {
    setAuthMessage('');
    const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

    try {
      const response = await fetch(`${apiBase}${mfaChallenge ? '/api/auth/mfa/verify-login' : '/api/auth/login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mfaChallenge ? { challenge: mfaChallenge, code: mfaCode, method: mfaMethod, rememberMe } : { email: email.trim(), password, rememberMe }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.mfaRequired && data.mfaChallenge) return { mfaChallenge: data.mfaChallenge, mfaMethods: data.mfaMethods };
        setAuthToken(data.token);
        const userProfile: UserAccount = {
          id: data.user.id || data.token,
          username: data.user.username || data.user.email || email,
          email: data.user.email || email,
          roleId: data.user.roleId || 'role-admin',
          status: data.user.status || 'Active',
          employeeId: data.user.employeeId || undefined,
        };
        setLoggedInUser(userProfile);
        setCurrentUserAccount(userProfile);
        privacyStorage.setItem('hr_logged_in_user', JSON.stringify(userProfile));
        privacyStorage.setItem('hr_current_user', JSON.stringify(userProfile));
        setAuthReady(true);
        return;
      } else {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Invalid email or password.');
      }
    } catch (err) {
      throw err;
    }
  };

  const handleLogout = () => {
    void authenticatedApiRequest('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    setAuthToken(null);
    setLoggedInUser(null);
    setCurrentUserAccount(emptyUserAccount);
    privacyStorage.removeItem('hr_logged_in_user');
    privacyStorage.removeItem('hr_current_user');
  };

  useEffect(() => {
    const expire = () => {
      setLoggedInUser(null);
      setCurrentUserAccount(emptyUserAccount);
      setAuthMessage('Your secure session expired. Please sign in again.');
    };
    window.addEventListener('hr:session-expired', expire);
    return () => window.removeEventListener('hr:session-expired', expire);
  }, []);

  useEffect(() => {
    if (!loggedInUser) return;
    setCurrentUserAccount(prev => {
      if (prev.id === loggedInUser.id && prev.roleId) return prev;
      const hydrated = publicUser(users.find(u => u.id === loggedInUser.id) || loggedInUser);
      privacyStorage.setItem('hr_current_user', JSON.stringify(hydrated));
      return hydrated;
    });
  }, [loggedInUser, users]);

  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);

  // PostgreSQL Database Real-time Sync
  useEffect(() => {
    if (!loggedInUser) return;

    const unsubscribes: (() => void)[] = [];
    const requiredSnapshots = new Set([
      'employees',
      'biometricTemplates',
      'attendances',
      'attendancePeriods',
      'leaves',
      'branches',
      'companies',
      'departments',
      'designations',
      'zones',
      'ucTowns',
      'wageTypes',
      'taxSlabs',
      'roles',
      'holidays',
      'loanAdvances',
      'salaryRevisions',
      'performanceReviews',
      'companyAssets',
      'jobPostings',
      'jobApplications',
      'gratuitySettlements',
      'notifications',
      'users',
      'payrollRuns',
      'payrollPayslips',
      'payrollAdjustments',
      'statConfig',
    ]);
    const loadedSnapshots = new Set<string>();

    const markSnapshotLoaded = (collectionName: string) => {
      loadedSnapshots.add(collectionName);
      if (loadedSnapshots.size >= requiredSnapshots.size) {
        setFirestoreSyncStatus({ state: 'synced', message: 'All data is up to date.' });
      } else {
        setFirestoreSyncStatus({
          state: 'syncing',
          message: `Loading your data (${loadedSnapshots.size}/${requiredSnapshots.size})...`,
        });
      }
    };


    const markSnapshotWarning = (collectionName: string, err: unknown) => {
      setFirestoreSyncStatus({ state: 'warning', message: `${collectionName} sync failed. Contact an administrator.` });
    };

    const registerCollectionListener = <T extends { id: string }>(
      collectionName: string,
      stateSetter: (items: T[]) => void,
      storageKey: string,
      onLoaded?: () => void,
      employeeScoped = false
    ) => {
      try {
        const source = employeeScoped && loggedInUser.roleId === 'role-employee' && loggedInUser.employeeId
          ? query(collection(db, collectionName), where('employeeId', '==', loggedInUser.employeeId))
          : collection(db, collectionName);
        const unsub = onSnapshot(source, (snapshot) => {
          const fetched: T[] = [];
          snapshot.forEach(docSnap => {
            fetched.push({ id: docSnap.id, ...docSnap.data() } as T);
          });

          stateSetter(fetched);
          privacyStorage.setItem(storageKey, JSON.stringify(fetched));
          onLoaded?.();
          markSnapshotLoaded(collectionName);
        }, (err) => {
          markSnapshotWarning(collectionName, err);
          console.warn(`PostgreSQL listener failed for ${collectionName}:`);
        });
        unsubscribes.push(unsub);
      } catch (err) {
        markSnapshotWarning(collectionName, err);
        console.warn(`PostgreSQL subscription deferred for ${collectionName}:`);

      }
    };

    if (loggedInUser.roleId === 'role-employee' && loggedInUser.employeeId) {
      const employeeId = loggedInUser.employeeId;
      try {
        const unsubscribeEmployee = onSnapshot(doc(db, 'employees', employeeId), employeeSnapshot => {
          const fetched = employeeSnapshot.exists()
            ? [{ id: employeeSnapshot.id, ...employeeSnapshot.data() } as Employee]
            : [];
          setEmployees(fetched);
          privacyStorage.setItem('hr_employees', JSON.stringify(fetched));
          markSnapshotLoaded('employees');
        }, err => markSnapshotWarning('employees', err));
        unsubscribes.push(unsubscribeEmployee);
      } catch (err) {
        markSnapshotWarning('employees', err);
      }
    } else {
      registerCollectionListener('employees', setEmployees, 'hr_employees');
    }
    registerCollectionListener('biometricTemplates', setBiometricTemplates, 'hr_biometric_templates');
    registerCollectionListener('attendances', setAttendances, 'hr_attendances', undefined, true);
    registerCollectionListener('attendancePeriods', setAttendancePeriods, 'hr_attendance_periods');
    try {
      const authorizationSource = loggedInUser.roleId === 'role-employee' && loggedInUser.employeeId
        ? query(collection(db, 'mobileDutyAuthorizations'), where('employeeId', '==', loggedInUser.employeeId))
        : collection(db, 'mobileDutyAuthorizations');
      const unsubscribeAuthorizations = onSnapshot(authorizationSource, snapshot => {
        const fetched: MobileDutyAuthorization[] = [];
        snapshot.forEach(document => fetched.push({ id: document.id, ...document.data() } as MobileDutyAuthorization));
        setMobileDutyAuthorizations(fetched);
      }, err => console.warn('Mobile duty authorization sync failed:', err));
      unsubscribes.push(unsubscribeAuthorizations);
    } catch (err) {
      console.warn('Mobile duty authorization subscription deferred:', err);
    }
    registerCollectionListener('leaves', setLeaves, 'hr_leaves', undefined, true);
    registerCollectionListener('branches', setBranches, 'hr_branches');
    registerCollectionListener('companies', setCompanies, 'hr_companies');
    registerCollectionListener('departments', setDepartments, 'hr_departments');
    registerCollectionListener('designations', setDesignations, 'hr_designations');
    registerCollectionListener('zones', setZones, 'hr_zones');
    registerCollectionListener('ucTowns', setUcTowns, 'hr_uc_towns');
    registerCollectionListener('wageTypes', setWageTypes, 'hr_wage_types');
    registerCollectionListener('taxSlabs', (fetched: TaxSlab[]) => {
      if (!fetched || fetched.length === 0) {
        setTaxSlabs(DEFAULT_TAX_SLABS);
        privacyStorage.setItem('hr_tax_slabs', JSON.stringify(DEFAULT_TAX_SLABS));
      } else {
        setTaxSlabs(fetched);
      }
    }, 'hr_tax_slabs');
    registerCollectionListener('roles', setRoles, 'hr_roles', () => setRolesLoaded(true));
    registerCollectionListener('holidays', setHolidays, 'hr_holidays');
    registerCollectionListener('loanAdvances', setLoanAdvances, 'hr_loans');
    registerCollectionListener('salaryRevisions', setSalaryRevisions, 'hr_salary_revisions', undefined, true);
    registerCollectionListener('performanceReviews', setPerformanceReviews, 'hr_perf_reviews', undefined, true);
    registerCollectionListener('companyAssets', setCompanyAssets, 'hr_assets');
    registerCollectionListener('jobPostings', setJobPostings, 'hr_job_postings');
    registerCollectionListener('jobApplications', setJobApplications, 'hr_job_apps');
    registerCollectionListener('gratuitySettlements', setGratuitySettlements, 'hr_gratuity');
    registerCollectionListener('notifications', setNotifications, 'hr_notifications');

    // Users Sync (special: also updates currentUserAccount)
    try {
      const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const fetched: UserAccount[] = [];
        snapshot.forEach(docSnap => {
          fetched.push({ id: docSnap.id, ...docSnap.data() } as UserAccount);
        });

        setUsersLoaded(true);
        setUsers(fetched);
        privacyStorage.setItem('hr_users', JSON.stringify(fetched));

          if (fetched.length === 0) {
            setLoggedInUser(null);
            setCurrentUserAccount(emptyUserAccount);
            privacyStorage.removeItem('hr_logged_in_user');
            privacyStorage.removeItem('hr_current_user');
            markSnapshotLoaded('users');
            return;
          }

        const storedCurrentUser = privacyStorage.getItem('hr_current_user');
        if (storedCurrentUser) {
          const parsed = JSON.parse(storedCurrentUser) as UserAccount;
          const updatedCurrent = fetched.find(u => u.id === parsed.id);
          if (updatedCurrent) {
            setCurrentUserAccount(publicUser(updatedCurrent));
            privacyStorage.setItem('hr_current_user', JSON.stringify(updatedCurrent));
          }
        }
        markSnapshotLoaded('users');
      }, (err) => {
        setUsersLoaded(true);
        markSnapshotWarning('users', err);
        console.warn('PostgreSQL users listener failed:');
      });
      unsubscribes.push(unsubUsers);
    } catch (err) {
      setUsersLoaded(true);
      markSnapshotWarning('users', err);
      console.warn('PostgreSQL users subscription deferred:');

    }

    // PayrollRuns Sync
    registerCollectionListener('payrollRuns', setPayrollRuns, 'hr_payroll_runs');
    registerCollectionListener('payrollPayslips', setPayrollPayslips, 'hr_payroll_payslips', undefined, true);
    registerCollectionListener('payrollAdjustments', setPayrollAdjustments, 'hr_payroll_adjustments', undefined, true);
    if (loggedInUser.roleId !== 'role-employee') {
      registerCollectionListener('statutoryChangeRequests', setStatutoryChangeRequests, 'hr_statutory_change_requests');
      registerCollectionListener('lifecycleRequests', setLifecycleRequests, 'hr_lifecycle_requests');
    }

    // StatConfig Sync (single document)
    try {
      const unsubConfig = onSnapshot(collection(db, 'statConfig'), async (snapshot) => {
        let fetchedConfig: StatutoryConfig | null = null;
        snapshot.forEach(docSnap => {
          fetchedConfig = { id: docSnap.id, ...docSnap.data() } as StatutoryConfig;
        });

        if (fetchedConfig) {
          setStatConfig(fetchedConfig);
          privacyStorage.setItem('hr_stat_config', JSON.stringify(fetchedConfig));
        }
        markSnapshotLoaded('statConfig');
      }, (err) => {
        markSnapshotWarning('statConfig', err);
        console.warn('PostgreSQL statConfig listener failed:');
      });
      unsubscribes.push(unsubConfig);
    } catch (err) {
      markSnapshotWarning('statConfig', err);
      console.warn('PostgreSQL statConfig subscription deferred:');

    }

    return () => unsubscribes.forEach(unsub => unsub());
  }, [loggedInUser?.id]);

  // ─── Employee Handlers ────────────────────────────────────────────────────
  const handleAddEmployee = async (newEmp: Employee) => {
    setEmployees(prev => {
      const updated = [...prev, newEmp];
      privacyStorage.setItem('hr_employees', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'employees', newEmp.id), cleanData(newEmp));
    } catch (err) {
      console.warn('PostgreSQL employee add delayed:');

    }
  };

  const handleUpdateEmployee = async (updatedEmp: Employee) => {
    const hasExplicitFingerprintTemplates = Object.prototype.hasOwnProperty.call(updatedEmp, 'fingerprintTemplates');
    const employeeWithKnownTemplates = hasExplicitFingerprintTemplates
      ? updatedEmp
      : mergeEmployeeFingerprintTemplates([updatedEmp], biometricTemplates)[0];
    const fingerprintTemplates = getFingerprintTemplates(employeeWithKnownTemplates);
    const employeeForSave: Employee = { ...updatedEmp, fingerprintTemplates };

    setEmployees(prev => {
      const updated = prev.map(e => e.id === updatedEmp.id ? employeeForSave : e);
      privacyStorage.setItem('hr_employees', JSON.stringify(updated));
      return updated;
    });
    try {
      if (fingerprintTemplates.length > 0) {
        const biometricRecord = cleanData({
          id: employeeForSave.id,
          employeeId: employeeForSave.id,
          employeeCode: employeeForSave.employeeCode,
          fullName: employeeForSave.fullName,
          fingerprintTemplates,
          updatedAt: new Date().toISOString(),
        });
        await setDoc(doc(db, 'biometricTemplates', employeeForSave.id), biometricRecord, { merge: true });
        setBiometricTemplates(prev => {
          const updated = [
            biometricRecord,
            ...prev.filter(item => item.id !== employeeForSave.id && item.employeeId !== employeeForSave.id),
          ];
          privacyStorage.setItem('hr_biometric_templates', JSON.stringify(updated));
          return updated;
        });
      } else if (hasExplicitFingerprintTemplates) {
        await deleteDoc(doc(db, 'biometricTemplates', employeeForSave.id));
        setBiometricTemplates(prev => {
          const updated = prev.filter(item => item.id !== employeeForSave.id && item.employeeId !== employeeForSave.id);
          privacyStorage.setItem('hr_biometric_templates', JSON.stringify(updated));
          return updated;
        });
      }
      await setDoc(doc(db, 'employees', employeeForSave.id), cleanData(employeeForSave), { merge: true });
    } catch (err) {
      console.warn('PostgreSQL employee update delayed:');
      throw err;
    }
  };

  // ─── Statutory Config Handlers ────────────────────────────────────────────
  // Statutory rates are maker-checker controlled: edits accumulate in one pending change request and
  // only reach the live configuration after a different authorized user approves them.
  const pendingStatutoryChange = statutoryChangeRequests.find(item => item.status === 'Pending');

  const proposeStatutoryChange = async (proposedConfig: StatutoryConfig, proposedTaxSlabs: TaxSlab[]) => {
    if (pendingStatutoryChange && pendingStatutoryChange.createdById !== currentUserAccount.id) {
      alert(`A statutory change proposed by ${pendingStatutoryChange.createdBy} is awaiting review. Approve or reject it before proposing another change.`);
      return;
    }
    const request: StatutoryChangeRequest = {
      id: pendingStatutoryChange?.id || `stat-change-${Date.now()}`,
      status: 'Pending',
      proposedConfig: { ...proposedConfig, id: statConfig.id },
      proposedTaxSlabs,
      changedFields: statutoryChangedFields(statConfig, proposedConfig, taxSlabs, proposedTaxSlabs),
      createdAt: pendingStatutoryChange?.createdAt || new Date().toISOString(),
      createdById: currentUserAccount.id,
      createdBy: currentUserAccount.username,
    };
    setStatutoryChangeRequests(previous => [...previous.filter(item => item.id !== request.id), request]);
    try {
      await setDoc(doc(db, 'statutoryChangeRequests', request.id), cleanData(request));
    } catch (err) {
      console.warn('PostgreSQL statutory change request delayed:');
    }
  };

  const handleUpdateStatConfig = (newConfig: StatutoryConfig) =>
    proposeStatutoryChange(newConfig, pendingStatutoryChange?.proposedTaxSlabs || taxSlabs);

  const handleUpdateTaxSlabs = (newSlabs: TaxSlab[]) =>
    proposeStatutoryChange(pendingStatutoryChange?.proposedConfig || statConfig, newSlabs);

  const handleReviewStatutoryChange = async (id: string, decision: 'Approved' | 'Rejected', reviewComment: string) => {
    const request = statutoryChangeRequests.find(item => item.id === id);
    if (!request) return;
    const withdrawing = decision === 'Rejected' && request.createdById === currentUserAccount.id && request.status === 'Pending';
    const reviewError = withdrawing ? undefined : statutoryReviewError(request, currentUserAccount.id);
    if (reviewError) { alert(`Maker-checker control: ${reviewError}`); return; }
    if (!withdrawing && reviewComment.trim().length < 5) { alert('Enter a review comment (for example the FBR/EOBI notification reference).'); return; }
    const now = new Date().toISOString();
    const decided: StatutoryChangeRequest = { ...request, status: decision, reviewedAt: now, reviewedById: currentUserAccount.id, reviewedBy: currentUserAccount.username, reviewComment: reviewComment.trim() || 'Withdrawn by proposer' };
    await setDoc(doc(db, 'statutoryChangeRequests', id), cleanData(decided));
    setStatutoryChangeRequests(previous => previous.map(item => item.id === id ? decided : item));
    if (decision !== 'Approved') return;
    const liveConfig: StatutoryConfig = { ...request.proposedConfig, id: statConfig.id, changeRequestId: id, updatedAt: now };
    await setDoc(doc(db, 'statConfig', liveConfig.id), cleanData(liveConfig));
    setStatConfig(liveConfig);
    privacyStorage.setItem('hr_stat_config', JSON.stringify(liveConfig));
    const proposedIds = new Set(request.proposedTaxSlabs.map(slab => slab.id));
    await Promise.all(request.proposedTaxSlabs.map(slab => setDoc(doc(db, 'taxSlabs', slab.id), cleanData({ ...slab, changeRequestId: id }))));
    await Promise.all(taxSlabs.filter(slab => !proposedIds.has(slab.id)).map(slab => deleteDoc(doc(db, 'taxSlabs', slab.id))));
    setTaxSlabs(request.proposedTaxSlabs);
    privacyStorage.setItem('hr_tax_slabs', JSON.stringify(request.proposedTaxSlabs));
  };


  // ─── Leave Handlers ───────────────────────────────────────────────────────
  const handleApproveLeave = async (id: string) => {
    const pendingLeave = leaves.find(item => item.id === id);
    const leaveEmployee = pendingLeave && employees.find(item => item.id === pendingLeave.employeeId);
    const approvalBalanceError = pendingLeave && leaveEmployee ? leaveBalanceError(pendingLeave, leaveEmployee, leaves, statConfig) : undefined;
    if (approvalBalanceError) { alert(`Approval blocked: ${approvalBalanceError}`); return; }
    const today = todayStr();
    const approverName = loggedInUser?.username || 'HR Manager';

    setLeaves(prev => {
      const updated = prev.map(l =>
        l.id === id ? { ...l, status: 'Approved', approvedBy: approverName, approvedOn: today } as LeaveRequest : l
      );
      privacyStorage.setItem('hr_leaves', JSON.stringify(updated));
      return updated;
    });

    // Auto-inject attendance logs for approved leave days
    const targetLeave = leaves.find(l => l.id === id);
    if (targetLeave) {
      const start = new Date(targetLeave.startDate);
      const end = new Date(targetLeave.endDate);
      const autoLogs: AttendanceLog[] = [];
      let d = new Date(start);

      while (d <= end) {
        const dateStr = d.toISOString().split('T')[0];
        // Skip if log already exists
        const alreadyExists = attendances.some(
          (a: AttendanceLog) => a.employeeId === targetLeave.employeeId && a.date === dateStr
        );
        if (!alreadyExists) {
          autoLogs.push({
            id: `att-auto-leave-${targetLeave.id}-${dateStr}`,
            employeeId: targetLeave.employeeId,
            date: dateStr,
            method: 'Manual',
            status: 'On Leave',
            overtimeMinutes: 0
          });
        }
        d.setDate(d.getDate() + 1);
      }

      if (autoLogs.length > 0) {
        setAttendances((prev: AttendanceLog[]) => {
          const updated = [...prev, ...autoLogs];
          privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
          for (const log of autoLogs) {
            setDoc(doc(db, 'attendances', log.id), log).catch(err =>
              console.warn('PostgreSQL auto-attendance sync delayed:')
            );
          }
          return updated;
        });
      }

      await handleAddNotification({
        id: `leave-approved-${targetLeave.id}-${Date.now()}`,
        type: 'leave_approved',
        title: 'Leave request approved',
        message: `Your ${targetLeave.leaveType} leave from ${targetLeave.startDate} to ${targetLeave.endDate} has been approved.`,
        titleUrdu: 'چھٹی کی درخواست منظور ہو گئی',
        messageUrdu: `آپ کی ${targetLeave.startDate} سے ${targetLeave.endDate} تک کی چھٹی منظور کر دی گئی ہے۔`,
        targetEmployeeId: targetLeave.employeeId,
        createdAt: new Date().toISOString(),
        readBy: [],
        priority: 'medium'
      });
    }

    try {
      await updateDoc(doc(db, 'leaves', id), {
        status: 'Approved',
        approvedBy: loggedInUser?.username || 'HR Manager',
        approvedOn: today
      });
    } catch (err) {
      console.warn('PostgreSQL leave approval delayed:');
    }
  };

  const handleRejectLeave = async (id: string) => {
    const today = todayStr();
    const targetLeave = leaves.find(l => l.id === id);
    setLeaves(prev => {
      const updated = prev.map(l =>
        l.id === id ? { ...l, status: 'Rejected', approvedBy: loggedInUser?.username, approvedOn: today } as LeaveRequest : l
      );
      privacyStorage.setItem('hr_leaves', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'leaves', id), { status: 'Rejected' });
    } catch (err) {
      console.warn('PostgreSQL leave rejection delayed:');
    }
    if (targetLeave) {
      await handleAddNotification({
        id: `leave-rejected-${targetLeave.id}-${Date.now()}`,
        type: 'leave_rejected',
        title: 'Leave request not approved',
        message: `Your ${targetLeave.leaveType} leave request from ${targetLeave.startDate} to ${targetLeave.endDate} was not approved. Please contact HR if you need more information.`,
        titleUrdu: 'چھٹی کی درخواست منظور نہیں ہوئی',
        messageUrdu: `آپ کی ${targetLeave.startDate} سے ${targetLeave.endDate} تک کی چھٹی منظور نہیں ہوئی۔ مزید معلومات کے لیے HR سے رابطہ کریں۔`,
        targetEmployeeId: targetLeave.employeeId,
        createdAt: new Date().toISOString(),
        readBy: [],
        priority: 'medium'
      });
    }
  };

  const handleApplyLeave = async (leave: LeaveRequest) => {
    const applicant = employees.find(item => item.id === leave.employeeId);
    const balanceError = applicant ? leaveBalanceError(leave, applicant, leaves, statConfig) : undefined;
    if (balanceError) { alert(balanceError); return; }
    setLeaves(prev => {
      const updated = [...prev, leave];
      privacyStorage.setItem('hr_leaves', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'leaves', leave.id), cleanData(leave));
    } catch (err) {
      console.warn('PostgreSQL leave apply delayed:');
    }
  };

  // ─── Attendance Handlers ──────────────────────────────────────────────────
  const reviewContextFor = (attendance: AttendanceLog) => ({
    actorEmployeeId: currentUserAccount.employeeId, employee: employees.find(item => item.id === attendance.employeeId), users, roles,
  });

  const handleApproveRegularization = async (id: string, reviewComment = '') => {
    const attendance = attendances.find(item => item.id === id);
    const reviewError = attendance ? attendanceReviewError(attendance, currentUserAccount.id, reviewContextFor(attendance)) : 'Attendance item was not found.';
    if (reviewError || !attendance) { alert(reviewError); return; }
    if (reviewComment.trim().length < 5) { alert('Enter an approval comment describing the evidence reviewed.'); return; }
    const reviewedAt = new Date().toISOString();
    const reviewedBy = currentUserAccount.username;
    const reviewedById = currentUserAccount.id;
    // Approval confirms the evidence; it must not upgrade a late, half-day or off-site punch to a clean Present.
    const employee = employees.find(item => item.id === attendance.employeeId);
    const status: AttendanceLog['status'] = attendance.punchIn
      ? evaluateAttendanceTimes(attendance.punchIn, attendance.punchOut, employee?.shift, attendance.breaks, attendance.date).status
      : attendance.status === 'Absent' ? 'Present' : attendance.status;
    const decision = { status, regularizationApproved: true, reviewedAt, reviewedBy, reviewedById, reviewComment: reviewComment.trim() };
    setAttendances(prev => {
      const updated = prev.map(att =>
        att.id === id ? { ...att, ...decision } as AttendanceLog : att
      );
      privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'attendances', id), decision);
    } catch (err) {
      console.warn('PostgreSQL regularization approval delayed:');
    }
  };

  const handleRejectRegularization = async (id: string, reviewComment = '') => {
    const attendance = attendances.find(item => item.id === id);
    const reviewError = attendance ? attendanceReviewError(attendance, currentUserAccount.id, reviewContextFor(attendance)) : 'Attendance item was not found.';
    if (reviewError || !attendance) { alert(reviewError); return; }
    if (reviewComment.trim().length < 5) { alert('Enter a rejection comment explaining the decision.'); return; }
    const reviewedAt = new Date().toISOString();
    const reviewedBy = currentUserAccount.username;
    const reviewedById = currentUserAccount.id;
    // Rejecting a flagged punch (off-site, low-confidence biometric, suspicious GPS) means the day is not credited.
    const decision = { regularizationApproved: false, reviewedAt, reviewedBy, reviewedById, reviewComment: reviewComment.trim(), ...(attendance.punchIn && { status: 'Absent' as const }) };
    setAttendances(prev => {
      const updated = prev.map(att =>
        att.id === id ? { ...att, ...decision } : att
      );
      privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'attendances', id), decision);
    } catch (err) {
      console.warn('PostgreSQL regularization rejection delayed:');
    }
  };


  const handleSimulatePunch = async (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number, locationAccuracyMeters?: number, locationCapturedAt?: string, locationAddress?: string, mobileDetails?: MobilePunchDetails) => {
    const today = todayStr();
    let mobileAuthorization: MobileDutyAuthorization | undefined;
    if (method === 'Mobile GPS') {
      mobileAuthorization = mobileDutyAuthorizations.find(item => item.employeeId === employeeId
        && item.status === 'Approved' && item.validFrom <= today && item.validTo >= today);
      if (!mobileAuthorization) throw new Error('Mobile attendance is not authorized for today. Contact your manager or HR.');
      const authorizationAllowsVisits = mobileAuthorization.allowFieldVisits
        || ['Client visit', 'Market / field duty', 'Out of station', 'Official travel', 'Direct reporting to worksite'].includes(mobileAuthorization.dutyType);
      if ((mobileDetails?.action === 'visit-in' || mobileDetails?.action === 'visit-out') && !authorizationAllowsVisits) {
        throw new Error('Client and field visits are not enabled in today’s mobile-duty assignment.');
      }
    }
    const existingIdx = attendances.findIndex(a => a.employeeId === employeeId && a.date === today);
    const punchTimestamp = new Date().toISOString();
    if (existingIdx !== -1 && isDuplicatePunch(attendances[existingIdx].lastPunchTimestamp, Date.parse(punchTimestamp))) {
      throw new Error('Duplicate punch ignored: this employee already punched within the last two minutes.');
    }
    const locationEvidence = lat !== undefined && lon !== undefined && locationAccuracyMeters !== undefined && locationCapturedAt
      ? { latitude: lat, longitude: lon, accuracyMeters: locationAccuracyMeters, capturedAt: locationCapturedAt, source: 'device-gps' as const, ...(locationAddress && { address: locationAddress }) }
      : undefined;

    if (method === 'Mobile GPS' && !locationEvidence) throw new Error('Verified mobile location is required.');
    let geofenceFields: Partial<AttendanceLog> = {};
    if (method === 'Mobile GPS' && locationEvidence) {
      const evidenceError = validateLocationEvidence(locationEvidence);
      if (evidenceError) throw new Error(evidenceError);
      const sameDay = existingIdx !== -1 ? attendances[existingIdx] : undefined;
      const travelRisk = impossibleTravel([...(sameDay ? attendanceLocations(sameDay) : []), locationEvidence]
        .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt)));
      const employee = employees.find(item => item.id === employeeId);
      const geofence = evaluateBranchGeofence(branches.find(item => item.id === employee?.branchId), locationEvidence);
      if (travelRisk) geofenceFields = {
        geofenceStatus: 'needs-review', geofenceDistanceMeters: geofence.distanceMeters, locationRisk: travelRisk,
        regularizationRequested: true, requestedAt: punchTimestamp, regularizationReason: travelRisk,
      };
      else if (geofence.inside) geofenceFields = { geofenceStatus: 'inside', geofenceDistanceMeters: geofence.distanceMeters };
      else geofenceFields = {
        geofenceStatus: geofence.configured ? 'authorized-offsite' : 'needs-review',
        geofenceDistanceMeters: geofence.distanceMeters,
        regularizationRequested: true,
        requestedAt: punchTimestamp,
        regularizationReason: geofence.configured
          ? `Authorized off-site mobile punch (${geofence.distanceMeters} metres from branch); manager review required.`
          : geofence.reason,
      };
    }

    if (mobileDetails?.action === 'visit-in' || mobileDetails?.action === 'visit-out') {
      if (existingIdx === -1) throw new Error('Start the workday before recording a client or field visit.');
      const existing = attendances[existingIdx];
      if (existing.punchOut) throw new Error('The workday is already finished.');
      const visits = [...(existing.fieldVisits || [])];
      let activeIndex = -1;
      for (let index = visits.length - 1; index >= 0; index -= 1) {
        if (!visits[index].checkOut) { activeIndex = index; break; }
      }
      if (mobileDetails.action === 'visit-in') {
        if (activeIndex !== -1) throw new Error('Check out from the active visit before starting another visit.');
        visits.push({
          id: `visit-${employeeId}-${Date.now()}`,
          clientName: mobileDetails.clientName?.trim() || 'Field visit',
          checkIn: punchIn,
          checkInReasonCategory: mobileDetails.reasonCategory,
          checkInReasonNote: mobileDetails.reasonNote,
          checkInLocation: locationEvidence!,
          method: 'Mobile GPS',
          verificationMethod: mobileDetails.verificationMethod || 'Camera',
        });
      } else {
        if (activeIndex === -1) throw new Error('No active client or field visit was found.');
        visits[activeIndex] = {
          ...visits[activeIndex],
          checkOut: punchOut,
          checkOutReasonCategory: mobileDetails.reasonCategory,
          checkOutReasonNote: mobileDetails.reasonNote,
          checkOutLocation: locationEvidence!,
        };
      }
      const updatedLog: AttendanceLog = { ...existing, ...geofenceFields, method: 'Mobile GPS', fieldVisits: visits, lastPunchAt: locationCapturedAt, lastPunchTimestamp: punchTimestamp, mobileDutyAuthorizationId: mobileAuthorization!.id };
      setAttendances(prev => {
        const updated = prev.map(att => att.id === updatedLog.id ? updatedLog : att);
        privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
        return updated;
      });
      await setDoc(doc(db, 'attendances', updatedLog.id), cleanData(updatedLog));
      return;
    }

    if (existingIdx !== -1) {
      // Punch out — compute the updated log BEFORE calling setAttendances.
      // Never set values via updater side-effects: in React 18 concurrent mode the
      // updater runs during the render phase, so any variable assigned inside it is
      // still null by the time the next line after setAttendances executes.
      const existing = attendances[existingIdx];
      const returnableCheckoutReasons = new Set([
        'Lunch Break', 'Tea Break', 'Official Duty', 'Client Meeting', 'Site Visit',
        'Personal Work', 'Medical Appointment', 'Prayer',
      ]);
      if (method === 'Mobile Kiosk' && existing.punchOut && punchIn && returnableCheckoutReasons.has(existing.outReason?.trim() || '')) {
        const resumedLog: AttendanceLog = {
          ...existing,
          punchOut: '',
          outReason: '',
          lastPunchAt: punchIn,
          lastPunchTimestamp: punchTimestamp,
          method: 'Mobile Kiosk',
          breaks: [
            ...(existing.breaks || []),
            {
              reason: existing.outReason!.trim(),
              outAt: existing.punchOut,
              returnAt: punchIn,
              outMethod: existing.method,
              returnMethod: 'Mobile Kiosk',
            },
          ],
        };
        await setDoc(doc(db, 'attendances', resumedLog.id), cleanData(resumedLog));
        setAttendances(previous => previous.map(item => item.id === resumedLog.id ? resumedLog : item));
        return;
      }
      if (mobileDetails?.action === 'workday-in') throw new Error('The workday has already been started.');
      if (mobileDetails?.action === 'workday-out' && existing.punchOut) throw new Error('The workday has already been finished.');
      if (mobileDetails?.action === 'workday-out' && existing.fieldVisits?.some(visit => !visit.checkOut)) throw new Error('Check out from the active field visit before finishing the workday.');
      const employee = employees.find(item => item.id === employeeId);
      const evaluated = evaluateAttendanceTimes(existing.punchIn, punchOut, employee?.shift, existing.breaks, existing.date);
      const updatedLog: AttendanceLog = {
        ...existing,
        ...(mobileAuthorization && { method: 'Mobile GPS', mobileDutyAuthorizationId: mobileAuthorization.id }),
        punchOut,
        lastPunchAt: punchOut,
        lastPunchTimestamp: punchTimestamp,
        ...(method === 'Mobile Kiosk' && mobileDetails?.reasonNote && { outReason: mobileDetails.reasonNote }),
        status: evaluated.status,
        overtimeMinutes: evaluated.overtimeMinutes,
        ...(lat !== undefined && { latitude: lat }),
        ...(lon !== undefined && { longitude: lon }),
        ...(locationAccuracyMeters !== undefined && { locationAccuracyMeters }),
        ...(locationCapturedAt && { locationCapturedAt, locationSource: 'device-gps' as const }),
        ...(locationAddress && { address: locationAddress }),
        ...(locationEvidence && { punchOutLocation: locationEvidence }),
        ...(mobileDetails && { punchOutReasonCategory: mobileDetails.reasonCategory, punchOutReasonNote: mobileDetails.reasonNote })
        ,...geofenceFields
      };
      await setDoc(doc(db, 'attendances', updatedLog.id), cleanData(updatedLog));
      setAttendances(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(a => a.id === updatedLog.id);
        if (idx !== -1) updated[idx] = updatedLog;
        privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
        return updated;
      });
    } else {
      if (mobileDetails && mobileDetails.action !== 'workday-in') throw new Error('Start the workday before performing this action.');
      // Punch in — create new log
      const employee = employees.find(item => item.id === employeeId);
      const status = evaluateAttendanceTimes(punchIn, undefined, employee?.shift, [], today).status;
      const newLog: AttendanceLog = {
        id: `att-${employeeId}-${Date.now()}`,
        employeeId,
        date: today,
        punchIn,
        lastPunchAt: punchIn,
        lastPunchTimestamp: punchTimestamp,
        method: method as AttendanceLog['method'],
        status,
        overtimeMinutes: 0,
        ...(lat !== undefined && { latitude: lat }),
        ...(lon !== undefined && { longitude: lon }),
        ...(locationAccuracyMeters !== undefined && { locationAccuracyMeters }),
        ...(locationCapturedAt && { locationCapturedAt, locationSource: 'device-gps' as const }),
        ...(locationAddress && { address: locationAddress }),
        ...(locationEvidence && { punchInLocation: locationEvidence }),
        ...(mobileDetails && { punchInReasonCategory: mobileDetails.reasonCategory, punchInReasonNote: mobileDetails.reasonNote })
        ,...(mobileAuthorization && { mobileDutyAuthorizationId: mobileAuthorization.id })
        ,...geofenceFields
      };
      await setDoc(doc(db, 'attendances', newLog.id), cleanData(newLog));
      setAttendances(prev => {
        const updated = [...prev, newLog];
        privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleAddRegularization = async (employeeId: string, date: string, reason: string, evidenceDocumentIds: string[] = []) => {
    const newRegLog: AttendanceLog = {
      id: `att-reg-${employeeId}-${Date.now()}`,
      employeeId,
      date,
      method: 'Manual',
      status: 'Absent',
      overtimeMinutes: 0,
      regularizationRequested: true,
      regularizationReason: reason,
      requestedById: currentUserAccount.id,
      requestedAt: new Date().toISOString(),
      ...(evidenceDocumentIds.length && { evidenceDocumentIds })
    };
    setAttendances(prev => {
      const updated = [...prev, newRegLog];
      privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'attendances', newRegLog.id), cleanData(newRegLog));
    } catch (err) {
      console.warn('Database regularization delayed:');
    }
  };

  const handleAddAttendance = async (newAtt: AttendanceLog) => {
    setAttendances(prev => {
      const updated = [...prev, newAtt];
      privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'attendances', newAtt.id), cleanData(newAtt));
    } catch (err) {
      console.warn('Database attendance add delayed:');
    }
  };

  // ─── Payroll Handler ──────────────────────────────────────────────────────
  const registerInputs = { employees, leaves, holidays };
  // Cancelled runs stay for audit but must not feed year-to-date tax, variance checks or arrears.
  const cancelledRunIds = new Set(payrollRuns.filter(run => run.status === 'Cancelled').map(run => run.id));
  const effectivePayslips = payrollPayslips.filter(item => !cancelledRunIds.has(item.payrollRunId));

  const handleLockAttendancePeriod = async (month: number, year: number) => {
    const id = attendancePeriodId(month, year);
    const existing = attendancePeriods.find(item => item.id === id);
    if (existing?.status === 'Locked') {
      alert(isAttendancePeriodValid(existing, attendances, registerInputs)
        ? 'This attendance period is already locked and its integrity check is valid.'
        : 'Attendance, leave, holiday or roster data changed after this register was locked. Reopen the register with a documented reason, review the changes, then lock it again.');
      return;
    }
    try {
      const period = createAttendancePeriod(attendances, employees, leaves, holidays, month, year, currentUserAccount.username || currentUserAccount.id, undefined, existing);
      await setDoc(doc(db, 'attendancePeriods', period.id), cleanData(period));
      setAttendancePeriods(previous => [...previous.filter(item => item.id !== period.id), period]);
      alert(`Attendance register locked. Integrity reference: ${period.integrityHash}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Attendance period could not be locked.');
    }
  };

  const handleReopenAttendancePeriod = async (month: number, year: number, reason: string) => {
    const existing = attendancePeriods.find(item => item.id === attendancePeriodId(month, year));
    if (!existing) { alert('This attendance period has not been locked.'); return; }
    try {
      const reopened = reopenAttendancePeriod(existing, reason, currentUserAccount.username || currentUserAccount.id, currentUserAccount.id, payrollRuns);
      await setDoc(doc(db, 'attendancePeriods', reopened.id), cleanData(reopened));
      setAttendancePeriods(previous => previous.map(item => item.id === reopened.id ? reopened : item));
      alert(`Attendance register reopened (version ${reopened.registerVersion || 1}). Corrections are now allowed; lock it again before payroll.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Attendance period could not be reopened.');
    }
  };

  const handleCreatePayrollRun = async (title: string, month: number, year: number) => {
    if (payrollRuns.some(run => run.periodMonth === month && run.periodYear === year && run.status !== 'Cancelled')) {
      alert('A payroll run already exists for this period. Open the existing run instead of creating a duplicate.');
      return;
    }
    const payrollPeriodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const expectedTaxYear = String(month >= 7 ? year + 1 : year);
    if (!statConfig.effectiveFrom || payrollPeriodStart < statConfig.effectiveFrom
      || (statConfig.effectiveTo && payrollPeriodStart > statConfig.effectiveTo)
      || statConfig.taxYear !== expectedTaxYear) {
      alert(`Payroll refused: statutory configuration is not valid for this period. Expected Pakistan Tax Year ${expectedTaxYear} with an effective date covering ${payrollPeriodStart}.`);
      return;
    }

    const lockedPeriod = attendancePeriods.find(item => item.id === attendancePeriodId(month, year));
    if (!lockedPeriod || !isAttendancePeriodValid(lockedPeriod, attendances, registerInputs)) {
      alert('Payroll refused: lock the attendance register first. If attendance, leave, holiday or roster data changed after locking, reopen, review and lock it again.');
      return;
    }
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    const pendingReviews = attendances.filter(
      a => a.date.startsWith(monthPrefix) && a.regularizationRequested && a.regularizationApproved === undefined
    );
    if (pendingReviews.length > 0) {
      alert(`Payroll cycle refused: There are ${pendingReviews.length} pending item(s) in "Needs Review" for ${month}/${year}. Clear all attendance exceptions and regularizations before locking the register.`);
      return;
    }

    const lastDay = new Date(year, month, 0).getDate();
    const eligibleEmployees = employees.filter(emp => emp.status === 'Active' || emp.status === 'On Leave');
    const runId = `run-${month}-${year}-${Date.now()}`;

    const sheets = eligibleEmployees.map(emp => ({
      ...computePayslipDetails(emp, month, year, attendances, leaves, statConfig, taxSlabs, departments, designations, branches, loanAdvances, wageTypes, holidays, effectivePayslips, payrollAdjustments, lockedPeriod.registerRows),
      id: `${runId}-${emp.id}`,
      payrollRunId: runId
    }));

    const totalGrossPay = sheets.reduce((sum, s) => sum + s.grossSalary, 0);
    const totalDeductions = sheets.reduce((sum, s) => sum + s.totalDeductions, 0);
    const totalNetPay = sheets.reduce((sum, s) => sum + s.netSalary, 0);
    const totalEobiEmployer = sheets.reduce((sum, s) => sum + s.eobiEmployerContribution, 0);
    const totalSocialSecurityEmployer = sheets.reduce((sum, s) => sum + s.pessiEmployerContribution, 0);
    const preflightIssues = payrollPreflight(employees, sheets, effectivePayslips, branches, statConfig, wageTypes);
    const preflightCriticalCount = preflightIssues.filter(item => item.severity === 'Critical').length;
    const preflightWarningCount = preflightIssues.filter(item => item.severity === 'Warning').length;
    if (preflightCriticalCount > 0) {
      const preview = preflightIssues.filter(item => item.severity === 'Critical').slice(0, 5).map(item => `${item.employeeName}: ${item.message}`).join('\n');
      alert(`Payroll preflight failed with ${preflightCriticalCount} critical issue(s). Correct employee payment records before creating the run.\n\n${preview}`);
      return;
    }

    const newRun: PayrollRun = {
      id: runId,
      title,
      periodMonth: month,
      periodYear: year,
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      status: 'Draft',
      createdAt: todayStr(),
      totalGrossPay,
      totalDeductions,
      totalNetPay,
      totalEobiEmployer,
      totalSocialSecurityEmployer,
      employeeCount: eligibleEmployees.length,
      statutoryConfigId: statConfig.id,
      statutoryEffectiveFrom: statConfig.effectiveFrom,
      createdById: currentUserAccount.id,
      auditTrail: [{ action: 'Created', at: new Date().toISOString(), by: currentUserAccount.username, actorId: currentUserAccount.id }],
      attendancePeriodId: lockedPeriod.id,
      attendanceIntegrityHash: lockedPeriod.integrityHash,
      attendanceRegisterHash: lockedPeriod.registerHash,
      preflightCriticalCount,
      preflightWarningCount,
    };

    setPayrollRuns(prev => {
      const updated = [...prev, newRun];
      privacyStorage.setItem('hr_payroll_runs', JSON.stringify(updated));
      return updated;
    });

    // Process loan installments — reduce remaining installments
    setPayrollPayslips(prev => {
      const updated = [...prev, ...sheets];
      privacyStorage.setItem('hr_payroll_payslips', JSON.stringify(updated));
      return updated;
    });

    try {
      await setDoc(doc(db, 'payrollRuns', newRun.id), cleanData(newRun));
      await Promise.all(sheets.map(sheet => setDoc(doc(db, 'payrollPayslips', sheet.id), cleanData(sheet))));
      const usedAdjustmentIds = new Set(sheets.flatMap(sheet => sheet.payrollAdjustmentIds || []));
      const assignedAdjustments = payrollAdjustments.map(item => usedAdjustmentIds.has(item.id) ? { ...item, payrollRunId: runId } : item);
      await Promise.all(assignedAdjustments.filter(item => usedAdjustmentIds.has(item.id)).map(item => setDoc(doc(db, 'payrollAdjustments', item.id), cleanData(item))));
      setPayrollAdjustments(assignedAdjustments);
    } catch (err) {
      console.warn('Database payroll run sync delayed:');
    }

    alert(`Draft payroll created for ${eligibleEmployees.length} employees. Review and approve it before loan deductions or disbursement.\nGross Pay: PKR ${totalGrossPay.toLocaleString()}\nNet Pay: PKR ${totalNetPay.toLocaleString()}`);
  };

  const handleCreatePayrollAdjustment = async (adjustment: PayrollAdjustment) => {
    await setDoc(doc(db, 'payrollAdjustments', adjustment.id), cleanData(adjustment));
    setPayrollAdjustments(previous => [...previous, adjustment]);
  };

  const handleReviewPayrollAdjustment = async (id: string, status: 'Approved' | 'Rejected') => {
    const adjustment = payrollAdjustments.find(item => item.id === id);
    if (!adjustment || adjustment.status !== 'Pending') return;
    if (adjustment.createdById === currentUserAccount.id) { alert('Maker-checker control: another payroll user must review this adjustment.'); return; }
    const updated = { ...adjustment, status, reviewedAt: new Date().toISOString(), reviewedById: currentUserAccount.id, reviewedBy: currentUserAccount.username };
    await setDoc(doc(db, 'payrollAdjustments', id), cleanData(updated));
    setPayrollAdjustments(previous => previous.map(item => item.id === id ? updated : item));
  };

  const handleRecordBankAdvice = async (runId: string, checksum: string, employeeCount: number, total: number, profile: PayrollRun['bankAdviceProfile'], batch?: { batchReference: string; controlHash: string; verified: boolean }) => {
    const run = payrollRuns.find(item => item.id === runId);
    if (!run || run.status !== 'Approved') throw new Error('Approve payroll before generating bank advice.');
    const updated: PayrollRun = { ...run, bankAdviceChecksum: checksum, bankAdviceGeneratedAt: new Date().toISOString(), bankAdviceGeneratedById: currentUserAccount.id, bankAdviceEmployeeCount: employeeCount, bankAdviceTotal: total, bankAdviceProfile: profile || 'Generic CSV', ...(batch && { bankAdviceBatchReference: batch.batchReference, bankAdviceControlHash: batch.controlHash, bankAdviceTemplateVerified: batch.verified }) };
    await setDoc(doc(db, 'payrollRuns', runId), cleanData(updated));
    setPayrollRuns(previous => previous.map(item => item.id === runId ? updated : item));
  };

  const handleSendPayslips = async (runId: string) => authenticatedApiRequest(`/api/payroll-delivery/${encodeURIComponent(runId)}/send`, { method: 'POST', body: '{}' }) as Promise<{ sent: number; skipped: number; failed: Array<{ employeeId: string; error: string }> }>;

  const handleUpdatePayrollStatus = async (runId: string, nextStatus: 'Approved' | 'Disbursed', disbursementReference?: string) => {
    const run = payrollRuns.find(item => item.id === runId);
    if (!run) return;
    const transitionError = payrollTransitionError(run, nextStatus, currentUserAccount.id);
    if (transitionError) { alert(`Maker-checker control: ${transitionError}`); return; }
    if (nextStatus === 'Approved') {
      const runSheets = payrollPayslips.filter(item => item.payrollRunId === runId);
      const criticalIssues = payrollPreflight(employees, runSheets, effectivePayslips, branches, statConfig, wageTypes).filter(item => item.severity === 'Critical');
      if (criticalIssues.length) {
        alert(`Approval blocked: ${criticalIssues.length} critical payroll preflight issue(s) remain. ${criticalIssues[0].employeeName}: ${criticalIssues[0].message}`);
        return;
      }
    }
    if (nextStatus === 'Disbursed' && (!run.bankAdviceChecksum || !disbursementReference?.trim())) {
      alert('Disbursement blocked: download the bank advice first and enter the bank transaction/reference number.');
      return;
    }
    const now = new Date().toISOString();
    const updatedRun: PayrollRun = {
      ...run,
      status: nextStatus,
      ...(nextStatus === 'Approved'
        ? { approvedAt: now, approvedBy: currentUserAccount.username, approvedById: currentUserAccount.id }
        : { disbursedAt: now, disbursedBy: currentUserAccount.username, disbursedById: currentUserAccount.id, disbursementReference: disbursementReference!.trim() }),
      auditTrail: [...(run.auditTrail || []), { action: nextStatus, at: now, by: currentUserAccount.username, actorId: currentUserAccount.id }]
    };

    setPayrollRuns(prev => {
      const updated = prev.map(item => item.id === runId ? updatedRun : item);
      privacyStorage.setItem('hr_payroll_runs', JSON.stringify(updated));
      return updated;
    });
    await setDoc(doc(db, 'payrollRuns', runId), cleanData(updatedRun));

    if (nextStatus === 'Disbursed') {
      const paidPayslips = payrollPayslips.filter(item => item.payrollRunId === runId);
      await Promise.all(paidPayslips.map(payslip => handleAddNotification({
        id: `payroll-disbursed-${runId}-${payslip.employeeId}`,
        type: 'payroll_processed',
        title: 'Salary has been disbursed',
        message: `Your salary for ${run.title} has been disbursed. Check your payslip and bank account for the payment.`,
        titleUrdu: 'تنخواہ جاری کر دی گئی ہے',
        messageUrdu: `${run.title} کی آپ کی تنخواہ جاری کر دی گئی ہے۔ ادائیگی کے لیے اپنی پے سلپ اور بینک اکاؤنٹ دیکھیں۔`,
        targetEmployeeId: payslip.employeeId,
        createdAt: now,
        readBy: [],
        priority: 'high'
      })));
    }

    // Loan balances move only when salary is actually paid; an approved run can still be cancelled.
    if (nextStatus === 'Disbursed') {
      const runEmployeeIds = new Set(payrollPayslips.filter(p => p.payrollRunId === runId && p.loanRepaymentDeduction > 0).map(p => p.employeeId));
      const changedLoanIds = new Set<string>();
      const updatedLoans = loanAdvances.map((loan: LoanAdvance) => {
        if (!runEmployeeIds.has(loan.employeeId) || loan.status !== 'Active' || loan.remainingInstallments <= 0) return loan;
        changedLoanIds.add(loan.id);
        const remainingInstallments = loan.remainingInstallments - 1;
        return {
          ...loan,
          remainingInstallments,
          totalRepaid: loan.totalRepaid + loan.monthlyInstallment,
          status: remainingInstallments === 0 ? 'Closed' : 'Active' as LoanAdvance['status']
        };
      });
      setLoanAdvances(updatedLoans);
      privacyStorage.setItem('hr_loans', JSON.stringify(updatedLoans));
      await Promise.all(updatedLoans.filter(loan => changedLoanIds.has(loan.id)).map(loan => setDoc(doc(db, 'loanAdvances', loan.id), cleanData(loan))));
    }
  };

  const handleCancelPayrollRun = async (runId: string, reason: string) => {
    const run = payrollRuns.find(item => item.id === runId);
    if (!run) return;
    const cancellationError = payrollCancellationError(run, reason);
    if (cancellationError) { alert(cancellationError); return; }
    const now = new Date().toISOString();
    const cancelledRun: PayrollRun = {
      ...run, status: 'Cancelled', statusBeforeCancellation: run.status as 'Draft' | 'Approved',
      cancelledAt: now, cancelledBy: currentUserAccount.username, cancelledById: currentUserAccount.id, cancellationReason: reason.trim(),
      auditTrail: [...(run.auditTrail || []), { action: 'Cancelled', at: now, by: currentUserAccount.username, actorId: currentUserAccount.id, reason: reason.trim() }],
    };
    await setDoc(doc(db, 'payrollRuns', runId), cleanData(cancelledRun));
    setPayrollRuns(previous => previous.map(item => item.id === runId ? cancelledRun : item));
    // Release approved adjustments so they flow into the replacement run for the same period.
    const released = payrollAdjustments.filter(item => item.payrollRunId === runId).map(({ payrollRunId: _released, ...item }) => item as PayrollAdjustment);
    await Promise.all(released.map(item => setDoc(doc(db, 'payrollAdjustments', item.id), cleanData(item))));
    const releasedById = new Map(released.map(item => [item.id, item]));
    setPayrollAdjustments(previous => previous.map(item => releasedById.get(item.id) || item));
    alert(`Payroll run cancelled. ${released.length} adjustment(s) released. The attendance register can now be reopened or a replacement run created.`);
  };

  // ─── Escalation of overdue attendance corrections ──────────────────────────
  // Deterministic notification ids make this idempotent across sessions and reviewers.
  useEffect(() => {
    const canEscalate = currentUserAccount.roleId === 'role-admin' || roles.find(role => role.id === currentUserAccount.roleId)?.permissions.includes('manage_attendance');
    if (!canEscalate) return;
    const known = new Set(notifications.map(item => item.id));
    for (const attendance of attendances) {
      if (!isRegularizationOverdue(attendance)) continue;
      const employee = employees.find(item => item.id === attendance.employeeId);
      const manager = lineManagerReviewer({ employee, users, roles });
      const id = `regularization-overdue-${attendance.id}`;
      if (known.has(id) || !manager?.employeeId) continue;
      void handleAddNotification({
        id, type: 'system', priority: 'high', createdAt: new Date().toISOString(), readBy: [], targetEmployeeId: manager.employeeId,
        title: 'Attendance correction overdue', message: `${employee?.fullName || 'An employee'}'s attendance correction for ${attendance.date} passed its 3-working-day review deadline and is now escalated to HR.`,
        titleUrdu: 'حاضری کی درستگی زیر التواء', messageUrdu: `${attendance.date} کی حاضری کی درستگی کی مقررہ مدت گزر گئی ہے اور معاملہ HR کو بھیج دیا گیا ہے۔`,
      });
    }
  }, [attendances, notifications.length, users, roles, currentUserAccount.id]);

  // ─── Employee Lifecycle Handlers ──────────────────────────────────────────
  const handleCreateLifecycleRequest = async (draft: Omit<LifecycleRequest, 'id' | 'status' | 'createdAt' | 'createdById' | 'createdBy'>) => {
    const employee = employees.find(item => item.id === draft.employeeId);
    const error = lifecycleRequestError(draft, employee);
    if (error) { alert(error); return false; }
    if (lifecycleRequests.some(item => item.employeeId === draft.employeeId && item.type === draft.type && item.status === 'Pending')) {
      alert(`A ${draft.type.toLowerCase()} request for this employee is already pending.`);
      return false;
    }
    const request: LifecycleRequest = { ...draft, reason: draft.reason.trim(), id: `life-${draft.employeeId}-${Date.now()}`, status: 'Pending', createdAt: new Date().toISOString(), createdById: currentUserAccount.id, createdBy: currentUserAccount.username };
    await setDoc(doc(db, 'lifecycleRequests', request.id), cleanData(request));
    setLifecycleRequests(previous => [...previous, request]);
    return true;
  };

  const handleReviewLifecycleRequest = async (id: string, decision: 'Approved' | 'Rejected', reviewComment: string) => {
    const request = lifecycleRequests.find(item => item.id === id);
    const employee = request && employees.find(item => item.id === request.employeeId);
    if (!request || !employee) return;
    const reviewError = lifecycleReviewError(request, currentUserAccount.id);
    if (reviewError) { alert(`Maker-checker control: ${reviewError}`); return; }
    if (reviewComment.trim().length < 5) { alert('Enter a review comment.'); return; }
    const now = new Date().toISOString();
    let decided: LifecycleRequest = { ...request, status: decision, reviewedAt: now, reviewedById: currentUserAccount.id, reviewedBy: currentUserAccount.username, reviewComment: reviewComment.trim() };
    if (decision === 'Approved') {
      const outcome = applyLifecycleRequest(request, employee, currentUserAccount, now, statConfig, wageTypes);
      await handleUpdateEmployee(outcome.employee);
      if (outcome.settlement) { await handleAddGratuitySettlement(outcome.settlement); decided = { ...decided, settlementId: outcome.settlement.id }; }
      if (outcome.salaryRevision) { await handleAddSalaryRevision(outcome.salaryRevision); decided = { ...decided, salaryRevisionId: outcome.salaryRevision.id }; }
    }
    await setDoc(doc(db, 'lifecycleRequests', id), cleanData(decided));
    setLifecycleRequests(previous => previous.map(item => item.id === id ? decided : item));
  };

  const handleUpdateOnboarding = async (employeeId: string, item: NonNullable<keyof NonNullable<Employee['onboardingChecklist']>>, done: boolean) => {
    const employee = employees.find(record => record.id === employeeId);
    if (!employee) return;
    const stamp = { done, at: new Date().toISOString(), by: currentUserAccount.username };
    const updated: Employee = {
      ...employee,
      onboardingChecklist: { ...(employee.onboardingChecklist || {}), [item]: stamp },
      ...(item === 'bankVerified' && (done ? { bankVerifiedAt: stamp.at, bankVerifiedBy: stamp.by } : { bankVerifiedAt: undefined, bankVerifiedBy: undefined })),
    };
    await handleUpdateEmployee(updated);
  };

  // ─── Off-cycle Payroll, Tax Deposits & Payment Exceptions ─────────────────
  const persistRun = async (run: PayrollRun, sheets: Payslip[]) => {
    await setDoc(doc(db, 'payrollRuns', run.id), cleanData(run));
    await Promise.all(sheets.map(sheet => setDoc(doc(db, 'payrollPayslips', sheet.id), cleanData(sheet))));
    setPayrollRuns(previous => [...previous, run]);
    setPayrollPayslips(previous => [...previous, ...sheets]);
  };

  const offCycleRun = (title: string, month: number, year: number, sheets: Payslip[], extra: Partial<PayrollRun>): PayrollRun => {
    const lastDay = new Date(year, month, 0).getDate();
    return {
      id: '', title, periodMonth: month, periodYear: year, status: 'Draft', createdAt: todayStr(),
      startDate: `${year}-${String(month).padStart(2, '0')}-01`, endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      totalGrossPay: sheets.reduce((sum, item) => sum + item.grossSalary, 0), totalDeductions: sheets.reduce((sum, item) => sum + item.totalDeductions, 0),
      totalNetPay: sheets.reduce((sum, item) => sum + item.netSalary, 0), totalEobiEmployer: 0, totalSocialSecurityEmployer: 0, employeeCount: sheets.length,
      statutoryConfigId: statConfig.id, statutoryEffectiveFrom: statConfig.effectiveFrom, createdById: currentUserAccount.id,
      auditTrail: [{ action: 'Created', at: new Date().toISOString(), by: currentUserAccount.username, actorId: currentUserAccount.id }],
      attendancePeriodId: '', attendanceIntegrityHash: '', preflightCriticalCount: 0, preflightWarningCount: 0, ...extra,
    };
  };

  const handleCreateSupplementaryRun = async (month: number, year: number) => {
    const regular = payrollRuns.find(run => run.periodMonth === month && run.periodYear === year && (run.runType || 'Regular') === 'Regular' && run.status !== 'Cancelled');
    if (!regular) { alert('Create the regular payroll for this period first; supplementary runs pay items approved after it.'); return; }
    const directory = { departments, designations, branches };
    const sheets = employees.flatMap(employee => {
      const base = effectivePayslips.find(item => item.payrollRunId === regular.id && item.employeeId === employee.id);
      const sheet = computeSupplementaryPayslip(employee, month, year, payrollAdjustments, base, statConfig, taxSlabs, directory);
      return sheet ? [sheet] : [];
    });
    if (!sheets.length) { alert('No approved, unpaid adjustments exist for this period.'); return; }
    if (sheets.some(sheet => sheet.netSalary <= 0)) { alert('A supplementary payslip would have zero or negative net pay. Review deductions before running it.'); return; }
    const runId = `run-supp-${month}-${year}-${Date.now()}`;
    const run = { ...offCycleRun(`Supplementary payroll - ${month}/${year}`, month, year, sheets, { runType: 'Supplementary', attendancePeriodId: regular.attendancePeriodId, attendanceIntegrityHash: regular.attendanceIntegrityHash, attendanceRegisterHash: regular.attendanceRegisterHash }), id: runId };
    const linked = sheets.map(sheet => ({ ...sheet, id: `${runId}-${sheet.employeeId}`, payrollRunId: runId }));
    await persistRun(run, linked);
    const used = new Set(linked.flatMap(sheet => sheet.payrollAdjustmentIds || []));
    const assigned = payrollAdjustments.filter(item => used.has(item.id)).map(item => ({ ...item, payrollRunId: runId }));
    await Promise.all(assigned.map(item => setDoc(doc(db, 'payrollAdjustments', item.id), cleanData(item))));
    setPayrollAdjustments(previous => previous.map(item => assigned.find(next => next.id === item.id) || item));
    alert(`Supplementary draft created for ${linked.length} employee(s): net PKR ${run.totalNetPay.toLocaleString()}. Another payroll officer must approve it.`);
  };

  const handleCreateFinalSettlementRun = async (settlementId: string) => {
    const settlement = gratuitySettlements.find(item => item.id === settlementId);
    const employee = settlement && employees.find(item => item.id === settlement.employeeId);
    if (!settlement || !employee) return;
    if (payrollRuns.some(run => run.settlementId === settlementId && run.status !== 'Cancelled')) { alert('A payroll run already exists for this settlement.'); return; }
    try {
      const sheet = computeFinalSettlementPayslip(employee, settlement, loanAdvances, effectivePayslips, statConfig, taxSlabs, { departments, designations, branches });
      if (sheet.netSalary <= 0) { alert('Settlement net pay is zero after tax and loan recovery; record the settlement outside payroll.'); return; }
      const runId = `run-fs-${employee.id}-${Date.now()}`;
      const run = { ...offCycleRun(`Final settlement - ${employee.fullName}`, sheet.periodMonth!, sheet.periodYear!, [sheet], { runType: 'Final Settlement', settlementId }), id: runId };
      await persistRun(run, [{ ...sheet, id: `${runId}-${employee.id}`, payrollRunId: runId }]);
      alert(`Final settlement draft created: gross PKR ${sheet.grossSalary.toLocaleString()}, tax PKR ${sheet.incomeTaxDeduction.toLocaleString()}, loan recovery PKR ${sheet.loanRepaymentDeduction.toLocaleString()}, net PKR ${sheet.netSalary.toLocaleString()}.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Final settlement payroll could not be created.');
    }
  };

  const handleRetroRecalculate = async (payslipId: string, reason: string, target: { month: number; year: number }) => {
    const original = payrollPayslips.find(item => item.id === payslipId);
    const run = original && payrollRuns.find(item => item.id === original.payrollRunId);
    const employee = original && employees.find(item => item.id === original.employeeId);
    if (!original || !run || !employee || !original.periodMonth || !original.periodYear) { alert('Choose a paid payslip to recalculate.'); return; }
    if ((run.runType || 'Regular') !== 'Regular' || (run.status !== 'Approved' && run.status !== 'Disbursed')) { alert('Only processed regular payroll months can be recalculated.'); return; }
    const register = attendancePeriods.find(item => item.id === run.attendancePeriodId)?.registerRows;
    // Recompute the month exactly as payroll did, against the same locked register, with today's corrected employee data.
    const recomputed = computePayslipDetails(employee, original.periodMonth, original.periodYear, attendances, leaves, statConfig, taxSlabs, departments, designations, branches,
      loanAdvances, wageTypes, holidays, effectivePayslips.filter(item => item.id !== original.id), [], register);
    try {
      const result = retroRecalculationAdjustment(original, recomputed, reason, currentUserAccount, target);
      if (!result.adjustment) { alert('Recalculation matches what was paid; no correction is needed.'); return; }
      const lines = result.breakdown.map(([label, delta]) => `• ${label}: ${delta > 0 ? '+' : ''}PKR ${delta.toLocaleString()}`).join('\n');
      if (!window.confirm(`${employee.fullName} — ${original.periodYear}-${String(original.periodMonth).padStart(2, '0')}\n${lines}\n\n${result.adjustment.type} of PKR ${result.adjustment.amount.toLocaleString()} will be raised for ${target.month}/${target.year} and needs approval by another payroll user. Continue?`)) return;
      await handleCreatePayrollAdjustment(result.adjustment);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Recalculation failed.');
    }
  };

  const handleRecordParallelRun = async (runId: string, record: Omit<ParallelRunRecord, 'comparedAt' | 'comparedById' | 'comparedBy'>) => {
    const run = payrollRuns.find(item => item.id === runId);
    if (!run || (run.status !== 'Approved' && run.status !== 'Disbursed')) { alert('Record parallel-run results on an approved or disbursed payroll.'); return; }
    if ((record.differing || record.onlyLegacy || record.onlySystem) && !record.explanation) { alert('Explain the differences before recording the result.'); return; }
    const updated: PayrollRun = { ...run, parallelRun: { ...record, comparedAt: new Date().toISOString(), comparedById: currentUserAccount.id, comparedBy: currentUserAccount.username } };
    await setDoc(doc(db, 'payrollRuns', runId), cleanData(updated));
    setPayrollRuns(previous => previous.map(item => item.id === runId ? updated : item));
  };

  const handleRecordTaxDeposit = async (runId: string, cprNumber: string, amount: number, depositedOn: string) => {
    const run = payrollRuns.find(item => item.id === runId);
    if (!run || (run.status !== 'Approved' && run.status !== 'Disbursed')) { alert('Record the FBR deposit only for an approved or disbursed payroll.'); return; }
    if (!/^[A-Za-z0-9-]{6,40}$/.test(cprNumber.trim()) || !Number.isFinite(amount) || amount < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(depositedOn)) { alert('Enter a valid CPR number, amount and deposit date (YYYY-MM-DD).'); return; }
    const updated: PayrollRun = { ...run, taxDeposit: { cprNumber: cprNumber.trim().toUpperCase(), amount: Math.round(amount), depositedOn, recordedAt: new Date().toISOString(), recordedById: currentUserAccount.id, recordedBy: currentUserAccount.username } };
    await setDoc(doc(db, 'payrollRuns', runId), cleanData(updated));
    setPayrollRuns(previous => previous.map(item => item.id === runId ? updated : item));
  };

  const handleMarkPaymentFailed = async (payslipId: string, reason: string) => {
    const sheet = payrollPayslips.find(item => item.id === payslipId);
    const run = sheet && payrollRuns.find(item => item.id === sheet.payrollRunId);
    if (!sheet || run?.status !== 'Disbursed') { alert('Only payslips in a disbursed run can be marked as failed payments.'); return; }
    if (sheet.paymentStatus === 'Failed') return;
    if (reason.trim().length < 5) { alert('Enter the bank return reason.'); return; }
    const updated: Payslip = { ...sheet, paymentStatus: 'Failed', paymentFailureReason: reason.trim(), paymentFailedAt: new Date().toISOString(), paymentFailedById: currentUserAccount.id };
    await setDoc(doc(db, 'payrollPayslips', payslipId), cleanData(updated));
    setPayrollPayslips(previous => previous.map(item => item.id === payslipId ? updated : item));
  };

  const handleRecordPaymentRetry = async (payslipIds: string[], reference: string) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9/_ .-]{2,99}$/.test(reference.trim())) { alert('Enter the bank reference for the retry payment.'); return; }
    const now = new Date().toISOString();
    const updates = payrollPayslips.filter(item => payslipIds.includes(item.id) && item.paymentStatus === 'Failed').map(item => {
      const employee = employees.find(record => record.id === item.employeeId);
      return { ...item, paymentStatus: 'Retried' as const, paymentRetryReference: reference.trim(), paymentRetriedAt: now, paymentRetriedById: currentUserAccount.id,
        retryBankName: employee?.bankName, retryBankAccountNumber: employee?.bankAccountNumber, retryIban: employee?.iban };
    });
    await Promise.all(updates.map(item => setDoc(doc(db, 'payrollPayslips', item.id), cleanData(item))));
    setPayrollPayslips(previous => previous.map(item => updates.find(next => next.id === item.id) || item));
  };

  // ─── Role & User Handlers ─────────────────────────────────────────────────
  const handleAddRole = async (newRole: Role) => {
    setRoles(prev => {
      const updated = [...prev, newRole];
      privacyStorage.setItem('hr_roles', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'roles', newRole.id), cleanData(newRole));
    } catch (err) {
      console.warn('Database role sync delayed:');
    }
  };

  const handleUpdateRole = async (updatedRole: Role) => {
    setRoles(prev => prev.map(role => role.id === updatedRole.id ? updatedRole : role));
    await setDoc(doc(db, 'roles', updatedRole.id), cleanData(updatedRole));
  };

  const handleSaveMobileDutyAuthorization = async (authorization: MobileDutyAuthorization) => {
    setMobileDutyAuthorizations(prev => [...prev.filter(item => item.id !== authorization.id), authorization]);
    await setDoc(doc(db, 'mobileDutyAuthorizations', authorization.id), cleanData(authorization));
  };

  const handleCancelMobileDutyAuthorization = async (id: string) => {
    const existing = mobileDutyAuthorizations.find(item => item.id === id);
    if (!existing) return;
    const cancelled: MobileDutyAuthorization = { ...existing, status: 'Cancelled', updatedAt: new Date().toISOString() };
    setMobileDutyAuthorizations(prev => prev.map(item => item.id === id ? cancelled : item));
    await setDoc(doc(db, 'mobileDutyAuthorizations', id), cleanData(cancelled));
  };

  const handleAddUser = async (newUser: NewUserAccount) => {
    const { password, id: _temporaryId, ...profile } = newUser;
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');

    const uid = `usr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const securedUser: UserAccount = {
      ...profile,
      id: uid,
      email: profile.email.trim().toLowerCase(),
    };
    await setDoc(doc(db, 'users', uid), cleanData({ ...securedUser, password }));
    setUsers(prev => {
      const updated = [...prev.filter(user => user.id !== uid), securedUser];
      privacyStorage.setItem('hr_users', JSON.stringify(updated));
      return updated;
    });
  };


  const handleUpdateUserRole = async (userId: string, roleId: string) => {
    let updatedUser: UserAccount | null = null;
    setUsers(prev => {
      const updated = prev.map(u => {
        if (u.id === userId) {
          updatedUser = { ...u, roleId };
          return updatedUser;
        }
        return u;
      });
      privacyStorage.setItem('hr_users', JSON.stringify(updated));
      return updated;
    });

    if (currentUserAccount.id === userId) {
      setCurrentUserAccount(prev => {
        const updated = { ...prev, roleId };
        privacyStorage.setItem('hr_current_user', JSON.stringify(updated));
        return updated;
      });
    }

    if (updatedUser) {
      try {
        await updateDoc(doc(db, 'users', userId), { roleId });
      } catch (err) {
        console.warn('Database user role update delayed:');
      }
    }
  };

  const handleUpdateUser = async (user: UserAccount) => {
    const existing = users.find(item => item.id === user.id);
    if (!existing) throw new Error('User account no longer exists.');
    const username = user.username.trim();
    if (!username) throw new Error('Username is required.');
    if (!roles.some(role => role.id === user.roleId)) throw new Error('Select a valid role.');
    if (user.roleId === 'role-employee' && !user.employeeId) throw new Error('Employee mobile accounts must be linked to an employee.');
    if (user.employeeId && users.some(item => item.id !== user.id && item.employeeId === user.employeeId)) {
      throw new Error('This employee is already linked to another login account.');
    }

    const isAdminRole = (roleId: string) => {
      const role = roles.find(item => item.id === roleId);
      return roleId === 'role-admin' || role?.name === 'Super Admin';
    };
    const activeAdmins = users.filter(item => item.status === 'Active' && isAdminRole(item.roleId));
    if (existing.status === 'Active' && isAdminRole(existing.roleId) && activeAdmins.length <= 1 && (user.status !== 'Active' || !isAdminRole(user.roleId))) {
      throw new Error('The last active Super Admin cannot be disabled or assigned another role.');
    }

    const updated: UserAccount = {
      ...existing,
      username,
      roleId: user.roleId,
      status: user.status,
      employeeId: user.employeeId || undefined,
      email: existing.email,
    };
    await updateDoc(doc(db, 'users', updated.id), {
      username: updated.username,
      roleId: updated.roleId,
      status: updated.status,
      employeeId: updated.employeeId || deleteField(),
    });
    setUsers(previous => previous.map(item => item.id === updated.id ? updated : item));
    if (currentUserAccount.id === updated.id) setCurrentUserAccount(publicUser(updated));
    if (loggedInUser?.id === updated.id) setLoggedInUser(publicUser(updated));
  };

  const handleDeleteUser = async (userId: string) => {
    const user = users.find(item => item.id === userId);
    if (!user) return;
    const employeeId = user.employeeId;
    await deleteDoc(doc(db, 'users', userId));

    if (employeeId) {
      const deletions = [
        ...attendances.filter(item => item.employeeId === employeeId).map(item => deleteDoc(doc(db, 'attendances', item.id))),
        ...leaves.filter(item => item.employeeId === employeeId).map(item => deleteDoc(doc(db, 'leaves', item.id))),
        ...loanAdvances.filter(item => item.employeeId === employeeId).map(item => deleteDoc(doc(db, 'loanAdvances', item.id))),
        ...salaryRevisions.filter(item => item.employeeId === employeeId).map(item => deleteDoc(doc(db, 'salaryRevisions', item.id))),
        ...performanceReviews.filter(item => item.employeeId === employeeId || item.reviewerId === employeeId).map(item => deleteDoc(doc(db, 'performanceReviews', item.id))),
        ...gratuitySettlements.filter(item => item.employeeId === employeeId).map(item => deleteDoc(doc(db, 'gratuitySettlements', item.id))),
      ];
      await Promise.allSettled(deletions);
      await Promise.allSettled([
        deleteDoc(doc(db, 'employees', employeeId)),
        deleteDoc(doc(db, 'biometricTemplates', employeeId)),
      ]);

      const affectedPayslips = payrollPayslips.filter(item => item.employeeId === employeeId);
      await Promise.all(affectedPayslips.map(item => setDoc(doc(db, 'payrollPayslips', item.id), {
        ...item,
        employeeId: `deleted-${userId}`,
        employeeName: '[REDACTED]',
        employeeCode: '[REDACTED]',
        cnic: '[REDACTED]',
        bankName: '',
        bankAccountNumber: '',
        iban: '',
      })));
      setEmployees(prev => prev.filter(item => item.id !== employeeId));
      setAttendances(prev => prev.filter(item => item.employeeId !== employeeId));
      setLeaves(prev => prev.filter(item => item.employeeId !== employeeId));
      setLoanAdvances(prev => prev.filter(item => item.employeeId !== employeeId));
      setSalaryRevisions(prev => prev.filter(item => item.employeeId !== employeeId));
      setPerformanceReviews(prev => prev.filter(item => item.employeeId !== employeeId && item.reviewerId !== employeeId));
      setGratuitySettlements(prev => prev.filter(item => item.employeeId !== employeeId));
      setPayrollPayslips(prev => prev.map(item => item.employeeId === employeeId ? {
        ...item, employeeId: `deleted-${userId}`, employeeName: '[REDACTED]', employeeCode: '[REDACTED]',
        cnic: '[REDACTED]', bankName: '', bankAccountNumber: '', iban: '',
      } : item));
    }
    setUsers(prev => prev.filter(item => item.id !== userId));
    if (loggedInUser?.id === userId) handleLogout();
  };

  const handleSetCurrentUserAccount = (user: UserAccount) => {
    setCurrentUserAccount(user);
    privacyStorage.setItem('hr_current_user', JSON.stringify(user));
  };

  // ─── Org Structure Handlers ───────────────────────────────────────────────
  const handleSaveCompanySetup = async (payload: CompanySetupPayload) => {
    const nextCompanies = [payload.company, ...companies.filter(item => item.id !== payload.company.id)];
    const nextBranches = [payload.branch, ...branches.filter(item => item.id !== payload.branch.id)];
    const departmentIds = new Set(payload.departments.map(item => item.id));
    const designationIds = new Set(payload.designations.map(item => item.id));
    const nextDepartments = [...payload.departments, ...departments.filter(item => !departmentIds.has(item.id))];
    const nextDesignations = [...payload.designations, ...designations.filter(item => !designationIds.has(item.id))];
    const batch = writeBatch(db);
    batch.set(doc(db, 'companies', payload.company.id), cleanData(payload.company), { merge: true });
    batch.set(doc(db, 'branches', payload.branch.id), cleanData(payload.branch), { merge: true });
    payload.departments.forEach(item => batch.set(doc(db, 'departments', item.id), cleanData(item), { merge: true }));
    payload.designations.forEach(item => batch.set(doc(db, 'designations', item.id), cleanData(item), { merge: true }));
    batch.set(doc(db, 'statConfig', payload.statutoryConfig.id), cleanData(payload.statutoryConfig), { merge: true });
    await batch.commit();

    setCompanies(nextCompanies); setBranches(nextBranches); setDepartments(nextDepartments); setDesignations(nextDesignations); setStatConfig(payload.statutoryConfig);
    const activeName = (payload.company?.legalName?.trim() || payload.company?.name?.trim());
    if (activeName) {
      setBrandTitle(activeName);
      try { localStorage.setItem('app_brand_name', activeName); } catch {}
      document.title = `${activeName} - HR & Payroll`;
    }
    privacyStorage.setItem('hr_companies', JSON.stringify(nextCompanies)); privacyStorage.setItem('hr_branches', JSON.stringify(nextBranches));
    privacyStorage.setItem('hr_departments', JSON.stringify(nextDepartments)); privacyStorage.setItem('hr_designations', JSON.stringify(nextDesignations));
    privacyStorage.setItem('hr_stat_config', JSON.stringify(payload.statutoryConfig));
  };

  const handleAddBranch = async (newBranch: Branch) => {
    setBranches(prev => {
      const updated = [...prev, newBranch];
      privacyStorage.setItem('hr_branches', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'branches', newBranch.id), cleanData(newBranch));
    } catch (err) {
      console.warn('Database branch sync delayed:');
    }
  };

  const handleAddDepartment = async (newDept: Department) => {
    setDepartments(prev => {
      const updated = [...prev, newDept];
      privacyStorage.setItem('hr_departments', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'departments', newDept.id), cleanData(newDept));
    } catch (err) {
      console.warn('Database department sync delayed:');
    }
  };

  const handleAddDesignation = async (newDesg: Designation) => {
    setDesignations(prev => {
      const updated = [...prev, newDesg];
      privacyStorage.setItem('hr_designations', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'designations', newDesg.id), cleanData(newDesg));
    } catch (err) {
      console.warn('Database designation sync delayed:');
    }
  };

  const handleSaveMasterData = async (
    kind: 'branch' | 'department' | 'designation' | 'zone' | 'ucTown' | 'wageType',
    record: Branch | Department | Designation | Zone | UcTown | WageType
  ) => {
    const config = {
      branch: { collectionName: 'branches', storageKey: 'hr_branches', set: setBranches },
      department: { collectionName: 'departments', storageKey: 'hr_departments', set: setDepartments },
      designation: { collectionName: 'designations', storageKey: 'hr_designations', set: setDesignations },
      zone: { collectionName: 'zones', storageKey: 'hr_zones', set: setZones },
      ucTown: { collectionName: 'ucTowns', storageKey: 'hr_uc_towns', set: setUcTowns },
      wageType: { collectionName: 'wageTypes', storageKey: 'hr_wage_types', set: setWageTypes },
    }[kind] as { collectionName: string; storageKey: string; set: React.Dispatch<React.SetStateAction<any[]>> };
    config.set(previous => {
      const updated = previous.some(item => item.id === record.id)
        ? previous.map(item => item.id === record.id ? record : item)
        : [...previous, record];
      privacyStorage.setItem(config.storageKey, JSON.stringify(updated));
      return updated;
    });
    await setDoc(doc(db, config.collectionName, record.id), cleanData(record), { merge: true });
  };


  // ─── Holiday Handlers ─────────────────────────────────────────────────────
  const handleAddHoliday = async (holiday: Holiday) => {
    setHolidays(prev => {
      const updated = [...prev, holiday];
      privacyStorage.setItem('hr_holidays', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'holidays', holiday.id), cleanData(holiday));
    } catch (err) {
      console.warn('Database holiday add delayed:');
    }
  };

  const handleUpdateHoliday = async (holiday: Holiday) => {
    setHolidays((prev: Holiday[]) => {
      const updated = prev.map((h: Holiday) => h.id === holiday.id ? holiday : h);
      privacyStorage.setItem('hr_holidays', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'holidays', holiday.id), cleanData(holiday));
    } catch (err) {
      console.warn('Database holiday update delayed:');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    setHolidays((prev: Holiday[]) => {
      const updated = prev.filter((h: Holiday) => h.id !== id);
      privacyStorage.setItem('hr_holidays', JSON.stringify(updated));
      return updated;
    });
    // Soft delete: no database delete to avoid accidental data loss
  };

  // ─── Loan & Advance Handlers ──────────────────────────────────────────────
  const handleApplyLoan = async (loan: LoanAdvance) => {
    setLoanAdvances(prev => {
      const updated = [...prev, loan];
      privacyStorage.setItem('hr_loans', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'loanAdvances', loan.id), cleanData(loan));
    } catch (err) {
      console.warn('Database loan apply delayed:');
    }
  };

  const handleApproveLoan = async (id: string) => {
    const today = todayStr();
    const approverName = loggedInUser?.username || 'HR Manager';
    setLoanAdvances((prev: LoanAdvance[]) => {
      const updated = prev.map((l: LoanAdvance) =>
        l.id === id ? { ...l, status: 'Active' as LoanAdvance['status'], approvedBy: approverName, approvedOn: today, disbursedDate: today } : l
      );
      privacyStorage.setItem('hr_loans', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'loanAdvances', id), { status: 'Active', approvedBy: approverName, approvedOn: today, disbursedDate: today });
    } catch (err) {
      console.warn('Database loan approval delayed:');
    }
  };

  const handleRejectLoan = async (id: string) => {
    setLoanAdvances((prev: LoanAdvance[]) => {
      const updated = prev.map((l: LoanAdvance) => l.id === id ? { ...l, status: 'Rejected' as LoanAdvance['status'] } : l);
      privacyStorage.setItem('hr_loans', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'loanAdvances', id), { status: 'Rejected' });
    } catch (err) {
      console.warn('Database loan rejection delayed:');
    }
  };

  // ─── Salary Revision Handlers ─────────────────────────────────────────────
  const handleAddSalaryRevision = async (revision: SalaryRevision) => {
    // Draft recommendations never change payroll. Salary changes occur only
    // after a different authorized user explicitly approves the revision.
    const employee = employees.find(e => e.id === revision.employeeId);
    const previous = salaryRevisions.find(item => item.id === revision.id);
    if (revision.status !== 'Draft') {
      const approvalError = salaryRevisionApprovalError(previous || { ...revision, status: 'Draft' }, currentUserAccount.id);
      if (approvalError) { alert(`Maker-checker control: ${approvalError}`); return; }
      revision = { ...revision, approvedById: currentUserAccount.id, approvedBy: currentUserAccount.username, approvedOn: todayStr() };
      if (employee) await handleUpdateEmployee({ ...employee, basicSalary: revision.newSalary });
      // Back-dated revisions owe the difference for payroll months already processed at the old salary.
      const arrears = salaryRevisionArrears(revision, effectivePayslips, payrollRuns);
      if (arrears.amount > 0) {
        const [currentYear, currentMonth] = todayStr().split('-').map(Number);
        const adjustment: PayrollAdjustment = {
          id: `adj-arrears-${revision.id}`, employeeId: revision.employeeId, periodMonth: currentMonth, periodYear: currentYear,
          type: 'Arrears', amount: arrears.amount, taxable: true,
          reason: `Salary revision arrears effective ${revision.effectiveDate} for ${arrears.months.join(', ')}`.slice(0, 500),
          status: 'Pending', createdAt: new Date().toISOString(), createdById: currentUserAccount.id, createdBy: currentUserAccount.username,
        };
        await handleCreatePayrollAdjustment(adjustment);
        revision = { ...revision, arrearsAdjustmentId: adjustment.id, arrearsAmount: arrears.amount };
      }
    } else if (!previous) {
      revision = { ...revision, createdById: revision.createdById || currentUserAccount.id, createdBy: revision.createdBy || currentUserAccount.username };
    }

    setSalaryRevisions(prev => {
      const updated = prev.some(item => item.id === revision.id)
        ? prev.map(item => item.id === revision.id ? revision : item)
        : [...prev, revision];
      privacyStorage.setItem('hr_salary_revisions', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'salaryRevisions', revision.id), cleanData(revision));
    } catch (err) {
      console.warn('Database salary revision delayed:');
    }
  };

  // ─── Performance Review Handlers ──────────────────────────────────────────
  const handleAddPerformanceReview = async (review: PerformanceReview) => {
    setPerformanceReviews((prev: PerformanceReview[]) => {
      const updated = [...prev, review];
      privacyStorage.setItem('hr_perf_reviews', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'performanceReviews', review.id), cleanData(review));
    } catch (err) {
      console.warn('Database performance review add delayed:');
    }
  };

  const handleUpdatePerformanceReview = async (review: PerformanceReview) => {
    setPerformanceReviews((prev: PerformanceReview[]) => {
      const updated = prev.map((r: PerformanceReview) => r.id === review.id ? review : r);
      privacyStorage.setItem('hr_perf_reviews', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'performanceReviews', review.id), cleanData(review));
    } catch (err) {
      console.warn('Database performance review update delayed:');
    }
  };

  // ─── Asset Handlers ───────────────────────────────────────────────────────
  const handleAddAsset = async (asset: CompanyAsset) => {
    setCompanyAssets((prev: CompanyAsset[]) => {
      const updated = [...prev, asset];
      privacyStorage.setItem('hr_assets', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'companyAssets', asset.id), cleanData(asset));
    } catch (err) {
      console.warn('Database asset add delayed:');
    }
  };

  const handleUpdateAsset = async (asset: CompanyAsset) => {
    setCompanyAssets((prev: CompanyAsset[]) => {
      const updated = prev.map((a: CompanyAsset) => a.id === asset.id ? asset : a);
      privacyStorage.setItem('hr_assets', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'companyAssets', asset.id), cleanData(asset));
    } catch (err) {
      console.warn('Database asset update delayed:');
    }
  };

  // ─── Recruitment Handlers ─────────────────────────────────────────────────
  const handleAddJobPosting = async (posting: JobPosting) => {
    setJobPostings((prev: JobPosting[]) => {
      const updated = [...prev, posting];
      privacyStorage.setItem('hr_job_postings', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobPostings', posting.id), cleanData(posting));
    } catch (err) {
      console.warn('Database job posting add delayed:');
    }
  };

  const handleUpdateJobPosting = async (posting: JobPosting) => {
    setJobPostings((prev: JobPosting[]) => {
      const updated = prev.map((p: JobPosting) => p.id === posting.id ? posting : p);
      privacyStorage.setItem('hr_job_postings', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobPostings', posting.id), cleanData(posting));
    } catch (err) {
      console.warn('Database job posting update delayed:');
    }
  };

  const handleAddJobApplication = async (app: JobApplication) => {
    setJobApplications((prev: JobApplication[]) => {
      const updated = [...prev, app];
      privacyStorage.setItem('hr_job_apps', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobApplications', app.id), cleanData(app));
    } catch (err) {
      console.warn('Database job application add delayed:');
    }
  };

  const handleUpdateJobApplication = async (app: JobApplication) => {
    setJobApplications((prev: JobApplication[]) => {
      const updated = prev.map((a: JobApplication) => a.id === app.id ? app : a);
      privacyStorage.setItem('hr_job_apps', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobApplications', app.id), cleanData(app));
    } catch (err) {
      console.warn('Database job application update delayed:');
    }
  };

  // ─── Gratuity Settlement Handlers ────────────────────────────────────────
  const handleAddGratuitySettlement = async (settlement: GratuitySettlement) => {
    setGratuitySettlements((prev: GratuitySettlement[]) => {
      const updated = [...prev, settlement];
      privacyStorage.setItem('hr_gratuity', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'gratuitySettlements', settlement.id), cleanData(settlement));
    } catch (err) {
      console.warn('Database gratuity settlement add delayed:');
    }
  };

  const handleUpdateGratuitySettlement = async (settlement: GratuitySettlement) => {
    setGratuitySettlements((prev: GratuitySettlement[]) => {
      const updated = prev.map((s: GratuitySettlement) => s.id === settlement.id ? settlement : s);
      privacyStorage.setItem('hr_gratuity', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'gratuitySettlements', settlement.id), cleanData(settlement));
    } catch (err) {
      console.warn('Database gratuity settlement update delayed:');
    }
  };

  // ─── Notification Handlers ────────────────────────────────────────────────
  const handleAddNotification = async (notification: AppNotification) => {
    setNotifications((prev: AppNotification[]) => {
      const updated = [...prev, notification];
      privacyStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'notifications', notification.id), cleanData(notification));
    } catch (err) {
      console.warn('Database notification add delayed:');
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    const empId = loggedInUser?.employeeId || loggedInUser?.username || 'unknown';
    setNotifications((prev: AppNotification[]) => {
      const updated = prev.map((n: AppNotification) =>
        n.id === id && !n.readBy.includes(empId) ? { ...n, readBy: [...n.readBy, empId] } : n
      );
      privacyStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
    try {
      const notif = notifications.find((n: AppNotification) => n.id === id);
      if (notif && !notif.readBy.includes(empId)) {
        await updateDoc(doc(db, 'notifications', id), { readBy: [...notif.readBy, empId] });
      }
    } catch (err) {
      console.warn('Database notification mark-read delayed:');
    }
  };

  const handleMarkAllNotificationsRead = () => {
    const empId = loggedInUser?.employeeId || loggedInUser?.username || 'unknown';
    setNotifications((prev: AppNotification[]) => {
      const updated = prev.map((n: AppNotification) =>
        n.readBy.includes(empId) ? n : { ...n, readBy: [...n.readBy, empId] }
      );
      privacyStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteNotification = async (id: string) => {
    setNotifications((prev: AppNotification[]) => {
      const updated = prev.filter((n: AppNotification) => n.id !== id);
      privacyStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  const accessControlLoaded = rolesLoaded && usersLoaded;

  const employeesWithFingerprints = mergeEmployeeFingerprintTemplates(employees, biometricTemplates);

  const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const [hasUsersInDb, setHasUsersInDb] = useState<boolean | null>(null);
  const [brandTitle, setBrandTitle] = useState<string>(() => {
    try {
      const injected = (window as any).__APP_CONFIG__?.companyName;
      if (injected && injected.trim()) return injected.trim();
      const stored = localStorage.getItem('app_brand_name');
      if (stored && stored.trim()) return stored.trim();
    } catch {}
    return 'OneNet Solutions Pk.';
  });
  const [brandSubtitle, setBrandSubtitle] = useState<string>(() => {
    try {
      const injected = (window as any).__APP_CONFIG__?.companySubtitle;
      if (injected && injected.trim()) return injected.trim();
      const stored = localStorage.getItem('app_brand_subtitle');
      if (stored && stored.trim()) return stored.trim();
    } catch {}
    return 'Payroll Compliance & Attendance Management';
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/status`)
      .then(res => res.json())
      .then(data => {
        setHasUsersInDb(Boolean(data.hasUsers));
        if (data.companyName) {
          setBrandTitle(data.companyName);
          try { localStorage.setItem('app_brand_name', data.companyName); } catch {}
          document.title = `${data.companyName} - HR & Payroll`;
        }
        if (data.companySubtitle) {
          setBrandSubtitle(data.companySubtitle);
          try { localStorage.setItem('app_brand_subtitle', data.companySubtitle); } catch {}
        }
      })
      .catch(() => setHasUsersInDb(true));
  }, [API_BASE]);

  useEffect(() => {
    if (companies && companies.length > 0) {
      const comp = companies[0];
      const activeName = (comp?.legalName?.trim() || comp?.name?.trim());
      if (activeName) {
        setBrandTitle(activeName);
        try { localStorage.setItem('app_brand_name', activeName); } catch {}
        document.title = `${activeName} - HR & Payroll`;
      }
    }
  }, [companies]);

  const isDatabaseEmpty = hasUsersInDb === false;

  if (!loggedInUser) {
    if (isDatabaseEmpty) {
      return (
        <SetupWizardScreen
          canCancel={false}
          onComplete={async (companyName, adminEmail, adminPassword, adminName) => {
            const res = await fetch(`${API_BASE}/api/auth/setup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyName, adminEmail, adminPassword, adminName }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Setup failed.');
            setAuthToken(data.token);
            setLoggedInUser(publicUser(data.user));
            setCurrentUserAccount(publicUser(data.user));
            setHasUsersInDb(true);
          }}
        />
      );
    }

    return (
      <LoginScreen
        authReady={authReady}
        authMessage={authMessage}
        onLogin={handleLogin}
        isDatabaseEmpty={false}
        appName={brandTitle}
        appSubtitle={brandSubtitle}
      />
    );
  }


  return (
    <DeviceEmulator
      employees={employeesWithFingerprints}
      attendances={attendances}
      mobileDutyAuthorizations={mobileDutyAuthorizations}
      leaves={leaves}
      statConfig={statConfig}
      taxSlabs={taxSlabs}
      payrollRuns={payrollRuns}
      attendancePeriods={attendancePeriods}
      payrollPayslips={payrollPayslips}
      payrollAdjustments={payrollAdjustments}
      onCreatePayrollAdjustment={handleCreatePayrollAdjustment}
      onReviewPayrollAdjustment={handleReviewPayrollAdjustment}
      onAddEmployee={handleAddEmployee}
      onUpdateEmployee={handleUpdateEmployee}
      onUpdateStatConfig={handleUpdateStatConfig}
      onUpdateTaxSlabs={handleUpdateTaxSlabs}
      onApproveLeave={handleApproveLeave}
      onRejectLeave={handleRejectLeave}
      onApproveRegularization={handleApproveRegularization}
      onRejectRegularization={handleRejectRegularization}
      onCreatePayrollRun={handleCreatePayrollRun}
      onLockAttendancePeriod={handleLockAttendancePeriod}
      onReopenAttendancePeriod={handleReopenAttendancePeriod}
      onCancelPayrollRun={handleCancelPayrollRun}
      portalGovernance={{
        statutoryChangeRequests, onReviewStatutoryChange: handleReviewStatutoryChange,
        lifecycleRequests, onCreateLifecycleRequest: handleCreateLifecycleRequest, onReviewLifecycleRequest: handleReviewLifecycleRequest,
        onUpdateOnboarding: handleUpdateOnboarding, onCreateSupplementaryRun: handleCreateSupplementaryRun,
        onCreateFinalSettlementRun: handleCreateFinalSettlementRun, onRecordTaxDeposit: handleRecordTaxDeposit,
        onMarkPaymentFailed: handleMarkPaymentFailed, onRecordPaymentRetry: handleRecordPaymentRetry, onRetroRecalculate: handleRetroRecalculate, onRecordParallelRun: handleRecordParallelRun,
      }}
      onUpdatePayrollStatus={handleUpdatePayrollStatus}
      onRecordBankAdvice={handleRecordBankAdvice}
      onSendPayslips={handleSendPayslips}
      onSimulatePunch={handleSimulatePunch}
      onApplyLeave={handleApplyLeave}
      onAddRegularization={handleAddRegularization}
      onAddAttendance={handleAddAttendance}
      branches={branches}
      companies={companies}
      onSaveCompanySetup={handleSaveCompanySetup}
      departments={departments}
      designations={designations}
      zones={zones}
      ucTowns={ucTowns}
      wageTypes={wageTypes}
      onSaveMasterData={handleSaveMasterData}
      onAddBranch={handleAddBranch}
      onAddDepartment={handleAddDepartment}
      onAddDesignation={handleAddDesignation}
      roles={roles}
      users={users.map(publicUser)}
      currentUserAccount={currentUserAccount}
      accessControlLoaded={accessControlLoaded}
      onSetCurrentUserAccount={handleSetCurrentUserAccount}
      onAddRole={handleAddRole}
      onUpdateRole={handleUpdateRole}
      onAddUser={handleAddUser}
      onDeleteUser={handleDeleteUser}
      onUpdateUserRole={handleUpdateUserRole}
      onUpdateUser={handleUpdateUser}
      onSaveMobileDutyAuthorization={handleSaveMobileDutyAuthorization}
      onCancelMobileDutyAuthorization={handleCancelMobileDutyAuthorization}
      loggedInUser={loggedInUser}
      onLogout={handleLogout}
      holidays={holidays}
      onAddHoliday={handleAddHoliday}
      onUpdateHoliday={handleUpdateHoliday}
      onDeleteHoliday={handleDeleteHoliday}
      loanAdvances={loanAdvances}
      onApplyLoan={handleApplyLoan}
      onApproveLoan={handleApproveLoan}
      onRejectLoan={handleRejectLoan}
      salaryRevisions={salaryRevisions}
      onAddSalaryRevision={handleAddSalaryRevision}
      performanceReviews={performanceReviews}
      onAddPerformanceReview={handleAddPerformanceReview}
      onUpdatePerformanceReview={handleUpdatePerformanceReview}
      companyAssets={companyAssets}
      onAddAsset={handleAddAsset}
      onUpdateAsset={handleUpdateAsset}
      jobPostings={jobPostings}
      onAddJobPosting={handleAddJobPosting}
      onUpdateJobPosting={handleUpdateJobPosting}
      jobApplications={jobApplications}
      onAddJobApplication={handleAddJobApplication}
      onUpdateJobApplication={handleUpdateJobApplication}
      gratuitySettlements={gratuitySettlements}
      onAddGratuitySettlement={handleAddGratuitySettlement}
      onUpdateGratuitySettlement={handleUpdateGratuitySettlement}
      notifications={notifications}
      onAddNotification={handleAddNotification}
      onMarkNotificationRead={handleMarkNotificationRead}
      onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
      onDeleteNotification={handleDeleteNotification}
      firestoreSyncStatus={firestoreSyncStatus}
    />
  );
}

// Login Screen
function LoginScreen({
  authReady,
  authMessage,
  onLogin,
  isDatabaseEmpty,
  onLaunchSetup,
  appName = 'OneNet Solutions Pk.',
  appSubtitle = 'Payroll Compliance & Attendance Management',
}: {
  authReady: boolean;
  authMessage: string;
  onLogin: (email: string, password: string, mfaChallenge?: string, mfaCode?: string, mfaMethod?: 'totp' | 'email', rememberMe?: boolean) => Promise<{ mfaChallenge?: string; mfaMethods?: Array<'totp' | 'email'> } | void>;
  isDatabaseEmpty?: boolean;
  onLaunchSetup?: () => void;
  appName?: string;
  appSubtitle?: string;
}) {
  const [loginId, setLoginId] = useState(() => {
    try {
      return localStorage.getItem('hr_remembered_email') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return Boolean(localStorage.getItem('hr_remembered_email'));
    } catch {
      return false;
    }
  });
  const [error, setError] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'email'>('totp');
  const [mfaMethods, setMfaMethods] = useState<Array<'totp' | 'email'>>(['totp', 'email']);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  // Only an unreachable server is worth telling users about; infrastructure details stay private.
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
    fetch(`${apiBase}/api/health`, { signal: controller.signal })
      .then(response => setServerReachable(response.ok))
      .catch(() => setServerReachable(false))
      .finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, []);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      if (rememberMe) {
        try { localStorage.setItem('hr_remembered_email', loginId.trim()); } catch {}
      } else {
        try { localStorage.removeItem('hr_remembered_email'); } catch {}
      }
      const result = await onLogin(loginId, password, mfaChallenge || undefined, mfaCode || undefined, mfaMethod, rememberMe);
      if (result && result.mfaChallenge) {
        setMfaChallenge(result.mfaChallenge);
        setMfaCode('');
        const availableMethods: Array<'totp' | 'email'> = result.mfaMethods?.length ? result.mfaMethods : ['totp', 'email'];
        setMfaMethod(availableMethods.includes('totp') ? 'totp' : 'email');
        setMfaMethods(availableMethods);
        setEmailCodeSent(false);
        setError('');
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sendEmailLoginCode = async () => {
    try {
      setError('');
      setIsSubmitting(true);
      const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
      const response = await fetch(`${apiBase}/api/auth/mfa/send-email-login-code`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: mfaChallenge }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Email verification code could not be sent.');
      setEmailCodeSent(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Email verification code could not be sent.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    // The app shell locks page scrolling, so the sign-in screen owns its scroll area; on phones it must reach the form.
    <div className="h-[100dvh] overflow-y-auto bg-[#070b14] text-slate-100 flex justify-center p-4 sm:p-6 md:p-8 font-sans relative overflow-x-hidden selection:bg-emerald-500 selection:text-white">
      {/* Background ambient decorative blurs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 md:w-[500px] md:h-[500px] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 md:w-[550px] md:h-[550px] rounded-full bg-teal-500/10 blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-emerald-600/5 rounded-full blur-[160px] pointer-events-none" />

      {/* Subtle modern cyber-grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #10b981 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }}
      />

      {/* Main Split Layout Container */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center relative z-10 my-auto py-6">

        {/* Left Column: Hero & Branding (Matches user reference image with elevated aesthetic) */}
        <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">

          {/* Top Tagline */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Enterprise Biometric &amp; HR Platform</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white uppercase drop-shadow-md">
              {appName}
            </h1>
            <p className="text-sm sm:text-base text-slate-400 font-medium tracking-wide max-w-lg">
              {appSubtitle}
            </p>
          </div>

          {/* Central High-Definition Illustration */}
          <div className="relative w-full max-w-[420px] aspect-square hidden lg:flex items-center justify-center my-2 group">
            {/* Ambient emerald backlight ring */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-emerald-500/25 via-teal-500/15 to-transparent blur-3xl scale-95 group-hover:scale-105 transition-transform duration-700 pointer-events-none" />
            <img
              src="/assets/hr-hero-illustration.webp"
              alt={`${appName} Platform`}
              className="relative z-10 w-full h-full object-contain drop-shadow-[0_20px_40px_rgba(16,185,129,0.3)] transition-transform duration-500 group-hover:scale-[1.02]"
            />
          </div>

          {/* Bottom Highlights & Pillars */}
          <div className="hidden lg:grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl">
            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-3.5 flex items-center gap-3 text-left hover:border-emerald-500/40 transition">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-400">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Touchless Shift</div>
                <div className="text-[10px] text-slate-400">Face HUD &amp; Biometric</div>
              </div>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-3.5 flex items-center gap-3 text-left hover:border-emerald-500/40 transition">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0 text-teal-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Statutory Rules</div>
                <div className="text-[10px] text-slate-400">Tax 2026, EOBI &amp; PESSI</div>
              </div>
            </div>

            <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-3.5 flex items-center gap-3 text-left hover:border-emerald-500/40 transition">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Approval Controls</div>
                <div className="text-[10px] text-slate-400">Two-person sign-off &amp; audit trail</div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Floating Modern Glassmorphism Login Card */}
        <div className="lg:col-span-5 relative w-full max-w-md mx-auto pt-7">

          {/* Top Floating Badge (HR in rounded emerald squircle) */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-green-400 p-[2.5px] shadow-2xl shadow-emerald-500/50 ring-4 ring-[#070b14] flex items-center justify-center z-20 transition-transform duration-300 hover:scale-105">
            <div className="w-full h-full rounded-[14px] bg-gradient-to-tr from-emerald-600 via-emerald-500 to-green-500 flex items-center justify-center text-white font-black text-2xl tracking-wider shadow-inner">
              HR
            </div>
          </div>

          {/* Frosted Glass Card Container */}
          <div className="w-full bg-slate-900/75 backdrop-blur-2xl p-7 sm:p-9 rounded-[32px] border border-emerald-500/20 shadow-2xl shadow-black/80 relative overflow-hidden space-y-6 pt-12">

            {/* Top Border Neon Line Glow */}
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-80" />

            {/* Title / Heading inside card */}
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Sign In to System
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Enter your administrative credentials to continue
              </p>
            </div>

            {/* Database Empty Alert / Setup Trigger */}
            {isDatabaseEmpty && (
              <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-2xl text-xs text-amber-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Database is uninitialized</span>
                </div>
                <p>No user accounts have been created yet.</p>
                {onLaunchSetup && (
                  <button
                    type="button"
                    onClick={onLaunchSetup}
                    className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-xs shadow-md transition"
                  >
                    Launch First-Time Setup Wizard
                  </button>
                )}
              </div>
            )}

            {!authReady ? (
              <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl text-xs text-slate-300 flex items-center justify-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <span>Checking authentication session...</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Error Banner */}
                {(error || authMessage) && (
                  <div className="bg-rose-950/40 border border-rose-900/60 p-3.5 rounded-2xl text-rose-300 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{error || authMessage}</span>
                  </div>
                )}

                {/* Email Field */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    EMAIL
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      autoComplete="username"
                      required
                      value={loginId}
                      onChange={e => setLoginId(e.target.value)}
                      placeholder="admin@binishaqsoft.com"
                      className="w-full text-sm py-3 pl-10 pr-4 bg-slate-950/80 border border-slate-800/90 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Password Field */}
                {!mfaChallenge && <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      PASSWORD
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowForgotHelp(true)}
                      className="text-[11px] text-slate-400 hover:text-emerald-400 transition-colors font-medium hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-400 transition-colors">
                      <Lock className="h-4 w-4" />
                    </div>
                    <input
                      type={isPasswordVisible ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => {
                        if (typeof e.getModifierState === 'function') {
                          setCapsLockOn(e.getModifierState('CapsLock'));
                        }
                      }}
                      onKeyUp={e => {
                        if (typeof e.getModifierState === 'function') {
                          setCapsLockOn(e.getModifierState('CapsLock'));
                        }
                      }}
                      placeholder="••••••••••••"
                      className="w-full text-sm py-3 pl-10 pr-12 bg-slate-950/80 border border-slate-800/90 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 font-mono transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setIsPasswordVisible(visible => !visible)}
                      aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 hover:text-emerald-400 focus:outline-none transition-colors cursor-pointer"
                    >
                      {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {capsLockOn && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1 font-mono pt-0.5">
                      <AlertCircle className="w-3 h-3" /> Caps Lock is ON
                    </p>
                  )}
                </div>}

                {mfaChallenge && <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-emerald-400 uppercase tracking-widest">TWO-FACTOR VERIFICATION</label>
                  <div className="grid grid-cols-2 gap-2">
                    {mfaMethods.includes('totp') && <button type="button" onClick={() => { setMfaMethod('totp'); setMfaCode(''); setError(''); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${mfaMethod === 'totp' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>Authenticator app</button>}
                    {mfaMethods.includes('email') && <button type="button" onClick={() => { setMfaMethod('email'); setMfaCode(''); setError(''); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${mfaMethod === 'email' ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>Email verification</button>}
                  </div>
                  <p className="text-xs text-slate-400">{mfaMethod === 'totp' ? 'Enter the current six-digit code from your authenticator app.' : 'Request a code at your registered email, then enter it below.'}</p>
                  {mfaMethod === 'email' && <button type="button" disabled={isSubmitting} onClick={sendEmailLoginCode} className="rounded-lg border border-emerald-500/60 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60">{emailCodeSent ? 'Send a new email code' : 'Send email code'}</button>}
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={mfaCode}
                    onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder={mfaMethod === 'email' ? 'Email code' : 'Authenticator code'}
                    className="w-full text-center tracking-[0.5em] text-lg font-mono py-3 bg-slate-950/80 border border-emerald-700/70 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400"
                  />
                  <button type="button" onClick={() => { setMfaChallenge(''); setMfaCode(''); setMfaMethod('totp'); setEmailCodeSent(false); setError(''); }} className="text-xs text-slate-400 hover:text-emerald-400 underline">Use a different account</button>
                </div>}

                {/* Remember Me Checkbox */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-emerald-500/30 focus:ring-offset-0 transition cursor-pointer"
                    />
                    <span className="text-xs text-slate-300 font-medium">Remember me for 5 days</span>
                  </label>

                </div>
                {rememberMe && <p className="-mt-1 text-[10px] leading-relaxed text-emerald-300/80">This browser will stay signed in for up to 5 days. You will need to verify again after that, or sooner if you sign out.</p>}

                {/* Primary CTA Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || (Boolean(mfaChallenge) && (mfaCode.length !== 6 || (mfaMethod === 'email' && !emailCodeSent)))}
                  className="w-full mt-2 bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-400 hover:via-green-400 hover:to-emerald-500 text-slate-950 font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 text-sm flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <span>{mfaChallenge ? `Verify ${mfaMethod === 'email' ? 'Email Code' : 'Authenticator Code'}` : 'Sign In to System'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Quick Setup Link for uninitialized DB */}
            {isDatabaseEmpty && onLaunchSetup && (
              <div className="pt-2 border-t border-slate-800/80 text-center">
                <button
                  type="button"
                  onClick={onLaunchSetup}
                  className="text-xs text-slate-400 hover:text-emerald-400 transition underline underline-offset-4 cursor-pointer"
                >
                  New installation or database cleared? Launch Setup Wizard
                </button>
              </div>
            )}

            {/* Modal for Forgot Password Help */}
            {showForgotHelp && (
              <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center gap-3 text-emerald-400 font-bold text-base">
                    <HelpCircle className="w-5 h-5" />
                    <span>Password Reset Assistance</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    For your security, passwords are reset by your HR or system administrator, not by email link.
                  </p>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <div>1. Contact your HR or system administrator.</div>
                    <div>2. They reset your password in User Management after confirming your identity.</div>
                    <div>3. Sign in with the new password they give you.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForgotHelp(false)}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {serverReachable === false && (
              <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                The server can&apos;t be reached right now. Check your internet connection and try again in a moment.
              </div>
            )}

          </div>

          {/* Under-Card Footnote */}
          <div className="text-center text-[10px] text-slate-500 mt-4 font-mono">
            © {new Date().getFullYear()} {appName}. Authorised users only.
          </div>

        </div>

      </div>
    </div>
  );
}

function SetupWizardScreen({
  onComplete,
  onCancel,
  canCancel,
}: {
  onComplete: (companyName: string, adminEmail: string, adminPassword: string, adminName: string) => Promise<void>;
  onCancel?: () => void;
  canCancel?: boolean;
}) {
  const [companyName, setCompanyName] = useState('OneNet Solutions');
  const [adminName, setAdminName] = useState('System Administrator');
  const [adminEmail, setAdminEmail] = useState('admin@onenet.com');
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!companyName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      await onComplete(companyName.trim(), adminEmail.trim(), adminPassword.trim(), adminName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
      <div className="w-full max-w-lg bg-slate-950/90 backdrop-blur-md p-8 rounded-3xl border border-slate-800 shadow-2xl relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-500 mx-auto flex items-center justify-center shadow-lg text-white font-bold text-xl">
            HR
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white uppercase">Database Setup Wizard</h2>
          <p className="text-xs text-slate-400">Set up your company and create the first administrator account.</p>
        </div>

        {error && (
          <div className="bg-rose-950/40 border border-rose-900/60 p-3.5 rounded-xl text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Company Name</label>
            <input type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. OneNet Solutions" className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white" />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Super Admin Full Name</label>
            <input type="text" required value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="System Administrator" className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white" />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Super Admin Email</label>
            <input type="email" required value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@company.com" className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white" />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Super Admin Password</label>
            <input type="password" required value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Set initial password" className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white font-mono" />
          </div>

          <button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold py-3.5 rounded-xl shadow-lg transition duration-200 text-sm disabled:opacity-50">
            {submitting ? 'Initializing Database…' : 'Initialize Database & Sign In'}
          </button>
        </form>

        {canCancel && onCancel && (
          <button type="button" onClick={onCancel} className="w-full text-xs text-slate-400 hover:text-white transition">
            Back to Sign In
          </button>
        )}
      </div>
    </div>
  );
}
