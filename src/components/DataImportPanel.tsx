import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileUp, Loader2, Lock, PlayCircle, PlugZap, Search, Server, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { apiBase } from '../data/apiBase';
import { getAuthToken } from '../data/postgresStore';

interface PackageInfo { id: string; fileName: string; size: number; completedAt: string; header?: { exportedAt?: string; server?: string; database?: string; fromDate?: string | null; photos?: boolean } }
interface Report {
  integrity?: string;
  warnings?: string[];
  employees?: Record<string, unknown>;
  masters?: Record<string, number>;
  attendance?: { packageDays: number; imported: number; first: string | null; last: string | null; byStatus: Record<string, number>; droppedTrailingAbsences: number; skippedExistingNewSystem: number; correctedFromAbsent?: number };
  archive?: { rows: number };
  wipe?: { removed: Record<string, number>; usersUnlinked: number };
}
interface Job { id: string; kind: 'analyze' | 'import' | 'export'; detail?: string; state: 'running' | 'done' | 'failed'; phase: string; bytes: number; size: number; startedAt: string; finishedAt: string | null; report: Report | null; error: string | null; options?: { wipe?: boolean }; backup?: { at: string } | null }
interface Status { package: PackageInfo | null; job: Job | null; chunkSize: number; confirmation: string; currentData?: Record<string, number>; wipeAllowed: boolean; liveSince: string | null; backupConfigured: boolean; sqlExport?: boolean }
interface SqlDatabase { name: string; cyberap: boolean; employees: number | null }

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const n = (value: unknown) => (typeof value === 'number' ? value.toLocaleString() : '0');
const PHASES: Record<string, string> = {
  starting: 'Starting', backup: 'Taking a safety backup', analyzing: 'Reading the package', analyzed: 'Analysis finished', wiping: 'Removing current data',
  archive: 'Archiving legacy tables', exporting: 'Reading SQL Server', employees: 'Importing employees', attendance: 'Importing attendance history', finishing: 'Finishing', done: 'Finished',
};

/**
 * Data Import (legacy CyberAP): the client's administrator moves their old system's data in themselves.
 * Upload the package made by Export-CyberAP.ps1 → Analyse (no changes) → Import. Switched on per installation by the
 * service provider; needs the "Data import" permission. Removing current data takes a safety backup first and is
 * refused once the installation is live.
 */
