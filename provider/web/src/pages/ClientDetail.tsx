import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Archive, DatabaseBackup, ExternalLink, FileText, Globe, HeartPulse, KeyRound, Plus, Power, RefreshCw, Smartphone, Star, Trash2, Upload } from 'lucide-react';
import { api, ago, fmtBytes, fmtDate, fmtDateTime } from '../api';
import { Badge, Button, Card, Copyable, Empty, Field, inputClass, LICENCE_LABEL, licenceTone, Notice, Stat, statusTone } from '../ui';
import { canOperate, navigate, RoleContext } from '../App';
import { JobSteps, KIND_LABEL } from './JobPage';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Detail = any;

const FEATURE_LABELS: Record<string, string> = {
  incomeTax: 'FBR income tax', eobi: 'EOBI', socialSecurity: 'Social security (PESSI / SESSI)', providentFund: 'Provident fund', gratuity: 'Gratuity & final settlement',
  bankPayroll: 'Bank payroll', makerChecker: 'Maker-checker approvals', requireEmployeeEmail: 'Employee email required', recruitment: 'Recruitment', performance: 'Performance reviews',
  assets: 'Asset management', loans: 'Loans & advances', salaryRevisions: 'Salary revisions', parallelRun: 'Parallel-run reconciliation', goLiveChecklist: 'Go-live checklist',
};

const TABS = [
  ['overview', 'Overview'], ['domains', 'Domains'], ['licence', 'Licence & edition'], ['devices', 'Kiosks & app'],
  ['releases', 'Releases'], ['backups', 'Backups'], ['jobs', 'Jobs'], ['activity', 'Activity'],
] as const;

export function ClientDetail({ id, tab }: { id: string; tab: string }) {
  const user = useContext(RoleContext);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api(`/clients/${id}`).then(setData).catch(loadError => setError(loadError.message)), [id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (label: string, run: () => Promise<any>, done?: string) => {
    setBusy(label); setError(''); setMessage('');
    try {
      const result = await run();
      if (result && result.ok === false && result.instructions) setMessage(`Do this in aaPanel: ${result.instructions.join(' ')}`);
      else if (done) setMessage(done);
      await load();
      return result;
    } catch (actError) { setError((actError as Error).message); return null; } finally { setBusy(''); }
  };

  if (!data) return <p className="text-sm text-slate-500">{error || 'Loading…'}</p>;
  const { client } = data;
  const operator = canOperate(user);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a href="#/" className="text-xs font-semibold text-emerald-700 hover:underline">← All clients</a>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">{client.name} <Badge tone={statusTone(client.status)}>{client.status}</Badge> <Badge tone={licenceTone(client.licenceSummary?.state)}>{LICENCE_LABEL[client.licenceSummary?.state] || '—'}</Badge></h1>
          <p className="text-sm text-slate-500"><a href={client.platformUrl} target="_blank" rel="noreferrer" className="font-mono hover:text-emerald-700">{client.platformUrl.replace('https://', '')}</a> · {client.edition?.id === 'lite' ? 'Lite' : 'Full'} edition · release {client.release} · port {client.port}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/clients/${client.id}/handover`} target="_blank" rel="noreferrer"><Button><FileText className="h-4 w-4" /> Handover sheet</Button></a>
          {operator && client.status !== 'archived' && <Button busy={busy === 'restart'} onClick={() => act('restart', () => api(`/clients/${client.id}/restart`, { method: 'POST' }), 'Restart requested.')}><RefreshCw className="h-4 w-4" /> Restart</Button>}
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="info">{message}</Notice>}

      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map(([key, label]) => (
          <a key={key} href={`#/clients/${client.id}/${key}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === key ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</a>
        ))}
      </nav>

      {tab === 'overview' && <Overview data={data} busy={busy} act={act} />}
      {tab === 'domains' && <Domains data={data} operator={operator} act={act} busy={busy} reload={load} />}
      {tab === 'licence' && <Licence data={data} operator={operator} act={act} busy={busy} isOwner={user?.role === 'owner'} />}
      {tab === 'devices' && <Devices data={data} operator={operator} act={act} />}
      {tab === 'releases' && <Releases data={data} operator={operator} act={act} busy={busy} />}
      {tab === 'backups' && <Backups data={data} operator={operator} act={act} busy={busy} />}
      {tab === 'jobs' && <Jobs data={data} reload={load} />}
      {tab === 'activity' && <ActivityList entries={data.audit} />}
    </div>
  );
}

