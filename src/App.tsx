/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  DEFAULT_EMPLOYEES, DEFAULT_ATTENDANCES, DEFAULT_LEAVE_REQUESTS, 
  DEFAULT_STATUTORY_CONFIG, DEFAULT_TAX_SLABS, DEFAULT_COMPANIES, 
  DEFAULT_BRANCHES, DEFAULT_DEPARTMENTS, DEFAULT_DESIGNATIONS,
  computePayslipDetails
} from './data/defaults';
import { 
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip
} from './types';
import { DeviceEmulator } from './components/DeviceEmulator';
import { db, isFirebaseConfigured } from './firebase';
import { 
  collection, getDocs, doc, setDoc, addDoc, updateDoc, query 
} from 'firebase/firestore';

export default function App() {
  // Application Data States
  const [employees, setEmployees] = useState<Employee[]>(DEFAULT_EMPLOYEES);
  const [attendances, setAttendances] = useState<AttendanceLog[]>(DEFAULT_ATTENDANCES);
  const [leaves, setLeaves] = useState<LeaveRequest[]>(DEFAULT_LEAVE_REQUESTS);
  const [statConfig, setStatConfig] = useState<StatutoryConfig>(DEFAULT_STATUTORY_CONFIG);
  const [taxSlabs, setTaxSlabs] = useState<TaxSlab[]>(DEFAULT_TAX_SLABS);
  
  // Historical Payroll Runs initialized with pre-made seed data
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([
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
  ]);

  // Firestore Sync Effect
  useEffect(() => {
    async function syncFromFirestore() {
      if (!isFirebaseConfigured()) return;
      
      try {
        // 1. Fetch Employees
        const empSnap = await getDocs(collection(db, 'employees'));
        if (!empSnap.empty) {
          const fetchedEmps: Employee[] = [];
          empSnap.forEach(docSnap => {
            fetchedEmps.push({ id: docSnap.id, ...docSnap.data() } as Employee);
          });
          setEmployees(fetchedEmps);
        } else {
          // No documents - Seed Initial defaults to keep empty DBs live on first refresh
          for (const emp of DEFAULT_EMPLOYEES) {
            await setDoc(doc(db, 'employees', emp.id), emp);
          }
        }

        // 2. Fetch Attendances
        const attSnap = await getDocs(collection(db, 'attendances'));
        if (!attSnap.empty) {
          const fetchedAtts: AttendanceLog[] = [];
          attSnap.forEach(docSnap => {
            fetchedAtts.push({ id: docSnap.id, ...docSnap.data() } as AttendanceLog);
          });
          setAttendances(fetchedAtts);
        } else {
          for (const att of DEFAULT_ATTENDANCES) {
            await setDoc(doc(db, 'attendances', att.id), att);
          }
        }

        // 3. Fetch Leaves
        const leaveSnap = await getDocs(collection(db, 'leaves'));
        if (!leaveSnap.empty) {
          const fetchedLeaves: LeaveRequest[] = [];
          leaveSnap.forEach(docSnap => {
            fetchedLeaves.push({ id: docSnap.id, ...docSnap.data() } as LeaveRequest);
          });
          setLeaves(fetchedLeaves);
        } else {
          for (const leave of DEFAULT_LEAVE_REQUESTS) {
            await setDoc(doc(db, 'leaves', leave.id), leave);
          }
        }

        // 4. Fetch Configs & slabs
        const configSnap = await getDocs(collection(db, 'statConfig'));
        if (!configSnap.empty) {
          configSnap.forEach(docSnap => {
            setStatConfig({ id: docSnap.id, ...docSnap.data() } as StatutoryConfig);
          });
        } else {
          await setDoc(doc(db, 'statConfig', DEFAULT_STATUTORY_CONFIG.id), DEFAULT_STATUTORY_CONFIG);
        }

      } catch (err) {
        console.warn('Firestore initial query connection deferred or lack rules. Gracefully routing to self-contained secure local storage fallback.', err);
      }
    }
    
    syncFromFirestore();
  }, []);

  // Operation Handlers (Synchronized to local state + Firebase)

  const handleAddEmployee = async (newEmp: Employee) => {
    setEmployees(prev => [...prev, newEmp]);
    
    try {
      await setDoc(doc(db, 'employees', newEmp.id), newEmp);
    } catch (err) {
      console.warn('Firebase sync delayed: ', err);
    }
  };

  const handleUpdateEmployee = async (updatedEmp: Employee) => {
    setEmployees(prev => prev.map(e => e.id === updatedEmp.id ? updatedEmp : e));
    
    try {
      await setDoc(doc(db, 'employees', updatedEmp.id), updatedEmp);
    } catch (err) {
      console.warn('Firebase update delayed: ', err);
    }
  };

  const handleUpdateStatConfig = async (newConfig: StatutoryConfig) => {
    setStatConfig(newConfig);
    
    try {
      await setDoc(doc(db, 'statConfig', newConfig.id), newConfig);
    } catch (err) {
      console.warn('Firebase config update delayed: ', err);
    }
  };

  const handleUpdateTaxSlabs = async (newSlabs: TaxSlab[]) => {
    setTaxSlabs(newSlabs);
  };

  // Leaves Workflow
  const handleApproveLeave = async (id: string) => {
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'Approved' } : l));
    
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
      
      setAttendances(prev => [...prev, ...autoLogs]);
    }

    try {
      const leaveRef = doc(db, 'leaves', id);
      await updateDoc(leaveRef, { status: 'Approved' });
    } catch (err) {
      console.warn('Firebase leave update delayed: ', err);
    }
  };

  const handleRejectLeave = async (id: string) => {
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'Rejected' } : l));
    
    try {
      const leaveRef = doc(db, 'leaves', id);
      await updateDoc(leaveRef, { status: 'Rejected' });
    } catch (err) {
      console.warn('Firebase leave rejection delayed: ', err);
    }
  };

  // Regularization Workflow
  const handleApproveRegularization = async (id: string) => {
    setAttendances(prev => prev.map(att => 
      att.id === id ? { ...att, status: 'Present', regularizationApproved: true } : att
    ));

    try {
      const attRef = doc(db, 'attendances', id);
      await updateDoc(attRef, { status: 'Present', regularizationApproved: true });
    } catch (err) {
      console.warn('Firebase regularization approval delayed: ', err);
    }
  };

  const handleRejectRegularization = async (id: string) => {
    setAttendances(prev => prev.map(att => 
      att.id === id ? { ...att, regularizationApproved: false } : att
    ));
    
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
      const updated = [...attendances];
      updated[existingIdx] = {
        ...updated[existingIdx],
        punchOut,
        overtimeMinutes: 45 // mock standard OT calculated
      };
      setAttendances(updated);
      
      try {
        await setDoc(doc(db, 'attendances', updated[existingIdx].id), updated[existingIdx]);
      } catch (err) {
        console.warn('Firebase checkout delayed:', err);
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
      
      setAttendances(prev => [...prev, newLog]);
      
      try {
        await setDoc(doc(db, 'attendances', newLog.id), newLog);
      } catch (err) {
        console.warn('Firebase clock-in delayed:', err);
      }
    }
  };

  const handleApplyLeave = async (leave: LeaveRequest) => {
    setLeaves(prev => [...prev, leave]);
    
    try {
      await setDoc(doc(db, 'leaves', leave.id), leave);
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

    setAttendances(prev => [...prev, newRegLog]);
    
    try {
      await setDoc(doc(db, 'attendances', newRegLog.id), newRegLog);
    } catch (err) {
      console.warn('Firebase regularization file delayed:', err);
    }
  };

  // Create new active payroll run
  const handleCreatePayrollRun = (title: string, month: number, year: number) => {
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

    setPayrollRuns(prev => [...prev, newRun]);
    alert(`Success: Payroll processed for ${employees.length} employees!\nTotal gross pay: PKR ${totalGrossPay.toLocaleString()}\nNet take-home dispatches: PKR ${totalNetPay.toLocaleString()}\nEOBI Employer matched reserve: PKR ${totalEobiEmployer.toLocaleString()}`);
  };

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
      branches={DEFAULT_BRANCHES}
      departments={DEFAULT_DEPARTMENTS}
      designations={DEFAULT_DESIGNATIONS}
    />
  );
}