export function DataImportPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [upload, setUpload] = useState<{ name: string; sent: number; size: number } | null>(null);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const call = useCallback(async (path: string, init: RequestInit = {}) => {
    const isBinary = init.body instanceof ArrayBuffer;
    const response = await fetch(`${apiBase()}/api/data-import${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${getAuthToken() || ''}`, ...(init.body && !isBinary ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    });
    const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status}).`), { status: response.status, body });
    return body;
  }, []);

  const refresh = useCallback(async (withCounts = false) => {
    try { setStatus(await call(`/status${withCounts ? '?counts=1' : ''}`)); setError(''); }
    catch (refreshError) { setError(refreshError instanceof Error ? refreshError.message : 'Status could not be read.'); }
  }, [call]);

  useEffect(() => { void refresh(true); }, [refresh]);
  const running = status?.job?.state === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => { void refresh(false); }, 2000);
    return () => window.clearInterval(timer);
  }, [running, refresh]);
  const wasRunning = useRef(false);
  useEffect(() => { if (wasRunning.current && !running) void refresh(true); wasRunning.current = running; }, [running, refresh]);

  const uploadFile = async (file: File) => {
    setError(''); setBusyAction('upload');
    try {
      const started = await call('/uploads', { method: 'POST', body: JSON.stringify({ fileName: file.name, size: file.size }) });
      const chunkSize: number = started.chunkSize;
      let offset = 0;
      setUpload({ name: file.name, sent: 0, size: file.size });
      while (offset < file.size) {
        const chunk = await file.slice(offset, offset + chunkSize).arrayBuffer();
        let attempt = 0;
        for (;;) {
          try {
            offset = (await call(`/uploads/${started.uploadId}?offset=${offset}`, { method: 'PUT', body: chunk, headers: { 'Content-Type': 'application/octet-stream' } })).received;
            break;
          } catch (chunkError) {
            const body = (chunkError as { body?: { received?: number } }).body;
            if (typeof body?.received === 'number') { offset = body.received; break; } // resume where the server is
            attempt += 1;
            if (attempt >= 5) throw chunkError;
            await new Promise(resolve => window.setTimeout(resolve, 1500 * attempt));
          }
        }
        setUpload({ name: file.name, sent: offset, size: file.size });
      }
      await call(`/uploads/${started.uploadId}/complete`, { method: 'POST', body: '{}' });
      await refresh(true);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The upload failed.');
    } finally {
      setBusyAction(''); setUpload(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const run = async (kind: 'analyze' | 'import') => {
    if (!status?.package) return;
    setError(''); setBusyAction(kind);
    try {
      await call(`/${kind}`, { method: 'POST', body: JSON.stringify(kind === 'import' ? { packageId: status.package.id, wipe, confirm: confirmText.trim(), password, companyName } : { packageId: status.package.id }) });
      setConfirmText(''); setPassword('');
      await refresh(false);
    } catch (runError) { setError(runError instanceof Error ? runError.message : 'Could not start.'); }
    finally { setBusyAction(''); }
  };

  const cancel = async () => { try { await call('/cancel', { method: 'POST', body: '{}' }); await refresh(false); } catch (cancelError) { setError(cancelError instanceof Error ? cancelError.message : 'Could not cancel.'); } };
  const removePackage = async () => { try { await call('/package', { method: 'DELETE' }); await refresh(true); } catch (removeError) { setError(removeError instanceof Error ? removeError.message : 'Could not remove.'); } };

  const job = status?.job || null;
  const report = job?.report || null;
  const confirmation = status?.confirmation || 'DELETE ALL DATA';
  const currentTotal = Object.values(status?.currentData || {}).reduce((sum, value) => sum + value, 0);
  const wipeBlockedReason = !status ? '' : !status.wipeAllowed
    ? `Live since ${status.liveSince?.slice(0, 10)}: current data can no longer be removed.`
    : !status.backupConfigured ? 'Server backups are not configured, so current data cannot be removed safely.' : '';
  const canImport = Boolean(status?.package) && !running && !busyAction && (!wipe || (confirmText.trim() === confirmation && password.length > 0));
  const percent = job && job.size && job.kind !== 'export' ? Math.min(100, Math.round((job.bytes / job.size) * 100)) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-1 text-slate-800">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Database className="h-5 w-5 text-emerald-600" /> Data import from CyberAP</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Move employees, attendance history and payroll history from your old CyberAP system.{' '}
            {status?.sqlExport
              ? <>Create the package straight from SQL Server below, or upload the <code className="rounded bg-slate-100 px-1 text-xs">.cyberap.gz</code> file made by <code className="rounded bg-slate-100 px-1 text-xs text-emerald-700">Export-CyberAP.ps1</code>.</>
              : <>On the PC with SQL Server run <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-emerald-700">Export-CyberAP.ps1</code> and upload the <code className="rounded bg-slate-100 px-1 text-xs">.cyberap.gz</code> file it creates.</>}
            {' '}Analyse first: nothing changes until you press Import.
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" /> Every step is recorded in the audit log</span>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><FileUp className="h-4 w-4 text-emerald-600" /> 1 · Package</h3>
        {status?.package ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{status.package.fileName} <span className="font-normal text-slate-500">({mb(status.package.size)})</span></p>
              <p className="text-xs text-slate-500">
                From {status.package.header?.server} / {status.package.header?.database}, exported {status.package.header?.exportedAt ? new Date(status.package.header.exportedAt).toLocaleString() : '?'}
                {status.package.header?.fromDate ? ` · attendance from ${status.package.header.fromDate} only` : ' · full history'}
                {status.package.header?.photos === false ? ' · no photos' : ''}
              </p>
            </div>
            <button type="button" disabled={running} onClick={removePackage} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Remove</button>
          </div>
        ) : <p className="mt-2 text-sm text-slate-500">No package uploaded yet.</p>}
        {upload ? (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500"><span className="truncate">Uploading {upload.name}</span><span>{mb(upload.sent)} / {mb(upload.size)}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((upload.sent / upload.size) * 100)}%` }} /></div>
          </div>
        ) : (
          <label className={`mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 ${running || busyAction ? 'pointer-events-none opacity-50' : ''}`}>
            <FileUp className="h-4 w-4" /> {status?.package ? 'Upload a different package' : 'Choose package (.cyberap.gz)'}
            <input ref={fileInput} type="file" accept=".gz" className="sr-only" onChange={event => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
          </label>
        )}
        {status?.sqlExport && <SqlExportBox call={call} disabled={running || Boolean(busyAction)} onStarted={() => refresh(false)} onError={setError} />}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><Database className="h-4 w-4 text-emerald-600" /> 2 · Analyse and import</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${wipeBlockedReason ? 'border-slate-200 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'}`}>
            <input type="checkbox" checked={wipe} onChange={event => { setWipe(event.target.checked); setConfirmText(''); setPassword(''); }} disabled={running || Boolean(wipeBlockedReason)} className="mt-0.5 h-4 w-4 accent-rose-600" />
            <span>
              <span className="flex items-center gap-1.5 font-semibold text-slate-900">Remove all current data first {wipeBlockedReason && <Lock className="h-3.5 w-3.5 text-slate-400" />}</span>
              <span className="block text-xs leading-snug text-slate-500">
                {wipeBlockedReason || `For a new setup with only test data. Deletes every employee, attendance, leave, loan, payroll run and payslip${currentTotal ? ` (${currentTotal.toLocaleString()} records now)` : ''}, plus branches, departments, designations and holidays. Users and company settings are kept. A full backup is taken first.`}
              </span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-semibold text-slate-700">Company name</span>
            <span className="block text-xs text-slate-500">Used only if no company is set up yet.</span>
            <input value={companyName} onChange={event => setCompanyName(event.target.value)} disabled={running} placeholder="e.g. Bin Ishaq Traders"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
        </div>
        {wipe && (
          <div className="mt-3 grid gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 md:grid-cols-2">
            <p className="flex items-start gap-2 md:col-span-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> This removes your current data. A safety backup is taken automatically before anything is deleted; your service provider can restore it.</p>
            <label className="block">
              <span className="text-xs font-semibold">Type <b>{confirmation}</b></span>
              <input value={confirmText} onChange={event => setConfirmText(event.target.value)} disabled={running} aria-label="Confirmation"
                className="mt-1 w-full rounded-lg border border-rose-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-rose-500" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold">Your password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={running}
                className="mt-1 w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-500" />
            </label>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => run('analyze')} disabled={!status?.package || running || Boolean(busyAction)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:border-emerald-500 disabled:opacity-40">
            <Search className="h-4 w-4" /> Analyse (no changes)
          </button>
          <button type="button" onClick={() => run('import')} disabled={!canImport}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm disabled:opacity-40 ${wipe ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            <PlayCircle className="h-4 w-4" /> {wipe ? 'Back up, remove current data and import' : 'Import (keep current data)'}
          </button>
          {running && <button type="button" onClick={cancel} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 hover:text-rose-600"><XCircle className="h-4 w-4" /> Cancel</button>}
        </div>
      </section>

      {job && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold text-slate-900">
              {job.state === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> : job.state === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
              {job.kind === 'analyze' ? 'Analysis' : job.kind === 'export' ? 'Package from SQL Server' : 'Import'} · {job.state === 'running' ? PHASES[job.phase] || job.phase : job.state === 'done' ? 'finished' : 'failed'}
            </h3>
            <span className="text-xs text-slate-500">Started {new Date(job.startedAt).toLocaleTimeString()}{job.finishedAt ? ` · ended ${new Date(job.finishedAt).toLocaleTimeString()}` : ''}{job.backup ? ` · backup ${new Date(job.backup.at).toLocaleTimeString()}` : ''}</span>
          </div>
          {job.state === 'running' && job.kind === 'export' && (
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full w-1/3 animate-pulse rounded bg-emerald-500" /></div>
              <p className="mt-1 text-xs text-slate-500">{job.detail || 'Working'}{job.bytes ? ` · ${mb(job.bytes)} written` : ''}</p>
            </div>
          )}
          {job.state === 'done' && job.kind === 'export' && <p className="mt-2 text-xs text-slate-600">The package is ready{job.size ? ` (${mb(job.size)})` : ''}. Press <b>Analyse (no changes)</b> to check it.</p>}
          {job.state === 'running' && job.kind !== 'export' && (
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500">{percent}% of the package read</p>
            </div>
          )}
          {job.error && <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">{job.error}</p>}
          {report && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Stat title="Employees" lines={[
                ['Total', n(report.employees?.total)], ['Active', n(report.employees?.active)], ['Left / inactive', n(report.employees?.inactive)],
                ['Active, no attendance in 30 days', n(report.employees?.activeWithoutRecentAttendance)], ['Active without valid CNIC', n(report.employees?.invalidCnic)],
                ['Active without real salary', n(report.employees?.placeholderSalary)], ['Photos', n(report.employees?.withThumb)], ['Fingerprints (archived)', n(report.employees?.withFingerprint)],
              ]} />
              <Stat title="Attendance" lines={[
                ['Days in package', n(report.attendance?.packageDays)], [job.kind === 'analyze' ? 'Days to import' : 'Days imported', n(report.attendance?.imported)],
                ['Period', report.attendance?.first ? `${report.attendance.first} → ${report.attendance.last}` : '—'],
                ...Object.entries(report.attendance?.byStatus || {}).map(([key, value]) => [`  ${key}`, n(value)] as [string, string]),
                ['Absent corrected from punches', n(report.attendance?.correctedFromAbsent)], ['Absences after leaving (dropped)', n(report.attendance?.droppedTrailingAbsences)],
                ['Kept (already recorded here)', n(report.attendance?.skippedExistingNewSystem)],
              ]} />
              <Stat title="Setup & archive" lines={[
                ['Branches', n(report.masters?.branches)], ['Departments', n(report.masters?.departments)], ['Designations', n(report.masters?.designations)], ['Holidays', n(report.masters?.holidays)],
                ['Archived legacy rows', n(report.archive?.rows)], ['Package check', report.integrity || '—'],
                ...(report.wipe ? [['Records removed', n(Object.values(report.wipe.removed).reduce((a, b) => a + b, 0))] as [string, string]] : []),
              ]} />
            </div>
          )}
          {report?.warnings && report.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {report.warnings.map(warning => <li key={warning} className="flex gap-2 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />{warning}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Option B on Windows installations: the server reads CyberAP from SQL Server itself and creates the package. */
function SqlExportBox({ call, disabled, onStarted, onError }: { call: (path: string, init?: RequestInit) => Promise<any>; disabled: boolean; onStarted: () => void; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [instances, setInstances] = useState<string[]>([]);
  const [server, setServer] = useState('');
  const [auth, setAuth] = useState<'windows' | 'sql'>('sql');
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [databases, setDatabases] = useState<SqlDatabase[] | null>(null);
  const [version, setVersion] = useState('');
  const [database, setDatabase] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [noPhotos, setNoPhotos] = useState(false);
  const [working, setWorking] = useState('');

  useEffect(() => {
    if (!open || instances.length) return;
    call('/sql/instances').then(body => {
      const found: string[] = body.instances || [];
      setInstances(found);
      setServer(current => current || found[0] || '');
    }).catch(() => undefined);
  }, [open, instances.length, call]);

  const connection = () => ({ server: server.trim(), auth, user: auth === 'sql' ? user.trim() : '', password: auth === 'sql' ? password : '' });
  const connect = async () => {
    onError(''); setWorking('connect'); setDatabases(null); setDatabase('');
    try {
      const body = await call('/sql/databases', { method: 'POST', body: JSON.stringify(connection()) });
      const list: SqlDatabase[] = body.databases || [];
      setDatabases(list); setVersion(body.version || '');
      const first = list.find(item => item.cyberap);
      if (first) setDatabase(first.name);
    } catch (connectError) { onError(connectError instanceof Error ? connectError.message : 'Could not connect.'); }
    finally { setWorking(''); }
  };
  const create = async () => {
    onError(''); setWorking('export');
    try {
      await call('/sql/export', { method: 'POST', body: JSON.stringify({ ...connection(), database, fromDate: fromDate || undefined, noPhotos }) });
      setPassword(''); setOpen(false); setDatabases(null);
      onStarted();
    } catch (exportError) { onError(exportError instanceof Error ? exportError.message : 'Could not start.'); }
    finally { setWorking(''); }
  };

  const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50';
  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
        <span className="text-slate-500">or</span>
        <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50">
          <Server className="h-4 w-4" /> Create package from SQL Server
        </button>
        <span className="text-xs text-slate-400">Reads CyberAP directly from SQL Server. Read-only: CyberAP is not changed.</span>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold text-slate-900"><Server className="h-4 w-4 text-emerald-600" /> Create package from SQL Server</p>
        <button type="button" onClick={() => { setOpen(false); setPassword(''); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Close</button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700">SQL Server instance</span>
          <input list="sql-instances" value={server} onChange={event => { setServer(event.target.value); setDatabases(null); }} placeholder=".\SQLEXPRESS" disabled={Boolean(working)} className={field} />
          <datalist id="sql-instances">{instances.map(name => <option key={name} value={name} />)}</datalist>
        </label>
        <div className="block">
          <span className="text-xs font-semibold text-slate-700">Sign in with</span>
          <div className="mt-1 flex gap-1 rounded-lg border border-slate-300 bg-white p-1">
            {(['sql', 'windows'] as const).map(value => (
              <button key={value} type="button" onClick={() => { setAuth(value); setDatabases(null); }} disabled={Boolean(working)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold ${auth === value ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {value === 'sql' ? 'SQL login' : 'Windows (service account)'}
              </button>
            ))}
          </div>
        </div>
        {auth === 'sql' ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="block"><span className="text-xs font-semibold text-slate-700">Login</span><input value={user} onChange={event => setUser(event.target.value)} placeholder="sa" autoComplete="off" disabled={Boolean(working)} className={field} /></label>
            <label className="block"><span className="text-xs font-semibold text-slate-700">Password</span><input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" disabled={Boolean(working)} className={field} /></label>
          </div>
        ) : (
          <p className="self-end text-xs leading-snug text-slate-500">Connects as this server's computer account (the app service runs as NetworkService). Give it read access to CyberAP first; the Windows Server guide has the command.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={connect} disabled={!server.trim() || (auth === 'sql' && !user.trim()) || Boolean(working) || disabled}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-500 disabled:opacity-40">
          {working === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Connect and list databases
        </button>
        {version && databases && <span className="text-xs text-slate-500">SQL Server {version}</span>}
      </div>
      {databases && (databases.length === 0 ? <p className="text-xs text-slate-500">This login cannot open any database.</p> : (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {databases.map(item => (
              <label key={item.name} className={`flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 ${database === item.name ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200'} ${item.cyberap ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <span className="flex min-w-0 items-center gap-2">
                  <input type="radio" name="sql-database" checked={database === item.name} disabled={!item.cyberap} onChange={() => setDatabase(item.name)} className="accent-emerald-600" />
                  <span className="truncate font-semibold text-slate-800">{item.name}</span>
                </span>
                {item.cyberap
                  ? <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">CyberAP · {n(item.employees)} staff</span>
                  : <span className="shrink-0 text-[10px] text-slate-400">not CyberAP</span>}
              </label>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">Attendance from (optional)</span>
              <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} disabled={Boolean(working)} className={field} />
              <span className="text-[11px] text-slate-500">Empty = full history. A date makes a top-up package after go-live.</span>
            </label>
            <label className="flex items-center gap-2 self-center text-xs text-slate-700">
              <input type="checkbox" checked={noPhotos} onChange={event => setNoPhotos(event.target.checked)} className="h-4 w-4 accent-emerald-600" /> Skip employee photos (smaller, faster)
            </label>
            <button type="button" onClick={create} disabled={!database || Boolean(working) || disabled}
              className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40">
              {working === 'export' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} Create package
            </button>
          </div>
          <p className="text-[11px] text-slate-500">This replaces any package already uploaded. The full history takes several minutes; you can close this page and come back.</p>
        </div>
      ))}
    </div>
  );
}

function Stat({ title, lines }: { title: string; lines: Array<[string, string]> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      <dl className="space-y-0.5">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-xs"><dt className="truncate whitespace-pre text-slate-500">{label}</dt><dd className="shrink-0 font-semibold text-slate-900">{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}
