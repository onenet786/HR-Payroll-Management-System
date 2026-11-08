import React, { useContext, useEffect, useState } from 'react';
import { AlertTriangle, CircleAlert, PlusCircle, RefreshCw, Search } from 'lucide-react';
import { api, ago, fmtBytes } from '../api';
import { Badge, Button, Card, Empty, inputClass, LICENCE_LABEL, licenceTone, Notice, Stat, statusTone } from '../ui';
import { canOperate, navigate, RoleContext } from '../App';

interface ClientRow {
  id: string; slug: string; name: string; status: string; edition: { id: string }; release: string;
  api_ok: boolean | null; checked_at: string | null; active_employees: number | null; attendance_today: number | null; db_bytes: number | null; kiosks_seen_24h: number | null; kiosks_total: number | null;
  last_backup_at: string | null; licenceSummary?: { state: string; daysLeft: number | null }; domains: Array<{ domain: string; kind: string; status: string; isPrimary: boolean }> | null;
  open_job: { id: string; kind: string; state: string } | null;
}
interface Alert { level: 'error' | 'warn' | 'action'; client: string; clientId: string; text: string }

export function Dashboard() {
  const user = useContext(RoleContext);
  const [data, setData] = useState<{ clients: ClientRow[]; alerts: Alert[]; baseDomain: string } | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [checking, setChecking] = useState(false);

  const load = () => api('/overview').then(setData).catch(loadError => setError(loadError.message));
  useEffect(() => { void load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer); }, []);

  const runHealth = async () => { setChecking(true); try { await api('/tasks/health', { method: 'POST' }); await load(); } catch (taskError) { setError((taskError as Error).message); } finally { setChecking(false); } };

  if (!data) return <p className="text-sm text-slate-500">{error || 'Loading…'}</p>;
  const visible = data.clients.filter(client => (showArchived || client.status !== 'archived') && `${client.name} ${client.slug} ${(client.domains || []).map(d => d.domain).join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const live = data.clients.filter(client => client.status !== 'archived');
  const down = live.filter(client => client.status === 'active' && client.checked_at && !client.api_ok).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold text-slate-900">Clients</h1><p className="text-sm text-slate-500">Every hosted installation on this server.</p></div>
        <div className="flex gap-2">
          <Button onClick={runHealth} busy={checking}><RefreshCw className="h-4 w-4" /> Check health now</Button>
          {canOperate(user) && <Button variant="primary" onClick={() => navigate('/clients/new')}><PlusCircle className="h-4 w-4" /> New client</Button>}
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active clients" value={live.filter(client => client.status === 'active').length} sub={`${live.filter(client => client.status === 'suspended').length} suspended · ${live.filter(client => client.status === 'provisioning').length} being set up`} />
        <Stat label="Not answering" value={down} tone={down ? 'red' : 'green'} sub="from the last health check" />
        <Stat label="Active employees" value={live.reduce((sum, client) => sum + (client.active_employees || 0), 0).toLocaleString()} sub={`${live.reduce((sum, client) => sum + (client.attendance_today || 0), 0).toLocaleString()} attendance records today`} />
        <Stat label="Needs attention" value={data.alerts.length} tone={data.alerts.some(alert => alert.level === 'error') ? 'red' : data.alerts.length ? 'amber' : 'green'} sub="alerts below" />
      </div>

      {data.alerts.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Needs attention</span>}>
          <ul className="divide-y divide-slate-100">
            {data.alerts.map((alert, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <CircleAlert className={`h-4 w-4 shrink-0 ${alert.level === 'error' ? 'text-rose-500' : alert.level === 'action' ? 'text-sky-500' : 'text-amber-500'}`} />
                  <b className="shrink-0">{alert.client}</b><span className="truncate text-slate-600">{alert.text}</span>
                </span>
                <a href={`#/clients/${alert.clientId}`} className="shrink-0 text-xs font-semibold text-emerald-700 hover:underline">Open</a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`All clients (${visible.length})`} actions={<>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or domain" className={`${inputClass} mt-0 w-56 pl-8`} /></div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Archived</label>
      </>}>
        {visible.length === 0 ? <Empty>No clients yet. {canOperate(user) && <a href="#/clients/new" className="font-semibold text-emerald-700">Create the first one</a>}</Empty> : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Client</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Licence</th><th className="px-2 py-2">Health</th><th className="px-2 py-2 text-right">Staff</th><th className="px-2 py-2">Kiosks</th><th className="px-2 py-2">Last backup</th><th className="px-4 py-2">Address</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(client => {
                  const primary = (client.domains || []).find(domain => domain.isPrimary && domain.kind !== 'platform' && domain.status === 'active') || (client.domains || []).find(domain => domain.kind === 'platform');
                  return (
                    <tr key={client.id} onClick={() => navigate(`/clients/${client.id}`)} className="cursor-pointer hover:bg-slate-50">
                      <td className="px-4 py-2.5"><p className="font-semibold text-slate-900">{client.name}</p><p className="text-xs text-slate-500">{client.slug} · {client.edition?.id === 'lite' ? 'Lite' : 'Full'} · {client.release || '—'}</p></td>
                      <td className="px-2 py-2.5"><Badge tone={statusTone(client.status)}>{client.status}</Badge>{client.open_job && client.open_job.state !== 'running' && <div className="mt-1"><Badge tone={client.open_job.state === 'failed' ? 'red' : 'blue'}>{client.open_job.kind}: {client.open_job.state}</Badge></div>}</td>
                      <td className="px-2 py-2.5"><Badge tone={licenceTone(client.licenceSummary?.state)}>{LICENCE_LABEL[client.licenceSummary?.state || ''] || '—'}{client.licenceSummary?.daysLeft != null && client.licenceSummary.state !== 'active' ? ` · ${client.licenceSummary.daysLeft}d` : ''}</Badge></td>
                      <td className="px-2 py-2.5">{client.checked_at ? <Badge tone={client.api_ok ? 'green' : 'red'}>{client.api_ok ? 'Up' : 'Down'}</Badge> : <Badge>not checked</Badge>}<p className="mt-0.5 text-[11px] text-slate-400">{ago(client.checked_at)} · {fmtBytes(client.db_bytes)}</p></td>
                      <td className="px-2 py-2.5 text-right font-semibold">{client.active_employees ?? '—'}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-600">{client.kiosks_total ? `${client.kiosks_seen_24h}/${client.kiosks_total} online` : '—'}</td>
                      <td className="px-2 py-2.5 text-xs text-slate-600">{ago(client.last_backup_at)}</td>
                      <td className="px-4 py-2.5 text-xs">{primary ? <span className="font-mono text-slate-700">{primary.domain}</span> : '—'}{(client.domains || []).some(domain => domain.status === 'error') && <span className="ml-1 text-rose-600">⚠</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
