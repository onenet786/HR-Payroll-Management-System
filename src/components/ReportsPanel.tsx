import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Download, FileText, Loader2, Play, Printer, Search, X } from 'lucide-react';
import type { Branch, Department, Designation, UcTown, Zone } from '../types';
import { apiBase } from '../data/apiBase';
import { getAuthToken } from '../data/postgresStore';
import { openPrintableHtml } from '../data/lifecycle';

interface ReportInfo { id: string; title: string; description: string; filters: string[]; defaults: Record<string, string> }
interface ReportGroup { id: string; title: string; reports: ReportInfo[] }
interface Column { key: string; label: string; type: 'text' | 'number' | 'date' | 'time' | 'badge' | 'mark' }
interface Result { columns: Column[]; rows: Array<Record<string, unknown>>; total: number; totals: Record<string, unknown> | null; summary: Array<{ label: string; value: number }> | null; page: number; pageSize: number; ms: number; wide: boolean }
interface EmployeeOption { id: string; code: string; name: string; status: string }

interface Props {
  group: string;
  companyName: string;
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  zones: Zone[];
  ucTowns: UcTown[];
}

const RANGES: Array<[string, string]> = [['today', 'Today'], ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['thisYear', 'This year'], ['lastYear', 'Last year'], ['taxYear', 'This tax year (Jul-Jun)'], ['lastTaxYear', 'Last tax year'], ['next60', 'Next 60 days'], ['custom', 'Custom']];
const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function rangeDates(range: string, today: string): { from: string; to: string } {
  const now = new Date(`${today}T00:00:00`);
  const y = now.getFullYear(); const m = now.getMonth();
  switch (range) {
    case 'today': return { from: today, to: today };
    case 'lastMonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'thisYear': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'lastYear': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'taxYear': { const start = m >= 6 ? y : y - 1; return { from: `${start}-07-01`, to: `${start + 1}-06-30` }; }
    case 'lastTaxYear': { const start = (m >= 6 ? y : y - 1) - 1; return { from: `${start}-07-01`, to: `${start + 1}-06-30` }; }
    case 'next60': return { from: today, to: iso(new Date(y, m, now.getDate() + 60)) };
    default: return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
}

const BADGE: Record<string, string> = {
  Present: 'bg-emerald-50 text-emerald-700', Late: 'bg-amber-50 text-amber-700', 'Half Day': 'bg-orange-50 text-orange-700', Absent: 'bg-rose-50 text-rose-700',
  'On Leave': 'bg-sky-50 text-sky-700', Holiday: 'bg-violet-50 text-violet-700', 'No record': 'bg-slate-100 text-slate-500', Active: 'bg-emerald-50 text-emerald-700',
  Terminated: 'bg-slate-100 text-slate-500', Disbursed: 'bg-emerald-50 text-emerald-700', Approved: 'bg-sky-50 text-sky-700', Draft: 'bg-slate-100 text-slate-600',
  Pending: 'bg-amber-50 text-amber-700', Closed: 'bg-slate-100 text-slate-500', Paid: 'bg-emerald-50 text-emerald-700', Processed: 'bg-sky-50 text-sky-700', Bank: 'bg-emerald-50 text-emerald-700',
  'Cash / cheque': 'bg-amber-50 text-amber-700', Rejected: 'bg-rose-50 text-rose-700', Revoked: 'bg-slate-100 text-slate-500', Yes: 'bg-emerald-50 text-emerald-700', No: 'bg-rose-50 text-rose-700',
  'Signed out': 'bg-slate-100 text-slate-600', Expired: 'bg-slate-100 text-slate-500', Annual: 'bg-sky-50 text-sky-700', Casual: 'bg-indigo-50 text-indigo-700', Sick: 'bg-amber-50 text-amber-700', Unpaid: 'bg-rose-50 text-rose-700', Loan: 'bg-indigo-50 text-indigo-700', Advance: 'bg-violet-50 text-violet-700', Suspended: 'bg-rose-50 text-rose-700', Joined: 'bg-emerald-50 text-emerald-700', Left: 'bg-slate-100 text-slate-600',
  CyberAP: 'bg-indigo-50 text-indigo-700', inside: 'bg-emerald-50 text-emerald-700', 'needs-review': 'bg-amber-50 text-amber-700', 'authorized-offsite': 'bg-sky-50 text-sky-700',
};
const MARK: Record<string, string> = { P: 'text-emerald-700', L: 'text-amber-600 font-bold', HD: 'text-orange-600', A: 'text-rose-600 font-bold', LV: 'text-sky-600', H: 'text-violet-600' };

async function api(path: string) {
  const response = await fetch(`${apiBase()}${path}`, { cache: 'no-store', headers: { Authorization: `Bearer ${getAuthToken() || ''}` } });
  if (response.status === 401) window.dispatchEvent(new CustomEvent('hr:session-expired'));
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

function display(value: unknown, type: Column['type']): string {
  if (value === null || value === undefined || value === '') return type === 'mark' ? '' : '—';
  if (type === 'number') { const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('en-PK', { maximumFractionDigits: 2 }) : String(value); }
  if (type === 'time') return String(value).slice(0, 5);
  return String(value);
}

/**
 * Reports: everything historical is read from the server on demand (filtered, paged, exported), so browsers only
 * load the working set. One screen per group (Employees, Attendance, …); the sidebar opens a group.
 */
export function ReportsPanel({ group, companyName, branches, departments, designations, zones, ucTowns }: Props) {
  const [groups, setGroups] = useState<ReportGroup[] | null>(null);
  const [today, setToday] = useState(iso(new Date()));
  const [reportId, setReportId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [range, setRange] = useState('thisMonth');
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [options, setOptions] = useState<{ archiveKinds?: Array<{ kind: string; rows: number }>; auditActions?: string[] }>({});

  useEffect(() => {
    api('/api/reports/catalog').then(body => { setGroups(body.groups || []); if (body.today) setToday(body.today); })
      .catch(catalogError => setError(catalogError instanceof Error ? catalogError.message : 'Reports could not be loaded.'));
  }, []);
  useEffect(() => {
    if (group !== 'audit' && group !== 'archive') return;
    api('/api/reports/options').then(setOptions).catch(() => setOptions({}));
  }, [group]);
  const current = groups?.find(item => item.id === group) || groups?.[0] || null;
  const report = current?.reports.find(item => item.id === reportId) || null;

  const choose = useCallback((next: ReportInfo) => {
    setReportId(next.id); setResult(null); setError(''); setPage(1); setEmployee(null);
    const initial: Record<string, string> = {};
    for (const [key, value] of Object.entries(next.defaults || {})) {
      if (key === 'range') continue;
      initial[key] = value === 'today' ? today : value === 'thisMonth' ? today.slice(0, 7) : value === 'thisYear' && key === 'year' ? today.slice(0, 4) : value;
    }
    setValues(initial);
    setRange(next.defaults?.range || 'thisMonth');
  }, [today]);
  useEffect(() => { setReportId(''); setResult(null); setError(''); }, [group]);

  const query = useMemo(() => {
    if (!report) return '';
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
    if (report.filters.includes('dateRange')) {
      const dates = range === 'custom' ? { from: values.from || '', to: values.to || '' } : rangeDates(range, today);
      params.set('from', dates.from); params.set('to', dates.to);
    }
    if (employee) params.set('employeeId', employee.id);
    return params.toString();
  }, [report, values, range, today, employee]);

  const run = useCallback(async (targetPage = 1) => {
    if (!report) return;
    setLoading('run'); setError('');
    try {
      const body = await api(`/api/reports/run/${report.id}?${query}&page=${targetPage}&pageSize=100`);
      setResult(body); setPage(targetPage);
    } catch (runError) { setError(runError instanceof Error ? runError.message : 'The report failed.'); setResult(null); }
    finally { setLoading(''); }
  }, [report, query]);
  // Run as soon as a report is opened, with its default filters.
  const lastAuto = useRef('');
  useEffect(() => { if (report && lastAuto.current !== report.id) { lastAuto.current = report.id; if (!report.filters.includes('archiveKind')) void run(1); } }, [report, run]);

  const downloadCsv = async () => {
    if (!report) return;
    setLoading('csv'); setError('');
    try {
      const response = await fetch(`${apiBase()}/api/reports/run/${report.id}?${query}&format=csv`, { cache: 'no-store', headers: { Authorization: `Bearer ${getAuthToken() || ''}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `Export failed (${response.status}).`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${report.id}-${today}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (csvError) { setError(csvError instanceof Error ? csvError.message : 'Export failed.'); }
    finally { setLoading(''); }
  };

  const print = async () => {
    if (!report) return;
    setLoading('print'); setError('');
    try {
      const body: Result = await api(`/api/reports/run/${report.id}?${query}&page=1&pageSize=500`);
      const esc = (text: string) => text.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
      const head = body.columns.map(column => `<th class="${column.type}">${esc(column.label)}</th>`).join('');
      const rows = body.rows.map(row => `<tr>${body.columns.map(column => `<td class="${column.type}">${esc(display(row[column.key], column.type))}</td>`).join('')}</tr>`).join('');
      const totals = body.totals ? `<tr class="tot">${body.columns.map((column, index) => `<td class="${column.type}">${index === 0 ? 'Total' : esc(display(body.totals?.[column.key], column.type))}</td>`).join('')}</tr>` : '';
      const filters = describeFilters();
      openPrintableHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(report.title)}</title><style>
        @page { size: ${body.wide || body.columns.length > 9 ? 'A4 landscape' : 'A4'}; margin: 12mm; }
        body { font: 10px/1.35 Segoe UI, Arial, sans-serif; color: #0f172a; }
        h1 { font-size: 16px; margin: 0; } .meta { color: #475569; margin: 2px 0 10px; }
        table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #e2e8f0; padding: 3px 4px; text-align: left; }
        th { background: #f1f5f9; font-size: 9px; text-transform: uppercase; } td.number, th.number { text-align: right; } td.mark, th.mark { text-align: center; padding: 3px 1px; }
        tr.tot td { font-weight: 700; border-top: 2px solid #0f172a; } .foot { margin-top: 8px; color: #64748b; }
      </style></head><body><h1>${esc(report.title)}</h1><p class="meta">${esc(companyName)} · ${esc(filters)} · printed ${new Date().toLocaleString()}</p>
      <table><thead><tr>${head}</tr></thead><tbody>${rows}${totals}</tbody></table>
      <p class="foot">${body.rows.length < body.total ? `First ${body.rows.length} of ${body.total.toLocaleString()} rows; download CSV for all rows.` : `${body.total.toLocaleString()} rows.`}</p>
      <script>window.onload = () => window.print();</script></body></html>`);
    } catch (printError) { setError(printError instanceof Error ? printError.message : 'Could not open the printable view.'); }
    finally { setLoading(''); }
  };

  function describeFilters() {
    if (!report) return '';
    const parts: string[] = [];
    if (report.filters.includes('dateRange')) { const dates = range === 'custom' ? { from: values.from, to: values.to } : rangeDates(range, today); parts.push(`${dates.from} to ${dates.to}`); }
    if (values.date) parts.push(values.date);
    if (values.month) parts.push(values.month);
    const name = (list: Array<{ id: string; name?: string; title?: string }>, id?: string) => list.find(item => item.id === id)?.name || list.find(item => item.id === id)?.title;
    if (values.branchId) parts.push(`Branch: ${name(branches, values.branchId)}`);
    if (values.departmentId) parts.push(`Department: ${name(departments, values.departmentId)}`);
    if (values.designationId) parts.push(`Designation: ${name(designations, values.designationId)}`);
    if (values.zoneId) parts.push(`Zone: ${name(zones, values.zoneId)}`);
    if (employee) parts.push(`Employee: ${employee.code} ${employee.name}`);
    return parts.join(' · ') || 'All';
  }

  const set = (key: string, value: string) => setValues(previous => ({ ...previous, [key]: value }));
  const field = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
  const select = (key: string, label: string, options: Array<{ id: string; label: string }>) => (
    <label className="flex flex-col text-[11px] font-semibold text-slate-500">{label}
      <select value={values[key] || ''} onChange={event => set(key, event.target.value)} className={`${field} mt-0.5 min-w-[150px]`}>
        <option value="">All</option>
        {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );

  if (error && !groups) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  if (!groups) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports…</div>;
  if (!current) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">You do not have access to any report. Ask an administrator for the "View reports" permission.</div>;

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><BarChart3 className="h-5 w-5 text-emerald-600" /> {current.title} reports</h2>
          <p className="text-xs text-slate-500">Read from the server when you open them: any period, including imported history. Download as CSV (Excel) or print / save as PDF.</p>
        </div>
      </header>

      {!report ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {current.reports.map(item => (
            <button key={item.id} type="button" onClick={() => choose(item)}
              className="group flex flex-col items-start gap-1 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-emerald-400 hover:shadow">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-900"><FileText className="h-4 w-4 text-emerald-600" /> {item.title}</span>
              <span className="text-xs leading-snug text-slate-500">{item.description}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <button type="button" onClick={() => { setReportId(''); setResult(null); setError(''); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-emerald-700">
                <ChevronLeft className="h-3.5 w-3.5" /> All {current.title.toLowerCase()} reports
              </button>
              <h3 className="text-sm font-bold text-slate-900">{report.title}</h3>
            </div>
            <p className="mb-3 text-xs text-slate-500">{report.description}</p>
            <div className="flex flex-wrap items-end gap-2">
              {report.filters.includes('dateRange') && (
                <>
                  <label className="flex flex-col text-[11px] font-semibold text-slate-500">Period
                    <select value={range} onChange={event => setRange(event.target.value)} className={`${field} mt-0.5`}>
                      {RANGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>
                  {range === 'custom' && (
                    <>
                      <label className="flex flex-col text-[11px] font-semibold text-slate-500">From<input type="date" value={values.from || ''} onChange={event => set('from', event.target.value)} className={`${field} mt-0.5`} /></label>
                      <label className="flex flex-col text-[11px] font-semibold text-slate-500">To<input type="date" value={values.to || ''} onChange={event => set('to', event.target.value)} className={`${field} mt-0.5`} /></label>
                    </>
                  )}
                </>
              )}
              {report.filters.includes('optionalRange') && (
                <>
                  <label className="flex flex-col text-[11px] font-semibold text-slate-500">From (optional)<input type="date" value={values.from || ''} onChange={event => set('from', event.target.value)} className={`${field} mt-0.5`} /></label>
                  <label className="flex flex-col text-[11px] font-semibold text-slate-500">To (optional)<input type="date" value={values.to || ''} onChange={event => set('to', event.target.value)} className={`${field} mt-0.5`} /></label>
                </>
              )}
              {report.filters.includes('archiveKind') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">CyberAP table
                  <select value={values.archiveKind || ''} onChange={event => set('archiveKind', event.target.value)} className={`${field} mt-0.5 min-w-[220px]`}>
                    <option value="">Choose…</option>
                    {(options.archiveKinds || []).map(item => <option key={item.kind} value={item.kind}>{item.kind.replace(/_/g, ' ')} ({item.rows.toLocaleString()})</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('year') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Year
                  <select value={values.year || today.slice(0, 4)} onChange={event => set('year', event.target.value)} className={`${field} mt-0.5`}>
                    {Array.from({ length: 12 }, (_, index) => String(Number(today.slice(0, 4)) + 1 - index)).map(year => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('leaveType') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Leave type
                  <select value={values.leaveType || ''} onChange={event => set('leaveType', event.target.value)} className={`${field} mt-0.5`}>
                    <option value="">All</option>
                    {['Annual', 'Casual', 'Sick', 'Maternity', 'Paternity', 'Hajj', 'Unpaid'].map(type => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('leaveStatus') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Status
                  <select value={values.leaveStatus || ''} onChange={event => set('leaveStatus', event.target.value)} className={`${field} mt-0.5`}>
                    <option value="">All</option>
                    {['Pending', 'Approved', 'Rejected'].map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('enrolment') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Show
                  <select value={values.enrolment || 'missing'} onChange={event => set('enrolment', event.target.value)} className={`${field} mt-0.5`}>
                    {[['missing', 'Missing fingerprint or face'], ['complete', 'Fully enrolled'], ['all', 'Everyone']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('auditAction') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Action
                  <select value={values.auditAction || ''} onChange={event => set('auditAction', event.target.value)} className={`${field} mt-0.5 min-w-[180px]`}>
                    <option value="">All</option>
                    {(options.auditActions || []).map(action => <option key={action} value={action}>{action.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('auditUser') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">User
                  <input value={values.auditUser || ''} onChange={event => set('auditUser', event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void run(1); }} placeholder="Name or email" className={`${field} mt-0.5 w-44`} />
                </label>
              )}
              {report.filters.includes('date') && <label className="flex flex-col text-[11px] font-semibold text-slate-500">Day<input type="date" value={values.date || ''} onChange={event => set('date', event.target.value)} className={`${field} mt-0.5`} /></label>}
              {report.filters.includes('month') && <label className="flex flex-col text-[11px] font-semibold text-slate-500">Month<input type="month" value={values.month || ''} onChange={event => set('month', event.target.value)} className={`${field} mt-0.5`} /></label>}
              {report.filters.includes('groupBy') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Group by
                  <select value={values.groupBy || 'branch'} onChange={event => set('groupBy', event.target.value)} className={`${field} mt-0.5`}>
                    {[['branch', 'Branch'], ['department', 'Department'], ['designation', 'Designation'], ['zone', 'Zone'], ['ucTown', 'UC / Town'], ['supervisor', 'Supervisor'], ['gender', 'Gender']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('payGroupBy') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Group by
                  <select value={values.payGroupBy || 'branch'} onChange={event => set('payGroupBy', event.target.value)} className={`${field} mt-0.5`}>
                    {[['branch', 'Branch'], ['department', 'Department'], ['designation', 'Designation']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('runStatus') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Payroll runs
                  <select value={values.runStatus || 'approved'} onChange={event => set('runStatus', event.target.value)} className={`${field} mt-0.5`}>
                    {[['paid', 'Paid (disbursed)'], ['approved', 'Approved and paid'], ['all', 'All except cancelled']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('loanStatus') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Status
                  <select value={values.loanStatus || 'open'} onChange={event => set('loanStatus', event.target.value)} className={`${field} mt-0.5`}>
                    {[['open', 'Open (pending, approved, active)'], ['Active', 'Active'], ['Pending', 'Pending'], ['Closed', 'Closed'], ['Rejected', 'Rejected'], ['all', 'All']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('employeeStatus') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Status
                  <select value={values.employeeStatus || 'current'} onChange={event => set('employeeStatus', event.target.value)} className={`${field} mt-0.5`}>
                    {[['current', 'Current staff'], ['Active', 'Active'], ['On Leave', 'On leave'], ['Suspended', 'Suspended'], ['Terminated', 'Left'], ['all', 'Everyone']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('attendanceStatus') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Attendance
                  <select value={values.attendanceStatus || ''} onChange={event => set('attendanceStatus', event.target.value)} className={`${field} mt-0.5`}>
                    <option value="">All</option>
                    {['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Holiday', ...(report.id === 'daily-attendance' ? ['No record'] : [])].map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              )}
              {report.filters.includes('branch') && select('branchId', 'Branch', branches.map(item => ({ id: item.id, label: item.name })))}
              {report.filters.includes('department') && select('departmentId', 'Department', departments.map(item => ({ id: item.id, label: item.name })))}
              {report.filters.includes('designation') && select('designationId', 'Designation', designations.map(item => ({ id: item.id, label: item.title })))}
              {report.filters.includes('zone') && zones.length > 0 && select('zoneId', 'Zone', zones.map(item => ({ id: item.id, label: item.name })))}
              {report.filters.includes('ucTown') && ucTowns.length > 0 && select('ucTownId', 'UC / Town', ucTowns.map(item => ({ id: item.id, label: item.name })))}
              {report.filters.includes('employee') && <EmployeePicker value={employee} onChange={setEmployee} />}
              {report.filters.includes('search') && (
                <label className="flex flex-col text-[11px] font-semibold text-slate-500">Name, code or CNIC
                  <input value={values.search || ''} onChange={event => set('search', event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void run(1); }} className={`${field} mt-0.5 w-44`} />
                </label>
              )}
              <button type="button" onClick={() => run(1)} disabled={Boolean(loading)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50">
                {loading === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Show
              </button>
              <div className="ml-auto flex gap-2">
                <button type="button" onClick={downloadCsv} disabled={Boolean(loading) || !result?.total} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 disabled:opacity-40">
                  {loading === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
                </button>
                <button type="button" onClick={print} disabled={Boolean(loading) || !result?.total} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 disabled:opacity-40">
                  {loading === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print / PDF
                </button>
              </div>
            </div>
          </div>

          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          {result && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              {result.summary && result.summary.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                  {result.summary.map(item => <span key={item.label} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE[item.label] || 'bg-slate-100 text-slate-600'}`}>{item.label}: {item.value.toLocaleString()}</span>)}
                </div>
              )}
              <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
                <span>{result.total.toLocaleString()} row{result.total === 1 ? '' : 's'} · {result.ms} ms</span>
                {pages > 1 && (
                  <span className="flex items-center gap-2">
                    <button type="button" disabled={page <= 1 || Boolean(loading)} onClick={() => run(page - 1)} className="rounded border border-slate-200 p-1 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button>
                    Page {page} of {pages.toLocaleString()}
                    <button type="button" disabled={page >= pages || Boolean(loading)} onClick={() => run(page + 1)} className="rounded border border-slate-200 p-1 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button>
                  </span>
                )}
              </div>
              {result.rows.length === 0 ? <p className="px-3 pb-6 pt-2 text-center text-sm text-slate-500">Nothing found for these filters.</p> : (
                <div className="max-h-[65vh] overflow-auto border-t border-slate-100">
                  <table className="min-w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>{result.columns.map(column => <th key={column.key} className={`whitespace-nowrap px-2 py-2 ${column.type === 'number' ? 'text-right' : column.type === 'mark' ? 'w-7 px-0.5 text-center' : ''}`}>{column.label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.rows.map((row, index) => (
                        <tr key={`${String(row.employee_id ?? '')}-${index}`} className="hover:bg-slate-50">
                          {result.columns.map(column => {
                            const value = row[column.key];
                            if (column.type === 'badge') return <td key={column.key} className="whitespace-nowrap px-2 py-1.5">{value ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[String(value)] || 'bg-slate-100 text-slate-600'}`}>{String(value)}</span> : '—'}</td>;
                            if (column.type === 'mark') return <td key={column.key} className={`px-0.5 py-1.5 text-center text-[10px] ${MARK[String(value)] || 'text-slate-300'}`}>{value ? String(value) : '·'}</td>;
                            return <td key={column.key} className={`whitespace-nowrap px-2 py-1.5 ${column.type === 'number' ? 'text-right tabular-nums' : ''} ${column.key === 'name' ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{display(value, column.type)}</td>;
                          })}
                        </tr>
                      ))}
                      {result.totals && (
                        <tr className="bg-slate-50 font-bold text-slate-900">
                          {result.columns.map((column, index) => <td key={column.key} className={`whitespace-nowrap px-2 py-2 ${column.type === 'number' ? 'text-right tabular-nums' : ''}`}>{index === 0 ? 'Total (all pages)' : column.type === 'number' ? display(result.totals?.[column.key], 'number') : ''}</td>)}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Searches every employee on the server, including former staff that the browser does not hold. */
function EmployeePicker({ value, onChange }: { value: EmployeeOption | null; onChange: (value: EmployeeOption | null) => void }) {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<EmployeeOption[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      api(`/api/reports/employees?search=${encodeURIComponent(text.trim())}`).then(body => setOptions(body.employees || [])).catch(() => setOptions([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text, open]);
  if (value) {
    return (
      <div className="flex flex-col text-[11px] font-semibold text-slate-500">Employee
        <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-sm text-emerald-800">
          {value.code} {value.name}{value.status === 'Terminated' ? ' (left)' : ''}
          <button type="button" onClick={() => onChange(null)} aria-label="Clear employee" className="text-emerald-700 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
        </span>
      </div>
    );
  }
  return (
    <div className="relative flex flex-col text-[11px] font-semibold text-slate-500">Employee
      <span className="relative mt-0.5">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" />
        <input value={text} onChange={event => setText(event.target.value)} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)} placeholder="Everyone"
          className="w-48 rounded-lg border border-slate-300 bg-white py-1.5 pl-7 pr-2 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
      </span>
      {open && options.length > 0 && (
        <ul className="absolute top-full z-20 mt-1 max-h-64 w-72 overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm font-normal text-slate-700 shadow-lg">
          {options.map(option => (
            <li key={option.id}>
              <button type="button" onMouseDown={() => { onChange(option); setText(''); setOpen(false); }} className="flex w-full justify-between gap-2 px-3 py-1.5 text-left hover:bg-emerald-50">
                <span className="truncate">{option.code} {option.name}</span>
                {option.status === 'Terminated' && <span className="shrink-0 text-[10px] text-slate-400">left</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
