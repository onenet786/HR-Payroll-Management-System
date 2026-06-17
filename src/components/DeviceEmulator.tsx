/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Monitor, Cpu, Smartphone, Layers, ShieldCheck, HeartHandshake, Briefcase, Info } from 'lucide-react';
import { WebPortal } from './WebPortal';
import { WindowsApp } from './WindowsApp';
import { MobileApp } from './MobileApp';
import { 
  Employee, AttendanceLog, LeaveRequest, StatutoryConfig, TaxSlab, PayrollRun, Designation, Branch, Department
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
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
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
  branches,
  departments,
  designations
}: DeviceEmulatorProps) {
  const [deviceMode, setDeviceMode] = useState<'web' | 'windows' | 'mobile'>('web');
  const [showComplianceOverview, setShowComplianceOverview] = useState(true);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans" id="emulator-container">
      
      {/* 1. Global Emulator Device Selector Bar */}
      <div className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0" id="emulator-selector-bar">
        
        <div className="flex items-center space-x-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-500 flex items-center justify-center shadow-lg text-white">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-white tracking-widest uppercase flex items-center">
              Indus Cross-Platform Suite <span className="ml-2 font-mono text-[9px] px-1.5 py-0.5 bg-emerald-950 text-emerald-400 rounded-full border border-emerald-900 leading-none">v1.2</span>
            </h1>
            <p className="text-xs text-slate-400 font-sans mt-0.5">FBR High-Compliance Multi-Tenant Engine</p>
          </div>
        </div>

        {/* Triple Switch Controller */}
        <div className="bg-slate-900 p-1 rounded-2xl flex border border-slate-850 shadow-inner" id="emulator-buttons">
          <button 
            onClick={() => setDeviceMode('web')}
            className={`px-4 py-2 rounded-xl text-xs font-bold leading-none flex items-center space-x-2 transition ${deviceMode === 'web' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>🖥️ Web Admin</span>
          </button>

          <button 
            onClick={() => setDeviceMode('windows')}
            className={`px-4 py-2 rounded-xl text-xs font-bold leading-none flex items-center space-x-2 transition ${deviceMode === 'windows' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>💻 Windows Client</span>
          </button>

          <button 
            onClick={() => setDeviceMode('mobile')}
            className={`px-4 py-2 rounded-xl text-xs font-bold leading-none flex items-center space-x-2 transition ${deviceMode === 'mobile' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>📱 Mobile ESS</span>
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

      {/* 2. Interactive Main Workspace Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden" id="emulator-main">
        
        {/* Main Content Area */}
        <div className="flex-1 p-4 lg:p-6 flex items-center justify-center overflow-auto" id="emulator-canvas">
          <div className="w-full h-full max-w-7xl">
            <AnimatePresence mode="wait">
              {deviceMode === 'web' && (
                <motion.div 
                  key="web-view"
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  className="w-full h-[660px] rounded-3xl overflow-hidden shadow-2xl border border-slate-800"
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
                    branches={branches}
                    departments={departments}
                    designations={designations}
                  />
                </motion.div>
              )}

              {deviceMode === 'windows' && (
                <motion.div 
                  key="win-view"
                  initial={{ opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.99 }}
                  className="w-full h-[640px] rounded-2xl overflow-hidden shadow-2xl"
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
                  className="w-full flex items-center justify-center p-4"
                >
                  <MobileApp 
                    employees={employees}
                    attendances={attendances}
                    leaves={leaves}
                    onApplyLeave={onApplyLeave}
                    onSimulatePunch={onSimulatePunch}
                    onAddRegularization={onAddRegularization}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

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
