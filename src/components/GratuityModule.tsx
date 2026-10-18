/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { DateField } from './DateField';
import { RequiredMark, RequiredNote } from './RequiredMark';
import { Calculator, X } from 'lucide-react';
import { GratuitySettlement, Employee, StatutoryConfig, UserAccount } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { gratuityEntitlement } from '../data/lifecycle';

interface GratuityModuleProps {
  settlements: GratuitySettlement[];
  employees: Employee[];
  statConfig: StatutoryConfig;
  canManage: boolean;
  currentUserAccount: UserAccount;
  onAddSettlement: (settlement: GratuitySettlement) => void;
  onUpdateSettlement: (settlement: GratuitySettlement) => void;
}

type SeparationType = GratuitySettlement['separationType'];
const SEPARATION_TYPES: SeparationType[] = ['Resignation', 'Termination', 'Retirement', 'Death', 'Redundancy'];

const STATUS_COLORS: Record<GratuitySettlement['status'], string> = {
  'Pending': 'amber', 'Processed': 'blue', 'Paid': 'emerald'
};
const SEP_COLORS: Record<SeparationType, string> = {
  'Resignation': 'amber', 'Termination': 'rose', 'Retirement': 'blue', 'Death': 'slate', 'Redundancy': 'indigo'
};

function PKR(n: number) { return 'PKR ' + n.toLocaleString('en-PK', { maximumFractionDigits: 0 }); }

function computeYears(joiningDate: string, lastWorkingDate: string) {
  const from = new Date(joiningDate);
  const to = new Date(lastWorkingDate);
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}