function Overview({ data, busy, act }: { data: Detail; busy: string; act: any }) {
  const { client, health, domains, jobs } = data;
  const openJob = jobs.find((job: any) => job.state !== 'done');
  return (
    <div className="space-y-4">
      {openJob && (
        <Card title={`${KIND_LABEL[openJob.kind] || openJob.kind} — ${openJob.state === 'waiting' ? 'waiting for you' : openJob.state}`} actions={<a href={`#/jobs/${openJob.id}`} className="text-xs font-semibold text-emerald-700">Open job</a>}>
          <JobSteps jobId={openJob.id} compact />
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Health" value={health ? (health.api_ok ? 'Up' : 'Down') : '—'} tone={health ? (health.api_ok ? 'green' : 'red') : undefined} sub={health ? `${health.api_ms ?? '—'} ms · checked ${ago(health.checked_at)}` : 'not checked yet'} />
        <Stat label="Active employees" value={health?.active_employees ?? '—'} sub={client.licence?.staffLimit ? `limit ${client.licence.staffLimit}` : 'no limit'} />
        <Stat label="Attendance today" value={health?.attendance_today ?? '—'} sub={health?.kiosks_total ? `${health.kiosks_seen_24h}/${health.kiosks_total} kiosks online (24 h)` : 'no kiosks'} />
        <Stat label="Database" value={fmtBytes(health?.db_bytes)} sub={`last backup ${ago(data.backups.find((backup: any) => backup.status === 'done')?.created_at)}`} />
      </div>
      {health?.error && <Notice tone="error">{health.error}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Addresses">
          <ul className="space-y-2 text-sm">
            {domains.map((domain: any) => (
              <li key={domain.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono">{domain.domain}</span>
                <span className="flex gap-1">{domain.kind === 'platform' ? <Badge tone="violet">platform · devices</Badge> : <Badge>{domain.kind}</Badge>}{domain.is_primary && domain.kind !== 'platform' && <Badge tone="blue">primary</Badge>}<Badge tone={domain.status === 'active' ? 'green' : domain.status === 'error' ? 'red' : 'amber'}>{domain.status}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Details" actions={<Button busy={busy === 'health'} onClick={() => act('health', () => api(`/clients/${client.id}/health`, { method: 'POST' }), 'Health checked.')}><HeartPulse className="h-4 w-4" /> Check now</Button>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Contact</dt><dd>{client.contact_name || '—'} · {client.contact_email || '—'} · {client.contact_phone || '—'}</dd>
            <dt className="text-slate-500">Licence</dt><dd>{client.licence?.plan || '—'} · until {client.licence?.expiresAt || 'no end date'}</dd>
            <dt className="text-slate-500">Data import</dt><dd>{client.features?.clientDataImport ? 'Allowed for the client\'s IT' : 'Off'}</dd>
            <dt className="text-slate-500">aaPanel project</dt><dd className="font-mono">{client.projectName}</dd>
            <dt className="text-slate-500">Folder</dt><dd className="break-all font-mono text-xs">{client.folder}</dd>
            <dt className="text-slate-500">Database</dt><dd className="font-mono">{client.db_name}</dd>
            <dt className="text-slate-500">Created</dt><dd>{fmtDateTime(client.created_at)}</dd>
            {client.notes && <><dt className="text-slate-500">Notes</dt><dd>{client.notes}</dd></>}
          </dl>
        </Card>
      </div>
    </div>
  );
}

const DOMAIN_HELP: Record<string, string> = {
  subdomain: 'Their own subdomain (e.g. hr.company.com) with a CNAME to the platform address. Recommended: set once, survives server moves.',
  apex: 'A root domain (company.com) with an A record to this server. Replaces any website on it; a server move needs the client to update the record.',
  nameservers: 'A dedicated domain whose nameservers point to us; we manage every record.',
};

function Domains({ data, operator, act, busy, reload }: { data: Detail; operator: boolean; act: any; busy: string; reload: () => void }) {
  const { client, domains, jobs } = data;
  const [domain, setDomain] = useState('');
  const [mode, setMode] = useState<'records' | 'nameservers'>('records');
  const [warning, setWarning] = useState('');
  const attachJobs = jobs.filter((job: any) => job.kind === 'domain-attach' && job.state !== 'done');
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await act('add-domain', () => api(`/clients/${client.id}/domains`, { method: 'POST', body: { domain, mode } }));
    if (result) { setDomain(''); setWarning(result.warning || ''); }
  };
  return (
    <div className="space-y-4">
      <Notice tone="info">Every client keeps <b className="font-mono">{client.platformUrl.replace('https://', '')}</b>. Kiosks and the mobile app always use it, so attendance keeps working even if the client's own DNS breaks. A custom domain is extra, for people in a browser.</Notice>
      {warning && <Notice tone="warn">{warning}</Notice>}
      {operator && client.status !== 'archived' && (
        <Card title="Add the client's own domain">
          <form onSubmit={add} className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <Field label="Domain" hint="hr.company.com (recommended) · company.com · a domain bought for HR"><input required value={domain} onChange={event => setDomain(event.target.value)} placeholder="hr.company.com" className={`${inputClass} font-mono`} /></Field>
            <Field label="If it is a root domain"><select value={mode} onChange={event => setMode(event.target.value as 'records' | 'nameservers')} className={inputClass}><option value="records">Client adds an A record</option><option value="nameservers">Nameservers point to us</option></select></Field>
            <Button type="submit" variant="primary" busy={busy === 'add-domain'}><Plus className="h-4 w-4" /> Add domain</Button>
          </form>
          <ul className="mt-3 grid gap-1 text-xs text-slate-500 md:grid-cols-3">{Object.entries(DOMAIN_HELP).map(([key, text]) => <li key={key}><b className="text-slate-700">{key}:</b> {text}</li>)}</ul>
        </Card>
      )}
      {attachJobs.map((job: any) => (
        <Card key={job.id} title="Connecting a domain"><JobSteps jobId={job.id} compact onFinished={reload} /></Card>
      ))}
      <Card title="Domains">
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2">Domain</th><th className="px-2">Type</th><th className="px-2">Status</th><th className="px-2">Certificate</th><th className="px-2">Registration</th><th className="px-4 text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {domains.map((row: any) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5"><a href={`https://${row.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:text-emerald-700">{row.domain}<ExternalLink className="h-3 w-3" /></a>{row.last_error && <p className="text-xs text-rose-600">{row.last_error}</p>}</td>
                  <td className="px-2">{row.kind === 'platform' ? <Badge tone="violet">platform</Badge> : <Badge>{row.kind}</Badge>} {row.is_primary && row.kind !== 'platform' && <Badge tone="blue">primary</Badge>}</td>
                  <td className="px-2"><Badge tone={row.status === 'active' ? 'green' : row.status === 'error' ? 'red' : 'amber'}>{row.status.replace('_', ' ')}</Badge><p className="text-[11px] text-slate-400">checked {ago(row.last_checked_at)}</p></td>
                  <td className="px-2 text-xs">{row.ssl_expires_at ? <>{fmtDate(row.ssl_expires_at)}<p className="text-slate-400">{row.ssl_issuer}</p></> : '—'}</td>
                  <td className="px-2 text-xs">{row.kind === 'platform' ? '—' : row.domain_expires_at ? fmtDate(row.domain_expires_at) : 'unknown'}</td>
                  <td className="px-4 text-right">
                    <div className="flex justify-end gap-1">
                      {row.kind !== 'platform' && <a href={`/api/domains/${row.id}/instructions`} target="_blank" rel="noreferrer"><Button variant="ghost" title="Instructions for the client's IT (print / PDF)"><FileText className="h-4 w-4" /></Button></a>}
                      {operator && row.kind !== 'platform' && !row.is_primary && <Button variant="ghost" title="Make primary" onClick={() => act('primary', () => api(`/domains/${row.id}/primary`, { method: 'POST' }), `${row.domain} is now the primary address.`)}><Star className="h-4 w-4" /></Button>}
                      {operator && row.kind !== 'platform' && <Button variant="ghost" title="Remove" onClick={() => { if (window.confirm(`Remove ${row.domain}? Users will no longer reach the system at this address.`)) void act('remove', () => api(`/domains/${row.id}`, { method: 'DELETE' }), `${row.domain} removed.`); }}><Trash2 className="h-4 w-4 text-rose-600" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Licence({ data, operator, act, busy, isOwner }: { data: Detail; operator: boolean; act: any; busy: string; isOwner: boolean }) {
  const { client, editionPresets, editionFeatureKeys } = data;
  const [edition, setEdition] = useState<{ id: string; features: Record<string, boolean> }>(() => ({ id: client.edition?.id || 'full', features: { ...(client.edition?.features || editionPresets[client.edition?.id || 'full']) } }));
  const [licence, setLicence] = useState({ plan: client.licence?.plan || '', expiresAt: client.licence?.expiresAt || '', staffLimit: client.licence?.staffLimit ?? '', graceDays: client.licence?.graceDays ?? 7, autoSuspend: client.licence?.autoSuspend !== false, message: client.licence?.message || '' });
  const [features, setFeatures] = useState({ clientDataImport: client.features?.clientDataImport === true });
  const [contact, setContact] = useState({ name: client.name, contactName: client.contact_name, contactEmail: client.contact_email, contactPhone: client.contact_phone, notes: client.notes });
  const suspended = client.licence?.status === 'suspended';
  const save = () => act('save', () => api(`/clients/${client.id}`, { method: 'PUT', body: {
    ...contact, edition, features,
    licence: { ...licence, staffLimit: licence.staffLimit === '' ? null : Number(licence.staffLimit), expiresAt: licence.expiresAt || null, graceDays: Number(licence.graceDays) || 0 },
  } }), 'Saved. The client sees the change within 15 seconds.');
  const setStatus = (status: 'active' | 'suspended') => act('status', () => api(`/clients/${client.id}`, { method: 'PUT', body: { licence: { status } } }), status === 'suspended' ? 'Suspended: users cannot sign in (within 15 seconds); kiosks keep recording.' : 'Resumed.');
  return (
    <div className="space-y-4">
      <Card title="Licence" actions={operator && (suspended
        ? <Button variant="primary" busy={busy === 'status'} onClick={() => setStatus('active')}><Power className="h-4 w-4" /> Resume</Button>
        : <Button variant="danger" busy={busy === 'status'} onClick={() => { if (window.confirm(`Suspend ${client.name}? Nobody will be able to sign in until you resume it.`)) void setStatus('suspended'); }}><Power className="h-4 w-4" /> Suspend now</Button>)}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Plan"><input disabled={!operator} value={licence.plan} onChange={event => setLicence({ ...licence, plan: event.target.value })} className={inputClass} /></Field>
          <Field label="Valid until" hint="Empty = no end date"><input disabled={!operator} type="date" value={licence.expiresAt} onChange={event => setLicence({ ...licence, expiresAt: event.target.value })} className={inputClass} /></Field>
          <Field label="Active staff limit" hint="Empty = unlimited"><input disabled={!operator} type="number" min={1} value={licence.staffLimit} onChange={event => setLicence({ ...licence, staffLimit: event.target.value })} className={inputClass} /></Field>
          <Field label="Grace days after expiry"><input disabled={!operator} type="number" min={0} max={90} value={licence.graceDays} onChange={event => setLicence({ ...licence, graceDays: Number(event.target.value) })} className={inputClass} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input disabled={!operator} type="checkbox" checked={licence.autoSuspend} onChange={event => setLicence({ ...licence, autoSuspend: event.target.checked })} className="accent-emerald-600" /> Suspend automatically when the grace period ends (users are warned from 14 days before expiry)</label>
          <Field label="Message shown when suspended" className="sm:col-span-3"><input disabled={!operator} value={licence.message} onChange={event => setLicence({ ...licence, message: event.target.value })} placeholder="This installation is suspended. Contact your service provider to restore access." className={inputClass} /></Field>
        </div>
      </Card>
      <Card title="Edition">
        <div className="mb-3 flex gap-2">
          {['full', 'lite'].map(id => <Button key={id} variant={edition.id === id ? 'primary' : 'secondary'} disabled={!operator} onClick={() => setEdition({ id, features: { ...editionPresets[id] } })}>{id === 'full' ? 'Full compliance' : 'Lite (small business)'}</Button>)}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {editionFeatureKeys.map((key: string) => (
            <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input disabled={!operator} type="checkbox" checked={edition.features[key] !== false} onChange={event => setEdition({ ...edition, features: { ...edition.features, [key]: event.target.checked } })} className="accent-emerald-600" />{FEATURE_LABELS[key] || key}</label>
          ))}
        </div>
      </Card>
      <Card title="Switches">
        <label className="flex items-start gap-2 text-sm"><input disabled={!operator} type="checkbox" checked={features.clientDataImport} onChange={event => setFeatures({ clientDataImport: event.target.checked })} className="mt-1 accent-emerald-600" /><span><b>Client data import (CyberAP)</b><span className="block text-xs text-slate-500">The client's Super Admin (or users with the Data import permission) can upload and import a CyberAP export themselves. A safety backup is taken before any wipe, and wiping is locked once payroll has been paid.</span></span></label>
      </Card>
      <Card title="Client details">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name"><input disabled={!operator} value={contact.name} onChange={event => setContact({ ...contact, name: event.target.value })} className={inputClass} /></Field>
          <Field label="Contact person"><input disabled={!operator} value={contact.contactName} onChange={event => setContact({ ...contact, contactName: event.target.value })} className={inputClass} /></Field>
          <Field label="Contact email"><input disabled={!operator} value={contact.contactEmail} onChange={event => setContact({ ...contact, contactEmail: event.target.value })} className={inputClass} /></Field>
          <Field label="Contact phone"><input disabled={!operator} value={contact.contactPhone} onChange={event => setContact({ ...contact, contactPhone: event.target.value })} className={inputClass} /></Field>
          <Field label="Internal notes" className="sm:col-span-2"><textarea disabled={!operator} rows={2} value={contact.notes} onChange={event => setContact({ ...contact, notes: event.target.value })} className={inputClass} /></Field>
        </div>
      </Card>
      {operator && <div className="flex flex-wrap items-center justify-between gap-2">
        {isOwner ? (client.status === 'archived'
          ? <Button onClick={() => act('archive', () => api(`/clients/${client.id}/unarchive`, { method: 'POST' }), 'Client restored and started.')}><Archive className="h-4 w-4" /> Restore from archive</Button>
          : <Button variant="ghost" onClick={() => { if (window.confirm(`Archive ${client.name}? The app is stopped; the database, files and backups are kept.`)) void act('archive', () => api(`/clients/${client.id}/archive`, { method: 'POST' }), 'Client archived.'); }}><Archive className="h-4 w-4" /> Archive client</Button>) : <span />}
        <Button variant="primary" busy={busy === 'save'} onClick={save}>Save changes</Button>
      </div>}
    </div>
  );
}

function Devices({ data, operator, act }: { data: Detail; operator: boolean; act: any }) {
  const { client, kioskCodes } = data;
  const [created, setCreated] = useState<{ code: string; qr: string; expiresAt: string; maxUses: number } | null>(null);
  const [form, setForm] = useState({ label: '', maxUses: 1, expiresInHours: 72 });
  const [mobile, setMobile] = useState<{ code: string; qr: string; urls: string[] } | null>(null);
  useEffect(() => { api(`/clients/${client.id}/mobile-code`).then(setMobile).catch(() => undefined); }, [client.id]);
  const create = async () => { const result = await act('kiosk', () => api(`/clients/${client.id}/kiosk-codes`, { method: 'POST', body: form })); if (result) setCreated(result); };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-600" /> Kiosk setup codes</span>}>
        <p className="mb-3 text-sm text-slate-600">A setup code registers an attendance kiosk without typing an account password at the branch. In the kiosk: Settings → Server registration → Setup code → paste or scan.</p>
        {operator && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Label"><input value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} placeholder="e.g. Main gate" className={inputClass} /></Field>
            <Field label="Kiosks"><input type="number" min={1} max={100} value={form.maxUses} onChange={event => setForm({ ...form, maxUses: Number(event.target.value) })} className={inputClass} /></Field>
            <Field label="Valid for (hours)"><input type="number" min={1} max={720} value={form.expiresInHours} onChange={event => setForm({ ...form, expiresInHours: Number(event.target.value) })} className={inputClass} /></Field>
            <div className="sm:col-span-3"><Button variant="primary" onClick={create}><Plus className="h-4 w-4" /> Create setup code</Button></div>
          </div>
        )}
        {created && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
            <img src={created.qr} alt="Kiosk setup code" className="mx-auto h-48 w-48" />
            <p className="mt-2 break-all font-mono text-[11px] text-slate-700">{created.code}</p>
            <div className="mt-2 flex justify-center gap-2"><Copyable text={created.code} label="Copy code" /><Button variant="ghost" onClick={() => window.print()}>Print</Button></div>
            <p className="mt-1 text-xs text-slate-600">Valid until {fmtDateTime(created.expiresAt)} for {created.maxUses} kiosk(s). Shown once: copy or print it now.</p>
          </div>
        )}
        <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Recent codes</h3>
        {kioskCodes.length === 0 ? <Empty>No setup codes yet.</Empty> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {kioskCodes.map((code: any) => {
              const expired = new Date(code.expires_at) < new Date();
              return (
                <li key={code.id} className="flex items-center justify-between gap-2 py-2">
                  <span><b>{code.label || 'Kiosk'}</b> <span className="text-xs text-slate-500">{code.uses}/{code.max_uses} used · until {fmtDateTime(code.expires_at)}</span></span>
                  {code.revoked_at ? <Badge>revoked</Badge> : expired ? <Badge>expired</Badge> : code.uses >= code.max_uses ? <Badge tone="green">used</Badge>
                    : operator ? <Button variant="ghost" onClick={() => act('revoke', () => api(`/clients/${client.id}/kiosk-codes/${code.id}/revoke`, { method: 'POST' }), 'Code revoked.')}>Revoke</Button> : <Badge tone="amber">open</Badge>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={<span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-emerald-600" /> Mobile app connection code</span>}>
        <p className="mb-3 text-sm text-slate-600">Employees install the HR mobile app and enter (or scan) this code on the first screen. It holds only the company's addresses, no password: employees still sign in with their own account.</p>
        {mobile ? (
          <div className="text-center">
            <img src={mobile.qr} alt="Mobile connection code" className="mx-auto h-48 w-48" />
            <p className="mt-2 break-all font-mono text-[11px] text-slate-700">{mobile.code}</p>
            <div className="mt-2 flex justify-center gap-2"><Copyable text={mobile.code} label="Copy code" /><Button variant="ghost" onClick={() => window.print()}>Print</Button></div>
            <p className="mt-1 text-xs text-slate-500">Addresses: {mobile.urls.join(' · ')}</p>
          </div>
        ) : <p className="text-sm text-slate-500">Loading…</p>}
      </Card>
    </div>
  );
}

function Releases({ data, operator, act, busy }: { data: Detail; operator: boolean; act: any; busy: string }) {
  const { client, releases } = data;
  const [target, setTarget] = useState(releases.find((release: any) => release.name !== client.release && release.ready)?.name || '');
  const start = async () => { const result = await act('release', () => api(`/clients/${client.id}/release`, { method: 'POST', body: { release: target } })); if (result?.jobId) navigate(`/jobs/${result.jobId}`); };
  return (
    <Card title="Application release">
      <p className="text-sm">This client runs <b className="font-mono">{client.release}</b>. Switching takes a safety backup, points the client at the new release, runs database migrations and restarts it. Try a new release on one client first, then roll it out to the rest.</p>
      {operator && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Switch to"><select value={target} onChange={event => setTarget(event.target.value)} className={inputClass}>
            <option value="">Choose a release</option>
            {releases.filter((release: any) => release.name !== client.release).map((release: any) => <option key={release.name} value={release.name} disabled={!release.ready}>{release.name} {release.version ? `(v${release.version})` : ''}{release.ready ? '' : ' — not ready'}</option>)}
          </select></Field>
          <Button variant="primary" disabled={!target} busy={busy === 'release'} onClick={start}><Upload className="h-4 w-4" /> Switch release</Button>
        </div>
      )}
      <table className="mt-4 w-full text-sm">
        <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="py-2">Release</th><th>Version</th><th>Migrations</th><th>Installed</th><th>Ready</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{releases.map((release: any) => <tr key={release.name}><td className="py-2 font-mono">{release.name} {release.name === client.release && <Badge tone="green">current</Badge>}</td><td>{release.version || '—'}</td><td>{release.migrations}</td><td>{fmtDate(release.createdAt)}</td><td>{release.ready ? <Badge tone="green">yes</Badge> : <Badge tone="amber">npm ci / build missing</Badge>}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

function Backups({ data, operator, act, busy }: { data: Detail; operator: boolean; act: any; busy: string }) {
  const { client, backups, backupFiles } = data;
  return (
    <div className="space-y-4">
      <Card title="Backups" actions={operator && <Button variant="primary" busy={busy === 'backup'} onClick={() => act('backup', () => api(`/clients/${client.id}/backup`, { method: 'POST' }), 'Backup finished.')}><DatabaseBackup className="h-4 w-4" /> Back up now</Button>}>
        <p className="mb-3 text-sm text-slate-600">Encrypted with the client's own BACKUP_ENCRYPTION_KEY (kept in its .env; keep a copy off the server). Nightly backups run from aaPanel Cron (<code className="text-xs">node provider/cli.cjs nightly</code>); aaPanel's directory backup copies the backup folder off the server.</p>
        {backups.length === 0 ? <Empty>No backups yet.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="py-2">When</th><th>Trigger</th><th>Status</th><th>File</th><th className="text-right">Size</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{backups.map((backup: any) => <tr key={backup.id}><td className="py-2">{fmtDateTime(backup.created_at)}</td><td>{backup.trigger}</td><td><Badge tone={backup.status === 'done' ? 'green' : backup.status === 'failed' ? 'red' : 'blue'}>{backup.status}</Badge>{backup.status === 'failed' && <p className="max-w-md text-xs text-rose-600">{backup.detail}</p>}</td><td className="font-mono text-xs">{backup.file || '—'}</td><td className="text-right">{fmtBytes(backup.bytes)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
      <Card title={`Files on the server (${backupFiles.length})`}>
        <p className="mb-2 text-sm text-slate-600">To restore, follow the admin guide (Restore a client backup): it uses the release's postgres-restore script with the client's .env and a confirmation flag.</p>
        <ul className="text-xs text-slate-600">{backupFiles.slice(0, 15).map((file: any) => <li key={file.file} className="flex justify-between border-b border-slate-100 py-1"><span className="font-mono">{file.file}</span><span>{fmtBytes(file.bytes)}</span></li>)}</ul>
      </Card>
    </div>
  );
}

function Jobs({ data, reload }: { data: Detail; reload: () => void }) {
  const [open, setOpen] = useState<string | null>(data.jobs.find((job: any) => job.state !== 'done')?.id || null);
  return (
    <Card title="Jobs">
      {data.jobs.length === 0 ? <Empty>No jobs.</Empty> : (
        <ul className="divide-y divide-slate-100">
          {data.jobs.map((job: any) => (
            <li key={job.id} className="py-2">
              <button type="button" onClick={() => setOpen(open === job.id ? null : job.id)} className="flex w-full items-center justify-between gap-2 text-left text-sm">
                <span><b>{KIND_LABEL[job.kind] || job.kind}</b> <span className="text-xs text-slate-500">{fmtDateTime(job.created_at)} · {job.created_by}</span></span>
                <Badge tone={job.state === 'done' ? 'green' : job.state === 'failed' ? 'red' : job.state === 'waiting' ? 'amber' : 'blue'}>{job.state}</Badge>
              </button>
              {open === job.id && <div className="mt-2"><JobSteps jobId={job.id} compact onFinished={reload} /></div>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ActivityList({ entries, showClient = false }: { entries: any[]; showClient?: boolean }) {
  return (
    <Card title="Activity">
      {entries.length === 0 ? <Empty>No activity yet.</Empty> : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="px-4 py-2">When</th><th>Who</th>{showClient && <th>Client</th>}<th>Action</th><th className="px-4">Detail</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{entries.map((entry, index) => (
              <tr key={entry.id || index}><td className="whitespace-nowrap px-4 py-2 text-xs">{fmtDateTime(entry.at)}</td><td className="text-xs">{entry.actor}</td>{showClient && <td className="text-xs">{entry.slug ? <a href={`#/clients/${entry.slug}`} className="text-emerald-700">{entry.slug}</a> : '—'}</td>}<td><Badge>{String(entry.action).replace(/_/g, ' ')}</Badge></td><td className="max-w-md truncate px-4 font-mono text-[11px] text-slate-500" title={JSON.stringify(entry.detail)}>{entry.target || ''} {entry.detail && Object.keys(entry.detail).length ? JSON.stringify(entry.detail) : ''}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export { Globe };
