import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Employee, PayrollRun, Payslip } from '../types';

interface Props {
  run: PayrollRun;
  payslips: Payslip[];
  employees: Employee[];
  onClose: () => void;
  onMarkFailed: (payslipId: string, reason: string) => void;
  onRecordRetry: (payslipIds: string[], reference: string) => void;
}

const csvCell = (value: string | number | undefined) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function PaymentExceptionsModal({ run, payslips, employees, onClose, onMarkFailed, onRecordRetry }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const sheets = payslips.filter(item => item.payrollRunId === run.id).sort((a, b) => (a.employeeCode || '').localeCompare(b.employeeCode || ''));
  const failed = sheets.filter(item => item.paymentStatus === 'Failed');
  const employee = (id: string) => employees.find(item => item.id === id);
  const retryAdvice = () => {
    const rows = failed.filter(item => selected.includes(item.id)).map(item => {
      const person = employee(item.employeeId);
      return [item.employeeCode, item.employeeName, person?.bankName, (person?.iban || '').replace(/\s/g, ''), person?.bankAccountNumber, item.netSalary, item.paymentFailureReason];
    });
    if (!rows.length) { alert('Select failed payments to include in the retry advice.'); return; }
    const csv = [['Employee Code', 'Employee Name', 'Bank', 'IBAN', 'Account Number', 'Net Salary PKR', 'Previous Failure'], ...rows, ['TOTAL', '', '', '', '', rows.reduce((sum, row) => sum + Number(row[5] || 0), 0), '']]
      .map(row => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `payment-retry-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div><h2 className="font-bold text-slate-900">Payment exceptions — {run.title}</h2><p className="text-xs text-slate-500">Mark bank returns, correct the employee's bank details, then pay the retry batch.</p></div>
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          <table className="w-full">
            <thead><tr className="text-left text-slate-500"><th className="p-1"></th><th className="p-1">Employee</th><th className="p-1">Net PKR</th><th className="p-1">Status</th><th className="p-1"></th></tr></thead>
            <tbody>{sheets.map(item => <tr key={item.id} className="border-t border-slate-100">
              <td className="p-1">{item.paymentStatus === 'Failed' && <input type="checkbox" aria-label={`Select ${item.employeeName}`} checked={selected.includes(item.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} />}</td>
              <td className="p-1">{item.employeeName} <span className="text-slate-400">({item.employeeCode})</span></td>
              <td className="p-1 font-mono">{item.netSalary.toLocaleString()}</td>
              <td className={`p-1 font-semibold ${item.paymentStatus === 'Failed' ? 'text-rose-700' : item.paymentStatus === 'Retried' ? 'text-indigo-700' : 'text-emerald-700'}`}>
                {item.paymentStatus || 'Paid'}{item.paymentFailureReason ? ` — ${item.paymentFailureReason}` : ''}{item.paymentRetryReference ? ` (ref ${item.paymentRetryReference})` : ''}
              </td>
              <td className="p-1 text-right">{(!item.paymentStatus || item.paymentStatus === 'Paid') && <button type="button" onClick={() => { const reason = window.prompt(`Bank return reason for ${item.employeeName}:`)?.trim(); if (reason) onMarkFailed(item.id, reason); }} className="font-semibold text-rose-700 hover:underline">Mark failed</button>}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-xs">
          <span className="text-slate-500">{failed.length} failed · {selected.length} selected</span>
          <div className="flex gap-2">
            <button type="button" onClick={retryAdvice} className="rounded border border-slate-300 px-3 py-2 font-semibold text-slate-700">Download retry advice</button>
            <button type="button" disabled={!selected.length} onClick={() => { const reference = window.prompt('Bank reference for the retry payment:')?.trim(); if (reference) { onRecordRetry(selected, reference); setSelected([]); } }} className="rounded bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-40">Record retry paid</button>
          </div>
        </div>
      </div>
    </div>
  );
}