export function GratuityModule({ settlements, employees, statConfig, canManage, currentUserAccount, onAddSettlement, onUpdateSettlement }: GratuityModuleProps) {
  const [showCalc, setShowCalc] = useState(false);

  const [calcForm, setCalcForm] = useState({
    employeeId: employees[0]?.id || '',
    separationType: 'Resignation' as SeparationType,
    lastWorkingDate: new Date().toISOString().split('T')[0],
    encashableLeaveDays: 0,
    noticePayDays: 0,
    pendingSalaryDays: 0,
    notes: ''
  });

  const selectedEmp = useMemo(() => employees.find(e => e.id === calcForm.employeeId), [employees, calcForm.employeeId]);

  const yearsOfService = useMemo(() => {
    if (!selectedEmp) return 0;
    return Math.max(0, computeYears(selectedEmp.dateOfJoining, calcForm.lastWorkingDate));
  }, [selectedEmp, calcForm.lastWorkingDate]);

  const basicSalary = selectedEmp?.basicSalary || 0;
  const dailyRate = basicSalary / (statConfig.settlementDailyRateDivisor || 30);

  // Same configurable rule as offboarding and lifecycle approvals, so every settlement path agrees.
  const gratuityAmount = useMemo(() => selectedEmp
    ? gratuityEntitlement(basicSalary, selectedEmp.dateOfJoining, calcForm.lastWorkingDate, calcForm.separationType, statConfig).amount
    : 0, [selectedEmp, basicSalary, calcForm.lastWorkingDate, calcForm.separationType, statConfig]);

  const leaveEncashmentAmount = dailyRate * calcForm.encashableLeaveDays;
  const noticePayAmount = dailyRate * calcForm.noticePayDays;
  const pendingSalaryAmount = dailyRate * calcForm.pendingSalaryDays;
  const totalSettlementAmount = gratuityAmount + leaveEncashmentAmount + noticePayAmount + pendingSalaryAmount;

  const handleSave = () => {
    if (!selectedEmp) return;
    const settlement: GratuitySettlement = {
      id: `gs-${Date.now()}`,
      employeeId: calcForm.employeeId,
      separationType: calcForm.separationType,
      lastWorkingDate: calcForm.lastWorkingDate,
      separationDate: calcForm.lastWorkingDate,
      yearsOfService,
      basicSalaryAtSeparation: basicSalary,
      gratuityAmount,
      encashableLeaveDays: calcForm.encashableLeaveDays,
      leaveEncashmentAmount,
      noticePayDays: calcForm.noticePayDays,
      noticePayAmount,
      pendingSalaryDays: calcForm.pendingSalaryDays,
      pendingSalaryAmount,
      totalSettlementAmount,
      status: 'Pending',
      notes: calcForm.notes,
      createdAt: new Date().toISOString(),
      createdById: currentUserAccount.id,
    };
    onAddSettlement(settlement);
    setShowCalc(false);
  };

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.fullName || '—';
  const totalPaid = settlements.filter(s => s.status === 'Paid').reduce((sum, s) => sum + s.totalSettlementAmount, 0);
  const pendingCount = settlements.filter(s => s.status === 'Pending').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gratuity & Terminal Settlement</h2>
          <p className="text-xs text-slate-500 mt-0.5">Calculate and process employee final settlements including gratuity, leave encashment, and notice pay</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCalc(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
            <Calculator size={14} /> New Settlement
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Settlements', val: settlements.length, color: 'slate' },
          { label: 'Pending', val: pendingCount, color: 'amber' },
          { label: 'Paid', val: settlements.filter(s => s.status === 'Paid').length, color: 'emerald' },
          { label: 'Total Paid Out', val: PKR(totalPaid), color: 'blue' }
        ].map(({ label, val, color }) => (
          <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-2xl p-4`}>
            <div className={`text-xl font-bold text-${color}-700`}>{val}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Settlements Table */}
      {settlements.length > 0 ? (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200">
              <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
                {['Employee', 'Separation', 'Last Day', 'Service', 'Gratuity', 'Leave Enc.', 'Notice', 'Total', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlements.map(s => {
                const sepColor = SEP_COLORS[s.separationType];
                const statusColor = STATUS_COLORS[s.status];
                return (
                  <tr key={s.id} className="hover:bg-slate-100 transition">
                    <td className="px-4 py-3 text-slate-900 font-medium">{getEmpName(s.employeeId)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${sepColor}-50 text-${sepColor}-700 border border-${sepColor}-200`}>
                        {s.separationType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.lastWorkingDate}</td>
                    <td className="px-4 py-3 text-slate-600">{s.yearsOfService}y</td>
                    <td className="px-4 py-3 text-emerald-700">{PKR(s.gratuityAmount)}</td>
                    <td className="px-4 py-3 text-blue-700">{PKR(s.leaveEncashmentAmount)}</td>
                    <td className="px-4 py-3 text-indigo-700">{PKR(s.noticePayAmount)}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{PKR(s.totalSettlementAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${statusColor}-50 text-${statusColor}-700 border border-${statusColor}-200`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && s.status !== 'Paid' && (
                        <div className="flex gap-1">
                          {s.status === 'Pending' && (
                            <button disabled={s.createdById === currentUserAccount.id} title={s.createdById === currentUserAccount.id ? 'Another payroll user must process this settlement.' : 'Process settlement'} onClick={() => onUpdateSettlement({ ...s, status: 'Processed', processedAt: new Date().toISOString(), processedById: currentUserAccount.id })}
                              className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-500/20 transition">Process</button>
                          )}
                          {s.status === 'Processed' && (
                            <button disabled={s.createdById === currentUserAccount.id || s.processedById === currentUserAccount.id} title={s.createdById === currentUserAccount.id ? 'Settlement maker cannot pay it.' : s.processedById === currentUserAccount.id ? 'Settlement processor cannot pay it.' : 'Mark settlement paid'} onClick={() => onUpdateSettlement({ ...s, status: 'Paid', paidDate: new Date().toISOString().split('T')[0], paidById: currentUserAccount.id })}
                              className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition">Mark Paid</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-slate-500 text-sm bg-slate-50 border border-slate-200 rounded-2xl">
          No settlements processed yet. Use "New Settlement" to calculate gratuity.
        </div>
      )}

      {/* Settlement Calculator Modal */}
      <AnimatePresence>
        {showCalc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-6 space-y-5 my-8">
              <div className="flex justify-between items-start">
                <h3 className="text-base font-bold text-slate-900">Terminal Settlement Calculator</h3>
                <button onClick={() => setShowCalc(false)} className="text-slate-500 hover:text-slate-900 transition" aria-label="Close calculator"><X size={18} /></button>
              </div>
              <RequiredNote />

              {/* Input Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="gratuity-employee" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Employee<RequiredMark /></label>
                  <select id="gratuity-employee" aria-required="true" value={calcForm.employeeId} onChange={e => setCalcForm(p => ({ ...p, employeeId: e.target.value }))}
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {employees.filter(e => e.status === 'Active').map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="gratuity-separation-type" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Separation Type</label>
                  <select id="gratuity-separation-type" value={calcForm.separationType} onChange={e => setCalcForm(p => ({ ...p, separationType: e.target.value as SeparationType }))}
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                    {SEPARATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="gratuity-last-working-date" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Last Working Date</label>
                  <DateField id="gratuity-last-working-date" value={calcForm.lastWorkingDate}
                    onChange={e => setCalcForm(p => ({ ...p, lastWorkingDate: e.target.value }))}
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                </div>
                <div className="flex flex-col justify-end">
                  {selectedEmp && (
                    <div className="bg-slate-50 rounded-xl px-3 py-2 text-xs">
                      <div className="text-slate-500">Joining Date: <span className="text-slate-900">{selectedEmp.dateOfJoining}</span></div>
                      <div className="text-slate-500">Basic Salary: <span className="text-emerald-700 font-bold">{PKR(basicSalary)}</span></div>
                      <div className="text-slate-500">Service: <span className={`font-bold ${yearsOfService >= 1 ? 'text-emerald-700' : 'text-rose-700'}`}>{yearsOfService} year{yearsOfService !== 1 ? 's' : ''}</span>
                        {yearsOfService < 1 && <span className="text-rose-700 ml-1">(Minimum 1 year required)</span>}
                      </div>
                    </div>
                  )}
                </div>
                {[
                  { label: 'Encashable Leave Days', key: 'encashableLeaveDays' },
                  { label: 'Notice Pay Days (owed)', key: 'noticePayDays' },
                  { label: 'Pending Salary Days', key: 'pendingSalaryDays' }
                ].map(({ label, key }) => (
                  <div key={key}>
                    <label htmlFor={`gratuity-${key}`} className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}</label>
                    <input id={`gratuity-${key}`} type="number" min="0" value={(calcForm as any)[key]}
                      onChange={e => setCalcForm(p => ({ ...p, [key]: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                  </div>
                ))}
                <div>
                  <label htmlFor="gratuity-notes" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Notes</label>
                  <input id="gratuity-notes" value={calcForm.notes} onChange={e => setCalcForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Settlement notes..."
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                </div>
              </div>

              {/* Calculation Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Settlement Breakdown</h4>
                {[
                  { label: `Gratuity (${yearsOfService} yrs × ${statConfig.gratuityRateDaysPerYear} days × Daily Rate${calcForm.separationType === 'Resignation' && yearsOfService < 5 ? ' × 50%' : ''})`, amount: gratuityAmount, color: 'emerald' },
                  { label: `Leave Encashment (${calcForm.encashableLeaveDays} days × ${PKR(Math.round(dailyRate))}/day)`, amount: leaveEncashmentAmount, color: 'blue' },
                  { label: `Notice Pay (${calcForm.noticePayDays} days × ${PKR(Math.round(dailyRate))}/day)`, amount: noticePayAmount, color: 'indigo' },
                  { label: `Pending Salary (${calcForm.pendingSalaryDays} days × ${PKR(Math.round(dailyRate))}/day)`, amount: pendingSalaryAmount, color: 'amber' }
                ].map(({ label, amount, color }) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-200 last:border-0 text-sm">
                    <span className="text-slate-500 text-xs">{label}</span>
                    <span className={`font-bold text-${color}-700`}>{PKR(amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-slate-300">
                  <span className="text-slate-900 font-bold">Total Settlement Amount</span>
                  <span className="text-2xl font-bold text-slate-900">{PKR(totalSettlementAmount)}</span>
                </div>
                {calcForm.separationType === 'Resignation' && yearsOfService < 5 && yearsOfService >= (statConfig.gratuityMinimumServiceYears ?? 1) && (statConfig.gratuityResignationUnderFiveYearsPercent ?? 100) < 100 && (
                  <div className="text-[10px] text-amber-700 mt-1">* Gratuity paid at {statConfig.gratuityResignationUnderFiveYearsPercent}% for resignation within 5 years of service (company policy setting)</div>
                )}
                {yearsOfService < (statConfig.gratuityMinimumServiceYears ?? 1) && (
                  <div className="text-[10px] text-rose-700 mt-1">* Employee is not eligible for gratuity (minimum {statConfig.gratuityMinimumServiceYears ?? 1} year(s) of service required)</div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowCalc(false)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleSave} disabled={!selectedEmp}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  Save Settlement
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
