/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Layers, ShieldCheck, Briefcase, Info } from 'lucide-react';
import './DeviceEmulator.css';
import { WebPortal, type WebPortalProps } from './WebPortal';
import { KioskTerminal } from './KioskTerminal';
import { MobileApp } from './MobileApp';
import type { FirestoreSyncStatus } from '../App';
import {
  Employee, AttendanceLog, AttendancePeriod, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Payslip, Designation, Branch, Department,
  Role, UserAccount, NewUserAccount, Holiday, LoanAdvance, SalaryRevision, PayrollAdjustment,
  PerformanceReview, CompanyAsset, JobPosting, JobApplication, GratuitySettlement, AppNotification, Company, CompanySetupPayload, Zone, UcTown, WageType, MobileDutyAuthorization
} from '../types';
import { motion } from 'motion/react';

interface DeviceEmulatorProps {
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
  onCorrectPunchOut?: (id: string, punchOut: string, reason: string) => void;
  onRejectRegularization: (id: string, reviewComment: string) => void;
  onCreatePayrollRun: (title: string, month: number, year: number) => void;
  onLockAttendancePeriod: (month: number, year: number) => void;
  onReopenAttendancePeriod: (month: number, year: number, reason: string) => void;
  onCancelPayrollRun: (runId: string, reason: string) => void;
  portalGovernance: Pick<WebPortalProps, 'statutoryChangeRequests' | 'onReviewStatutoryChange' | 'lifecycleRequests' | 'onCreateLifecycleRequest' | 'onReviewLifecycleRequest' | 'onUpdateOnboarding' | 'onCreateSupplementaryRun' | 'onCreateFinalSettlementRun' | 'onRecordTaxDeposit' | 'onMarkPaymentFailed' | 'onRecordPaymentRetry' | 'onRetroRecalculate' | 'onRecordParallelRun'>;
  onUpdatePayrollStatus: (runId: string, status: 'Approved' | 'Disbursed', disbursementReference?: string) => void;
  onRecordBankAdvice: (runId: string, checksum: string, employeeCount: number, total: number, profile: PayrollRun['bankAdviceProfile'], batch?: { batchReference: string; controlHash: string; verified: boolean }) => void | Promise<void>;
  onSendPayslips: (runId: string) => Promise<{ sent: number; skipped: number; failed: Array<{ employeeId: string; error: string }> }>;
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string, lat?: number, lon?: number, locationAccuracyMeters?: number, locationCapturedAt?: string, locationAddress?: string) => void | Promise<void>;
  onApplyLeave: (leave: LeaveRequest) => void;
  onAddRegularization: (employeeId: string, date: string, reason: string, evidenceDocumentIds?: string[]) => void;
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
  firestoreSyncStatus: FirestoreSyncStatus;
}

