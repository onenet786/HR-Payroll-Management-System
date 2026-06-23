/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Calculator, X } from 'lucide-react';
import { GratuitySettlement, Employee, StatutoryConfig } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface GratuityModuleProps {
  settlements: GratuitySettlement[];
  employees: Employee[];
  statConfig: StatutoryConfig;
  canManage: boolean;
  onAddSettlement: (settlement: GratuitySettlement) => void;
  onUpdateSettlement: (settlement: GratuitySettlement) => void;
}

type SeparationType = GratuitySettlement['separationType'];
const SEPARATION_TYPES: SeparationType[] = ['Resignation', 'Termination', 'Retirement', 'Death', 'Redundancy'];

const STATUS_COLORS: Record<GratuitySettlement['status'], string> = {
  'Pending': 'amber', 'Processed': 'blue', 'Paid': 'emerald'
};
const SEP_COLORS: Record<SeparationType, string> = {
  'Resignation': 'amber', 'Termination': 'rose', 'Retirement': 'blue', 'Death': 'slate', 'Redundancy': 'violet'
};

function PKR(n: number) { return 'PKR ' + n.toLocaleString('en-PK', { maximumFractionDigits: 0 }); }

function computeYears(joiningDate: string, lastWorkingDate: string) {
  const from = new Date(joiningDate);
  const to = new Date(lastWorkingDate);
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 365.25));
}

function computeGratuityAmount(basicSalary: number, yearsOfService: number, daysPerYear: number) {
  // Pakistan formula: (basic / 26) * daysPerYear * years
  return (basicSalary / 26) * daysPerYear * yearsOfService;
}

