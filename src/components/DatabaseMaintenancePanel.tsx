import React, { useCallback, useEffect, useState } from 'react';
import { Database, Gauge, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { apiBase } from '../data/apiBase';
import { getAuthToken } from '../data/postgresStore';

interface TableInfo { name: string; bytes: number; rows: number; dead_rows: number; last_vacuum: string | null; last_analyze: string | null }
interface Run { mode: string; state: string; startedAt: string; finishedAt: string; sizeBefore: number | null; sizeAfter: number | null; error: string | null; by: string }
interface Job { mode: string; state: string; phase: string; table: string; done: number; total: number; sizeBefore: number | null; sizeAfter: number | null; error: string | null }
interface Health { database: string; bytes: number; tables: TableInfo[]; settings: Record<string, string>; deadRows: number; liveRows: number; deadShare: number; history: Run[]; job: Job | null }

const mb = (bytes: number | null) => (bytes === null || bytes === undefined ? '—' : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`);
async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiBase()}/api/maintenance/database${path}`, { ...init, cache: 'no-store', headers: { Authorization: `Bearer ${getAuthToken() || ''}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

/** Database health and optimisation for administrators (Data Backup screen). */
export function DatabaseMaintenancePanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState('');
  const [confirmDeep, setConfirmDeep] = useState(false);
  const load = useCallback(async () => { try { setHealth(await api('')); setError(''); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not read the database state.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const running = health?.job?.state === 'running';
  useEffect(() => { if (!running) return; const timer = window.setInterval(() => { void load(); }, 2000); return () => window.clearInterval(timer); }, [running, load]);

  const start = async (mode: 'quick' | 'deep', withoutBackup = false) => {
    setError(''); setConfirmDeep(false);
    try { await api('/optimize', { method: 'POST', body: JSON.stringify({ mode, withoutBackup }) }); await load(); }
    catch (startError) { setError(startError instanceof Error ? startError.message : 'Could not start.'); }
  };

  if (!health) return <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">{error || <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Reading the database…</span>}</section>;
  const job = health.job;
  const deadPercent = (health.deadShare * 100).toFixed(1);
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="db-health-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="db-health-title" className="flex items-center gap-2 text-sm font-bold text-slate-900"><Database className="h-4 w-4 text-emerald-600" /> Database health &amp; optimisation</h3>
          <p className="mt-1 text-xs text-slate-600">Quick optimisation runs every night after the backup; a deep optimisation (shrink) on the first Sunday of the month. You can also run them here.</p>
        </div>
        <button type="button" onClick={load} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-emerald-700"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Database size</p><p className="text-lg font-bold text-slate-900">{mb(health.bytes)}</p></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Records</p><p className="text-lg font-bold text-slate-900">{health.liveRows.toLocaleString()}</p></div>
        <div className={`rounded-lg border p-3 ${health.deadShare > 0.2 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unused space (old row versions)</p><p className="text-lg font-bold text-slate-900">{deadPercent}%</p><p className="text-[10px] text-slate-500">{health.deadShare > 0.2 ? 'A deep optimisation will shrink the database.' : 'Healthy.'}</p></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Memory for the database</p><p className="text-sm font-bold text-slate-900">{health.settings.shared_buffers || '—'} cache</p><p className="text-[10px] text-slate-500">work {health.settings.work_mem || '—'} · planner {health.settings.effective_cache_size || '—'}</p></div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={running} onClick={() => start('quick')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"><Gauge className="h-4 w-4" /> Quick optimise</button>
        <button type="button" disabled={running} onClick={() => setConfirmDeep(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-500 disabled:opacity-50"><Sparkles className="h-4 w-4" /> Deep optimise (shrink)…</button>
        <span className="text-xs text-slate-500">Quick is safe while people work. Deep takes a backup first and locks each table briefly: run it outside working hours.</span>
      </div>
      {confirmDeep && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span>Users may see short pauses while each table is rewritten (the attendance table can take a few minutes). Continue?</span>
          <button type="button" onClick={() => start('deep')} className="rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white hover:bg-amber-500">Back up and deep optimise</button>
          <button type="button" onClick={() => setConfirmDeep(false)} className="font-semibold text-amber-800 hover:underline">Cancel</button>
        </div>
      )}
      {job && (
        <div className={`rounded-lg border p-3 text-xs ${job.state === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`} aria-live="polite">
          {job.state === 'running'
            ? <span className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {job.mode === 'deep' ? 'Deep' : 'Quick'} optimisation: {job.phase === 'backup' ? 'taking a backup first…' : `${job.done + 1} of ${job.total || '…'} tables (${job.table || 'starting'})`}</span>
            : job.state === 'done'
              ? <span><b>{job.mode === 'deep' ? 'Deep' : 'Quick'} optimisation finished.</b> Database {mb(job.sizeBefore)} → {mb(job.sizeAfter)}.</span>
              : <span><b>Optimisation failed:</b> {job.error}</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Largest tables</p>
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase text-slate-400"><tr><th className="py-1">Table</th><th className="py-1 text-right">Size</th><th className="py-1 text-right">Records</th><th className="py-1 text-right">Unused</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {health.tables.slice(0, 8).map(table => (
                <tr key={table.name}><td className="py-1 font-mono text-slate-700">{table.name}</td><td className="py-1 text-right tabular-nums">{mb(table.bytes)}</td><td className="py-1 text-right tabular-nums">{table.rows.toLocaleString()}</td>
                  <td className={`py-1 text-right tabular-nums ${table.bytes > 1024 * 1024 && table.dead_rows / (table.rows + table.dead_rows) > 0.2 ? 'font-bold text-amber-700' : 'text-slate-500'}`}>{table.rows + table.dead_rows ? `${((table.dead_rows / (table.rows + table.dead_rows)) * 100).toFixed(0)}%` : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent optimisations</p>
          {health.history.length === 0 ? <p className="text-xs text-slate-400">None yet.</p> : (
            <ul className="space-y-1 text-xs">
              {health.history.map(run => (
                <li key={`${run.startedAt}-${run.mode}`} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-1">
                  <span className="text-slate-700">{new Date(run.startedAt).toLocaleString()} · <b>{run.mode}</b> · {run.by === 'scheduled' ? 'scheduled' : 'manual'}</span>
                  <span className={run.state === 'done' ? 'text-slate-500' : 'text-rose-600'}>{run.state === 'done' ? `${mb(run.sizeBefore)} → ${mb(run.sizeAfter)}` : run.error || run.state}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
