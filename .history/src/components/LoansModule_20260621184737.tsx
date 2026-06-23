/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { LoanAdvance, Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface LoansModuleProps {
  loanAdvances: LoanAdvance[];
  employees: Employee[];
  currentUserEmployeeId?: string;
  canApprove: boolean;
  onApplyLoan: (loan: LoanAdvance) => void;
  onApproveLoan: (id: string) => void;
  onRejectLoan: (id: string) => void;
}

const statusColors: Record<string, string> = {
  Pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  Approved: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Active: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Closed: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Rejected: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
};

export function LoansModule({
  loanAdvances, employees, currentUserEmployeeId, canApprove,
  onApplyLoan, onApproveLoan, onRejectLoan
}: LoansModuleProps) {
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterEmpId, setFilterEmpId] = useState<string>('All');

  const [form, setForm] = useState({
    employeeId: currentUserEmployeeId || employees[0]?.id || '',
    type: 'Advance' as LoanAdvance['type'],
    principalAmount: 25000,
    totalInstallments: 2,
    reason: ''
  });

  const handleApply = () => {
    if (!form.employeeId || !form.reason.trim() || form.principalAmount <= 0) return;
    const installment = Math.ceil(form.principalAmount / form.totalInstallments);
    const loan: LoanAdvance = {
      id: `loan-${Date.now()}`,
      employeeId: form.employeeId,
      type: form.type,
      principalAmount: form.principalAmount,
      approvedAmount: 0,
      disbursedDate: '',
      totalInstallments: form.totalInstallments,
      remainingInstallments: form.totalInstallments,
      monthlyInstallment: installment,
      totalRepaid: 0,
      reason: form.reason.trim(),
      status: 'Pending',
      appliedOn: new Date().toISOString().split('T')[0]
    };
    onApplyLoan(loan);
    setShowApplyForm(false);
    setForm(p => ({ ...p, reason: '', principalAmount: 25000, totalInstallments: 2 }));
  };

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.fullName || 'Unknown Employee';

  const filtered = loanAdvances.filter(l => {
    const statusMatch = filterStatus === 'All' || l.status === filterStatus;
    const empMatch = filterEmpId === 'All' || l.employeeId === filterEmpId;
    return statusMatch && empMatch;
  }).sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));

  const totalActive = loanAdvances.filter(l => l.status === 'Active').length;
  const totalPending = loanAdvances.filter(l => l.status === 'Pending').length;
  const totalOutstanding = loanAdvances
    .filter(l => l.status === 'Active')
    .reduce((sum, l) => sum + (l.principalAmount - l.totalRepaid), 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Loans & Salary Advances</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage employee salary advances and loans with auto installment deductions</p>
        </div>
        <button onClick={() => setShowApplyForm(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
          <Plus size={14} /> Apply for Loan/Advance
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <div className="text-xl mb-1">⏳</div>
          <div className="text-2xl font-bold text-amber-400">{totalPending}</div>
          <div className="text-xs text-slate-400">Pending Approval</div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <div className="text-xl mb-1">✅</div>
          <div className="text-2xl font-bold text-emerald-400">{totalActive}</div>
          <div className="text-xs text-slate-400">Active Loans</div>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
          <div className="text-xl mb-1">💰</div>
          <div className="text-2xl font-bold text-rose-400">PKR {(totalOutstanding / 1000).toFixed(0)}K</div>
          <div className="text-xs text-slate-400">Total Outstanding</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)}
          aria-label="Filter loans by employee"
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="All">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>
        <div className="flex gap-1">
          {['All', 'Pending', 'Active', 'Closed', 'Rejected'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-xs font-bold px-3 py-2 rounded-xl transition ${filterStatus === s ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Loan Records */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No loan records found.</div>
        ) : (
          filtered.map(loan => {
            const repaidPct = loan.principalAmount > 0 ? (loan.totalRepaid / loan.principalAmount) * 100 : 0;
            const emp = employees.find(e => e.id === loan.employeeId);
            return (
              <div key={loan.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {emp?.pictureUrl ? (
                      <img src={emp.pictureUrl} alt="" className="w-9 h-9 rounded-xl object-cover" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center text-slate-400 text-sm font-bold">
                        {getEmployeeName(loan.employeeId).charAt(0)}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{getEmployeeName(loan.employeeId)}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${statusColors[loan.status]}`}>
                          {loan.status}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-slate-600 text-slate-400">
                          {loan.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{loan.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-white">PKR {loan.principalAmount.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500">Applied {loan.appliedOn}</div>
                  </div>
                </div>

                {/* Progress bar for active/closed loans */}
                {(loan.status === 'Active' || loan.status === 'Closed') && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Repaid: PKR {loan.totalRepaid.toLocaleString()}</span>
                      <span>Remaining: {loan.remainingInstallments}/{loan.totalInstallments} installments</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, repaidPct)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Monthly deduction: PKR {loan.monthlyInstallment.toLocaleString()} • {Math.round(repaidPct)}% repaid
                    </div>
                  </div>
                )}

                {/* Approve/Reject for pending loans */}
                {loan.status === 'Pending' && canApprove && (
                  <div className="mt-3 flex gap-2 pt-3 border-t border-slate-700/50">
                    <div className="text-xs text-slate-400 flex-1">
                      Monthly installment: PKR {loan.monthlyInstallment.toLocaleString()} over {loan.totalInstallments} months
                    </div>
                    <button onClick={() => onRejectLoan(loan.id)}
                      className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold px-3 py-1.5 rounded-xl transition">
                      <XCircle size={13} /> Reject
                    </button>
                    <button onClick={() => onApproveLoan(loan.id)}
                      className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-3 py-1.5 rounded-xl transition">
                      <CheckCircle size={13} /> Approve & Disburse
                    </button>
                  </div>
                )}

                {loan.approvedBy && (
                  <div className="mt-2 text-[10px] text-slate-500">
                    {loan.status === 'Rejected' ? 'Rejected' : 'Approved'} by {loan.approvedBy} on {loan.approvedOn}
                    {loan.disbursedDate && ` • Disbursed ${loan.disbursedDate}`}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Apply Loan/Advance Modal */}
      <AnimatePresence>
        {showApplyForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-white">Apply for Loan / Advance</h3>

              <div className="space-y-3">
                <div>
                  <label htmlFor="loan-employee" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Employee</label>
                  <select id="loan-employee" value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {employees.filter(e => e.status === 'Active').map(e => (
                      <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="loan-type" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                    <select id="loan-type" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as LoanAdvance['type'] }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="Advance">Salary Advance</option>
                      <option value="Loan">Loan</option>
                    </select>
                  </div>
                <div>
                  <label htmlFor="loan-amount" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Amount (PKR)</label>
                  <input id="loan-amount" type="number" min="1000" step="1000" value={form.principalAmount}
                      onChange={e => setForm(p => ({ ...p, principalAmount: Number(e.target.value) }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Repayment Installments: {form.totalInstallments} months
                  </label>
                  <input type="range" min="1" max="24" value={form.totalInstallments}
                    onChange={e => setForm(p => ({ ...p, totalInstallments: Number(e.target.value) }))}
                    className="w-full accent-emerald-500" />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>1 month</span>
                    <span className="text-emerald-400 font-bold">
                      PKR {Math.ceil(form.principalAmount / form.totalInstallments).toLocaleString()}/month
                    </span>
                    <span>24 months</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="loan-reason" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reason *</label>
                  <textarea id="loan-reason" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                    rows={3} placeholder="State the purpose of this loan/advance request..."
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
                  <strong>Note:</strong> Upon approval, PKR {Math.ceil(form.principalAmount / form.totalInstallments).toLocaleString()} will be automatically deducted from the employee's monthly payslip for {form.totalInstallments} month{form.totalInstallments !== 1 ? 's' : ''}.
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowApplyForm(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  Cancel
                </button>
                <button onClick={handleApply} disabled={!form.reason.trim() || form.principalAmount <= 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  Submit Application
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
