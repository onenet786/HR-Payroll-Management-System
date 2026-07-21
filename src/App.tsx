/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { computePayslipDetails } from './data/defaults';
import {
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip, MobilePunchDetails,
  Role, UserAccount, Branch, Department, Designation, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification, Company, CompanySetupPayload, Zone, UcTown, WageType, NewUserAccount, MobileDutyAuthorization
} from './types';
import { DeviceEmulator } from './components/DeviceEmulator';
import { auth, db, isFirebaseConfigured, provisionFirebaseUser } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  collection, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc, onSnapshot, writeBatch, query, where
} from 'firebase/firestore';

// HR and payroll records must never be persisted in browser-accessible storage.
// Remove legacy cache entries and keep application state in memory/Firestore only.
const privacyStorage = {
  getItem: (_key: string): string | null => null,
  setItem: (_key: string, _value: string): void => undefined,
  removeItem: (key: string): void => localStorage.removeItem(key),
};

const publicUser = ({ passwordHash: _passwordHash, ...profile }: UserAccount): UserAccount => profile;

const authErrorCode = (error: unknown): string =>
  typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

const safeAuthErrorMessage = (error: unknown): string => {
  const code = authErrorCode(error);
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'Unable to reach Firebase Authentication. Check DNS, proxy, firewall, and internet access.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait before trying again or reset the password.';
    case 'auth/unauthorized-domain':
      return 'This application domain is not authorized in Firebase Authentication.';
    case 'auth/configuration-not-found':
      return 'Firebase Authentication is not configured for this project. Enable Email/Password sign-in.';
    case 'auth/app-not-authorized':
      return 'This application is not authorized to use Firebase Authentication with the configured API key.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'The Firebase web API key is invalid or is not permitted to use Firebase Authentication.';
    case 'auth/user-disabled':
      return 'This account is disabled. Contact your administrator.';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password. Confirm the account exists under Firebase Authentication → Users.';
    default:
      return 'Invalid email or password.';
  }
};

