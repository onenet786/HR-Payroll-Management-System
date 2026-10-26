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
  onMarkPaid: (payslipIds: string[], reference: string) => void;
  onMarkUnpaid: (payslipId: string) => void;
  /** Bank payroll edition: bank returns (Failed / Retried) are handled here too. */
  bankPayroll?: boolean;
  /** Company option: Unpaid / Paid register. Off = the standard payment-exceptions window (bank returns and retries only). */
  salaryRegister?: boolean;
}

const csvCell = (value: string | number | undefined) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const isUnpaid = (item: Payslip) => !item.paymentStatus || item.paymentStatus === 'Unpaid';

/** The standard window (default): mark bank returns on a disbursed run and record the retry batch. */
function StandardPaymentExceptions({ run, sheets, employees, onClose, onMarkFailed, onRecordRetry }: { run: PayrollRun; sheets: Payslip[]; employees: Employee[]; onClose: () => void; onMarkFailed: Props['onMarkFailed']; onRecordRetry: Props['onRecordRetry'] }) {
  const [selected, setSelected] = useState<string[]>([]);
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
                {item.paymentStatus === 'Unpaid' ? 'Paid' : item.paymentStatus || 'Paid'}{item.paymentFailureReason ? ` — ${item.paymentFailureReason}` : ''}{item.paymentRetryReference ? ` (ref ${item.paymentRetryReference})` : ''}
              </td>
              <td className="p-1 text-right">{(!item.paymentStatus || item.paymentStatus === 'Paid' || item.paymentStatus === 'Unpaid') && <button type="button" onClick={() => { const reason = window.prompt(`Bank return reason for ${item.employeeName}:`)?.trim(); if (reason) onMarkFailed(item.id, reason); }} className="font-semibold text-rose-700 hover:underline">Mark failed</button>}</td>
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

/**
 * Salary payment register for one payroll run: every payslip is Unpaid until HR marks it Paid (hand-over / cash
 * payroll), and a bank payroll can additionally record bank returns and retries once the run is disbursed.
 */
export function PaymentExceptionsModal({ run, payslips, employees, onClose, onMarkFailed, onRecordRetry, onMarkPaid, onMarkUnpaid, bankPayroll = true, salaryRegister = false }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<'Unpaid' | 'Paid'>('Unpaid');
  const sheets = payslips.filter(item => item.payrollRunId === run.id).sort((a, b) => (a.employeeCode || '').localeCompare(b.employeeCode || ''));
  if (!salaryRegister) return <StandardPaymentExceptions run={run} sheets={sheets} employees={employees} onClose={onClose} onMarkFailed={onMarkFailed} onRecordRetry={onRecordRetry} />;
  const unpaid = sheets.filter(isUnpaid);
  const paid = sheets.filter(item => !isUnpaid(item));
  const failed = sheets.filter(item => item.paymentStatus === 'Failed');
  const visible = tab === 'Unpaid' ? unpaid : paid;
  const employee = (id: string) => employees.find(item => item.id === id);
  const selectedUnpaid = selected.filter(id => unpaid.some(item => item.id === id));
  const selectedFailed = selected.filter(id => failed.some(item => item.id === id));
  const toggle = (id: string, checked: boolean) => setSelected(previous => checked ? [...previous, id] : previous.filter(item => item !== id));
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
  const statusText = (item: Payslip) => {
    if (item.paymentStatus === 'Failed') return `Bank return${item.paymentFailureReason ? ` — ${item.paymentFailureReason}` : ''}`;
    if (item.paymentStatus === 'Retried') return `Retried${item.paymentRetryReference ? ` (ref ${item.paymentRetryReference})` : ''}`;
    if (item.paymentStatus === 'Paid') return `Paid${item.paidAt ? ` ${new Date(item.paidAt).toLocaleDateString('en-PK')}` : ''}${item.paidBy ? ` by ${item.paidBy}` : ''}${item.paymentReference ? ` (ref ${item.paymentReference})` : ''}`;
    return 'Unpaid — salary on hold';
  };
  const total = (items: Payslip[]) => items.reduce((sum, item) => sum + (item.netSalary || 0), 0);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b p-4">
          <div><h2 className="font-bold text-slate-900">Salary payments — {run.title}</h2><p className="text-xs text-slate-500">Salaries stay in Unpaid until each one is handed over and marked Paid.{bankPayroll && run.status === 'Disbursed' ? ' Bank returns can be marked failed and paid again as a retry batch.' : ''}</p></div>
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>
        <div role="tablist" className="flex gap-1 border-b px-4 pt-2 text-xs">
          {(['Unpaid', 'Paid'] as const).map(item => (
            <button key={item} role="tab" aria-selected={tab === item} type="button" onClick={() => { setTab(item); setSelected([]); }} className={`rounded-t-lg border-b-2 px-4 py-2 font-bold ${tab === item ? (item === 'Unpaid' ? 'border-amber-500 text-amber-700' : 'border-emerald-600 text-emerald-700') : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {item} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">{item === 'Unpaid' ? unpaid.length : paid.length}</span>
            </button>
          ))}
          <span className="ml-auto self-center font-mono text-[11px] text-slate-500">{tab} total PKR {total(visible).toLocaleString()}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          <table className="w-full">
            <thead><tr className="text-left text-slate-500"><th className="p-1"><input type="checkbox" aria-label="Select all" checked={visible.length > 0 && visible.every(item => selected.includes(item.id))} onChange={event => setSelected(event.target.checked ? visible.filter(item => isUnpaid(item) || item.paymentStatus === 'Failed').map(item => item.id) : [])} /></th><th className="p-1">Employee</th><th className="p-1">Bank / account</th><th className="p-1 text-right">Net PKR</th><th className="p-1">Status</th><th className="p-1"></th></tr></thead>
            <tbody>{visible.map(item => {
              const person = employee(item.employeeId);
              return <tr key={item.id} className="border-t border-slate-100">
                <td className="p-1">{(isUnpaid(item) || item.paymentStatus === 'Failed') && <input type="checkbox" aria-label={`Select ${item.employeeName}`} checked={selected.includes(item.id)} onChange={event => toggle(item.id, event.target.checked)} />}</td>
                <td className="p-1">{item.employeeName} <span className="text-slate-400">({item.employeeCode})</span></td>
                <td className="p-1 text-slate-500">{person?.bankName || item.bankName || '—'}{person?.bankAccountNumber || item.bankAccountNumber ? ` · ${(person?.bankAccountNumber || item.bankAccountNumber || '').slice(-4).padStart(8, '*')}` : ''}</td>
                <td className="p-1 text-right font-mono">{item.netSalary.toLocaleString()}</td>
                <td className={`p-1 font-semibold ${item.paymentStatus === 'Failed' ? 'text-rose-700' : item.paymentStatus === 'Retried' ? 'text-indigo-700' : item.paymentStatus === 'Paid' ? 'text-emerald-700' : 'text-amber-700'}`}>{statusText(item)}</td>
                <td className="p-1 text-right whitespace-nowrap">
                  {isUnpaid(item) && <button type="button" onClick={() => onMarkPaid([item.id], '')} className="font-semibold text-emerald-700 hover:underline">Mark paid</button>}
                  {item.paymentStatus === 'Paid' && <>
                    <button type="button" onClick={() => { if (window.confirm(`Move ${item.employeeName}'s salary back to Unpaid?`)) onMarkUnpaid(item.id); }} className="font-semibold text-amber-700 hover:underline">Mark unpaid</button>
                    {bankPayroll && run.status === 'Disbursed' && <button type="button" onClick={() => { const reason = window.prompt(`Bank return reason for ${item.employeeName}:`)?.trim(); if (reason) onMarkFailed(item.id, reason); }} className="ml-3 font-semibold text-rose-700 hover:underline">Bank return</button>}
                  </>}
                </td>
              </tr>;
            })}
            {!visible.length && <tr><td colSpan={6} className="p-6 text-center text-slate-400">{tab === 'Unpaid' ? 'Every salary in this run has been paid.' : 'No salary has been marked paid yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4 text-xs">
          <span className="text-slate-500">{unpaid.length} unpaid · {paid.length} paid{failed.length ? ` · ${failed.length} bank returns` : ''} · {selected.length} selected</span>
          <div className="flex flex-wrap gap-2">
            {tab === 'Unpaid' && <button type="button" disabled={!selectedUnpaid.length} onClick={() => { const reference = window.prompt('Payment reference (voucher / transfer no., optional):', '') ?? null; if (reference === null) return; onMarkPaid(selectedUnpaid, reference.trim()); setSelected([]); }} className="rounded bg-emerald-700 px-3 py-2 font-bold text-white disabled:opacity-40">Mark {selectedUnpaid.length || ''} paid</button>}
            {tab === 'Paid' && bankPayroll && run.status === 'Disbursed' && <>
              <button type="button" onClick={retryAdvice} className="rounded border border-slate-300 px-3 py-2 font-semibold text-slate-700">Download retry advice</button>
              <button type="button" disabled={!selectedFailed.length} onClick={() => { const reference = window.prompt('Bank reference for the retry payment:')?.trim(); if (reference) { onRecordRetry(selectedFailed, reference); setSelected([]); } }} className="rounded bg-indigo-700 px-3 py-2 font-bold text-white disabled:opacity-40">Record retry paid</button>
            </>}
          </div>
        </div>
      </div>
    </div>
  );
}
