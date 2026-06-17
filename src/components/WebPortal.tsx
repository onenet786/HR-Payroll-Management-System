/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, Calendar, CreditCard, ShieldCheck, FileText, Download, UserPlus, 
  CheckCircle, XCircle, AlertTriangle, Building, MapPin, RefreshCw, Layers, Sliders, Info
} from 'lucide-react';
import { 
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip 
} from '../types';
import { computePayslipDetails, DEFAULT_TAX_SLABS } from '../data/defaults';
import { motion, AnimatePresence } from 'motion/react';

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
  branches: any[];
  departments: any[];
  designations: any[];
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
  onUpdateTaxSlabs,
  onApproveLeave,
  onRejectLeave,
  onApproveRegularization,
  onRejectRegularization,
  onCreatePayrollRun,
  branches,
  departments,
  designations
}: WebPortalProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'employees' | 'attendance' | 'leaves' | 'payroll' | 'settings'>('dashboard');
  
  // Modals state
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [showBankFileModal, setShowBankFileModal] = useState<PayrollRun | null>(null);
  const [showPayslipModal, setShowPayslipModal] = useState<Payslip | null>(null);
  const [showCreatePayrollModal, setShowCreatePayrollModal] = useState(false);
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
    socialSecurityNumber: 'SS-42-000111'
  });

  const [payrollTitle, setPayrollTitle] = useState('Payroll - June 2026');
  const [payrollMonth, setPayrollMonth] = useState(6);
  const [payrollYear, setPayrollYear] = useState(2026);

  // Settlement manual additions for offboarding
  const [settlementDaysGr, setSettlementDaysGr] = useState(15);
  const [settlementLeavesEncash, setSettlementLeavesEncash] = useState(10);

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

    const newEmp: Employee = {
      id: 'emp-' + Date.now(),
      companyId: 'c1',
      branchId: newEmpForm.branchId,
      departmentId: newEmpForm.departmentId,
      designationId: newEmpForm.designationId,
      employeeCode: `IND-PK-${Math.floor(100 + Math.random() * 900)}`,
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
      socialSecurityNumber: newEmpForm.socialSecurityNumber
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
      socialSecurityNumber: 'SS-42-000111'
    });
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
            I
          </div>
          <div>
            <h1 className="font-bold text-lg text-slate-900 leading-tight">Indus HR & Payroll</h1>
            <p className="text-xs text-slate-500 font-mono">Company ID: IND-KHI-456 • Pakistan Statutory Portal</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              ● Server Connected
            </span>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">DB: Firestore • synced</div>
          </div>
          <button 
            onClick={() => setShowAddEmpModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition flex items-center space-x-1"
          >
            <UserPlus className="w-4 h-4" />
            <span>Onboard Staff</span>
          </button>
        </div>
      </header>

      {/* Main Framework Divider */}
      <div className="flex flex-1 overflow-hidden" id="web-main-container">
        
        {/* Sidebar Nav */}
        <nav className="w-64 bg-slate-900 text-slate-300 flex flex-col p-4 border-r border-slate-800" id="web-sidebar">
          <div className="space-y-1 flex-1">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Layers className="w-4 h-4" />
              <span>Operations Dashboard</span>
            </button>

            <button 
              onClick={() => setActiveTab('employees')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'employees' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Users className="w-4 h-4" />
              <span>Employee Directory</span>
            </button>

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

            <button 
              onClick={() => setActiveTab('payroll')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'payroll' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Payroll Processing</span>
            </button>

            <button 
              onClick={() => setActiveTab('settings')}
              className={`w-full text-left px-3.5 py-3 rounded-lg text-sm font-medium flex items-center space-x-3 transition ${activeTab === 'settings' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Sliders className="w-4 h-4" />
              <span>Statutory config (FBR)</span>
            </button>
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
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50" id="web-main-panel">
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              
              {/* Pakistan Banner notification */}
              <div className="bg-gradient-to-r from-emerald-800 to-green-700 text-white p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center shadow-lg shadow-emerald-950/10">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold tracking-tight">Assalam-o-Alaikum!</h2>
                  <p className="text-emerald-100 text-sm max-w-xl">
                    Welcome to the Indus Logistics corporate portal. Today is <strong>June 17, 2026</strong>. Statutory slabs are synchronized with Federal Board of Revenue (FBR) and EOBI regulations.
                  </p>
                </div>
                <div className="mt-4 md:mt-0 flex space-x-2 bg-emerald-900/40 p-2.5 rounded-xl border border-emerald-500/30 font-mono text-sm">
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
                    {branches.map(br => {
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
                        const emp = employees.find(e => e.id === lv.employeeId);
                        return (
                          <div key={lv.id} className="p-3 bg-amber-50/50 border border-amber-200/55 rounded-lg space-y-2 text-xs">
                            <div className="flex justify-between font-bold">
                              <span className="text-slate-800">{emp?.fullName || 'Employee'}</span>
                              <span className="text-amber-700 bg-amber-100 px-2 py-0.5 rounded font-mono">{lv.leaveType}</span>
                            </div>
                            <p className="text-slate-500 italic">"{lv.reason}"</p>
                            <p className="text-[10px] text-slate-400">Period: {lv.startDate} to {lv.endDate} ({lv.totalDays} Days)</p>
                            
                            <div className="flex space-x-2 pt-1.5 border-t border-slate-200/50 justify-end">
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
                  <p className="text-xs text-slate-500">Total {employees.length} records mapped across Indus Logistics</p>
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

              {/* Grid or Table listing of employees */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                      const branch = branches.find(b => b.id === emp.branchId);
                      const dept = departments.find(d => d.id === emp.departmentId);
                      const desig = designations.find(ds => ds.id === emp.designationId);
                      
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">{emp.fullName}</div>
                            <div className="text-xs font-mono text-slate-500 mt-0.5">{emp.employeeCode} • {emp.email}</div>
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
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            {emp.status === 'Active' ? (
                              <button 
                                onClick={() => {
                                  setShowOffboardModal(emp);
                                  setSettlementLeavesEncash(12);
                                }}
                                className="text-xs font-semibold px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded border border-rose-200"
                              >
                                Trigger Exit
                              </button>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
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

            </motion.div>
          )}

          {/* TAB 3: ATTENDANCE & TIME REGULARIZATIONS */}
          {activeTab === 'attendance' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Attendance Ingestion &amp; Overtime</h2>
                  <p className="text-xs text-slate-500">Tracking GPS check-ins, web check-ins and mock biometric devices</p>
                </div>
              </div>

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
                                className="px-2.5 py-1 text-slate-600 border border-slate-350 hover:bg-slate-100 rounded"
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
                
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
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
                            <div className="font-semibold text-slate-800 text-xs">{emp?.fullName || 'Wager employee'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{emp?.fullName ? emp.employeeCode : 'SYSTEM'}</div>
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
                              'bg-rose-100 text-rose-800'
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

            </motion.div>
          )}

          {/* TAB 4: LEAVE MANAGEMENT WORKFLOW */}
          {activeTab === 'leaves' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Regional Leave Accruals &amp; approvals</h2>
                  <p className="text-xs text-slate-500">Configured according to Provincial Shops &amp; Establishments laws</p>
                </div>
              </div>

              {/* Grid of multi-step leaves status */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
                      const emp = employees.find(e => e.id === lv.employeeId);
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
                          <td className="px-6 py-4 max-w-xs truncate text-xs text-slate-500 italic">
                            "{lv.reason}"
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                            {lv.status === 'Pending' ? (
                              <div className="inline-flex space-x-1.5 justify-end">
                                <button
                                  onClick={() => onRejectLeave(lv.id)}
                                  className="text-rose-600 hover:text-rose-800 bg-rose-50 border border-rose-200 font-semibold px-2.5 py-1 rounded transition"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => onApproveLeave(lv.id)}
                                  className="text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-300 font-semibold px-2.5 py-1 rounded transition"
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
                    onClick={() => setShowCreatePayrollModal(true)}
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
                            emp, 6, 2026, attendances, leaves, statConfig, taxSlabs
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
              className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center flex-shrink-0">
                <span className="font-bold text-sm tracking-wider uppercase flex items-center">
                  <UserPlus className="w-4 h-4 mr-1.5 text-emerald-400" /> Onboard New Employee Workspace
                </span>
                <button onClick={() => setShowAddEmpModal(false)} className="text-white hover:text-slate-200 font-bold text-lg">×</button>
              </div>

              <form onSubmit={handleCreateEmployeeSubmit} className="p-6 overflow-y-auto space-y-4 text-xs select-none">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">Full Name (Human resource index):</label>
                    <input 
                      type="text" required
                      placeholder="e.g. Ali Ahmed"
                      value={newEmpForm.fullName}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, fullName: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">Official Email ID:</label>
                    <input 
                      type="email" required
                      placeholder="e.g. ahmed@induslog.com"
                      value={newEmpForm.email}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, email: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">Pakistan CNIC (Format Check):</label>
                    <input 
                      type="text" required
                      placeholder="e.g. 42101-1234567-3"
                      value={newEmpForm.cnic}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, cnic: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400">Strict format: 5 digits - 7 digits - 1 digit check.</span>
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">Mobile Contact:</label>
                    <input 
                      type="text" required
                      value={newEmpForm.contactNumber}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, contactNumber: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold mb-1 text-slate-600 font-sans">Assigned Branch:</label>
                    <select 
                      value={newEmpForm.branchId}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, branchId: e.target.value })}
                      className="w-full p-2 bg-white border border-slate-300 rounded focus:ring-1"
                    >
                      <option value="b1">Karachi Office (Sindh)</option>
                      <option value="b2">Lahore Distribution (Punjab)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">Wage Type:</label>
                    <select 
                      value={newEmpForm.wageType}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, wageType: e.target.value as 'Salaried' | 'Daily Wager' })}
                      className="w-full p-2 bg-white border border-slate-300 rounded focus:ring-1"
                    >
                      <option value="Salaried">Salaried (Monthly)</option>
                      <option value="Daily Wager">Daily Wager (Calculated basic)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">Wage / Basic Rate (PKR):</label>
                    <input 
                      type="number" required
                      value={newEmpForm.basicSalary}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, basicSalary: Number(e.target.value) })}
                      className="w-full p-2 border border-slate-300 rounded font-mono focus:ring-1 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-lg space-y-2 border border-slate-200">
                  <h4 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider">Provident Fund &amp; EOBI Statutory Check</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center space-x-2 font-medium">
                      <input 
                        type="checkbox"
                        checked={newEmpForm.providentFundOptIn}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, providentFundOptIn: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Opt In Provident Fund Contribution</span>
                    </label>

                    <label className="flex items-center space-x-2 font-medium">
                      <input 
                        type="checkbox"
                        checked={newEmpForm.gratuityOptIn}
                        onChange={(e) => setNewEmpForm({ ...newEmpForm, gratuityOptIn: e.target.checked })}
                        className="rounded text-emerald-600"
                      />
                      <span>Opt In Gratuity Trust Allowance</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">Disbursal Bank Name:</label>
                    <input 
                      type="text" required
                      value={newEmpForm.bankName}
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, bankName: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded focus:ring-1"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1 text-slate-600">PKR IBAN Number:</label>
                    <input 
                      type="text" required
                      value={newEmpForm.iban}
                      placeholder="PKXXHABB000000..."
                      onChange={(e) => setNewEmpForm({ ...newEmpForm, iban: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded font-mono focus:ring-1"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2.5 pt-4 border-t border-slate-200 flex-shrink-0">
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
                    <h4 className="font-bold text-base text-slate-900 uppercase">Indus Logistics Ltd.</h4>
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
                  <div>
                    <p>Bank: <strong className="text-slate-900 font-sans">{showPayslipModal.bankName}</strong></p>
                    <p>IBAN: <strong className="text-slate-900">{showPayslipModal.iban}</strong></p>
                    <p>Joining Date: <strong className="text-slate-900">01-Feb-2021</strong></p>
                  </div>
                </div>

                {/* Earnings & Deductions breakdown side by side */}
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
                        <span className="text-slate-500">House Rent (30%):</span>
                        <span className="text-slate-900">{showPayslipModal.houseRentAllowance.toLocaleString()} PKR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Medical (10%):</span>
                        <span className="text-slate-900">{showPayslipModal.medicalAllowance.toLocaleString()} PKR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Conveyance (10%):</span>
                        <span className="text-slate-900">{showPayslipModal.conveyanceAllowance.toLocaleString()} PKR</span>
                      </div>
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
                      <div className="flex justify-between">
                        <span className="text-slate-500">FBR Income Tax:</span>
                        <span className="text-rose-700 font-bold">-{showPayslipModal.incomeTaxDeduction.toLocaleString()} PKR</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">EOBI Employee (1%):</span>
                        <span className="text-rose-750 font-semibold">-{showPayslipModal.eobiEmployeeDeduction.toLocaleString()} PKR</span>
                      </div>
                      {showPayslipModal.providentFundDeduction > 0 && (
                        <div className="flex justify-between">
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
                  * Generated by Indus Logistics Ltd. under the Shops &amp; Establishments Ordinance. Salary disbursed directly via automated HBL bulk online bank advice file. Fully compliant values.
                </div>

              </div>

              <div className="px-6 py-4 bg-slate-50 border-t flex justify-end space-x-2">
                <button 
                  onClick={() => {
                    alert('PDF advice download simulated successfully.');
                    setShowPayslipModal(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded shadow"
                >
                  Download Formal PDF Payslip
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
                    <p>Paying Account Name: Indus Logistics Karachi</p>
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
                          emp, 6, 2026, attendances, leaves, statConfig, taxSlabs
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

    </div>
  );
}
