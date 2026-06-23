/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, TrendingUp, ArrowUpRight } from 'lucide-react';
import { SalaryRevision, Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface SalaryRevisionModuleProps {
  salaryRevisions: SalaryRevision[];
  employees: Employee[];
  currentUserAccount: { username: string };
  onAddSalaryRevision: (revision: SalaryRevision) => void;
}

const revisionTypeColors: Record<string, string> = {
  'Annual Increment': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'Promotion': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Adjustment': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Market Correction': 'bg-purple-500/20 text-purple-300 border-purple-500/30'
};

export function SalaryRevisionModule({ salaryRevisions, employees, currentUserAccount, onAddSalaryRevision }: SalaryRevisionModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [filterEmpId, setFilterEmpId] = useState<string>('All');

  const [form, setForm] = useState({
    employeeId: employees[0]?.id || '',
    newSalary: 0,
    effectiveDate: new Date().toISOString().split('T')[0],
    reason: '',
    type: 'Annual Increment' as SalaryRevision['type']
  });

  const selectedEmp = employees.find(e => e.id === form.employeeId);
  const previousSalary = selectedEmp?.basicSalary || 0;
  const incrementAmount = form.newSalary - previousSalary;
  const incrementPct = previousSalary > 0 ? (incrementAmount / previousSalary) * 100 : 0;

  const handleSave = () => {
    if (!form.employeeId || form.newSalary <= 0 || !form.reason.trim()) return;
    const revision: SalaryRevision = {
      id: `rev-${Date.now()}`,
      employeeId: form.employeeId,
      previousSalary,
      newSalary: form.newSalary,
      incrementAmount,
      incrementPercentage: parseFloat(incrementPct.toFixed(2)),
      effectiveDate: form.effectiveDate,
      reason: form.reason.trim(),
      approvedBy: currentUserAccount.username,
      approvedOn: new Date().toISOString().split('T')[0],
      type: form.type
    };
    onAddSalaryRevision(revision);
    setShowForm(false);
    setForm(p => ({ ...p, reason: '', newSalary: 0 }));
  };

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.fullName || 'Unknown';

  const filtered = salaryRevisions
    .filter(r => filterEmpId === 'All' || r.employeeId === filterEmpId)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

  const totalRevisionsThisYear = salaryRevisions.filter(r => r.effectiveDate.startsWith('2026')).length;
  const avgIncrement = salaryRevisions.length > 0
    ? salaryRevisions.reduce((sum, r) => sum + r.incrementPercentage, 0) / salaryRevisions.length
    : 0;
  const highestIncrement = salaryRevisions.reduce((max, r) => r.incrementPercentage > max ? r.incrementPercentage : max, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Salary Revisions & Increments</h2>
          <p className="text-xs text-slate-400 mt-0.5">Track salary changes, promotions, and increment history for all employees</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
          <Plus size={14} /> Process Increment
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <div className="text-xl mb-1">📈</div>
          <div className="text-2xl font-bold text-emerald-400">{totalRevisionsThisYear}</div>
          <div className="text-xs text-slate-400">Revisions in 2026</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
          <div className="text-xl mb-1">📊</div>
          <div className="text-2xl font-bold text-blue-400">{avgIncrement.toFixed(1)}%</div>
          <div className="text-xs text-slate-400">Avg Increment</div>
        </div>
        <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
          <div className="text-xl mb-1">🏆</div>
          <div className="text-2xl font-bold text-purple-400">{highestIncrement.toFixed(1)}%</div>
          <div className="text-xs text-slate-400">Highest Increment</div>
        </div>
      </div>

      {/* Current Salaries Summary */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Current Salary Register</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 text-left border-b border-slate-700">
                <th className="pb-2 pr-4">Employee</th>
                <th className="pb-2 pr-4">Designation</th>
                <th className="pb-2 pr-4 text-right">Current Salary</th>
                <th className="pb-2 pr-4 text-right">Last Revision</th>
                <th className="pb-2 text-right">% Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {employees.filter(e => e.status === 'Active').map(emp => {
                const lastRevision = salaryRevisions
                  .filter(r => r.employeeId === emp.id)
                  .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
                return (
                  <tr key={emp.id} className="hover:bg-slate-700/20 transition">
                    <td className="py-2 pr-4">
                      <div className="font-semibold text-white">{emp.fullName}</div>
                      <div className="text-slate-500">{emp.employeeCode}</div>
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{emp.wageType}</td>
                    <td className="py-2 pr-4 text-right font-bold text-white">
                      PKR {emp.basicSalary.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-400">
                      {lastRevision ? lastRevision.effectiveDate : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {lastRevision ? (
                        <span className={`font-bold ${lastRevision.incrementPercentage >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          +{lastRevision.incrementPercentage.toFixed(1)}%
                        </span>
                      ) : <span className="text-slate-500">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)}
          aria-label="Filter salary revisions by employee"
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="All">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>
      </div>

      {/* Revision History */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Revision History</h3>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No salary revisions on record.</div>
        ) : (
          filtered.map(revision => (
            <div key={revision.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                    <TrendingUp size={16} className="text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{getEmployeeName(revision.employeeId)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${revisionTypeColors[revision.type]}`}>
                        {revision.type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{revision.reason}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-base font-bold text-white">PKR {revision.newSalary.toLocaleString()}</span>
                    <ArrowUpRight size={14} className="text-emerald-400" />
                  </div>
                  <div className="text-xs text-slate-400">from PKR {revision.previousSalary.toLocaleString()}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>Effective: <span className="text-slate-300 font-semibold">{revision.effectiveDate}</span></span>
                  <span>Approved by: <span className="text-slate-300">{revision.approvedBy}</span></span>
                  <span>On: <span className="text-slate-300">{revision.approvedOn}</span></span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-400">+{revision.incrementPercentage.toFixed(1)}%</span>
                  <span className="text-xs text-slate-500 ml-2">(+PKR {revision.incrementAmount.toLocaleString()})</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Revision Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-white">Process Salary Revision</h3>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Employee *</label>
                    <select value={form.employeeId}
                      aria-label="Employee"
                      onChange={e => setForm(p => ({ ...p, employeeId: e.target.value, newSalary: 0 }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {employees.filter(e => e.status === 'Active').map(e => (
                        <option key={e.id} value={e.id}>{e.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Revision Type</label>
                    <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as SalaryRevision['type'] }))}
                      aria-label="Revision Type"
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {(['Annual Increment', 'Promotion', 'Adjustment', 'Market Correction'] as SalaryRevision['type'][]).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedEmp && (
                  <div className="bg-slate-800/60 rounded-xl p-3 text-xs text-slate-300">
                    <span className="text-slate-400">Current salary: </span>
                    <span className="font-bold text-white">PKR {previousSalary.toLocaleString()}</span>
                    <span className="text-slate-400"> • Joined: </span>
                    <span>{selectedEmp.dateOfJoining}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">New Salary (PKR) *</label>
                    <input type="number" min={previousSalary} step="1000" value={form.newSalary || ''}
                      aria-label="New Salary (PKR)"
                      onChange={e => setForm(p => ({ ...p, newSalary: Number(e.target.value) }))}
                      placeholder={`Min PKR ${previousSalary.toLocaleString()}`}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Effective Date</label>
                    <input type="date" value={form.effectiveDate}
                      aria-label="Effective Date"
                      onChange={e => setForm(p => ({ ...p, effectiveDate: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                {form.newSalary > 0 && (
                  <div className={`rounded-xl p-3 text-xs border ${incrementAmount >= 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'}`}>
                    <strong>Preview:</strong> Increment of PKR {Math.abs(incrementAmount).toLocaleString()} ({incrementPct >= 0 ? '+' : ''}{incrementPct.toFixed(1)}%) from PKR {previousSalary.toLocaleString()} → PKR {form.newSalary.toLocaleString()}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reason / Notes *</label>
                  <textarea aria-label="Reason / Notes" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                    rows={3} placeholder="Justification for this salary revision..."
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  Cancel
                </button>
                <button onClick={handleSave}
                  disabled={!form.newSalary || form.newSalary <= 0 || !form.reason.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  Apply Revision & Update Salary
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
