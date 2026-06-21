/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  DEFAULT_EMPLOYEES, DEFAULT_ATTENDANCES, DEFAULT_LEAVE_REQUESTS, 
  DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_COMPANIES, 
  DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS,
  computePayslipDetails, DEFAULT_ROLES, DEFAULT_USERS
} from './data/defaults';
import { 
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip,
  Role, UserAccount, Branch, Department, Designation
} from './types';
import { DeviceEmulator } from './components/DeviceEmulator';
import { MobileApp } from './components/MobileApp';
import { db, isFirebaseConfigured } from './firebase';
import { 
  collection, getDocs, doc, setDoc, addDoc, updateDoc, query, onSnapshot
} from 'firebase/firestore';

export default function App() {
  // Helper to remove undefined fields before writing to Firestore
  const cleanData = <T,>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
  };

  // Helper to load initial state from localStorage or fallback to default
  const getInitialValue = <T,>(key: string, fallback: T): T => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn(`Error loading state from localStorage for key ${key}:`, e);
    }
    return fallback;
  };

  // Application Data States
  const [employees, setEmployees] = useState<Employee[]>(() => getInitialValue('hr_employees', DEFAULT_EMPLOYEES));
  const [attendances, setAttendances] = useState<AttendanceLog[]>(() => getInitialValue('hr_attendances', DEFAULT_ATTENDANCES));
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() => getInitialValue('hr_leaves', DEFAULT_LEAVE_REQUESTS));
  const [statConfig, setStatConfig] = useState<StatutoryConfig>(() => getInitialValue('hr_stat_config', DEFAULT_STATUTORY_CONFIG));
  const [taxSlabs, setTaxSlabs] = useState<TaxSlab[]>(() => getInitialValue('hr_tax_slabs', DEFAULT_TAX_SLABS));
  const [branches, setBranches] = useState<Branch[]>(() => getInitialValue('hr_branches', DEFAULT_BRANCHES));
  const [departments, setDepartments] = useState<Department[]>(() => getInitialValue('hr_departments', DEFAULT_DEPARTMENTS));
  const [designations, setDesignations] = useState<Designation[]>(() => getInitialValue('hr_designations', DEFAULT_DESIGNATIONS));

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
  
  // Historical Payroll Runs initialized with pre-made seed data
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

  // Firestore Real-time Sync Effect
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    
    const unsubscribes: (() => void)[] = [];

    // Helper to register snapshot listener for collections that are arrays
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

          // Merge with default seed data to ensure new seeds are preserved
          const merged = [...fetched];
          let updated = false;

          for (const defItem of defaultItems) {
            if (!merged.some(item => item.id === defItem.id)) {
              merged.push(defItem);
              updated = true;
              try {
                await setDoc(doc(db, collectionName, defItem.id), defItem);
              } catch (e) {
                console.warn(`Sync seed item error in ${collectionName}:`, e);
              }
            }
          }

          stateSetter(merged);
          localStorage.setItem(storageKey, JSON.stringify(merged));
        }, (err) => {
          console.warn(`Firestore collection subscription failed for ${collectionName}:`, err);
        });
        unsubscribes.push(unsub);
      } catch (err) {
        console.warn(`Firestore initial query subscription deferred for ${collectionName}:`, err);
      }
    };

    // 1. Employees Sync
    registerCollectionListener('employees', DEFAULT_EMPLOYEES, setEmployees, 'hr_employees');

    // 2. Attendances Sync
    registerCollectionListener('attendances', DEFAULT_ATTENDANCES, setAttendances, 'hr_attendances');

    // 3. Leaves Sync
    registerCollectionListener('leaves', DEFAULT_LEAVE_REQUESTS, setLeaves, 'hr_leaves');

    // 4. Branches Sync
    registerCollectionListener('branches', DEFAULT_BRANCHES, setBranches, 'hr_branches');

    // 5. Departments Sync
    registerCollectionListener('departments', DEFAULT_DEPARTMENTS, setDepartments, 'hr_departments');

    // 6. Designations Sync
    registerCollectionListener('designations', DEFAULT_DESIGNATIONS, setDesignations, 'hr_designations');

    // 7. Tax Slabs Sync
    registerCollectionListener('taxSlabs', DEFAULT_TAX_SLABS, setTaxSlabs, 'hr_tax_slabs');

    // 8. Roles Sync
    registerCollectionListener('roles', DEFAULT_ROLES, setRoles, 'hr_roles');

    // 9. Users Sync (special user tracking for currentUserAccount updates)
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
              console.warn('Sync seed user error:', e);
            }
          }
        }

        setUsers(merged);
        localStorage.setItem('hr_users', JSON.stringify(merged));

        // Sync active user account profile if in remote updates
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
        console.warn('Firestore subscription failed for users:', err);
      });
      unsubscribes.push(unsubUsers);
    } catch (err) {
      console.warn('Firestore user query subscription deferred:', err);
    }

    // 10. Payroll Runs Sync
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

    // 11. Statutory Config Sync (single document config)
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
          // If Firestore is empty, seed it
          const current = getInitialValue('hr_stat_config', DEFAULT_STATUTORY_CONFIG);
          try {
            await setDoc(doc(db, 'statConfig', current.id), current);
          } catch (e) {
            console.warn('Sync seed statutory config error:', e);
          }
        }
      }, (err) => {
        console.warn('Firestore subscription failed for statConfig:', err);
      });
      unsubscribes.push(unsubConfig);
    } catch (err) {
      console.warn('Firestore statConfig query subscription deferred:', err);
    }

    // Return cleanup to unsubscribe on unmount
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, []);

  // Operation Handlers (Synchronized to local state + Firebase)

  const handleAddEmployee = async (newEmp: Employee) => {
    setEmployees(prev => {
      const updated = [...prev, newEmp];
      localStorage.setItem('hr_employees', JSON.stringify(updated));
      return updated;
    });
    
    try {
      await setDoc(doc(db, 'employees', newEmp.id), cleanData(newEmp));
    } catch (err) {
      console.warn('Firebase sync delayed: ', err);
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
      console.warn('Firebase update delayed: ', err);
    }
  };

  const handleUpdateStatConfig = async (newConfig: StatutoryConfig) => {
    setStatConfig(newConfig);
    localStorage.setItem('hr_stat_config', JSON.stringify(newConfig));
    
    try {
      await setDoc(doc(db, 'statConfig', newConfig.id), newConfig);
    } catch (err) {
      console.warn('Firebase config update delayed: ', err);
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
      console.warn('Firebase tax slabs update delayed: ', err);
    }
  };

  // Leaves Workflow
  const handleApproveLeave = async (id: string) => {
    let updatedLeaves: LeaveRequest[] = [];
    setLeaves(prev => {
      updatedLeaves = prev.map(l => l.id === id ? { ...l, status: 'Approved' } : l);
      localStorage.setItem('hr_leaves', JSON.stringify(updatedLeaves));
      return updatedLeaves;
    });
    
    // Inject automatically into attendance log to update registers
    const targetLeave = leaves.find(l => l.id === id);
    if (targetLeave) {
      const start = new Date(targetLeave.startDate);
      const end = new Date(targetLeave.endDate);
      let d = new Date(start);
      const autoLogs: AttendanceLog[] = [];
      
      while (d <= end) {
        const dateStr = d.toISOString().split('T')[0];
        const newLog: AttendanceLog = {
          id: `att-auto-leave-${targetLeave.id}-${dateStr}`,
          employeeId: targetLeave.employeeId,
          date: dateStr,
          method: 'Manual',
          status: 'On Leave',
          overtimeMinutes: 0
        };
        autoLogs.push(newLog);
        d.setDate(d.getDate() + 1);
      }
      
      setAttendances(prev => {
        const updated = [...prev, ...autoLogs];
        localStorage.setItem('hr_attendances', JSON.stringify(updated));
        
        // Sync auto-logs to firestore as well
        for (const log of autoLogs) {
          setDoc(doc(db, 'attendances', log.id), log).catch(err => 
            console.warn('Firebase sync delayed for auto-attendance: ', err)
          );
        }
        return updated;
      });
    }

    try {
      const leaveRef = doc(db, 'leaves', id);
      await updateDoc(leaveRef, { status: 'Approved' });
    } catch (err) {
      console.warn('Firebase leave update delayed: ', err);
    }
  };

  const handleRejectLeave = async (id: string) => {
    setLeaves(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, status: 'Rejected' } : l);
      localStorage.setItem('hr_leaves', JSON.stringify(updated));
      return updated;
    });
    
    try {
      const leaveRef = doc(db, 'leaves', id);
      await updateDoc(leaveRef, { status: 'Rejected' });
    } catch (err) {
      console.warn('Firebase leave rejection delayed: ', err);
    }
  };

  // Regularization Workflow
  const handleApproveRegularization = async (id: string) => {
    setAttendances(prev => {
      const updated = prev.map(att => 
        att.id === id ? { ...att, status: 'Present', regularizationApproved: true } : att
      );
      localStorage.setItem('hr_attendances', JSON.stringify(updated));
      return updated;
    });

    try {
      const attRef = doc(db, 'attendances', id);
      await updateDoc(attRef, { status: 'Present', regularizationApproved: true });
    } catch (err) {
      console.warn('Firebase regularization approval delayed: ', err);
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
      const attRef = doc(db, 'attendances', id);
      await updateDoc(attRef, { regularizationApproved: false });
    } catch (err) {
      console.warn('Firebase regularization rejection delayed: ', err);
    }
  };

  // Simulated punch in/out
  const handleSimulatePunch = async (employeeId: string, punchIn: string, punchOut: string, method: string) => {
    const todayStr = '2026-06-17';
    
    // Check if the log for today exists, if so modify it (simulating checkout)
    const existingIdx = attendances.findIndex(a => a.employeeId === employeeId && a.date === todayStr);
    
    if (existingIdx !== -1) {
      let updatedLog: AttendanceLog | null = null;
      setAttendances(prev => {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          punchOut,
          overtimeMinutes: 45 // mock standard OT calculated
        };
        updatedLog = updated[existingIdx];
        localStorage.setItem('hr_attendances', JSON.stringify(updated));
        return updated;
      });
      
      if (updatedLog) {
        try {
          await setDoc(doc(db, 'attendances', (updatedLog as AttendanceLog).id), updatedLog);
        } catch (err) {
          console.warn('Firebase checkout delayed:', err);
        }
      }
    } else {
      const newLog: AttendanceLog = {
        id: `att-${employeeId}-${Date.now()}`,
        employeeId,
        date: todayStr,
        punchIn,
        method: method as any,
        status: 'Present',
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
        console.warn('Firebase clock-in delayed:', err);
      }
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

  const handleAddRegularization = async (employeeId: string, date: string, reason: string) => {
    const newRegLog: AttendanceLog = {
      id: `att-reg-${employeeId}-${Date.now()}`,
      employeeId,
      date,
      method: 'Manual',
      status: 'Absent', // remains absent until approved
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
      console.warn('Firebase regularization file delayed:', err);
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
      console.warn('Firebase sync delayed: ', err);
    }
  };

  // Create new active payroll run
  const handleCreatePayrollRun = async (title: string, month: number, year: number) => {
    // Generate individual sheets
    const sheets = employees.map(emp => 
      computePayslipDetails(emp, month, year, attendances, leaves, statConfig, taxSlabs)
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
      endDate: `${year}-${String(month).padStart(2, '0')}-30`, // approximate
      status: 'Approved',
      createdAt: '2026-06-17',
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
    
    try {
      await setDoc(doc(db, 'payrollRuns', newRun.id), cleanData(newRun));
    } catch (err) {
      console.warn('Firebase payroll run sync delayed:', err);
    }

    alert(`Success: Payroll processed for ${employees.length} employees!\nTotal gross pay: PKR ${totalGrossPay.toLocaleString()}\nNet take-home dispatches: PKR ${totalNetPay.toLocaleString()}\nEOBI Employer matched reserve: PKR ${totalEobiEmployer.toLocaleString()}`);
  };

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
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, { roleId });
      } catch (err) {
        console.warn('Firebase user role update delayed:', err);
      }
    }
  };

  const handleSetCurrentUserAccount = (user: UserAccount) => {
    setCurrentUserAccount(user);
    localStorage.setItem('hr_current_user', JSON.stringify(user));
  };

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

  // Check if we are running in Capacitor/Mobile mode
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
    />
  );
}