export function GratuityModule({ settlements, employees, statConfig, canManage, onAddSettlement, onUpdateSettlement }: GratuityModuleProps) {
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
  const dailyRate = basicSalary / 26;

  const gratuityAmount = useMemo(() => {
    // Only eligible after completing 1+ year; reduced for resignation < 5 years per SECP rules
    if (yearsOfService < 1) return 0;
    const raw = computeGratuityAmount(basicSalary, yearsOfService, statConfig.gratuityRateDaysPerYear);
    if (calcForm.separationType === 'Resignation' && yearsOfService < 5) return raw * 0.5;
    return raw;
  }, [basicSalary, yearsOfService, statConfig.gratuityRateDaysPerYear, calcForm.separationType]);

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
      notes: calcForm.notes
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
          <h2 className="text-lg font-bold text-white">Gratuity & Terminal Settlement</h2>
          <p className="text-xs text-slate-400 mt-0.5">Calculate and process employee final settlements including gratuity, leave encashment, and notice pay</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCalc(true)}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
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
          <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-2xl p-4`}>
            <div className={`text-xl font-bold text-${color}-400`}>{val}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Settlements Table */}
      {settlements.length > 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-700">
              <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
                {['Employee', 'Separation', 'Last Day', 'Service', 'Gratuity', 'Leave Enc.', 'Notice', 'Total', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {settlements.map(s => {
                const sepColor = SEP_COLORS[s.separationType];
                const statusColor = STATUS_COLORS[s.status];
                return (
                  <tr key={s.id} className="hover:bg-slate-700/20 transition">
                    <td className="px-4 py-3 text-white font-medium">{getEmpName(s.employeeId)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${sepColor}-500/20 text-${sepColor}-300 border border-${sepColor}-500/30`}>
                        {s.separationType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{s.lastWorkingDate}</td>
                    <td className="px-4 py-3 text-slate-300">{s.yearsOfService}y</td>
                    <td className="px-4 py-3 text-emerald-400">{PKR(s.gratuityAmount)}</td>
                    <td className="px-4 py-3 text-blue-400">{PKR(s.leaveEncashmentAmount)}</td>
                    <td className="px-4 py-3 text-violet-400">{PKR(s.noticePayAmount)}</td>
                    <td className="px-4 py-3 font-bold text-white">{PKR(s.totalSettlementAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${statusColor}-500/20 text-${statusColor}-300 border border-${statusColor}-500/30`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && s.status !== 'Paid' && (
                        <div className="flex gap-1">
                          {s.status === 'Pending' && (
                            <button onClick={() => onUpdateSettlement({ ...s, status: 'Processed' })}
                              className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg hover:bg-blue-500/20 transition">Process</button>
                          )}
                          {s.status === 'Processed' && (
                            <button onClick={() => onUpdateSettlement({ ...s, status: 'Paid', paidDate: new Date().toISOString().split('T')[0] })}
                              className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition">Mark Paid</button>
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
        <div className="text-center py-12 text-slate-500 text-sm bg-slate-800/20 border border-slate-700/30 rounded-2xl">
          No settlements processed yet. Use "New Settlement" to calculate gratuity.
        </div>
      )}

      {/* Settlement Calculator Modal */}
      <AnimatePresence>
        {showCalc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 space-y-5 my-8">
              <div className="flex justify-between items-start">
                <h3 className="text-base font-bold text-white">Terminal Settlement Calculator</h3>
                <button onClick={() => setShowCalc(false)} className="text-slate-500 hover:text-white transition" aria-label="Close calculator"><X size={18} /></button>
              </div>

              {/* Input Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Employee *</label>
                  <select value={calcForm.employeeId} onChange={e => setCalcForm(p => ({ ...p, employeeId: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {employees.filter(e => e.status === 'Active').map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Separation Type</label>
                  <select value={calcForm.separationType} onChange={e => setCalcForm(p => ({ ...p, separationType: e.target.value as SeparationType }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                    {SEPARATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Last Working Date</label>
                  <input type="date" value={calcForm.lastWorkingDate}
                    onChange={e => setCalcForm(p => ({ ...p, lastWorkingDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                </div>
                <div className="flex flex-col justify-end">
                  {selectedEmp && (
                    <div className="bg-slate-800/60 rounded-xl px-3 py-2 text-xs">
                      <div className="text-slate-500">Joining Date: <span className="text-white">{selectedEmp.dateOfJoining}</span></div>
                      <div className="text-slate-500">Basic Salary: <span className="text-emerald-400 font-bold">{PKR(basicSalary)}</span></div>
                      <div className="text-slate-500">Service: <span className={`font-bold ${yearsOfService >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>{yearsOfService} year{yearsOfService !== 1 ? 's' : ''}</span>
                        {yearsOfService < 1 && <span className="text-rose-400 ml-1">(Minimum 1 year required)</span>}
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
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</label>
                    <input type="number" min="0" value={(calcForm as any)[key]}
                      onChange={e => setCalcForm(p => ({ ...p, [key]: Number(e.target.value) }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</label>
                  <input value={calcForm.notes} onChange={e => setCalcForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Settlement notes..."
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                </div>
              </div>

              {/* Calculation Preview */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Settlement Breakdown</h4>
                {[
                  { label: `Gratuity (${yearsOfService} yrs × ${statConfig.gratuityRateDaysPerYear} days × Daily Rate${calcForm.separationType === 'Resignation' && yearsOfService < 5 ? ' × 50%' : ''})`, amount: gratuityAmount, color: 'emerald' },
                  { label: `Leave Encashment (${calcForm.encashableLeaveDays} days × ${PKR(Math.round(dailyRate))}/day)`, amount: leaveEncashmentAmount, color: 'blue' },
                  { label: `Notice Pay (${calcForm.noticePayDays} days × ${PKR(Math.round(dailyRate))}/day)`, amount: noticePayAmount, color: 'violet' },
                  { label: `Pending Salary (${calcForm.pendingSalaryDays} days × ${PKR(Math.round(dailyRate))}/day)`, amount: pendingSalaryAmount, color: 'amber' }
                ].map(({ label, amount, color }) => (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-700/50 last:border-0 text-sm">
                    <span className="text-slate-400 text-xs">{label}</span>
                    <span className={`font-bold text-${color}-400`}>{PKR(amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-slate-600">
                  <span className="text-white font-bold">Total Settlement Amount</span>
                  <span className="text-2xl font-bold text-white">{PKR(totalSettlementAmount)}</span>
                </div>
                {calcForm.separationType === 'Resignation' && yearsOfService < 5 && yearsOfService >= 1 && (
                  <div className="text-[10px] text-amber-400 mt-1">* Gratuity reduced to 50% for resignation with less than 5 years of service (per SECP guidelines)</div>
                )}
                {yearsOfService < 1 && (
                  <div className="text-[10px] text-rose-400 mt-1">* Employee is not eligible for gratuity (minimum 1 complete year of service required)</div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowCalc(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleSave} disabled={!selectedEmp}
                  className="flex-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition">
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