export function DeviceEmulator({
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
  onCorrectPunchOut,
  onRejectRegularization,
  onCreatePayrollRun,
  onLockAttendancePeriod,
  onReopenAttendancePeriod,
  onCancelPayrollRun,
  portalGovernance,
  onUpdatePayrollStatus,
  onRecordBankAdvice,
  onSendPayslips,
  onSimulatePunch,
  onApplyLeave,
  onAddRegularization,
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
  onSetCurrentUserAccount,
  onAddRole,
  onUpdateRole,
  onAddUser,
  onDeleteUser,
  onUpdateUserRole,
  onUpdateUser,
  onSaveMobileDutyAuthorization,
  onCancelMobileDutyAuthorization,
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
  onDeleteNotification,
  firestoreSyncStatus
}: DeviceEmulatorProps) {
  const isKioskUser = loggedInUser?.username === 'kiosk' || loggedInUser?.roleId === 'role-kiosk';
  const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.();
  const isNativeMobileEmployee = isNativeApp && loggedInUser?.roleId === 'role-employee';
  const [showComplianceOverview, setShowComplianceOverview] = useState(false);

  useEffect(() => {
    if (!isNativeApp) return;
    void (window as any).Capacitor?.Plugins?.OrientationPlugin?.setMode({ mode: isKioskUser ? 'landscape' : 'portrait' });
    void (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.setKioskFullscreen({ enabled: isKioskUser });
  }, [isKioskUser, isNativeApp]);

  useEffect(() => {
    if (!isNativeApp || !isKioskUser) return;
    const exitOnZero = (event: KeyboardEvent) => {
      if (event.key !== '0' && event.code !== 'Numpad0') return;
      event.preventDefault();
      event.stopPropagation();
      void (window as any).Capacitor?.Plugins?.DeviceSettingsPlugin?.setKioskFullscreen({ enabled: false });
      onLogout();
    };
    document.addEventListener('keydown', exitOnZero, true);
    return () => document.removeEventListener('keydown', exitOnZero, true);
  }, [isKioskUser, isNativeApp, onLogout]);

  /* ── Kiosk locked mode ─────────────────────────────────────────── */
  if (isKioskUser) {
    return (
      <div className="h-screen overflow-hidden bg-slate-900 text-slate-100 flex flex-col font-sans select-none">
        {!isNativeApp && <div className="bg-slate-950 flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
              {(companies[0]?.legalName?.trim() || companies[0]?.name?.trim() || 'OneNet Solutions Pk.')} Attendance Terminal — Locked Mode
            </span>
          </div>
          <button
            onClick={onLogout}
            className="text-xs bg-rose-700 hover:bg-rose-600 text-white font-bold px-3 py-1.5 rounded-lg transition"
          >
            Exit Kiosk Terminal
          </button>
        </div>}
        <div className={`flex-1 flex items-center justify-center overflow-hidden ${isNativeApp ? 'p-0' : 'p-2'}`}>
          <KioskTerminal
            employees={employees}
            attendances={attendances}
            onSimulatePunch={onSimulatePunch}
            nativeMobileKiosk={isNativeApp}
            branches={branches}
            onExitKiosk={onLogout}
          />
        </div>
      </div>
    );
  }

  if (isNativeMobileEmployee) {
    return (
      <MobileApp
        notifications={notifications}
        onMarkNotificationRead={onMarkNotificationRead}
        leaveConfig={statConfig}
        employees={employees}
        attendances={attendances}
        mobileDutyAuthorizations={mobileDutyAuthorizations}
        leaves={leaves}
        onApplyLeave={onApplyLeave}
        onSimulatePunch={onSimulatePunch}
        onAddRegularization={onAddRegularization}
        hideMockPhoneFrame
        loggedInUser={loggedInUser}
        onLogout={onLogout}
        payrollPayslips={payrollPayslips}
        payrollRuns={payrollRuns}
      />
    );
  }

  /* ── Normal HR portal ──────────────────────────────────────────── */
  return (
    <div className="h-screen overflow-hidden bg-slate-900 text-slate-100 flex flex-col font-sans">

      {/* Main workspace */}
      <div className="flex-1 flex overflow-hidden">

        {/* Portal canvas — fills all remaining space */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full h-full"
          >
            <WebPortal
              employees={employees}
              attendances={attendances}
              mobileDutyAuthorizations={mobileDutyAuthorizations}
              leaves={leaves}
              statConfig={statConfig}
              taxSlabs={taxSlabs}
              payrollRuns={payrollRuns}
              attendancePeriods={attendancePeriods}
              payrollPayslips={payrollPayslips}
              payrollAdjustments={payrollAdjustments}
              onCreatePayrollAdjustment={onCreatePayrollAdjustment}
              onReviewPayrollAdjustment={onReviewPayrollAdjustment}
              onAddEmployee={onAddEmployee}
              onUpdateEmployee={onUpdateEmployee}
              onUpdateStatConfig={onUpdateStatConfig}
              onUpdateTaxSlabs={onUpdateTaxSlabs}
              onApproveLeave={onApproveLeave}
              onRejectLeave={onRejectLeave}
              onApproveRegularization={onApproveRegularization}
              onCorrectPunchOut={onCorrectPunchOut}
              onRejectRegularization={onRejectRegularization}
              onCreatePayrollRun={onCreatePayrollRun}
              onLockAttendancePeriod={onLockAttendancePeriod}
              onReopenAttendancePeriod={onReopenAttendancePeriod}
              onCancelPayrollRun={onCancelPayrollRun}
              {...portalGovernance}
              onUpdatePayrollStatus={onUpdatePayrollStatus}
              onRecordBankAdvice={onRecordBankAdvice}
              onSendPayslips={onSendPayslips}
              onApplyLeave={onApplyLeave}
              onAddAttendance={onAddAttendance}
              branches={branches}
              companies={companies}
              onSaveCompanySetup={onSaveCompanySetup}
              departments={departments}
              designations={designations}
              zones={zones}
              ucTowns={ucTowns}
              wageTypes={wageTypes}
              onSaveMasterData={onSaveMasterData}
              roles={roles}
              users={users}
              currentUserAccount={currentUserAccount}
              accessControlLoaded={accessControlLoaded}
              onSetCurrentUserAccount={onSetCurrentUserAccount}
              onAddRole={onAddRole}
              onUpdateRole={onUpdateRole}
              onAddUser={onAddUser}
              onDeleteUser={onDeleteUser}
              onUpdateUserRole={onUpdateUserRole}
              onUpdateUser={onUpdateUser}
              onSaveMobileDutyAuthorization={onSaveMobileDutyAuthorization}
              onCancelMobileDutyAuthorization={onCancelMobileDutyAuthorization}
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
              onSimulatePunch={onSimulatePunch}
              firestoreSyncStatus={firestoreSyncStatus}
            />
          </motion.div>
        </div>

        {/* Floating compliance toggle */}
        {!showComplianceOverview && (
          <button
            type="button"
            onClick={() => setShowComplianceOverview(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-4 rounded-l-xl shadow-xl flex flex-col items-center justify-center space-y-2 z-40 transition border border-emerald-500 border-r-0"
          >
            <ShieldCheck className="w-4 h-4" />
            <span className="text-[9px] font-bold tracking-widest uppercase vertical-text">Compliance</span>
          </button>
        )}

        {/* Compliance reference rail */}
        {showComplianceOverview && (
          <aside className="w-72 xl:w-80 bg-slate-950 border-l border-slate-800 p-5 overflow-y-auto space-y-5 flex-shrink-0">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-xs uppercase tracking-widest text-emerald-400 flex items-center">
                <Briefcase className="w-4 h-4 mr-1.5" />
                Pakistan Payroll Compliance
              </h3>
              <button
                type="button"
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
                  Any action on the <strong>Mobile ESS App</strong> (marking geofenced attendance or applying sick leave) immediately propagates to the Server Database and refreshes the live dashboards on the <strong>Web Admin Portal</strong>.
                </p>
              </div>

              <div className="space-y-1 border-t border-slate-800 pt-3">
                <span className="font-bold text-white block">🇵🇰 FBR Tax Tables &amp; Slabs</span>
                <p>
                  Calculates annual taxable projection based on current active monthly gross salary and references the 8-slab FBR progressive salaried individual tax table.
                </p>
              </div>

              <div className="space-y-1 border-t border-slate-800 pt-3">
                <span className="font-bold text-emerald-400 block">🏢 EOBI Social Security</span>
                <p>
                  Automatically deducts 1% employee quota and matches 5% employer contribution based on the FBR standard minimum wage.
                </p>
              </div>

              <div className="space-y-1 border-t border-slate-800 pt-3">
                <span className="font-bold text-white block">🏦 Bank Bulk Advice</span>
                <p>
                  Calculates net take-home adjusted for unpaid absences and generates formatted CSV bank advice sheets matching HBL and Alfalah enterprise layouts.
                </p>
              </div>

              <div className="bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-900/30 text-[11px] text-emerald-300 flex items-start space-x-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
                <p>
                  <strong>Tip:</strong> All payroll, attendance, and leave data syncs live with the server. Changes appear instantly across all logged-in sessions.
                </p>
              </div>

              {/* Statutory Lock */}
              <div className="border-t border-slate-800 pt-4 space-y-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Statutory Lock
                </h4>
                <div className="bg-slate-900 rounded-lg p-3 space-y-2 border border-slate-800">
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">FBR Minimum Wage:</span>
                    <span className="text-emerald-300 font-bold">PKR {statConfig.minimumWage.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">EOBI Employee:</span>
                    <span className="text-slate-200">1% (FBR Base)</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">EOBI Employer:</span>
                    <span className="text-slate-200">5% (FBR Base)</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">Prov. Security:</span>
                    <span className="text-slate-200">6% Employer</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

      </div>
    </div>
  );
}
