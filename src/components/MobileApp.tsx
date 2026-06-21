/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Scan, Smartphone, CheckCircle, ShieldCheck, Mail, MapPin, 
  Calendar, FileText, User, Bell, Send, Layers, Check, Hourglass
} from 'lucide-react';
import { Employee, AttendanceLog, LeaveRequest, Payslip } from '../types';
import { computePayslipDetails } from '../data/defaults';
import { motion, AnimatePresence } from 'motion/react';

interface MobileAppProps {
  employees: Employee[];
  attendances: AttendanceLog[];
  leaves: LeaveRequest[];
  onApplyLeave: (leave: LeaveRequest) => void;
  onSimulatePunch: (employeeId: string, punchIn: string, punchOut: string, method: string) => void;
  onAddRegularization: (employeeId: string, date: string, reason: string) => void;
  hideMockPhoneFrame?: boolean;
}

export function MobileApp({
  employees,
  attendances,
  leaves,
  onApplyLeave,
  onSimulatePunch,
  onAddRegularization,
  hideMockPhoneFrame
}: MobileAppProps) {
  const [selectedMobileEmpId, setSelectedMobileEmpId] = useState(employees[0]?.id || '');
  const [mobileTab, setMobileTab] = useState<'home' | 'punch' | 'leave' | 'payslips'>('home');
  
  // WhatsApp Notification Toast Simulation
  const [waNotice, setWaNotice] = useState<string | null>(null);

  // Forms state
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'Casual' as 'Casual' | 'Sick' | 'Annual' | 'Unpaid',
    startDate: '2026-06-20',
    endDate: '2026-06-21',
    reason: 'Personal urgent work in Lahore.'
  });

  const [regForm, setRegForm] = useState({
    date: '2026-06-15',
    reason: 'Biometric fingerprint reader biometric mismatch.'
  });

  // Derived user details
  const currentEmp = employees.find(e => e.id === selectedMobileEmpId) || employees[0];

  const triggerWaToast = (msg: string) => {
    setWaNotice(msg);
    setTimeout(() => {
      setWaNotice(null);
    }, 4500);
  };

  // Marked punches for current user
  const myPunches = attendances.filter(a => a.employeeId === currentEmp?.id);
  const isCheckedInToday = myPunches.some(p => p.date === '2026-06-17');

  const handleMobilePunch = () => {
    if (!currentEmp) return;
    
    if (isCheckedInToday) {
      triggerWaToast(`WhatsApp Alert: Punch OUT registered at 06:12 PM. Working hours: 9.2 hrs. Allah Hafiz!`);
      return;
    }

    // Register punch In
    onSimulatePunch(currentEmp.id, '08:58:12', '18:15:00', 'Mobile GPS');
    triggerWaToast(`WhatsApp Alert: Assalam-o-Alaikum ${currentEmp.fullName}! Punch IN recorded today at 08:58 AM near Clifton geofenced zone. Have a nice shift!`);
  };

  const handleApplyLeaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmp) return;

    // Days calculation
    const start = new Date(leaveForm.startDate);
    const end = new Date(leaveForm.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const request: LeaveRequest = {
      id: 'lv-' + Date.now(),
      employeeId: currentEmp.id,
      leaveType: leaveForm.leaveType,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      totalDays,
      reason: leaveForm.reason,
      status: 'Pending',
      appliedOn: '2026-06-17'
    };

    onApplyLeave(request);
    triggerWaToast(`WhatsApp Alert: Your request for ${totalDays} Day(s) of ${leaveForm.leaveType} leave has been submitted to your supervisor.`);
    
    // Reset form
    setLeaveForm({
      leaveType: 'Casual',
      startDate: '2026-06-20',
      endDate: '2026-06-21',
      reason: 'Personal urgent work in Lahore.'
    });
  };

  const handleApplyRegularization = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmp) return;

    onAddRegularization(currentEmp.id, regForm.date, regForm.reason);
    triggerWaToast(`WhatsApp Alert: Regularization for ${regForm.date} filed. Sent to HR admin approval docket.`);
    
    setRegForm({
      date: '2026-06-15',
      reason: 'Biometric fingerprint reader biometric mismatch.'
    });
  };

  // Personal payslip computation
  const myPayslip = currentEmp ? computePayslipDetails(
    currentEmp, 6, 2026, attendances, leaves
  ) : null;

  const innerContent = (
    <>

      {/* Employee Context Selector (Emulating logging in as different employees on ESS) */}
      <div className="bg-slate-100 p-2 border-b flex items-center justify-between text-[11px] select-none flex-shrink-0">
        <span className="font-semibold text-slate-500">ESS User Login:</span>
        <select 
          value={selectedMobileEmpId || ''}
          onChange={(e) => {
            setSelectedMobileEmpId(e.target.value);
            setMobileTab('home');
          }}
          className="bg-white border rounded p-1 text-[11px] font-medium outline-none text-slate-800 max-w-[170px] truncate"
        >
          {employees.map(e => (
            <option key={e.id} value={e.id}>{e.fullName}</option>
          ))}
        </select>
      </div>

      {/* 3. Dynamic Screen display */}
      <div className="flex-1 bg-white overflow-y-auto relative p-4" id="mob-screen-scroll">
        
        {/* Real-time WhatsApp Notification popups */}
        <AnimatePresence>
          {waNotice && (
            <motion.div 
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className="absolute top-2 left-2 right-2 z-50 bg-[#128C7E] text-white p-3 rounded-lg shadow-lg flex items-start space-x-2 border-l-4 border-[#075E54]"
            >
              <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center text-emerald-800 text-xs font-bold font-sans flex-shrink-0">WA</div>
              <div className="flex-1 text-[11px] font-sans leading-tight">
                <div className="font-bold flex justify-between">
                  <span>HR Notification service</span>
                  <span className="text-[9px] text-emerald-100 font-mono">1m ago</span>
                </div>
                <p className="mt-1">{waNotice}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab 1: ESS HOME & METRICS */}
        {mobileTab === 'home' && currentEmp && (
          <div className="space-y-4">
            
            {/* Tiny Greeting card */}
            <div className="flex items-center space-x-3 p-1">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm">
                {currentEmp.fullName.substring(0, 2)}
              </div>
              <div>
                <h3 className="font-bold text-slate-900 leading-tight">Sabaq Khair, {currentEmp.fullName.split(' ')[0]}!</h3>
                <p className="text-[10px] text-emerald-700 font-medium">Clifton HQ Branch • {currentEmp.employeeCode}</p>
              </div>
            </div>

            {/* Quick check state */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-150 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Today's Duty Status</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-bold ${
                  isCheckedInToday ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {isCheckedInToday ? 'Checked In' : 'Not Clocked In'}
                </span>
              </div>
              
              <div className="flex space-x-2 text-[11px]">
                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                <p className="text-slate-600">Geofence Location: <strong>Habib Bank Clifton Sector</strong> • In Range</p>
              </div>
            </div>

            {/* Attendance Streaks */}
            <div className="grid grid-cols-2 gap-3 font-sans text-center">
              <div className="p-3 rounded-2xl border bg-slate-50/50">
                <p className="text-[9px] text-slate-400 uppercase font-semibold">My Monthly Streak</p>
                <p className="text-lg font-bold text-slate-800 mt-1">94.2%</p>
                <span className="text-[9px] text-emerald-600 font-medium">Excellent</span>
              </div>

              <div className="p-3 rounded-2xl border bg-slate-50/50">
                <p className="text-[9px] text-slate-400 uppercase font-semibold">Casual Leave Left</p>
                <p className="text-lg font-bold text-slate-800 mt-1">8 / 10</p>
                <span className="text-[9px] text-slate-400">Days Remaining</span>
              </div>
            </div>

            {/* Quick action button panel shortcut */}
            <button 
              onClick={() => setMobileTab('punch')}
              className="w-full bg-[#25D366] hover:bg-[#20ba56] text-white font-bold p-3 rounded-xl flex items-center justify-center space-x-2 shadow-sm shadow-green-100"
            >
              <Scan className="w-4 h-4" />
              <span>Mark Attendance via GPS</span>
            </button>

          </div>
        )}

        {/* Tab 2: GPS TOUCH CHECK-IN / REGULARIZATION */}
        {mobileTab === 'punch' && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 border-b pb-1.5 flex items-center">
              <MapPin className="w-4 h-4 mr-1 text-emerald-600" />
              Geofenced Punch-In Center
            </h3>

            <div className="text-center p-4 bg-slate-50 rounded-2xl border space-y-4">
              <div className="inline-flex w-20 h-20 bg-emerald-100 rounded-full items-center justify-center text-emerald-800 shadow-md">
                <Scan className="w-10 h-10 animate-pulse" />
              </div>

              <div>
                <h4 className="font-bold text-slate-800">Biometric Identity Verification</h4>
                <p className="text-[10px] text-slate-400 max-w-xs mx-auto mt-0.5">Place your finger coordinates on screen within Clifton HQ Authorized bounds.</p>
              </div>

              <button 
                onClick={handleMobilePunch}
                className="mx-auto w-32 h-32 rounded-full bg-gradient-to-tr from-emerald-600 to-green-500 text-white font-bold text-xs uppercase flex flex-col items-center justify-center shadow-lg border-4 border-white active:scale-95 transition"
              >
                <span>{isCheckedInToday ? 'PUNCH OUT' : 'PRESS TO'}</span>
                <span className="block text-[10px] opacity-80 mt-1">PUNCH NOW</span>
              </button>
            </div>

            {/* Regularization form in case of missed punches */}
            <form onSubmit={handleApplyRegularization} className="p-3.5 bg-slate-50 border rounded-2xl space-y-3">
              <h4 className="font-bold text-slate-850">Forgot card? Apply Regularization</h4>
              
              <div>
                <label className="block text-[10px] font-medium text-slate-505 mb-1">Pick date of missing log:</label>
                <input 
                  type="date"
                  value={regForm.date}
                  onChange={(e) => setRegForm({ ...regForm, date: e.target.value })}
                  className="w-full p-2 border bg-white rounded font-mono text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-slate-505 mb-1">Detailed Reason for Manager:</label>
                <textarea 
                  value={regForm.reason}
                  onChange={(e) => setRegForm({ ...regForm, reason: e.target.value })}
                  placeholder="Fingerprint read issues..."
                  className="w-full p-2 border bg-white rounded text-xs leading-tight h-12 outline-none"
                ></textarea>
              </div>

              <button 
                type="submit"
                className="w-full bg-indigo-650 bg-slate-900 hover:bg-slate-800 text-white p-2 rounded text-xs font-semibold"
              >
                File Regularization Claim
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: LEAVE APPLICATION FORM */}
        {mobileTab === 'leave' && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 border-b pb-1.5 flex items-center">
              <Calendar className="w-4 h-4 mr-1 text-emerald-605" />
              Apply Leave ESS Module
            </h3>

            <form onSubmit={handleApplyLeaveSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Leave Sub-category:</label>
                <select 
                  value={leaveForm.leaveType}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value as any })}
                  className="w-full bg-slate-50 border p-2 rounded font-medium outline-none text-slate-800"
                >
                  <option value="Casual">Casual Leave (Paid)</option>
                  <option value="Sick">Medical / Sick Leave (Paid)</option>
                  <option value="Annual">Annual Vacation (Paid)</option>
                  <option value="Unpaid">Unpaid Leave (Monthly deduction)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block text-[10px] font-sans font-semibold text-slate-500 mb-1">Start Date:</label>
                  <input 
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    className="w-full p-2 border rounded text-xs outline-none bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-sans font-semibold text-slate-500 mb-1">End Date:</label>
                  <input 
                    type="date"
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    className="w-full p-2 border rounded text-xs outline-none bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Reason for application:</label>
                <textarea 
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  placeholder="Need to attend family event"
                  className="w-full p-2 border rounded text-xs leading-normal h-16 outline-none bg-slate-50"
                ></textarea>
              </div>

              <button 
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold p-3 rounded-lg shadow-sm"
              >
                Submit Authorization Request
              </button>
            </form>

            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1 text-[11px] text-indigo-900 leading-normal">
              <p className="font-bold flex items-center">
                <ShieldCheck className="w-4 h-4 mr-1 text-indigo-600" />
                Quota policy note:
              </p>
              <p>Under provincial civil services, Hajj leaves and maternal provisions accrue differently and require paper attachment files sent directly to HR admin office.</p>
            </div>
          </div>
        )}

        {/* Tab 4: ESS DIGITAL PAYSLIPS */}
        {mobileTab === 'payslips' && (
          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 border-b pb-1.5 flex items-center">
              <FileText className="w-4 h-4 mr-1 text-emerald-605" />
              My Digital Payslip Receipts
            </h3>

            {myPayslip ? (
              <div className="space-y-3 font-mono">
                
                <div className="bg-slate-900 text-slate-205 p-3.5 rounded-xl border border-slate-950 space-y-2 text-[10px]">
                  <div className="flex justify-between border-b border-slate-800 pb-1.5 font-sans">
                    <span className="font-bold text-white">Indus Logistics Paycheck Receipt</span>
                    <span className="text-[9px] text-slate-400">June 2026</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Basic Wage Salary:</span>
                    <span className="text-white">{myPayslip.basicEarnings.toLocaleString()} PKR</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">House Rent Allowance:</span>
                    <span className="text-white">{myPayslip.houseRentAllowance.toLocaleString()} PKR</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">Medical Allowance:</span>
                    <span className="text-white">{myPayslip.medicalAllowance.toLocaleString()} PKR</span>
                  </div>

                  {myPayslip.overtimePay > 0 && (
                    <div className="flex justify-between">
                      <span className="text-emerald-400">Overtime hours pay:</span>
                      <span className="text-emerald-300">+{myPayslip.overtimePay.toLocaleString()} PKR</span>
                    </div>
                  )}

                  <hr className="border-slate-800" />

                  <div className="flex justify-between text-rose-400">
                    <span>FBR Income Tax deducted:</span>
                    <span>-{myPayslip.incomeTaxDeduction.toLocaleString()} PKR</span>
                  </div>

                  <div className="flex justify-between text-rose-400 font-sans">
                    <span>EOBI (1% base contribution):</span>
                    <span>-{myPayslip.eobiEmployeeDeduction.toLocaleString()} PKR</span>
                  </div>

                  <div className="flex justify-between text-[#25D366] font-bold text-xs pt-1">
                    <span>Net Disbursed Takehome:</span>
                    <span>{myPayslip.netSalary.toLocaleString()} PKR</span>
                  </div>

                </div>

                <div className="text-center">
                  <button 
                    onClick={() => alert('Secure payslip download simulated. Checking key credentials...')}
                    className="bg-slate-950 text-white hover:bg-slate-850 px-4 py-2 rounded-lg font-sans font-bold w-full"
                  >
                    Generate Official Encrypted PDF
                  </button>
                </div>

              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-10">No active payslips mapped in archive.</p>
            )}
          </div>
        )}

      </div>

      {/* 4. Emulated Phone Physical Bottom Home bar */}
      <div className="bg-slate-50 rounded-b-3xl py-2 flex justify-around items-center border-t border-slate-100 flex-shrink-0 select-none">
        <button 
          onClick={() => setMobileTab('home')}
          className={`flex flex-col items-center space-y-1 ${mobileTab === 'home' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <User className="w-4 h-4" />
          <span className="text-[9px] font-sans">Home</span>
        </button>

        <button 
          onClick={() => setMobileTab('punch')}
          className={`flex flex-col items-center space-y-1 ${mobileTab === 'punch' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <Scan className="w-4 h-4" />
          <span className="text-[9px] font-sans">GPS Check</span>
        </button>

        <button 
          onClick={() => setMobileTab('leave')}
          className={`flex flex-col items-center space-y-1 ${mobileTab === 'leave' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <Calendar className="w-4 h-4" />
          <span className="text-[9px] font-sans">Leaves</span>
        </button>

        <button 
          onClick={() => setMobileTab('payslips')}
          className={`flex flex-col items-center space-y-1 ${mobileTab === 'payslips' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <FileText className="w-4 h-4" />
          <span className="text-[9px] font-sans">Payslips</span>
        </button>
      </div>

    </>
  );

  if (hideMockPhoneFrame) {
    return (
      <div className="w-full h-full bg-white flex flex-col font-sans text-xs text-slate-800" id="native-mobile-container">
        {innerContent}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto h-[610px] bg-slate-900 rounded-[40px] p-3 shadow-2xl relative border-4 border-slate-800 flex flex-col font-sans text-xs text-slate-800" id="mob-emulate-container">
      {/* 1. Phone Top Notch Speaker & Camera bar */}
      <div className="absolute top-2.5 left-1/2 transform -translate-x-1/2 bg-slate-800 rounded-full h-4 w-28 flex items-center justify-between px-3 z-10">
        <span className="w-1.5 h-1.5 bg-slate-700 rounded-full"></span>
        <span className="w-12 h-1 bg-slate-900 rounded-full"></span>
        <span className="w-1.5 h-1.5 bg-slate-700 rounded-full"></span>
      </div>

      {/* 2. Emulated OS Status bar */}
      <div className="bg-slate-50 text-slate-900 rounded-t-3xl pt-5 pb-1 px-5 flex justify-between items-center text-[10px] font-mono leading-none flex-shrink-0 border-b border-slate-100 select-none">
        <span>11:37 AM</span>
        <div className="flex space-x-1 items-center">
          <span>Mobilink LTE</span>
          <span className="text-[9px]">🔋 84%</span>
        </div>
      </div>

      {innerContent}
    </div>
  );
}
