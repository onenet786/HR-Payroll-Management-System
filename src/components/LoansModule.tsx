/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import { LoanAdvance, Employee } from '../types';
import { empAvatarUrl } from '../utils/avatar';
import { RequiredMark, RequiredNote } from './RequiredMark';
import { motion, AnimatePresence } from 'motion/react';
import ListSearch from './ListSearch';
import { matchesSearch } from '../data/listSearch';

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
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Approved: 'bg-blue-50 text-blue-700 border-blue-200',
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Closed: 'bg-slate-500/20 text-slate-500 border-slate-500/30',
  Rejected: 'bg-rose-50 text-rose-700 border-rose-200'
};

export function LoansModule({
  loanAdvances, employees, currentUserEmployeeId, canApprove,
  onApplyLoan, onApproveLoan, onRejectLoan
}: LoansModuleProps) {
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterEmpId, setFilterEmpId] = useState<string>('All');
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    employeeId: currentUserEmployeeId || '',
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
    const emp = employees.find(e => e.id === l.employeeId);
    return statusMatch && empMatch && matchesSearch(search, emp?.fullName, emp?.employeeCode, emp?.cnic, l.type, l.status, l.reason, l.appliedOn, l.principalAmount);
  }).sort((a, b) => (b.appliedOn || '').localeCompare(a.appliedOn || ''));

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
          <h2 className="text-lg font-bold text-slate-900">Loans & Salary Advances</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage employee salary advances and loans with auto installment deductions</p>
        </div>
        <button onClick={() => setShowApplyForm(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
          <Plus size={14} /> Apply for Loan/Advance
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="text-xl mb-1">⏳</div>
          <div className="text-2xl font-bold text-amber-700">{totalPending}</div>
          <div className="text-xs text-slate-500">Pending Approval</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="text-xl mb-1">✅</div>
          <div className="text-2xl font-bold text-emerald-700">{totalActive}</div>
          <div className="text-xs text-slate-500">Active Loans</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <div className="text-xl mb-1">💰</div>
          <div className="text-2xl font-bold text-rose-700">PKR {(totalOutstanding / 1000).toFixed(0)}K</div>
          <div className="text-xs text-slate-500">Total Outstanding</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <ListSearch value={search} onChange={setSearch} placeholder="Search employee, code, type, reason…" total={loanAdvances.length} shown={filtered.length} />
        <select value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)}
          aria-label="Filter loans by employee"
          className="bg-white border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="All">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </select>
        <div className="flex gap-1">
          {['All', 'Pending', 'Active', 'Closed', 'Rejected'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-xs font-bold px-3 py-2 rounded-xl transition ${filterStatus === s ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Loan Records */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">{search.trim() ? `No loan records match “${search.trim()}”.` : 'No loan records found.'}</div>
        ) : (
          filtered.map(loan => {
            const repaidPct = loan.principalAmount > 0 ? (loan.totalRepaid / loan.principalAmount) * 100 : 0;
            const emp = employees.find(e => e.id === loan.employeeId);
            return (
              <div key={loan.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <img src={empAvatarUrl(emp)} alt="" className="w-9 h-9 rounded-xl object-cover" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{getEmployeeName(loan.employeeId)}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${statusColors[loan.status]}`}>
                          {loan.status}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-slate-300 text-slate-500">
                          {loan.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{loan.reason}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-slate-900">PKR {loan.principalAmount.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500">Applied {loan.appliedOn}</div>
                  </div>
                </div>

                {/* Progress bar for active/closed loans */}
                {(loan.status === 'Active' || loan.status === 'Closed') && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>Repaid: PKR {loan.totalRepaid.toLocaleString()}</span>
                      <span>Remaining: {loan.remainingInstallments}/{loan.totalInstallments} installments</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, repaidPct)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Monthly deduction: PKR {loan.monthlyInstallment.toLocaleString()} • {Math.round(repaidPct)}% repaid
                    </div>
                  </div>
                )}

                {/* Approve/Reject for pending loans */}
                {loan.status === 'Pending' && canApprove && (
                  <div className="mt-3 flex gap-2 pt-3 border-t border-slate-200">
                    <div className="text-xs text-slate-500 flex-1">
                      Monthly installment: PKR {loan.monthlyInstallment.toLocaleString()} over {loan.totalInstallments} months
                    </div>
                    <button onClick={() => onRejectLoan(loan.id)}
                      className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-500/20 border border-rose-200 text-rose-700 text-xs font-bold px-3 py-1.5 rounded-xl transition">
                      <XCircle size={13} /> Reject
                    </button>
                    <button onClick={() => onApproveLoan(loan.id)}
                      className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-500/20 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-xl transition">
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
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900">Apply for Loan / Advance</h3>
              <RequiredNote />

              <div className="space-y-3">
                <div>
                  <label htmlFor="loan-employee" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Employee<RequiredMark /></label>
                  <select id="loan-employee" aria-required="true" value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">Select employee</option>
                    {employees.filter(e => e.status === 'Active').map(e => (
                      <option key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="loan-type" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Type</label>
                    <select id="loan-type" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as LoanAdvance['type'] }))}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="Advance">Salary Advance</option>
                      <option value="Loan">Loan</option>
                    </select>
                  </div>
                <div>
                  <label htmlFor="loan-amount" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Amount (PKR)<RequiredMark /></label>
                  <input id="loan-amount" aria-required="true" type="number" min="1000" step="1000" value={form.principalAmount}
                      onChange={e => setForm(p => ({ ...p, principalAmount: Number(e.target.value) }))}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                <div>
                  <label htmlFor="loan-installments" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                    Repayment Installments: {form.totalInstallments} months
                  </label>
                  <input id="loan-installments" type="range" min="1" max="24" value={form.totalInstallments}
                    onChange={e => setForm(p => ({ ...p, totalInstallments: Number(e.target.value) }))}
                    className="w-full accent-emerald-500" />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>1 month</span>
                    <span className="text-emerald-700 font-bold">
                      PKR {Math.ceil(form.principalAmount / form.totalInstallments).toLocaleString()}/month
                    </span>
                    <span>24 months</span>
                  </div>
                </div>

                <div>
                  <label htmlFor="loan-reason" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Reason<RequiredMark /></label>
                  <textarea id="loan-reason" aria-required="true" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                    rows={3} placeholder="State the purpose of this loan/advance request..."
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                  <strong>Note:</strong> Upon approval, PKR {Math.ceil(form.principalAmount / form.totalInstallments).toLocaleString()} will be automatically deducted from the employee's monthly payslip for {form.totalInstallments} month{form.totalInstallments !== 1 ? 's' : ''}.
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowApplyForm(false)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold py-2.5 rounded-xl transition">
                  Cancel
                </button>
                <button onClick={handleApply} disabled={!form.employeeId || !form.reason.trim() || form.principalAmount <= 0}
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
