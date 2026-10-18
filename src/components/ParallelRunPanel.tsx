import React, { useMemo, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { ParallelRunRecord, PayrollRun, Payslip } from '../types';
import { compareParallelRun, parallelRunCsv, parseLegacyPayrollCsv, type ParallelRunResult } from '../data/parallelRun';
import { RequiredMark, RequiredNote } from './RequiredMark';

interface Props {
  payrollRuns: PayrollRun[];
  payrollPayslips: Payslip[];
  onRecord: (runId: string, record: Omit<ParallelRunRecord, 'comparedAt' | 'comparedById' | 'comparedBy'>) => void | Promise<void>;
}

const fmt = (value: number) => value.toLocaleString('en-PK');

export function ParallelRunPanel({ payrollRuns, payrollPayslips, onRecord }: Props) {
  const candidates = payrollRuns.filter(run => (run.status === 'Approved' || run.status === 'Disbursed') && (run.runType || 'Regular') === 'Regular')
    .sort((a, b) => b.periodYear - a.periodYear || b.periodMonth - a.periodMonth);
  const [runId, setRunId] = useState(candidates[0]?.id || '');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ParallelRunResult | null>(null);
  const [error, setError] = useState('');
  const [explanation, setExplanation] = useState('');
  const run = candidates.find(item => item.id === runId);
  const explanationRequired = Boolean(result && (result.differing || result.onlyLegacy || result.onlySystem));
  const sheets = useMemo(() => payrollPayslips.filter(item => item.payrollRunId === runId), [payrollPayslips, runId]);

  const load = async (file?: File) => {
    if (!file) return;
    setError(''); setResult(null);
    if (file.size > 5 * 1024 * 1024) { setError('Choose a CSV file under 5 MB.'); return; }
    const parsed = parseLegacyPayrollCsv(await file.text());
    if (parsed.errors.length) { setError(parsed.errors.join(' ')); return; }
    setFileName(file.name);
    setResult(compareParallelRun(parsed, sheets));
  };
  const download = () => {
    if (!result || !run) return;
    const url = URL.createObjectURL(new Blob([parallelRunCsv(result)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `parallel-run-${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 text-xs shadow-sm" aria-labelledby="parallel-run-title">
      <div>
        <h3 id="parallel-run-title" className="text-sm font-bold text-slate-900">Parallel run against your current payroll</h3>
        <p className="mt-1 text-slate-500">Export the same month from your existing payroll as CSV (employee code or CNIC, and any of gross, tax, EOBI, PF, loan, deductions, net). Every employee is compared within PKR 1.</p>
      </div>
      {candidates.length === 0 ? <p className="text-slate-500">Approve a regular payroll run first.</p> : <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Payroll run to compare" value={runId} onChange={event => { setRunId(event.target.value); setResult(null); }} className="rounded border border-slate-300 bg-white p-1.5">
          {candidates.map(item => <option key={item.id} value={item.id}>{item.title}{item.parallelRun ? ' (compared)' : ''}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-1 rounded border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"><Upload size={13} />Legacy payroll CSV
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={event => { void load(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {run?.parallelRun && <span className="text-slate-500">Last recorded {run.parallelRun.comparedAt.slice(0, 10)} by {run.parallelRun.comparedBy}: {run.parallelRun.matched} matched, {run.parallelRun.differing} differing.</span>}
      </div>}
      {error && <p className="font-semibold text-rose-700">{error}</p>}
      {result && run && <>
        <div className="grid gap-2 sm:grid-cols-5">
          {([['Matched', result.matched, 'text-emerald-700'], ['Differences', result.differing, 'text-rose-700'], ['Only in legacy', result.onlyLegacy, 'text-amber-700'], ['Only in this system', result.onlySystem, 'text-amber-700'], ['Net difference (PKR)', result.netDelta, result.netDelta ? 'text-rose-700' : 'text-emerald-700']] as const).map(([label, value, tone]) => (
            <div key={label} className="rounded-lg bg-slate-50 p-2"><p className="text-[10px] text-slate-500">{label}</p><p className={`text-lg font-bold ${tone}`}>{fmt(value)}</p></div>
          ))}
        </div>
        <div className="max-h-64 overflow-auto rounded border border-slate-200">
          <table className="w-full">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500"><tr><th className="p-1.5">Employee</th><th className="p-1.5">Status</th><th className="p-1.5">Field</th><th className="p-1.5 text-right">Legacy</th><th className="p-1.5 text-right">This system</th><th className="p-1.5 text-right">Δ</th></tr></thead>
            <tbody>{result.lines.filter(line => line.status !== 'Match').slice(0, 200).flatMap(line => (line.differences.length ? line.differences : [undefined]).map((item, index) => (
              <tr key={`${line.employeeCode}-${index}`} className="border-t border-slate-100">
                <td className="p-1.5">{index === 0 ? `${line.employeeName || ''} ${line.employeeCode}` : ''}</td>
                <td className="p-1.5">{index === 0 ? line.status : ''}</td>
                <td className="p-1.5">{item?.field || '—'}</td>
                <td className="p-1.5 text-right font-mono">{item ? fmt(item.legacy) : ''}</td>
                <td className="p-1.5 text-right font-mono">{item ? fmt(item.system) : ''}</td>
                <td className={`p-1.5 text-right font-mono ${item?.delta ? 'text-rose-700' : ''}`}>{item ? fmt(item.delta) : ''}</td>
              </tr>
            )))}</tbody>
          </table>
          {result.lines.every(line => line.status === 'Match') && <p className="p-3 font-semibold text-emerald-700">Every employee matches the legacy payroll.</p>}
        </div>
        {explanationRequired && <RequiredNote />}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={download} className="flex items-center gap-1 rounded border border-slate-300 px-3 py-1.5 font-semibold text-slate-700"><Download size={13} />Difference report</button>
          {explanationRequired && <label htmlFor="parallel-run-explanation" className="font-semibold text-slate-700">Explanation<RequiredMark /></label>}
          <input id="parallel-run-explanation" aria-label="Explanation of differences" aria-required={explanationRequired || undefined} value={explanation} onChange={event => setExplanation(event.target.value)} placeholder={result.differing || result.onlyLegacy || result.onlySystem ? 'Explain the differences (e.g. legacy ignored medical exemption)' : 'Optional note'} className="min-w-64 flex-1 rounded border border-slate-300 p-1.5" />
          <button type="button" onClick={() => void onRecord(run.id, { legacyFileName: fileName, matched: result.matched, differing: result.differing, onlyLegacy: result.onlyLegacy, onlySystem: result.onlySystem, netDelta: result.netDelta, ...(explanation.trim() && { explanation: explanation.trim().slice(0, 1000) }) })} disabled={explanationRequired && !explanation.trim()} className="rounded bg-slate-800 px-3 py-1.5 font-bold text-white disabled:opacity-40">Record result on this run</button>
        </div>
      </>}
    </section>
  );
}
