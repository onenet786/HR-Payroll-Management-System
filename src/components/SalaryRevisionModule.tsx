/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { SearchableSelect } from './SearchableSelect';
import { DateField } from './DateField';
import { RequiredMark, RequiredNote } from './RequiredMark';
import { Plus, TrendingUp, ArrowUpRight, Upload, Download, CheckCheck } from 'lucide-react';
import { planSalarySheet, salarySheetTemplate, type SalarySheetPlan } from '../data/salarySheet';
import { SalaryRevision, Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ListSearch from './ListSearch';
import { matchesSearch } from '../data/listSearch';

interface SalaryRevisionModuleProps {
  salaryRevisions: SalaryRevision[];
  employees: Employee[];
  currentUserAccount: { id: string; username: string };
  /** Resolves false when the revision was not saved (the handler has already told the user why). */
  onAddSalaryRevision: (revision: SalaryRevision) => void | Promise<boolean | void>;
  /** Branch names for the salary sheet template. */
  branches?: Array<{ id: string; name: string }>;
  /** False in the lite edition: the preparer may approve their own revision. */
  makerChecker?: boolean;
}

const revisionTypeColors: Record<string, string> = {
  'Annual Increment': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Promotion': 'bg-blue-50 text-blue-700 border-blue-200',
  'Adjustment': 'bg-amber-50 text-amber-700 border-amber-200',
  'Market Correction': 'bg-indigo-50 text-indigo-700 border-indigo-200'
};

export function SalaryRevisionModule({ salaryRevisions, employees, currentUserAccount, onAddSalaryRevision, makerChecker = true, branches = [] }: SalaryRevisionModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [sheetText, setSheetText] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [sheetDefaults, setSheetDefaults] = useState({ effectiveDate: new Date().toISOString().split('T')[0], reason: '' });
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number; failed: number } | null>(null);
  const sheetPlan: SalarySheetPlan | null = sheetText
    ? planSalarySheet(sheetText, employees, { effectiveDate: sheetDefaults.effectiveDate, reason: sheetDefaults.reason.trim() || `Salary sheet ${sheetName}`.trim() })
    : null;

  const downloadTemplate = () => {
    const csv = salarySheetTemplate(employees, id => branches.find(b => b.id === id)?.name || '');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'salary-sheet.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const readSheet = (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) { alert('Save the sheet from Excel as "CSV (Comma delimited)" and upload that file.'); return; }
    const reader = new FileReader();
    reader.onload = () => { setSheetText(String(reader.result || '')); setSheetName(file.name); };
    reader.readAsText(file);
  };

  /** Saves one revision at a time, in order; stops at the first one the handler refuses. */
  const runBulk = async (label: string, revisions: SalaryRevision[]) => {
    setBulk({ label, done: 0, total: revisions.length, failed: 0 });
    let done = 0;
    for (const revision of revisions) {
      const ok = await onAddSalaryRevision(revision);
      if (ok === false) {
        setBulk({ label, done, total: revisions.length, failed: 1 });
        alert(`${label}: stopped after ${done} of ${revisions.length}. The rest were not saved.`);
        return false;
      }
      done += 1;
      setBulk({ label, done, total: revisions.length, failed: 0 });
    }
    setBulk(null);
    return true;
  };

  const createSheetDrafts = async () => {
    if (!sheetPlan?.usable.length) return;
    const stamp = Date.now();
    const revisions: SalaryRevision[] = sheetPlan.usable.map((row, index) => {
      const previous = row.employee!.basicSalary || 0;
      const increment = row.newSalary - previous;
      return {
        id: `rev-sheet-${stamp}-${index}`, employeeId: row.employee!.id, previousSalary: previous, newSalary: row.newSalary,
        incrementAmount: increment, incrementPercentage: previous > 1 ? parseFloat(((increment / previous) * 100).toFixed(2)) : 0,
        effectiveDate: row.effectiveDate, reason: row.reason.slice(0, 500), approvedBy: '', approvedOn: '', type: 'Adjustment', status: 'Draft',
        createdById: currentUserAccount.id, createdBy: currentUserAccount.username,
      };
    });
    if (await runBulk('Creating draft revisions', revisions)) {
      alert(`${revisions.length} draft salary revisions created. ${makerChecker ? 'Another authorized user approves them with "Approve all drafts".' : 'Approve them with "Approve all drafts".'}`);
      setShowSheet(false); setSheetText(''); setSheetName('');
    }
  };

  const approvableDrafts = salaryRevisions.filter(r => r.status === 'Draft' && !r.sourcePerformanceReviewId && !(makerChecker && r.createdById === currentUserAccount.id));
  const approveAllDrafts = async () => {
    if (!approvableDrafts.length) return;
    if (!confirm(`Approve ${approvableDrafts.length} draft salary revisions? Each employee's basic salary changes to the new amount.`)) return;
    const today = new Date().toISOString().split('T')[0];
    await runBulk('Approving revisions', approvableDrafts.map(r => ({ ...r, status: 'Approved' as const, approvedBy: currentUserAccount.username, approvedOn: today })));
  };
  const [filterEmpId, setFilterEmpId] = useState<string>('All');
  const [search, setSearch] = useState('');

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
      approvedBy: '',
      approvedOn: '',
      type: form.type,
      status: 'Draft',
      createdById: currentUserAccount.id,
      createdBy: currentUserAccount.username
    };
    onAddSalaryRevision(revision);
    setShowForm(false);
    setForm(p => ({ ...p, reason: '', newSalary: 0 }));
  };

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.fullName || 'Unknown';

  const filtered = salaryRevisions
    .filter(r => filterEmpId === 'All' || r.employeeId === filterEmpId)
    .filter(r => { const emp = employees.find(e => e.id === r.employeeId); return matchesSearch(search, emp?.fullName, emp?.employeeCode, emp?.cnic, r.type, r.status, r.reason, r.effectiveDate); })
    .sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''));

  const approvedRevisions = salaryRevisions.filter(r => r.status !== 'Draft');
  const totalRevisionsThisYear = approvedRevisions.filter(r => r.effectiveDate.startsWith('2026')).length;
  const avgIncrement = approvedRevisions.length > 0
    ? approvedRevisions.reduce((sum, r) => sum + r.incrementPercentage, 0) / approvedRevisions.length
    : 0;
  const highestIncrement = approvedRevisions.reduce((max, r) => r.incrementPercentage > max ? r.incrementPercentage : max, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Salary Revisions & Increments</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track salary changes, promotions, and increment history for all employees</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {approvableDrafts.length > 1 && (
            <button onClick={approveAllDrafts} disabled={!!bulk}
              className="flex items-center gap-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold px-4 py-2 rounded-xl transition disabled:opacity-40">
              <CheckCheck size={14} /> Approve all drafts ({approvableDrafts.length})
            </button>
          )}
          <button onClick={() => setShowSheet(true)} disabled={!!bulk}
            className="flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold px-4 py-2 rounded-xl transition disabled:opacity-40">
            <Upload size={14} /> Upload salary sheet
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
            <Plus size={14} /> Process Increment
          </button>
        </div>
      </div>

      {bulk && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800" role="status">
          <div className="font-bold">{bulk.label}: {bulk.done} of {bulk.total}{bulk.failed ? ' (stopped)' : ''}</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${bulk.total ? Math.round((bulk.done / bulk.total) * 100) : 0}%` }} /></div>
          {!bulk.failed && <div className="mt-1 text-emerald-700">Keep this page open until it finishes.</div>}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="text-xl mb-1">📈</div>
          <div className="text-2xl font-bold text-emerald-700">{totalRevisionsThisYear}</div>
          <div className="text-xs text-slate-500">Revisions in 2026</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <div className="text-xl mb-1">📊</div>
          <div className="text-2xl font-bold text-blue-700">{avgIncrement.toFixed(1)}%</div>
          <div className="text-xs text-slate-500">Avg Increment</div>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
          <div className="text-xl mb-1">🏆</div>
          <div className="text-2xl font-bold text-indigo-700">{highestIncrement.toFixed(1)}%</div>
          <div className="text-xs text-slate-500">Highest Increment</div>
        </div>
      </div>

      {/* Current Salaries Summary */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Current Salary Register</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 text-left border-b border-slate-200">
                <th className="pb-2 pr-4">Employee</th>
                <th className="pb-2 pr-4">Designation</th>
                <th className="pb-2 pr-4 text-right">Current Salary</th>
                <th className="pb-2 pr-4 text-right">Last Revision</th>
                <th className="pb-2 text-right">% Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.filter(e => e.status === 'Active').map(emp => {
                const lastRevision = salaryRevisions
                  .filter(r => r.employeeId === emp.id && r.status !== 'Draft')
                  .sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''))[0];
                return (
                  <tr key={emp.id} className="hover:bg-slate-100 transition">
                    <td className="py-2 pr-4">
                      <div className="font-semibold text-slate-900">{emp.fullName}</div>
                      <div className="text-slate-500">{emp.employeeCode}</div>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{emp.wageType}</td>
                    <td className="py-2 pr-4 text-right font-bold text-slate-900">
                      PKR {(emp.basicSalary || 0).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-500">
                      {lastRevision ? lastRevision.effectiveDate : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {lastRevision ? (
                        <span className={`font-bold ${lastRevision.incrementPercentage >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
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
      <div className="flex gap-3 flex-wrap items-center">
        <ListSearch value={search} onChange={setSearch} placeholder="Search employee, code, type, reason…" total={salaryRevisions.length} shown={filtered.length} />
        <SearchableSelect value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)}
          aria-label="Filter salary revisions by employee"
          className="bg-white border border-slate-200 text-slate-900 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
          <option value="All">All Employees</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
        </SearchableSelect>
      </div>

      {/* Revision History */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Revision History</h3>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">{search.trim() ? `No salary revisions match “${search.trim()}”.` : 'No salary revisions on record.'}</div>
        ) : (
          filtered.map(revision => (
            <div key={revision.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <TrendingUp size={16} className="text-emerald-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{getEmployeeName(revision.employeeId)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${revisionTypeColors[revision.type]}`}>
                        {revision.type}
                      </span>
                      {revision.status === 'Draft' && <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">DRAFT — NOT APPLIED</span>}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{revision.reason}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <span className="text-base font-bold text-slate-900">PKR {revision.newSalary.toLocaleString()}</span>
                    <ArrowUpRight size={14} className="text-emerald-700" />
                  </div>
                  <div className="text-xs text-slate-500">from PKR {revision.previousSalary.toLocaleString()}</div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-4 text-xs text-slate-500">
                  <span>Effective: <span className="text-slate-600 font-semibold">{revision.effectiveDate}</span></span>
                  {revision.createdBy && <span>Prepared by: <span className="text-slate-600">{revision.createdBy}</span></span>}
                  {revision.status !== 'Draft' && <span>Approved by: <span className="text-slate-600">{revision.approvedBy}</span></span>}
                  {revision.status !== 'Draft' && <span>On: <span className="text-slate-600">{revision.approvedOn}</span></span>}
                  {Boolean(revision.arrearsAmount) && <span>Arrears: <span className="text-amber-700">PKR {revision.arrearsAmount!.toLocaleString()} (pending payroll review)</span></span>}
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-emerald-700">+{revision.incrementPercentage.toFixed(1)}%</span>
                  <span className="text-xs text-slate-500 ml-2">(+PKR {revision.incrementAmount.toLocaleString()})</span>
                </div>
              </div>
              {revision.status === 'Draft' && <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-700">{revision.sourcePerformanceReviewId ? 'Performance recommendation only.' : 'Awaiting independent approval.'} Approving updates the employee salary; back-dated revisions raise an arrears adjustment for months already processed.</p>
                <button type="button" disabled={makerChecker && revision.createdById === currentUserAccount.id} title={makerChecker && revision.createdById === currentUserAccount.id ? 'Prepared by you; another authorized user must approve.' : 'Approve and apply'} onClick={() => onAddSalaryRevision({ ...revision, status: 'Approved', approvedBy: currentUserAccount.username, approvedOn: new Date().toISOString().split('T')[0] })} className="ml-4 shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Approve &amp; Apply</button>
              </div>}
            </div>
          ))
        )}
      </div>

      {showSheet && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4" role="dialog" aria-label="Upload salary sheet">
            <div>
              <h3 className="text-base font-bold text-slate-900">Upload salary sheet</h3>
              <p className="mt-1 text-xs text-slate-500">Set many basic salaries at once. Each row becomes a draft revision that must be approved before payroll uses it.</p>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-700">
              <li><button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"><Download size={12} /> Download the template</button> (current staff; those without a real salary are listed first).</li>
              <li>Open it in Excel and fill the <b>Basic Salary</b> column (monthly, PKR). Leave rows you don&apos;t want to change blank. Effective Date and Reason are optional per row.</li>
              <li>Save as <b>CSV (Comma delimited)</b> and choose the file below.</li>
            </ol>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-slate-600">CSV file
                <input type="file" accept=".csv,.txt,text/csv" onChange={e => readSheet(e.target.files?.[0])} className="mt-1 block w-full text-xs" />
              </label>
              <label className="text-xs text-slate-600">Effective date (when a row has none)
                <DateField value={sheetDefaults.effectiveDate} aria-label="Default effective date" onChange={e => setSheetDefaults(p => ({ ...p, effectiveDate: e.target.value }))}
                  className="mt-1 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2" />
              </label>
              <label className="text-xs text-slate-600">Reason (when a row has none)
                <input value={sheetDefaults.reason} maxLength={200} onChange={e => setSheetDefaults(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Salaries from CyberAP migration"
                  className="mt-1 w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2" />
              </label>
            </div>
            {sheetPlan && sheetPlan.errors.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{sheetPlan.errors.join(' ')}</div>
            )}
            {sheetPlan && sheetPlan.rows.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-700">{sheetPlan.usable.length} will become draft revisions</span>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">{sheetPlan.rows.length - sheetPlan.usable.length} skipped</span>
                </div>
                <div className="max-h-72 overflow-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr><th className="p-2">Row</th><th className="p-2">Code</th><th className="p-2">Employee</th><th className="p-2 text-right">Current</th><th className="p-2 text-right">New</th><th className="p-2">Effective</th><th className="p-2">Result</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...sheetPlan.rows].sort((a, b) => Number(a.problem === 'Salary left blank') - Number(b.problem === 'Salary left blank')).slice(0, 500).map(row => (
                        <tr key={row.line} className={row.problem ? 'text-slate-500' : ''}>
                          <td className="p-2">{row.line}</td><td className="p-2">{row.code}</td><td className="p-2">{row.employee?.fullName || '—'}</td>
                          <td className="p-2 text-right">{row.employee ? (row.employee.basicSalary || 0).toLocaleString() : ''}</td>
                          <td className="p-2 text-right font-semibold">{row.newSalary ? row.newSalary.toLocaleString() : ''}</td>
                          <td className="p-2">{row.problem ? '' : row.effectiveDate}</td>
                          <td className={`p-2 ${row.problem ? 'text-amber-700' : 'text-emerald-700 font-semibold'}`}>{row.problem || 'Draft revision'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowSheet(false); setSheetText(''); setSheetName(''); }} disabled={!!bulk}
                className="flex-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-900 text-sm font-bold py-2.5 rounded-xl transition disabled:opacity-40">Cancel</button>
              <button onClick={createSheetDrafts} disabled={!sheetPlan?.usable.length || !!bulk}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition">
                {bulk ? `${bulk.done} / ${bulk.total}…` : `Create ${sheetPlan?.usable.length || 0} draft revisions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Revision Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900">Process Salary Revision</h3>
              <RequiredNote />

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Employee<RequiredMark /></label>
                    <SearchableSelect value={form.employeeId}
                      aria-label="Employee" aria-required="true"
                      onChange={e => setForm(p => ({ ...p, employeeId: e.target.value, newSalary: 0 }))}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {employees.filter(e => e.status === 'Active').map(e => (
                        <option key={e.id} value={e.id}>{e.fullName}</option>
                      ))}
                    </SearchableSelect>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Revision Type</label>
                    <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as SalaryRevision['type'] }))}
                      aria-label="Revision Type"
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {(['Annual Increment', 'Promotion', 'Adjustment', 'Market Correction'] as SalaryRevision['type'][]).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedEmp && (
                  <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
                    <span className="text-slate-500">Current salary: </span>
                    <span className="font-bold text-slate-900">PKR {previousSalary.toLocaleString()}</span>
                    <span className="text-slate-500"> • Joined: </span>
                    <span>{selectedEmp.dateOfJoining}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">New Salary (PKR)<RequiredMark /></label>
                    <input type="number" min={previousSalary} step="1000" value={form.newSalary || ''}
                      aria-label="New Salary (PKR)" aria-required="true"
                      onChange={e => setForm(p => ({ ...p, newSalary: Number(e.target.value) }))}
                      placeholder={`Min PKR ${previousSalary.toLocaleString()}`}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Effective Date</label>
                    <DateField value={form.effectiveDate}
                      aria-label="Effective Date"
                      onChange={e => setForm(p => ({ ...p, effectiveDate: e.target.value }))}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                </div>

                {form.newSalary > 0 && (
                  <div className={`rounded-xl p-3 text-xs border ${incrementAmount >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                    <strong>Preview:</strong> Increment of PKR {Math.abs(incrementAmount).toLocaleString()} ({incrementPct >= 0 ? '+' : ''}{incrementPct.toFixed(1)}%) from PKR {previousSalary.toLocaleString()} → PKR {form.newSalary.toLocaleString()}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Reason / Notes<RequiredMark /></label>
                  <textarea aria-label="Reason / Notes" aria-required="true" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                    rows={3} placeholder="Justification for this salary revision..."
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold py-2.5 rounded-xl transition">
                  Cancel
                </button>
                <button onClick={handleSave}
                  disabled={!form.employeeId || !form.newSalary || form.newSalary <= 0 || !form.reason.trim()}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  Submit Revision for Approval
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
