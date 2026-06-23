/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Monitor, Cpu, Smartphone, Layers, ShieldCheck, Briefcase, Info, Scan } from 'lucide-react';
import './DeviceEmulator.css';
import { WebPortal } from './WebPortal';
import { WindowsApp } from './WindowsApp';
import { MobileApp } from './MobileApp';
import { KioskTerminal } from './KioskTerminal';
import {
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Designation, Branch, Department,
  Role, UserAccount, Holiday, LoanAdvance, SalaryRevision,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification
} from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface DeviceEmulatorProps {
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
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string) => void;
  onApplyLeave: (leave: LeaveRequest) => void;
  onAddRegularization: (employeeId: string, date: string, reason: string) => void;
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
  loggedInUser: UserAccount;
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

export function DeviceEmulator({
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
  onSimulatePunch,
  onApplyLeave,
  onAddRegularization,
  onAddAttendance,
  branches,
  departments,
  designations,
  roles,
  users,
  currentUserAccount,
  onSetCurrentUserAccount,
  onAddRole,
  onAddUser,
  onUpdateUserRole,
  loggedInUser,
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
}: DeviceEmulatorProps) {
  const isKioskUser = loggedInUser?.username === 'kiosk' || loggedInUser?.roleId === 'role-kiosk';

  const [deviceMode, setDeviceMode] = useState<'web' | 'windows' | 'mobile' | 'kiosk'>(() => {
    return isKioskUser ? 'kiosk' : 'web';
  });
  const [showComplianceOverview, setShowComplianceOverview] = useState(false);

  if (isKioskUser) {
    return (
      <div className="h-screen overflow-hidden bg-slate-900 text-slate-100 flex flex-col font-sans select-none" id="kiosk-locked-container">
        {/* Sleek top status bar for Kiosk */}
        <div className="bg-slate-950 px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-350">
              Bin Ishaq Attendance Terminal Locked Mode
            </span>
          </div>
          <button 
            onClick={onLogout}
            className="text-xs bg-rose-650 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition"
          >
            <span>Exit Kiosk Terminal</span>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-2 h-full overflow-hidden">
          <KioskTerminal 
            employees={employees}
            attendances={attendances}
            onSimulatePunch={onSimulatePunch}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-900 text-slate-100 flex flex-col font-sans" id="emulator-container">
      
      {/* 1. Global Emulator Device Selector Bar (Only visible to Super Admin for simulation) */}
      {loggedInUser?.roleId === 'role-admin' ? (
        <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0" id="emulator-selector-bar">
          
          <div className="flex items-center space-x-3.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-500 flex items-center justify-center shadow-lg text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-xs md:text-sm text-white tracking-wider uppercase flex flex-wrap items-center gap-2">
                <span>Bin Ishaq HR &amp; Payroll Management System</span>
                <span className="font-mono text-[9px] px-1.5 py-0.5 bg-emerald-950 text-emerald-400 rounded-full border border-emerald-900 leading-none">v1.2</span>
              </h1>
              <p className="text-xs text-slate-400 font-sans mt-0.5">FBR High-Compliance Multi-Tenant Engine</p>
            </div>
          </div>

          {/* Quadruple Switch Controller */}
          <div className="bg-slate-900 p-1 rounded-2xl flex border border-slate-850 shadow-inner" id="emulator-buttons">
            <button 
              onClick={() => setDeviceMode('web')}
              className={`px-3 py-2 rounded-xl text-xs font-bold leading-none flex items-center space-x-1.5 transition ${deviceMode === 'web' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>🖥️ Web Admin</span>
            </button>

            <button 
              onClick={() => setDeviceMode('windows')}
              className={`px-3 py-2 rounded-xl text-xs font-bold leading-none flex items-center space-x-1.5 transition ${deviceMode === 'windows' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>💻 Windows Client</span>
            </button>

            <button 
              onClick={() => setDeviceMode('mobile')}
              className={`px-3 py-2 rounded-xl text-xs font-bold leading-none flex items-center space-x-1.5 transition ${deviceMode === 'mobile' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>📱 Mobile ESS</span>
            </button>

            <button 
              onClick={() => setDeviceMode('kiosk')}
              className={`px-3 py-2 rounded-xl text-xs font-bold leading-none flex items-center space-x-1.5 transition ${deviceMode === 'kiosk' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              <Scan className="w-3.5 h-3.5" />
              <span>⏰ Kiosk Terminal</span>
            </button>
          </div>

          {/* Quick diagnostic view */}
          <div className="hidden lg:flex items-center space-x-4 font-mono text-xs">
            <div className="text-right">
              <span className="text-slate-400">Total Staff:</span> <span className="text-white font-bold">{employees.length}</span>
            </div>
            <div className="h-4 border-r border-slate-800"></div>
            <div className="text-right">
              <span className="text-slate-400">Active Logs:</span> <span className="text-emerald-400 font-bold">{attendances.length} Synced</span>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between" id="locked-client-header">
          <div className="flex items-center space-x-3.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-500 flex items-center justify-center shadow-lg text-white">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-xs md:text-sm text-white tracking-wider uppercase flex flex-wrap items-center gap-2">
                <span>Bin Ishaq HR Suite</span>
              </h1>
              <p className="text-xs text-slate-450 font-sans mt-0.5">
                Logged in: <span className="text-emerald-400 font-bold">{loggedInUser?.username}</span> ({roles.find(r => r.id === loggedInUser?.roleId)?.name})
              </p>
            </div>
          </div>
          {deviceMode !== 'web' && (
            <button 
              onClick={onLogout}
              className="text-xs bg-slate-900 border border-slate-800 hover:bg-rose-700 text-slate-350 hover:text-white font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
            >
              Log Out
            </button>
          )}
        </div>
      )}

      {/* 2. Interactive Main Workspace Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" id="emulator-main">
        
        {/* Main Content Area */}
        <div className="flex-1 p-2 flex items-center justify-center overflow-auto" id="emulator-canvas">
          <div className="w-full h-full max-w-7xl">
            <AnimatePresence mode="wait">
              {deviceMode === 'web' && (
                <motion.div 
                  key="web-view"
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  className="w-full h-full rounded-3xl overflow-hidden shadow-2xl border border-slate-800"
                >
                  <WebPortal 
                    employees={employees}
                    attendances={attendances}
                    leaves={leaves}
                    statConfig={statConfig}
                    taxSlabs={taxSlabs}
                    payrollRuns={payrollRuns}
                    onAddEmployee={onAddEmployee}
                    onUpdateEmployee={onUpdateEmployee}
                    onUpdateStatConfig={onUpdateStatConfig}
                    onUpdateTaxSlabs={onUpdateTaxSlabs}
                    onApproveLeave={onApproveLeave}
                    onRejectLeave={onRejectLeave}
                    onApproveRegularization={onApproveRegularization}
                    onRejectRegularization={onRejectRegularization}
                    onCreatePayrollRun={onCreatePayrollRun}
                    onApplyLeave={onApplyLeave}
                    onAddAttendance={onAddAttendance}
                    branches={branches}
                    departments={departments}
                    designations={designations}
                    roles={roles}
                    users={users}
                    currentUserAccount={currentUserAccount}
                    onSetCurrentUserAccount={onSetCurrentUserAccount}
                    onAddRole={onAddRole}
                    onAddUser={onAddUser}
                    onUpdateUserRole={onUpdateUserRole}
                    onLogout={onLogout}
                    onAddBranch={onAddBranch}
                    onAddDepartment={onAddDepartment}
                    onAddDesignation={onAddDesignation}
                    holidays={holidays}
                    onAddHoliday={onAddHoliday}
                    onUpdateHoliday={onUpdateHoliday}
                    onDeleteHoliday={onDeleteHoliday}
                    loanAdvances={loanAdvances}
                    onApplyLoan={onApplyLoan}
                    onApproveLoan={onApproveLoan}
                    onRejectLoan={onRejectLoan}
                    salaryRevisions={salaryRevisions}
                    onAddSalaryRevision={onAddSalaryRevision}
                    loggedInUser={loggedInUser}
                    performanceReviews={performanceReviews}
                    onAddPerformanceReview={onAddPerformanceReview}
                    onUpdatePerformanceReview={onUpdatePerformanceReview}
                    companyAssets={companyAssets}
                    onAddAsset={onAddAsset}
                    onUpdateAsset={onUpdateAsset}
                    jobPostings={jobPostings}
                    onAddJobPosting={onAddJobPosting}
                    onUpdateJobPosting={onUpdateJobPosting}
                    jobApplications={jobApplications}
                    onAddJobApplication={onAddJobApplication}
                    onUpdateJobApplication={onUpdateJobApplication}
                    gratuitySettlements={gratuitySettlements}
                    onAddGratuitySettlement={onAddGratuitySettlement}
                    onUpdateGratuitySettlement={onUpdateGratuitySettlement}
                    notifications={notifications}
                    onAddNotification={onAddNotification}
                    onMarkNotificationRead={onMarkNotificationRead}
                    onMarkAllNotificationsRead={onMarkAllNotificationsRead}
                    onDeleteNotification={onDeleteNotification}
                  />
                </motion.div>
              )}

              {deviceMode === 'windows' && (
                <motion.div 
                  key="win-view"
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  className="w-full h-full rounded-2xl overflow-hidden shadow-2xl"
                >
                  <WindowsApp 
                    employees={employees}
                    attendances={attendances}
                    leaves={leaves}
                    statConfig={statConfig}
                    onSimulatePunch={onSimulatePunch}
                    onApproveLeave={onApproveLeave}
                  />
                </motion.div>
              )}

              {deviceMode === 'mobile' && (
                <motion.div 
                  key="mob-view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="w-full h-full flex items-center justify-center p-2 overflow-hidden"
                >
                  <MobileApp
                    employees={employees}
                    attendances={attendances}
                    leaves={leaves}
                    onApplyLeave={onApplyLeave}
                    onSimulatePunch={onSimulatePunch}
                    onAddRegularization={onAddRegularization}
                    loggedInUser={loggedInUser}
                    onLogout={onLogout}
                  />
                </motion.div>
              )}

              {deviceMode === 'kiosk' && (
                <motion.div 
                  key="kiosk-view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="w-full h-full flex items-center justify-center p-2 overflow-hidden"
                >
                  <KioskTerminal 
                    employees={employees}
                    attendances={attendances}
                    onSimulatePunch={onSimulatePunch}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Floating toggle button for the compliance overview rail */}
        {!showComplianceOverview && (
          <button 
            onClick={() => setShowComplianceOverview(true)}
            className="fixed right-0 top-1/2 transform -translate-y-1/2 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-4 rounded-l-xl shadow-xl flex flex-col items-center justify-center space-y-2 cursor-pointer z-40 transition border border-emerald-500 border-r-0"
            id="compliance-toggle-btn"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[9px] font-bold tracking-widest uppercase vertical-text">
              Compliance
            </span>
          </button>
        )}

        {/* Absolute High-Compliance Explanatory Guide Rail */}
        {showComplianceOverview && (
          <aside className="w-full lg:w-80 bg-slate-950 border-t lg:border-t-0 lg:border-l border-slate-800 p-5 overflow-y-auto space-y-5 flex-shrink-0" id="emulator-guide">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-xs uppercase tracking-widest text-emerald-400 flex items-center">
                <Briefcase className="w-4 h-4 mr-1.5" />
                Pakistan Payroll Compliance
              </h3>
              <button 
                onClick={() => setShowComplianceOverview(false)}
                className="text-slate-500 hover:text-white text-xs font-mono"
              >
                Hide
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-slate-350 select-none">
              <div className="space-y-1">
                <h4 className="font-bold text-white text-xs">⭐ 100% Shared State Coordination</h4>
                <p>
                  Any action on the <strong>Mobile ESS App</strong> (such as marking geofenced attendance or applying sick leave) immediately propagates to Firestore and refreshes the live dashboards on the <strong>Web Admin Portal</strong> and the <strong>Windows Client terminal</strong>!
                </p>
              </div>

              <div className="space-y-1 block border-t border-slate-850 pt-3">
                <span className="font-bold text-white block">🇵🇰 FBR Tax Tables & Slabs</span>
                <p>
                  Calculates annual taxable projection based on current active monthly gross salary and references the 6-stage FBR progressive salaried individual individual tax slabs.
                </p>
              </div>

              <div className="space-y-1 border-t border-slate-850 pt-3">
                <span className="font-bold text-emerald-400 block">🏢 EOBI Social Security Setup</span>
                <p>
                  Multi-tenant compliant tracking. Automatically deducts 1% employee quota and matches 5% employer contribution based directly on the latest FBR standard base minimum wage limit.
                </p>
              </div>

              <div className="space-y-1 border-t border-slate-850 pt-3">
                <span className="font-bold text-white block">🏦 Bank Bulk advice dispatches</span>
                <p>
                  Calculates accurate Net Takehome salaries adjusted for unpaid absences and maps employee IBAN records to generate formatted csv bankAdvice sheets matching HBL and Alfalah enterprise layouts.
                </p>
              </div>

              <div className="bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-900/30 text-[11px] text-emerald-300 space-y-1 flex items-start space-x-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                <p>
                  <strong>Tip:</strong> Toggle to <strong>Windows Client</strong>, select an employee and trigger a 'Fingerprint swipe' scan. Then toggle back to <strong>Web Admin</strong> or check payroll registers to view immediate updates!
                </p>
              </div>
            </div>
          </aside>
        )}

      </div>

    </div>
  );
}
