/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  DEFAULT_EMPLOYEES, DEFAULT_ATTENDANCES, DEFAULT_LEAVE_REQUESTS,
  DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS,
  DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS,
  computePayslipDetails, DEFAULT_ROLES, DEFAULT_USERS,
  DEFAULT_HOLIDAYS, DEFAULT_LOAN_ADVANCES, DEFAULT_SALARY_REVISIONS,
  DEFAULT_PERFORMANCE_REVIEWS, DEFAULT_COMPANY_ASSETS,
  DEFAULT_JOB_POSTINGS, DEFAULT_JOB_APPLICATIONS,
  DEFAULT_GRATUITY_SETTLEMENTS, DEFAULT_NOTIFICATIONS
} from './data/defaults';
import {
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun,
  Role, UserAccount, Branch, Department, Designation, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification
} from './types';
import { DeviceEmulator } from './components/DeviceEmulator';
import { MobileApp } from './components/MobileApp';
import { db, isFirebaseConfigured } from './firebase';
import {
  collection, doc, setDoc, updateDoc, onSnapshot
} from 'firebase/firestore';

export default function App() {
  const cleanData = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj));

  const getInitialValue = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(`localStorage read error for ${key}:`, e);
    }
    return fallback;
  };

  const todayStr = () => new Date().toISOString().split('T')[0];

  // Application Data States
  const [employees, setEmployees] = useState<Employee[]>(() => getInitialValue('hr_employees', DEFAULT_EMPLOYEES));
  const [attendances, setAttendances] = useState<AttendanceLog[]>(() => getInitialValue('hr_attendances', DEFAULT_ATTENDANCES));
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => getInitialValue('hr_leaves', DEFAULT_LEAVE_REQUESTS));
  const [statConfig, setStatConfig] = useState<StatutoryConfig>(() => getInitialValue('hr_stat_config', DEFAULT_STATUTORY_CONFIG));
  const [taxSlabs, setTaxSlabs] = useState<TaxSlab[]>(() => getInitialValue('hr_tax_slabs', DEFAULT_TAX_SLABS));
  const [branches, setBranches] = useState<Branch[]>(() => getInitialValue('hr_branches', DEFAULT_BRANCHES));
  const [departments, setDepartments] = useState<Department[]>(() => getInitialValue('hr_departments', DEFAULT_DEPARTMENTS));
  const [designations, setDesignations] = useState<Designation[]>(() => getInitialValue('hr_designations', DEFAULT_DESIGNATIONS));
  const [holidays, setHolidays] = useState<Holiday[]>(() => getInitialValue('hr_holidays', DEFAULT_HOLIDAYS));
  const [loanAdvances, setLoanAdvances] = useState<LoanAdvance[]>(() => getInitialValue('hr_loans', DEFAULT_LOAN_ADVANCES));
  const [salaryRevisions, setSalaryRevisions] = useState<SalaryRevision[]>(() => getInitialValue('hr_salary_revisions', DEFAULT_SALARY_REVISIONS));
  const [performanceReviews, setPerformanceReviews] = useState<PerformanceReview[]>(() => getInitialValue('hr_perf_reviews', DEFAULT_PERFORMANCE_REVIEWS));
  const [companyAssets, setCompanyAssets] = useState<CompanyAsset[]>(() => getInitialValue('hr_assets', DEFAULT_COMPANY_ASSETS));
  const [jobPostings, setJobPostings] = useState<JobPosting[]>(() => getInitialValue('hr_job_postings', DEFAULT_JOB_POSTINGS));
  const [jobApplications, setJobApplications] = useState<JobApplication[]>(() => getInitialValue('hr_job_apps', DEFAULT_JOB_APPLICATIONS));
  const [gratuitySettlements, setGratuitySettlements] = useState<GratuitySettlement[]>(() => getInitialValue('hr_gratuity', DEFAULT_GRATUITY_SETTLEMENTS));
  const [notifications, setNotifications] = useState<AppNotification[]>(() => getInitialValue('hr_notifications', DEFAULT_NOTIFICATIONS));

  // User & RBAC States
  const [loggedInUser, setLoggedInUser] = useState<UserAccount | null>(() => getInitialValue('hr_logged_in_user', null));
  const [roles, setRoles] = useState<Role[]>(() => getInitialValue('hr_roles', DEFAULT_ROLES));
  const [users, setUsers] = useState<UserAccount[]>(() => getInitialValue('hr_users', DEFAULT_USERS));
  const [currentUserAccount, setCurrentUserAccount] = useState<UserAccount>(() => getInitialValue('hr_current_user', DEFAULT_USERS[0]));

  const handleLogin = (user: UserAccount) => {
    setLoggedInUser(user);
    localStorage.setItem('hr_logged_in_user', JSON.stringify(user));
    setCurrentUserAccount(user);
    localStorage.setItem('hr_current_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setLoggedInUser(null);
    localStorage.removeItem('hr_logged_in_user');
    localStorage.removeItem('hr_current_user');
  };

  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>(() => getInitialValue('hr_payroll_runs', [
    {
      id: 'run-pk-june2026',
      title: 'Payroll - June 2026 (Active)',
      periodMonth: 6,
      periodYear: 2026,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      status: 'Approved',
      createdAt: '2026-06-17',
      totalGrossPay: 646600,
      totalDeductions: 32600,
      totalNetPay: 614000,
      totalEobiEmployer: 9250,
      totalSocialSecurityEmployer: 10400
    }
  ]));

  // Firestore Real-time Sync
  useEffect(() => {
    if (!isFirebaseConfigured()) return;

    const unsubscribes: (() => void)[] = [];

    const registerCollectionListener = <T extends { id: string }>(
      collectionName: string,
      defaultItems: T[],
      stateSetter: React.Dispatch<React.SetStateAction<T[]>>,
      storageKey: string
    ) => {
      try {
        const unsub = onSnapshot(collection(db, collectionName), async (snapshot) => {
          const fetched: T[] = [];
          snapshot.forEach(docSnap => {
            fetched.push({ id: docSnap.id, ...docSnap.data() } as T);
          });

          const merged = [...fetched];
          for (const defItem of defaultItems) {
            if (!merged.some(item => item.id === defItem.id)) {
              merged.push(defItem);
              try {
                await setDoc(doc(db, collectionName, defItem.id), defItem);
              } catch (e) {
                console.warn(`Seed sync error in ${collectionName}:`, e);
              }
            }
          }

          stateSetter(merged);
          localStorage.setItem(storageKey, JSON.stringify(merged));
        }, (err) => {
          console.warn(`Firestore listener failed for ${collectionName}:`, err);
        });
        unsubscribes.push(unsub);
      } catch (err) {
        console.warn(`Firestore subscription deferred for ${collectionName}:`, err);
      }
    };

    registerCollectionListener('employees', DEFAULT_EMPLOYEES, setEmployees, 'hr_employees');
    registerCollectionListener('attendances', DEFAULT_ATTENDANCES, setAttendances, 'hr_attendances');
    registerCollectionListener('leaves', DEFAULT_LEAVE_REQUESTS, setLeaves, 'hr_leaves');
    registerCollectionListener('branches', DEFAULT_BRANCHES, setBranches, 'hr_branches');
    registerCollectionListener('departments', DEFAULT_DEPARTMENTS, setDepartments, 'hr_departments');
    registerCollectionListener('designations', DEFAULT_DESIGNATIONS, setDesignations, 'hr_designations');
    registerCollectionListener('taxSlabs', DEFAULT_TAX_SLABS, setTaxSlabs, 'hr_tax_slabs');
    registerCollectionListener('roles', DEFAULT_ROLES, setRoles, 'hr_roles');
    registerCollectionListener('holidays', DEFAULT_HOLIDAYS, setHolidays, 'hr_holidays');
    registerCollectionListener('loanAdvances', DEFAULT_LOAN_ADVANCES, setLoanAdvances, 'hr_loans');
    registerCollectionListener('salaryRevisions', DEFAULT_SALARY_REVISIONS, setSalaryRevisions, 'hr_salary_revisions');
    registerCollectionListener('performanceReviews', DEFAULT_PERFORMANCE_REVIEWS, setPerformanceReviews, 'hr_perf_reviews');
    registerCollectionListener('companyAssets', DEFAULT_COMPANY_ASSETS, setCompanyAssets, 'hr_assets');
    registerCollectionListener('jobPostings', DEFAULT_JOB_POSTINGS, setJobPostings, 'hr_job_postings');
    registerCollectionListener('jobApplications', DEFAULT_JOB_APPLICATIONS, setJobApplications, 'hr_job_apps');
    registerCollectionListener('gratuitySettlements', DEFAULT_GRATUITY_SETTLEMENTS, setGratuitySettlements, 'hr_gratuity');
    registerCollectionListener('notifications', DEFAULT_NOTIFICATIONS, setNotifications, 'hr_notifications');

    // Users Sync (special: also updates currentUserAccount)
    try {
      const unsubUsers = onSnapshot(collection(db, 'users'), async (snapshot) => {
        const fetched: UserAccount[] = [];
        snapshot.forEach(docSnap => {
          fetched.push({ id: docSnap.id, ...docSnap.data() } as UserAccount);
        });

        const merged = [...fetched];
        for (const defUser of DEFAULT_USERS) {
          if (!merged.some(u => u.id === defUser.id)) {
            merged.push(defUser);
            try {
              await setDoc(doc(db, 'users', defUser.id), defUser);
            } catch (e) {
              console.warn('Seed user sync error:', e);
            }
          }
        }

        setUsers(merged);
        localStorage.setItem('hr_users', JSON.stringify(merged));

        const storedCurrentUser = localStorage.getItem('hr_current_user');
        if (storedCurrentUser) {
          const parsed = JSON.parse(storedCurrentUser) as UserAccount;
          const updatedCurrent = merged.find(u => u.id === parsed.id);
          if (updatedCurrent) {
            setCurrentUserAccount(updatedCurrent);
            localStorage.setItem('hr_current_user', JSON.stringify(updatedCurrent));
          }
        }
      }, (err) => {
        console.warn('Firestore users listener failed:', err);
      });
      unsubscribes.push(unsubUsers);
    } catch (err) {
      console.warn('Firestore users subscription deferred:', err);
    }

    // PayrollRuns Sync
    registerCollectionListener('payrollRuns', [
      {
        id: 'run-pk-june2026',
        title: 'Payroll - June 2026 (Active)',
        periodMonth: 6,
        periodYear: 2026,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        status: 'Approved',
        createdAt: '2026-06-17',
        totalGrossPay: 646600,
        totalDeductions: 32600,
        totalNetPay: 614000,
        totalEobiEmployer: 9250,
        totalSocialSecurityEmployer: 10400
      }
    ], setPayrollRuns, 'hr_payroll_runs');

    // StatConfig Sync (single document)
    try {
      const unsubConfig = onSnapshot(collection(db, 'statConfig'), async (snapshot) => {
        let fetchedConfig: StatutoryConfig | null = null;
        snapshot.forEach(docSnap => {
          fetchedConfig = { id: docSnap.id, ...docSnap.data() } as StatutoryConfig;
        });

        if (fetchedConfig) {
          setStatConfig(fetchedConfig);
          localStorage.setItem('hr_stat_config', JSON.stringify(fetchedConfig));
        } else {
          const current = getInitialValue('hr_stat_config', DEFAULT_STATUTORY_CONFIG);
          try {
            await setDoc(doc(db, 'statConfig', current.id), current);
          } catch (e) {
            console.warn('StatConfig seed error:', e);
          }
        }
      }, (err) => {
        console.warn('Firestore statConfig listener failed:', err);
      });
      unsubscribes.push(unsubConfig);
    } catch (err) {
      console.warn('Firestore statConfig subscription deferred:', err);
    }

    return () => unsubscribes.forEach(unsub => unsub());
  }, []);

  // ─── Employee Handlers ────────────────────────────────────────────────────
  const handleAddEmployee = async (newEmp: Employee) => {
    setEmployees(prev => {
      const updated = [...prev, newEmp];
      localStorage.setItem('hr_employees', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'employees', newEmp.id), cleanData(newEmp));
    } catch (err) {
      console.warn('Firebase employee add delayed:', err);
    }
  };

  const handleUpdateEmployee = async (updatedEmp: Employee) => {
    setEmployees(prev => {
      const updated = prev.map(e => e.id === updatedEmp.id ? updatedEmp : e);
      localStorage.setItem('hr_employees', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'employees', updatedEmp.id), cleanData(updatedEmp));
    } catch (err) {
      console.warn('Firebase employee update delayed:', err);
    }
  };

  // ─── Statutory Config Handlers ────────────────────────────────────────────
  const handleUpdateStatConfig = async (newConfig: StatutoryConfig) => {
    setStatConfig(newConfig);
    localStorage.setItem('hr_stat_config', JSON.stringify(newConfig));
    try {
      await setDoc(doc(db, 'statConfig', newConfig.id), newConfig);
    } catch (err) {
      console.warn('Firebase statConfig update delayed:', err);
    }
  };

  const handleUpdateTaxSlabs = async (newSlabs: TaxSlab[]) => {
    setTaxSlabs(newSlabs);
    localStorage.setItem('hr_tax_slabs', JSON.stringify(newSlabs));
    try {
      for (const slab of newSlabs) {
        await setDoc(doc(db, 'taxSlabs', slab.id), slab);
      }
    } catch (err) {
      console.warn('Firebase tax slabs update delayed:', err);
    }
  };

  // ─── Leave Handlers ───────────────────────────────────────────────────────
  const handleApproveLeave = async (id: string) => {
    const today = todayStr();
    const approverName = loggedInUser?.username || 'HR Manager';

    setLeaves(prev => {
      const updated = prev.map(l =>
        l.id === id ? { ...l, status: 'Approved', approvedBy: approverName, approvedOn: today } : l
      );
      localStorage.setItem('hr_leaves', JSON.stringify(updated));
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
          localStorage.setItem('hr_attendances', JSON.stringify(updated));
          for (const log of autoLogs) {
            setDoc(doc(db, 'attendances', log.id), log).catch(err =>
              console.warn('Firebase auto-attendance sync delayed:', err)
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
      console.warn('Firebase leave approval delayed:', err);
    }
  };

  const handleRejectLeave = async (id: string) => {
    const today = todayStr();
    setLeaves(prev => {
      const updated = prev.map(l =>
        l.id === id ? { ...l, status: 'Rejected', approvedBy: loggedInUser?.username, approvedOn: today } : l
      );
      localStorage.setItem('hr_leaves', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'leaves', id), { status: 'Rejected' });
    } catch (err) {
      console.warn('Firebase leave rejection delayed:', err);
    }
  };

  const handleApplyLeave = async (leave: LeaveRequest) => {
    setLeaves(prev => {
      const updated = [...prev, leave];
      localStorage.setItem('hr_leaves', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'leaves', leave.id), cleanData(leave));
    } catch (err) {
      console.warn('Firebase leave apply delayed:', err);
    }
  };

  // ─── Attendance Handlers ──────────────────────────────────────────────────
  const handleApproveRegularization = async (id: string) => {
    setAttendances(prev => {
      const updated = prev.map(att =>
        att.id === id ? { ...att, status: 'Present', regularizationApproved: true } : att
      );
      localStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'attendances', id), { status: 'Present', regularizationApproved: true });
    } catch (err) {
      console.warn('Firebase regularization approval delayed:', err);
    }
  };

  const handleRejectRegularization = async (id: string) => {
    setAttendances(prev => {
      const updated = prev.map(att =>
        att.id === id ? { ...att, regularizationApproved: false } : att
      );
      localStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'attendances', id), { regularizationApproved: false });
    } catch (err) {
      console.warn('Firebase regularization rejection delayed:', err);
    }
  };

  const handleSimulatePunch = async (employeeId: string, punchIn: string, punchOut: string, method: string) => {
    const today = todayStr();
    const existingIdx = attendances.findIndex(a => a.employeeId === employeeId && a.date === today);

    if (existingIdx !== -1) {
      // Punch out — update existing log
      let updatedLog: AttendanceLog | null = null;
      setAttendances(prev => {
        const updated = [...prev];
        const existing = updated[existingIdx];
        // Calculate actual OT if punch times provided
        let otMins = 0;
        if (existing.punchIn && punchOut) {
          const [ih, im] = existing.punchIn.split(':').map(Number);
          const [oh, om] = punchOut.split(':').map(Number);
          const worked = (oh * 60 + om) - (ih * 60 + im);
          otMins = Math.max(0, worked - 480); // 480 = 8 hours standard
        }
        updated[existingIdx] = { ...existing, punchOut, overtimeMinutes: otMins };
        updatedLog = updated[existingIdx];
        localStorage.setItem('hr_attendances', JSON.stringify(updated));
        return updated;
      });
      if (updatedLog) {
        try {
          await setDoc(doc(db, 'attendances', (updatedLog as AttendanceLog).id), updatedLog);
        } catch (err) {
          console.warn('Firebase punch-out delayed:', err);
        }
      }
    } else {
      // Punch in — create new log
      // Determine if late (after 09:15 default grace)
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
        method: method as AttendanceLog['method'],
        status,
        overtimeMinutes: 0
      };
      setAttendances(prev => {
        const updated = [...prev, newLog];
        localStorage.setItem('hr_attendances', JSON.stringify(updated));
        return updated;
      });
      try {
        await setDoc(doc(db, 'attendances', newLog.id), newLog);
      } catch (err) {
        console.warn('Firebase punch-in delayed:', err);
      }
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
      localStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'attendances', newRegLog.id), cleanData(newRegLog));
    } catch (err) {
      console.warn('Firebase regularization delayed:', err);
    }
  };

  const handleAddAttendance = async (newAtt: AttendanceLog) => {
    setAttendances(prev => {
      const updated = [...prev, newAtt];
      localStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'attendances', newAtt.id), cleanData(newAtt));
    } catch (err) {
      console.warn('Firebase attendance add delayed:', err);
    }
  };

  // ─── Payroll Handler ──────────────────────────────────────────────────────
  const handleCreatePayrollRun = async (title: string, month: number, year: number) => {
    const lastDay = new Date(year, month, 0).getDate();

    const sheets = employees.map(emp =>
      computePayslipDetails(emp, month, year, attendances, leaves, statConfig, taxSlabs, departments, designations, branches, loanAdvances)
    );

    const totalGrossPay = sheets.reduce((sum, s) => sum + s.grossSalary, 0);
    const totalDeductions = sheets.reduce((sum, s) => sum + s.totalDeductions, 0);
    const totalNetPay = sheets.reduce((sum, s) => sum + s.netSalary, 0);
    const totalEobiEmployer = sheets.reduce((sum, s) => sum + s.eobiEmployerContribution, 0);
    const totalSocialSecurityEmployer = sheets.reduce((sum, s) => sum + s.pessiEmployerContribution, 0);

    const newRun: PayrollRun = {
      id: `run-${month}-${year}-${Date.now()}`,
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
      totalSocialSecurityEmployer
    };

    setPayrollRuns(prev => {
      const updated = [...prev, newRun];
      localStorage.setItem('hr_payroll_runs', JSON.stringify(updated));
      return updated;
    });

    // Process loan installments — reduce remaining installments
    const updatedLoans = loanAdvances.map((loan: LoanAdvance) => {
      const hasInstallmentThisMonth = employees.some((e: Employee) => e.id === loan.employeeId) &&
        loan.status === 'Active' && loan.remainingInstallments > 0;
      if (!hasInstallmentThisMonth) return loan;
      const remaining = loan.remainingInstallments - 1;
      const totalRepaid = loan.totalRepaid + loan.monthlyInstallment;
      return {
        ...loan,
        remainingInstallments: remaining,
        totalRepaid,
        status: remaining === 0 ? 'Closed' : 'Active' as LoanAdvance['status']
      };
    });
    setLoanAdvances(updatedLoans);
    localStorage.setItem('hr_loans', JSON.stringify(updatedLoans));

    try {
      await setDoc(doc(db, 'payrollRuns', newRun.id), cleanData(newRun));
    } catch (err) {
      console.warn('Firebase payroll run sync delayed:', err);
    }

    alert(`Payroll processed for ${employees.length} employees!\nGross Pay: PKR ${totalGrossPay.toLocaleString()}\nNet Pay: PKR ${totalNetPay.toLocaleString()}\nEOBI Employer: PKR ${totalEobiEmployer.toLocaleString()}`);
  };

  // ─── Role & User Handlers ─────────────────────────────────────────────────
  const handleAddRole = async (newRole: Role) => {
    setRoles(prev => {
      const updated = [...prev, newRole];
      localStorage.setItem('hr_roles', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'roles', newRole.id), cleanData(newRole));
    } catch (err) {
      console.warn('Firebase role sync delayed:', err);
    }
  };

  const handleAddUser = async (newUser: UserAccount) => {
    setUsers(prev => {
      const updated = [...prev, newUser];
      localStorage.setItem('hr_users', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'users', newUser.id), cleanData(newUser));
    } catch (err) {
      console.warn('Firebase user sync delayed:', err);
    }
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
      localStorage.setItem('hr_users', JSON.stringify(updated));
      return updated;
    });

    if (currentUserAccount.id === userId) {
      setCurrentUserAccount(prev => {
        const updated = { ...prev, roleId };
        localStorage.setItem('hr_current_user', JSON.stringify(updated));
        return updated;
      });
    }

    if (updatedUser) {
      try {
        await updateDoc(doc(db, 'users', userId), { roleId });
      } catch (err) {
        console.warn('Firebase user role update delayed:', err);
      }
    }
  };

  const handleSetCurrentUserAccount = (user: UserAccount) => {
    setCurrentUserAccount(user);
    localStorage.setItem('hr_current_user', JSON.stringify(user));
  };

  // ─── Org Structure Handlers ───────────────────────────────────────────────
  const handleAddBranch = async (newBranch: Branch) => {
    setBranches(prev => {
      const updated = [...prev, newBranch];
      localStorage.setItem('hr_branches', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'branches', newBranch.id), cleanData(newBranch));
    } catch (err) {
      console.warn('Firebase branch sync delayed:', err);
    }
  };

  const handleAddDepartment = async (newDept: Department) => {
    setDepartments(prev => {
      const updated = [...prev, newDept];
      localStorage.setItem('hr_departments', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'departments', newDept.id), cleanData(newDept));
    } catch (err) {
      console.warn('Firebase department sync delayed:', err);
    }
  };

  const handleAddDesignation = async (newDesg: Designation) => {
    setDesignations(prev => {
      const updated = [...prev, newDesg];
      localStorage.setItem('hr_designations', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'designations', newDesg.id), cleanData(newDesg));
    } catch (err) {
      console.warn('Firebase designation sync delayed:', err);
    }
  };

  // ─── Holiday Handlers ─────────────────────────────────────────────────────
  const handleAddHoliday = async (holiday: Holiday) => {
    setHolidays(prev => {
      const updated = [...prev, holiday];
      localStorage.setItem('hr_holidays', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'holidays', holiday.id), cleanData(holiday));
    } catch (err) {
      console.warn('Firebase holiday add delayed:', err);
    }
  };

  const handleUpdateHoliday = async (holiday: Holiday) => {
    setHolidays((prev: Holiday[]) => {
      const updated = prev.map((h: Holiday) => h.id === holiday.id ? holiday : h);
      localStorage.setItem('hr_holidays', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'holidays', holiday.id), cleanData(holiday));
    } catch (err) {
      console.warn('Firebase holiday update delayed:', err);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    setHolidays((prev: Holiday[]) => {
      const updated = prev.filter((h: Holiday) => h.id !== id);
      localStorage.setItem('hr_holidays', JSON.stringify(updated));
      return updated;
    });
    // Soft delete: no Firestore delete to avoid accidental data loss
  };

  // ─── Loan & Advance Handlers ──────────────────────────────────────────────
  const handleApplyLoan = async (loan: LoanAdvance) => {
    setLoanAdvances(prev => {
      const updated = [...prev, loan];
      localStorage.setItem('hr_loans', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'loanAdvances', loan.id), cleanData(loan));
    } catch (err) {
      console.warn('Firebase loan apply delayed:', err);
    }
  };

  const handleApproveLoan = async (id: string) => {
    const today = todayStr();
    const approverName = loggedInUser?.username || 'HR Manager';
    setLoanAdvances((prev: LoanAdvance[]) => {
      const updated = prev.map((l: LoanAdvance) =>
        l.id === id ? { ...l, status: 'Active' as LoanAdvance['status'], approvedBy: approverName, approvedOn: today, disbursedDate: today } : l
      );
      localStorage.setItem('hr_loans', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'loanAdvances', id), { status: 'Active', approvedBy: approverName, approvedOn: today, disbursedDate: today });
    } catch (err) {
      console.warn('Firebase loan approval delayed:', err);
    }
  };

  const handleRejectLoan = async (id: string) => {
    setLoanAdvances((prev: LoanAdvance[]) => {
      const updated = prev.map((l: LoanAdvance) => l.id === id ? { ...l, status: 'Rejected' as LoanAdvance['status'] } : l);
      localStorage.setItem('hr_loans', JSON.stringify(updated));
      return updated;
    });
    try {
      await updateDoc(doc(db, 'loanAdvances', id), { status: 'Rejected' });
    } catch (err) {
      console.warn('Firebase loan rejection delayed:', err);
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
      localStorage.setItem('hr_salary_revisions', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'salaryRevisions', revision.id), cleanData(revision));
    } catch (err) {
      console.warn('Firebase salary revision delayed:', err);
    }
  };

  // ─── Performance Review Handlers ──────────────────────────────────────────
  const handleAddPerformanceReview = async (review: PerformanceReview) => {
    setPerformanceReviews((prev: PerformanceReview[]) => {
      const updated = [...prev, review];
      localStorage.setItem('hr_perf_reviews', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'performanceReviews', review.id), cleanData(review));
    } catch (err) {
      console.warn('Firebase performance review add delayed:', err);
    }
  };

  const handleUpdatePerformanceReview = async (review: PerformanceReview) => {
    setPerformanceReviews((prev: PerformanceReview[]) => {
      const updated = prev.map((r: PerformanceReview) => r.id === review.id ? review : r);
      localStorage.setItem('hr_perf_reviews', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'performanceReviews', review.id), cleanData(review));
    } catch (err) {
      console.warn('Firebase performance review update delayed:', err);
    }
  };

  // ─── Asset Handlers ───────────────────────────────────────────────────────
  const handleAddAsset = async (asset: CompanyAsset) => {
    setCompanyAssets((prev: CompanyAsset[]) => {
      const updated = [...prev, asset];
      localStorage.setItem('hr_assets', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'companyAssets', asset.id), cleanData(asset));
    } catch (err) {
      console.warn('Firebase asset add delayed:', err);
    }
  };

  const handleUpdateAsset = async (asset: CompanyAsset) => {
    setCompanyAssets((prev: CompanyAsset[]) => {
      const updated = prev.map((a: CompanyAsset) => a.id === asset.id ? asset : a);
      localStorage.setItem('hr_assets', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'companyAssets', asset.id), cleanData(asset));
    } catch (err) {
      console.warn('Firebase asset update delayed:', err);
    }
  };

  // ─── Recruitment Handlers ─────────────────────────────────────────────────
  const handleAddJobPosting = async (posting: JobPosting) => {
    setJobPostings((prev: JobPosting[]) => {
      const updated = [...prev, posting];
      localStorage.setItem('hr_job_postings', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobPostings', posting.id), cleanData(posting));
    } catch (err) {
      console.warn('Firebase job posting add delayed:', err);
    }
  };

  const handleUpdateJobPosting = async (posting: JobPosting) => {
    setJobPostings((prev: JobPosting[]) => {
      const updated = prev.map((p: JobPosting) => p.id === posting.id ? posting : p);
      localStorage.setItem('hr_job_postings', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobPostings', posting.id), cleanData(posting));
    } catch (err) {
      console.warn('Firebase job posting update delayed:', err);
    }
  };

  const handleAddJobApplication = async (app: JobApplication) => {
    setJobApplications((prev: JobApplication[]) => {
      const updated = [...prev, app];
      localStorage.setItem('hr_job_apps', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobApplications', app.id), cleanData(app));
    } catch (err) {
      console.warn('Firebase job application add delayed:', err);
    }
  };

  const handleUpdateJobApplication = async (app: JobApplication) => {
    setJobApplications((prev: JobApplication[]) => {
      const updated = prev.map((a: JobApplication) => a.id === app.id ? app : a);
      localStorage.setItem('hr_job_apps', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'jobApplications', app.id), cleanData(app));
    } catch (err) {
      console.warn('Firebase job application update delayed:', err);
    }
  };

  // ─── Gratuity Settlement Handlers ────────────────────────────────────────
  const handleAddGratuitySettlement = async (settlement: GratuitySettlement) => {
    setGratuitySettlements((prev: GratuitySettlement[]) => {
      const updated = [...prev, settlement];
      localStorage.setItem('hr_gratuity', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'gratuitySettlements', settlement.id), cleanData(settlement));
    } catch (err) {
      console.warn('Firebase gratuity settlement add delayed:', err);
    }
  };

  const handleUpdateGratuitySettlement = async (settlement: GratuitySettlement) => {
    setGratuitySettlements((prev: GratuitySettlement[]) => {
      const updated = prev.map((s: GratuitySettlement) => s.id === settlement.id ? settlement : s);
      localStorage.setItem('hr_gratuity', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'gratuitySettlements', settlement.id), cleanData(settlement));
    } catch (err) {
      console.warn('Firebase gratuity settlement update delayed:', err);
    }
  };

  // ─── Notification Handlers ────────────────────────────────────────────────
  const handleAddNotification = async (notification: AppNotification) => {
    setNotifications((prev: AppNotification[]) => {
      const updated = [...prev, notification];
      localStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
    try {
      await setDoc(doc(db, 'notifications', notification.id), cleanData(notification));
    } catch (err) {
      console.warn('Firebase notification add delayed:', err);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    const empId = loggedInUser?.employeeId || loggedInUser?.username || 'unknown';
    setNotifications((prev: AppNotification[]) => {
      const updated = prev.map((n: AppNotification) =>
        n.id === id && !n.readBy.includes(empId) ? { ...n, readBy: [...n.readBy, empId] } : n
      );
      localStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
    try {
      const notif = notifications.find((n: AppNotification) => n.id === id);
      if (notif && !notif.readBy.includes(empId)) {
        await updateDoc(doc(db, 'notifications', id), { readBy: [...notif.readBy, empId] });
      }
    } catch (err) {
      console.warn('Firebase notification mark-read delayed:', err);
    }
  };

  const handleMarkAllNotificationsRead = () => {
    const empId = loggedInUser?.employeeId || loggedInUser?.username || 'unknown';
    setNotifications((prev: AppNotification[]) => {
      const updated = prev.map((n: AppNotification) =>
        n.readBy.includes(empId) ? n : { ...n, readBy: [...n.readBy, empId] }
      );
      localStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteNotification = async (id: string) => {
    setNotifications((prev: AppNotification[]) => {
      const updated = prev.filter((n: AppNotification) => n.id !== id);
      localStorage.setItem('hr_notifications', JSON.stringify(updated));
      return updated;
    });
  };

  // ─── Mobile Platform Detection ────────────────────────────────────────────
  const isMobilePlatform = (window as any).Capacitor || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobilePlatform) {
    return (
      <MobileApp
        employees={employees}
        attendances={attendances}
        leaves={leaves}
        onApplyLeave={handleApplyLeave}
        onSimulatePunch={handleSimulatePunch}
        onAddRegularization={handleAddRegularization}
        hideMockPhoneFrame={true}
      />
    );
  }

  if (!loggedInUser) {
    return <LoginScreen users={users} onLogin={handleLogin} />;
  }

  return (
    <DeviceEmulator
      employees={employees}
      attendances={attendances}
      leaves={leaves}
      statConfig={statConfig}
      taxSlabs={taxSlabs}
      payrollRuns={payrollRuns}
      onAddEmployee={handleAddEmployee}
      onUpdateEmployee={handleUpdateEmployee}
      onUpdateStatConfig={handleUpdateStatConfig}
      onUpdateTaxSlabs={handleUpdateTaxSlabs}
      onApproveLeave={handleApproveLeave}
      onRejectLeave={handleRejectLeave}
      onApproveRegularization={handleApproveRegularization}
      onRejectRegularization={handleRejectRegularization}
      onCreatePayrollRun={handleCreatePayrollRun}
      onSimulatePunch={handleSimulatePunch}
      onApplyLeave={handleApplyLeave}
      onAddRegularization={handleAddRegularization}
      onAddAttendance={handleAddAttendance}
      branches={branches}
      departments={departments}
      designations={designations}
      onAddBranch={handleAddBranch}
      onAddDepartment={handleAddDepartment}
      onAddDesignation={handleAddDesignation}
      roles={roles}
      users={users}
      currentUserAccount={currentUserAccount}
      onSetCurrentUserAccount={handleSetCurrentUserAccount}
      onAddRole={handleAddRole}
      onAddUser={handleAddUser}
      onUpdateUserRole={handleUpdateUserRole}
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
    />
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ users, onLogin }: { users: UserAccount[], onLogin: (user: UserAccount) => void }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showHelper, setShowHelper] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const match = users.find(
      u => u.username.toLowerCase() === loginId.toLowerCase() ||
           u.email.toLowerCase() === loginId.toLowerCase()
    );

    if (!match) {
      setError('Invalid username or email address.');
      return;
    }
    if (match.status === 'Inactive') {
      setError('This account is suspended. Contact your Super Admin.');
      return;
    }
    if (match.password && password !== match.password) {
      setError('Incorrect password. Please try again.');
      return;
    }

    onLogin(match);
  };

  const autofill = (usr: string, pass: string) => { setLoginId(usr); setPassword(pass); setError(''); };

  return (
    <div className="h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4 font-sans select-none relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-950/80 backdrop-blur-md p-8 rounded-3xl border border-slate-800 shadow-2xl relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-500 mx-auto flex items-center justify-center shadow-lg text-white font-bold text-xl">
            🇵🇰
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white uppercase">Bin Ishaq HR Suite</h2>
            <p className="text-xs text-slate-400">Payroll Compliance &amp; Attendance Management</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-rose-950/30 border border-rose-900/50 p-3.5 rounded-xl text-rose-400 text-xs flex items-center space-x-2">
              <span className="font-bold text-base leading-none">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Username or Email</label>
            <input
              type="text" required value={loginId} onChange={e => setLoginId(e.target.value)}
              placeholder="admin, sara.hr, kiosk..."
              className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white placeholder-slate-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white placeholder-slate-500 font-mono"
            />
          </div>
          <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold py-3.5 rounded-xl shadow-lg transition duration-200 text-sm">
            Sign In to System
          </button>
        </form>

        <div className="border-t border-slate-900 pt-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick Access Panel</span>
            <button type="button" onClick={() => setShowHelper(!showHelper)} className="text-[10px] text-emerald-400 font-bold hover:underline">
              {showHelper ? 'Hide' : 'Show'}
            </button>
          </div>
          {showHelper && (
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-900 text-[10px] space-y-2.5">
              <p className="text-slate-400">Click any profile to autofill credentials:</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Super Admin', usr: 'admin', pass: 'admin123', color: 'white' },
                  { label: 'HR Manager', usr: 'sara.hr', pass: 'sara123', color: 'white' },
                  { label: 'Payroll Spec', usr: 'usman.payroll', pass: 'usman123', color: 'white' },
                  { label: '⏰ Kiosk', usr: 'kiosk', pass: 'kiosk123', color: 'emerald' }
                ].map(({ label, usr, pass, color }) => (
                  <button key={usr} type="button" onClick={() => autofill(usr, pass)}
                    className={`bg-slate-950 hover:bg-slate-800 p-2 rounded-lg text-left border border-slate-850 hover:border-emerald-500 transition text-[10px]`}>
                    <span className={`font-bold block text-${color}-300`}>{label}</span>
                    <span className="text-slate-400 font-mono">{usr} / {pass}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-[10px] text-slate-500 mt-6 font-mono">
        Bin Ishaq HR Suite • FBR Progressive Payroll Compliance Engine
      </div>
    </div>
  );
}