for (let index = localStorage.length - 1; index >= 0; index -= 1) {
  const key = localStorage.key(index);
  if (key?.startsWith('hr_') || key?.startsWith('webauthn_')) localStorage.removeItem(key);
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
    provincialSocialSecurityRates: { Punjab: 6, Sindh: 6, KPK: 6, Balochistan: 6 },
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
  const [mobileDutyAuthorizations, setMobileDutyAuthorizations] = useState<MobileDutyAuthorization[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [statConfig, setStatConfig] = useState<StatutoryConfig>(emptyStatConfig);
  const [taxSlabs, setTaxSlabs] = useState<TaxSlab[]>([]);
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

  // User & RBAC States
  const [loggedInUser, setLoggedInUser] = useState<UserAccount | null>(() => getInitialValue('hr_logged_in_user', null));
  const [roles, setRoles] = useState<Role[]>(() => getInitialValue('hr_roles', []));
  const [users, setUsers] = useState<UserAccount[]>(() => getInitialValue('hr_users', []));
  const [rolesLoaded, setRolesLoaded] = useState(() => !isFirebaseConfigured());
  const [usersLoaded, setUsersLoaded] = useState(() => !isFirebaseConfigured());
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [firestoreSyncStatus, setFirestoreSyncStatus] = useState<FirestoreSyncStatus>(() =>
    isFirebaseConfigured()
      ? { state: 'syncing', message: 'Loading server data...' }
      : { state: 'local', message: 'Firebase is not configured.' }
  );
  const [currentUserAccount, setCurrentUserAccount] = useState<UserAccount>(() => {
    const storedCurrent = getInitialValue<UserAccount | null>('hr_current_user', null);
    const storedLoggedIn = getInitialValue<UserAccount | null>('hr_logged_in_user', null);
    return storedCurrent || storedLoggedIn || emptyUserAccount;
  });

  useEffect(() => onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser) {
      setLoggedInUser(null);
      setCurrentUserAccount(emptyUserAccount);
      setAuthReady(true);
      return;
    }

    try {
      const profileSnapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!profileSnapshot.exists()) {
        setAuthMessage('This Firebase account has no HR profile. Ask an administrator to provision it.');
        await signOut(auth);
        return;
      }

      const profile = publicUser({
        ...profileSnapshot.data(),
        id: firebaseUser.uid,
        email: firebaseUser.email || profileSnapshot.data().email || '',
      } as UserAccount);
      if (profile.status !== 'Active') {
        setAuthMessage('This account is suspended. Contact your administrator.');
        await signOut(auth);
        return;
      }

      setAuthMessage('');
      setLoggedInUser(profile);
      setCurrentUserAccount(profile);
    } catch {
      setAuthMessage('Unable to load the HR account profile. Contact your administrator.');
      await signOut(auth).catch(() => undefined);
    } finally {
      setAuthReady(true);
    }
  }), []);

  const handleLogin = async (email: string, password: string) => {
    setAuthMessage('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      const code = authErrorCode(error);
      console.warn(`Firebase sign-in rejected (${code || 'unknown-error'}).`);
      throw new Error(safeAuthErrorMessage(error));
    }
  };

  const handleLogout = () => {
    void signOut(auth);
    setLoggedInUser(null);
    setCurrentUserAccount(emptyUserAccount);
    privacyStorage.removeItem('hr_logged_in_user');
    privacyStorage.removeItem('hr_current_user');
  };

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

  // Firestore Real-time Sync
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    if (!loggedInUser) return;

    const unsubscribes: (() => void)[] = [];
    const requiredSnapshots = new Set([
      'employees',
      'biometricTemplates',
      'attendances',
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
      'statConfig',
    ]);
    const loadedSnapshots = new Set<string>();

    const markSnapshotLoaded = (collectionName: string) => {
      loadedSnapshots.add(collectionName);
      if (loadedSnapshots.size >= requiredSnapshots.size) {
        setFirestoreSyncStatus({ state: 'synced', message: 'Firestore synced.' });
      } else {
        setFirestoreSyncStatus({
          state: 'syncing',
          message: `Loading server data (${loadedSnapshots.size}/${requiredSnapshots.size})...`,
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
          console.warn(`Firestore listener failed for ${collectionName}:`);
        });
        unsubscribes.push(unsub);
      } catch (err) {
        markSnapshotWarning(collectionName, err);
        console.warn(`Firestore subscription deferred for ${collectionName}:`);
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
    registerCollectionListener('taxSlabs', setTaxSlabs, 'hr_tax_slabs');
    registerCollectionListener('roles', setRoles, 'hr_roles', () => setRolesLoaded(true));
    registerCollectionListener('holidays', setHolidays, 'hr_holidays');
    registerCollectionListener('loanAdvances', setLoanAdvances, 'hr_loans');
    registerCollectionListener('salaryRevisions', setSalaryRevisions, 'hr_salary_revisions');
    registerCollectionListener('performanceReviews', setPerformanceReviews, 'hr_perf_reviews');
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
        console.warn('Firestore users listener failed:');
      });
      unsubscribes.push(unsubUsers);
    } catch (err) {
      setUsersLoaded(true);
      markSnapshotWarning('users', err);
      console.warn('Firestore users subscription deferred:');
    }

    // PayrollRuns Sync
    registerCollectionListener('payrollRuns', setPayrollRuns, 'hr_payroll_runs');
    registerCollectionListener('payrollPayslips', setPayrollPayslips, 'hr_payroll_payslips', undefined, true);

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
        console.warn('Firestore statConfig listener failed:');
      });
      unsubscribes.push(unsubConfig);
    } catch (err) {
      markSnapshotWarning('statConfig', err);
      console.warn('Firestore statConfig subscription deferred:');
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
      console.warn('Firebase employee add delayed:');
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
      console.warn('Firebase employee update delayed:');
      throw err;
    }
  };

  // ─── Statutory Config Handlers ────────────────────────────────────────────
  const handleUpdateStatConfig = async (newConfig: StatutoryConfig) => {
    setStatConfig(newConfig);
    privacyStorage.setItem('hr_stat_config', JSON.stringify(newConfig));
    try {
      await setDoc(doc(db, 'statConfig', newConfig.id), newConfig);
    } catch (err) {
      console.warn('Firebase statConfig update delayed:');
    }
  };

  const handleUpdateTaxSlabs = async (newSlabs: TaxSlab[]) => {
    setTaxSlabs(newSlabs);
    privacyStorage.setItem('hr_tax_slabs', JSON.stringify(newSlabs));
    try {
      for (const slab of newSlabs) {
        await setDoc(doc(db, 'taxSlabs', slab.id), slab);
      }
    } catch (err) {
      console.warn('Firebase tax slabs update delayed:');
    }
  };

  // ─── Leave Handlers ───────────────────────────────────────────────────────
  const handleApproveLeave = async (id: string) => {
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
              console.warn('Firebase auto-attendance sync delayed:')
            );
          }
          return updated;
        });
      }
    }

    try {
      await updateDoc(doc(db, 'leaves', id), {
        status: 'Approved',
        approvedBy: loggedInUser?.username || 'HR Manager',
        approvedOn: today
      });
    } catch (err) {
      console.warn('Firebase leave approval delayed:');
    }
  };

  const handleRejectLeave = async (id: string) => {
    const today = todayStr();
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
      console.warn('Firebase leave rejection delayed:');
    }
  };

  const handleApplyLeave = async (leave: LeaveRequest) => {
    setLeaves(prev => {
      const updated = [...prev, leave];
      privacyStorage.setItem('hr_leaves', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'leaves', leave.id), cleanData(leave));
    } catch (err) {
      console.warn('Firebase leave apply delayed:');
    }
  };

  // ─── Attendance Handlers ──────────────────────────────────────────────────
  const handleApproveRegularization = async (id: string) => {
    setAttendances(prev => {
      const updated = prev.map(att =>
        att.id === id ? { ...att, status: 'Present', regularizationApproved: true } as AttendanceLog : att
      );
      privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'attendances', id), { status: 'Present', regularizationApproved: true });
    } catch (err) {
      console.warn('Firebase regularization approval delayed:');
    }
  };

  const handleRejectRegularization = async (id: string) => {
    setAttendances(prev => {
      const updated = prev.map(att =>
        att.id === id ? { ...att, regularizationApproved: false } : att
      );
      privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'attendances', id), { regularizationApproved: false });
    } catch (err) {
      console.warn('Firebase regularization rejection delayed:');
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
    const locationEvidence = lat !== undefined && lon !== undefined && locationAccuracyMeters !== undefined && locationCapturedAt
      ? { latitude: lat, longitude: lon, accuracyMeters: locationAccuracyMeters, capturedAt: locationCapturedAt, source: 'device-gps' as const, ...(locationAddress && { address: locationAddress }) }
      : undefined;

    if (method === 'Mobile GPS' && !locationEvidence) throw new Error('Verified mobile location is required.');

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
      const updatedLog: AttendanceLog = { ...existing, method: 'Mobile GPS', fieldVisits: visits, lastPunchAt: locationCapturedAt, mobileDutyAuthorizationId: mobileAuthorization!.id };
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
      let otMins = 0;
      if (existing.punchIn && punchOut) {
        const [ih, im] = existing.punchIn.split(':').map(Number);
        const [oh, om] = punchOut.split(':').map(Number);
        const worked = (oh * 60 + om) - (ih * 60 + im);
        otMins = Math.max(0, worked - 480);
      }
      const updatedLog: AttendanceLog = {
        ...existing,
        ...(mobileAuthorization && { method: 'Mobile GPS', mobileDutyAuthorizationId: mobileAuthorization.id }),
        punchOut,
        lastPunchAt: punchOut,
        ...(method === 'Mobile Kiosk' && mobileDetails?.reasonNote && { outReason: mobileDetails.reasonNote }),
        overtimeMinutes: otMins,
        ...(lat !== undefined && { latitude: lat }),
        ...(lon !== undefined && { longitude: lon }),
        ...(locationAccuracyMeters !== undefined && { locationAccuracyMeters }),
        ...(locationCapturedAt && { locationCapturedAt, locationSource: 'device-gps' as const }),
        ...(locationAddress && { address: locationAddress }),
        ...(locationEvidence && { punchOutLocation: locationEvidence }),
        ...(mobileDetails && { punchOutReasonCategory: mobileDetails.reasonCategory, punchOutReasonNote: mobileDetails.reasonNote })
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
      let status: AttendanceLog['status'] = 'Present';
      if (punchIn) {
        const [h, m] = punchIn.split(':').map(Number);
        if (h * 60 + m > 9 * 60 + 15) status = 'Late';
      }
      const newLog: AttendanceLog = {
        id: `att-${employeeId}-${Date.now()}`,
        employeeId,
        date: today,
        punchIn,
        lastPunchAt: punchIn,
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
      };
      await setDoc(doc(db, 'attendances', newLog.id), cleanData(newLog));
      setAttendances(prev => {
        const updated = [...prev, newLog];
        privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
        return updated;
      });
    }
  };

  const handleAddRegularization = async (employeeId: string, date: string, reason: string) => {
    const newRegLog: AttendanceLog = {
      id: `att-reg-${employeeId}-${Date.now()}`,
      employeeId,
      date,
      method: 'Manual',
      status: 'Absent',
      overtimeMinutes: 0,
      regularizationRequested: true,
      regularizationReason: reason
    };
    setAttendances(prev => {
      const updated = [...prev, newRegLog];
      privacyStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'attendances', newRegLog.id), cleanData(newRegLog));
    } catch (err) {
      console.warn('Firebase regularization delayed:');
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
      console.warn('Firebase attendance add delayed:');
    }
  };

  // ─── Payroll Handler ──────────────────────────────────────────────────────
  const handleCreatePayrollRun = async (title: string, month: number, year: number) => {
    if (payrollRuns.some(run => run.periodMonth === month && run.periodYear === year)) {
      alert('A payroll run already exists for this period. Open the existing run instead of creating a duplicate.');
      return;
    }
    const lastDay = new Date(year, month, 0).getDate();
    const eligibleEmployees = employees.filter(emp => emp.status === 'Active' || emp.status === 'On Leave');
    const runId = `run-${month}-${year}-${Date.now()}`;

    const sheets = eligibleEmployees.map(emp => ({
      ...computePayslipDetails(emp, month, year, attendances, leaves, statConfig, taxSlabs, departments, designations, branches, loanAdvances, wageTypes),
      id: `${runId}-${emp.id}`,
      payrollRunId: runId
    }));

    const totalGrossPay = sheets.reduce((sum, s) => sum + s.grossSalary, 0);
    const totalDeductions = sheets.reduce((sum, s) => sum + s.totalDeductions, 0);
    const totalNetPay = sheets.reduce((sum, s) => sum + s.netSalary, 0);
    const totalEobiEmployer = sheets.reduce((sum, s) => sum + s.eobiEmployerContribution, 0);
    const totalSocialSecurityEmployer = sheets.reduce((sum, s) => sum + s.pessiEmployerContribution, 0);

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
      auditTrail: [{ action: 'Created', at: new Date().toISOString(), by: currentUserAccount.username }]
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
    } catch (err) {
      console.warn('Firebase payroll run sync delayed:');
    }

    alert(`Draft payroll created for ${eligibleEmployees.length} employees. Review and approve it before loan deductions or disbursement.\nGross Pay: PKR ${totalGrossPay.toLocaleString()}\nNet Pay: PKR ${totalNetPay.toLocaleString()}`);
  };

  const handleUpdatePayrollStatus = async (runId: string, nextStatus: 'Approved' | 'Disbursed') => {
    const run = payrollRuns.find(item => item.id === runId);
    if (!run || (nextStatus === 'Approved' && run.status !== 'Draft') || (nextStatus === 'Disbursed' && run.status !== 'Approved')) return;
    const now = new Date().toISOString();
    const updatedRun: PayrollRun = {
      ...run,
      status: nextStatus,
      ...(nextStatus === 'Approved'
        ? { approvedAt: now, approvedBy: currentUserAccount.username }
        : { disbursedAt: now, disbursedBy: currentUserAccount.username }),
      auditTrail: [...(run.auditTrail || []), { action: nextStatus, at: now, by: currentUserAccount.username }]
    };

    setPayrollRuns(prev => {
      const updated = prev.map(item => item.id === runId ? updatedRun : item);
      privacyStorage.setItem('hr_payroll_runs', JSON.stringify(updated));
      return updated;
    });
    await setDoc(doc(db, 'payrollRuns', runId), cleanData(updatedRun));

    if (nextStatus === 'Approved') {
      const runEmployeeIds = new Set(payrollPayslips.filter(p => p.payrollRunId === runId).map(p => p.employeeId));
      const updatedLoans = loanAdvances.map((loan: LoanAdvance) => {
        if (!runEmployeeIds.has(loan.employeeId) || loan.status !== 'Active' || loan.remainingInstallments <= 0) return loan;
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
      await Promise.all(updatedLoans.map(loan => setDoc(doc(db, 'loanAdvances', loan.id), cleanData(loan))));
    }
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
      console.warn('Firebase role sync delayed:');
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
    if (password.length < 12) throw new Error('Password must be at least 12 characters.');

    await provisionFirebaseUser(profile.email, password, async uid => {
      const securedUser: UserAccount = {
        ...profile,
        id: uid,
        email: profile.email.trim().toLowerCase(),
      };
      await setDoc(doc(db, 'users', uid), cleanData(securedUser));
      setUsers(prev => {
        const updated = [...prev.filter(user => user.id !== uid), securedUser];
        privacyStorage.setItem('hr_users', JSON.stringify(updated));
        return updated;
      });
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
        console.warn('Firebase user role update delayed:');
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
    if (isFirebaseConfigured()) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'companies', payload.company.id), cleanData(payload.company), { merge: true });
      batch.set(doc(db, 'branches', payload.branch.id), cleanData(payload.branch), { merge: true });
      payload.departments.forEach(item => batch.set(doc(db, 'departments', item.id), cleanData(item), { merge: true }));
      payload.designations.forEach(item => batch.set(doc(db, 'designations', item.id), cleanData(item), { merge: true }));
      batch.set(doc(db, 'statConfig', payload.statutoryConfig.id), cleanData(payload.statutoryConfig), { merge: true });
      await batch.commit();
    }
    setCompanies(nextCompanies); setBranches(nextBranches); setDepartments(nextDepartments); setDesignations(nextDesignations); setStatConfig(payload.statutoryConfig);
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
      console.warn('Firebase branch sync delayed:');
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
      console.warn('Firebase department sync delayed:');
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
      console.warn('Firebase designation sync delayed:');
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
    try {
      await setDoc(doc(db, config.collectionName, record.id), cleanData(record), { merge: true });
    } catch (error) {
      if (isFirebaseConfigured()) throw error;
    }
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
      console.warn('Firebase holiday add delayed:');
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
      console.warn('Firebase holiday update delayed:');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    setHolidays((prev: Holiday[]) => {
      const updated = prev.filter((h: Holiday) => h.id !== id);
      privacyStorage.setItem('hr_holidays', JSON.stringify(updated));
      return updated;
    });
    // Soft delete: no Firestore delete to avoid accidental data loss
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
      console.warn('Firebase loan apply delayed:');
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
      console.warn('Firebase loan approval delayed:');
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
      console.warn('Firebase loan rejection delayed:');
    }
  };

  // ─── Salary Revision Handlers ─────────────────────────────────────────────
  const handleAddSalaryRevision = async (revision: SalaryRevision) => {
    // Apply the new salary to the employee record
    const employee = employees.find(e => e.id === revision.employeeId);
    if (employee) {
      await handleUpdateEmployee({ ...employee, basicSalary: revision.newSalary });
    }

    setSalaryRevisions(prev => {
      const updated = [...prev, revision];
      privacyStorage.setItem('hr_salary_revisions', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'salaryRevisions', revision.id), cleanData(revision));
    } catch (err) {
      console.warn('Firebase salary revision delayed:');
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
      console.warn('Firebase performance review add delayed:');
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
      console.warn('Firebase performance review update delayed:');
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
      console.warn('Firebase asset add delayed:');
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
      console.warn('Firebase asset update delayed:');
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
      console.warn('Firebase job posting add delayed:');
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
      console.warn('Firebase job posting update delayed:');
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
      console.warn('Firebase job application add delayed:');
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
      console.warn('Firebase job application update delayed:');
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
      console.warn('Firebase gratuity settlement add delayed:');
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
      console.warn('Firebase gratuity settlement update delayed:');
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
      console.warn('Firebase notification add delayed:');
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
      console.warn('Firebase notification mark-read delayed:');
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

  const accessControlLoaded = !isFirebaseConfigured() || (rolesLoaded && usersLoaded);
  const employeesWithFingerprints = mergeEmployeeFingerprintTemplates(employees, biometricTemplates);

  if (!loggedInUser) {
    return <LoginScreen authReady={authReady} authMessage={authMessage} onLogin={handleLogin} />;
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
      payrollPayslips={payrollPayslips}
      onAddEmployee={handleAddEmployee}
      onUpdateEmployee={handleUpdateEmployee}
      onUpdateStatConfig={handleUpdateStatConfig}
      onUpdateTaxSlabs={handleUpdateTaxSlabs}
      onApproveLeave={handleApproveLeave}
      onRejectLeave={handleRejectLeave}
      onApproveRegularization={handleApproveRegularization}
      onRejectRegularization={handleRejectRegularization}
      onCreatePayrollRun={handleCreatePayrollRun}
      onUpdatePayrollStatus={handleUpdatePayrollStatus}
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
  onLogin
}: {
  authReady: boolean,
  authMessage: string,
  onLogin: (email: string, password: string) => Promise<void>
}) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');

    try {
      await onLogin(loginId, password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    }
  };

  const renderError = () => (error || authMessage) ? (
    <div className="bg-rose-950/30 border border-rose-900/50 p-3.5 rounded-xl text-rose-400 text-xs flex items-center space-x-2">
      <span className="font-bold text-base leading-none">!</span>
      <span>{error || authMessage}</span>
    </div>
  ) : null;

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-950/80 backdrop-blur-md p-8 rounded-3xl border border-slate-800 shadow-2xl relative z-10 space-y-6">
        <span aria-hidden="true" className="pointer-events-none absolute left-[26px] top-[26px] h-1.5 w-1.5 rounded-full bg-slate-600" />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-[26px] left-[26px] h-1.5 w-1.5 rounded-full bg-slate-600" />
        <span aria-hidden="true" className="pointer-events-none absolute bottom-[26px] right-[26px] h-1.5 w-1.5 rounded-full bg-slate-600" />
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-500 mx-auto flex items-center justify-center shadow-lg text-white font-bold text-xl">
            HR
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white uppercase">Bin Ishaq HR Suite</h2>
            <p className="text-xs text-slate-400">Payroll Compliance &amp; Attendance Management</p>
          </div>
        </div>

        {!authReady ? (
          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl text-xs text-slate-300">
            Checking authentication session...
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              {renderError()}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</label>
                <input type="email" autoComplete="username" required value={loginId} onChange={e => setLoginId(e.target.value)} placeholder="admin@company.com" className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white placeholder-slate-500" />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
                <div className="relative">
                  <input type={isPasswordVisible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full text-sm py-3 pl-3 pr-12 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus-visible:ring-emerald-500 focus:outline-none text-white placeholder-slate-500 font-mono" />
                  <button type="button" onClick={() => setIsPasswordVisible(visible => !visible)} aria-label={isPasswordVisible ? 'Hide password' : 'Show password'} aria-pressed={isPasswordVisible} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition-colors hover:text-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500">
                    {isPasswordVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold py-3.5 rounded-xl shadow-lg transition duration-200 text-sm">
                Sign In to System
              </button>
            </form>
          </>
        )}
      </div>

      <div className="text-center text-[10px] text-slate-500 mt-6 font-mono">
        Bin Ishaq HR Suite - Firestore backed access control
      </div>
    </div>
  );
}