// PREMIUM LOGIN SCREEN COMPONENT
function LoginScreen({ users, onLogin }: { users: UserAccount[], onLogin: (user: UserAccount) => void }) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showHelper, setShowHelper] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const match = users.find(
      u => (u.username.toLowerCase() === loginId.toLowerCase() || u.email.toLowerCase() === loginId.toLowerCase())
    );

    if (!match) {
      setError('Invalid username or email address.');
      return;
    }

    if (match.status === 'Inactive') {
      setError('This account is suspended/inactive. Please contact your Super Admin.');
      return;
    }

    const expectedPassword = match.password || (
      match.username === 'admin' ? 'admin123' :
      match.username === 'sara.hr' ? 'sara123' :
      match.username === 'usman.payroll' ? 'usman123' :
      match.username === 'ali.raza' ? 'ali123' :
      match.username === 'kiosk' ? 'kiosk123' : '123456'
    );

    if (password !== expectedPassword) {
      setError('Incorrect password. Please try again.');
      return;
    }

    onLogin(match);
  };

  const autofill = (usr: string, pass: string) => {
    setLoginId(usr);
    setPassword(pass);
    setError('');
  };

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
            <p className="text-xs text-slate-400">Payroll Compliance &amp; Attendance Kiosk</p>
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
              type="text" 
              required
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="admin, sara.hr, kiosk..."
              className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white placeholder-slate-500"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full text-sm p-3 bg-slate-900 border border-slate-800 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white placeholder-slate-500 font-mono"
            />
          </div>

          <button 
            type="submit" 
            className="w-full bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-bold py-3.5 rounded-xl shadow-lg transition duration-200 text-sm"
          >
            Sign In to System
          </button>
        </form>

        <div className="border-t border-slate-900 pt-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Credential Help Panel</span>
            <button 
              type="button" 
              onClick={() => setShowHelper(!showHelper)}
              className="text-[10px] text-emerald-400 font-bold hover:underline"
            >
              {showHelper ? 'Hide Panel' : 'Show Panel'}
            </button>
          </div>

          {showHelper && (
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-900 text-[10px] space-y-2.5">
              <p className="text-slate-400">Click any profile below to autofill credentials:</p>
              <div className="grid grid-cols-2 gap-2">
                <button 
                  type="button"
                  onClick={() => autofill('admin', 'admin123')}
                  className="bg-slate-950 hover:bg-slate-800 p-2 rounded-lg text-left border border-slate-850 hover:border-emerald-500 transition text-[10px]"
                >
                  <span className="font-bold block text-white">Super Admin</span>
                  <span className="text-slate-400 font-mono">admin / admin123</span>
                </button>
                <button 
                  type="button"
                  onClick={() => autofill('sara.hr', 'sara123')}
                  className="bg-slate-950 hover:bg-slate-800 p-2 rounded-lg text-left border border-slate-850 hover:border-emerald-500 transition text-[10px]"
                >
                  <span className="font-bold block text-white">HR Manager</span>
                  <span className="text-slate-400 font-mono">sara.hr / sara123</span>
                </button>
                <button 
                  type="button"
                  onClick={() => autofill('usman.payroll', 'usman123')}
                  className="bg-slate-950 hover:bg-slate-800 p-2 rounded-lg text-left border border-slate-850 hover:border-emerald-500 transition text-[10px]"
                >
                  <span className="font-bold block text-white">Payroll Spec</span>
                  <span className="text-slate-400 font-mono">usman.payroll / usman123</span>
                </button>
                <button 
                  type="button"
                  onClick={() => autofill('kiosk', 'kiosk123')}
                  className="bg-emerald-950/20 hover:bg-emerald-900/30 p-2 rounded-lg text-left border border-emerald-900/30 hover:border-emerald-500 transition text-[10px]"
                >
                  <span className="font-bold block text-emerald-300">⏰ Attendance Kiosk</span>
                  <span className="text-emerald-400/80 font-mono">kiosk / kiosk123</span>
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
      
      <div className="text-center text-[10px] text-slate-500 mt-6 font-mono">
        Bin Ishaq HR Suite • Secured FBR Progressive Payroll Compliance Engine
      </div>
    </div>
  );
}
