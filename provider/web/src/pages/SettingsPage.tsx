import React, { useContext, useEffect, useState } from 'react';
import { CheckCircle2, Database, Play, RefreshCw, Server, XCircle } from 'lucide-react';
import { api, fmtDate, fmtDateTime } from '../api';
import { Badge, Button, Card, Notice } from '../ui';
import { canOperate, RoleContext } from '../App';

export function SettingsPage() {
  const user = useContext(RoleContext);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<string>('');
  const load = () => api('/settings').then(setData).catch(loadError => setError(loadError.message));
  useEffect(() => { void load(); }, []);

  const run = async (label: string, path: string, body?: unknown) => {
    setBusy(label); setError(''); setResult('');
    try { const output = await api(path, { method: 'POST', body: body ?? {} }); setResult(JSON.stringify(output, null, 2)); await load(); }
    catch (runError) { setError((runError as Error).message); } finally { setBusy(''); }
  };

  if (!data) return <p className="text-sm text-slate-500">{error || 'Loading…'}</p>;
  const ok = (value: boolean) => (value ? <CheckCircle2 className="inline h-4 w-4 text-emerald-600" /> : <XCircle className="inline h-4 w-4 text-rose-600" />);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-900">Server &amp; releases</h1><p className="text-sm text-slate-500">Hosting configuration (provider/.env), aaPanel connection, template database and application releases.</p></div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><Server className="h-4 w-4 text-emerald-600" /> Server</span>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Platform domain</dt><dd className="font-mono">*.{data.server.baseDomain}</dd>
            <dt className="text-slate-500">Server IP</dt><dd className="font-mono">{data.server.serverIp || <span className="text-rose-600">not set</span>}</dd>
            <dt className="text-slate-500">Nameservers</dt><dd className="font-mono text-xs">{data.server.nameservers.join(', ') || '— (delegation not offered)'}</dd>
            <dt className="text-slate-500">Wildcard certificate</dt><dd>{ok(data.server.wildcardCert)} {data.server.wildcardCert ? 'found' : 'not configured (SSL step becomes manual)'}</dd>
            <dt className="text-slate-500">Default SMTP</dt><dd>{ok(data.server.smtpConfigured)} {data.server.smtpConfigured ? 'configured' : 'not set'}</dd>
            <dt className="text-slate-500">Clients folder</dt><dd className="break-all font-mono text-xs">{data.server.clientsRoot}</dd>
            <dt className="text-slate-500">Releases folder</dt><dd className="break-all font-mono text-xs">{data.server.releasesRoot}</dd>
            <dt className="text-slate-500">Backups folder</dt><dd className="break-all font-mono text-xs">{data.server.backupRoot}</dd>
            <dt className="text-slate-500">Client ports from</dt><dd>{data.server.clientPortStart} · Node {data.server.nodeVersion}</dd>
          </dl>
        </Card>
        <Card title="aaPanel API" actions={<Button onClick={load}><RefreshCw className="h-4 w-4" /> Test again</Button>}>
          {data.aapanel.ok
            ? <Notice tone="success">Connected{data.aapanel.version ? ` · aaPanel ${data.aapanel.version}` : ''}{data.aapanel.system ? ` · ${data.aapanel.system}` : ''}. Provisioning creates Node projects, domains and certificates automatically.</Notice>
            : <Notice tone="warn"><p className="font-semibold">Not connected: {data.aapanel.error}</p><p className="mt-1">The console still works: every aaPanel step becomes a checklist with the exact values, and you press "Mark done". To automate it: aaPanel → Settings → API interface → enable, add 127.0.0.1 and the server IP to the whitelist, put the key in AAPANEL_API_KEY and restart the console.</p></Notice>}
        </Card>
      </div>

      <Card title={<span className="flex items-center gap-2"><Database className="h-4 w-4 text-emerald-600" /> Template database</span>} actions={user?.role === 'owner' && <Button variant="primary" busy={busy === 'template'} onClick={() => run('template', '/settings/template')}><RefreshCw className="h-4 w-4" /> {data.template.exists ? 'Refresh template' : 'Create template'}</Button>}>
        <p className="text-sm text-slate-600">New client databases are copied from <b className="font-mono">{data.template.name}</b> (all migrations, default roles and FBR tax slabs), which takes seconds. Refresh it after installing a new release.</p>
        <p className="mt-2 text-sm">{data.template.exists ? <>Exists · {data.template.migrations ?? '?'} migrations · from release <b className="font-mono">{data.template.release || '?'}</b> · refreshed {fmtDateTime(data.template.refreshedAt)}</> : <span className="text-rose-600">Not created yet.</span>}</p>
      </Card>

      <Card title="Releases">
        <p className="mb-2 text-sm text-slate-600">Each release is a complete copy of the application in its own folder, shared by every client that uses it. See the hosting guide, "Install a new release".</p>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500"><th className="py-2">Release</th><th>Version</th><th>Migrations</th><th>Installed</th><th>Ready</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{data.releases.map((release: any) => <tr key={release.name}><td className="py-2 font-mono">{release.name}</td><td>{release.version || '—'}</td><td>{release.migrations}</td><td>{fmtDate(release.createdAt)}</td><td>{release.ready ? <Badge tone="green">yes</Badge> : <Badge tone="amber">run npm ci + build</Badge>}</td></tr>)}</tbody>
        </table>
      </Card>

      <Card title="Scheduled tasks (aaPanel Cron)">
        <p className="text-sm text-slate-600">Add these in aaPanel → Cron → Shell script, run from the app folder:</p>
        <ul className="mt-2 space-y-1 font-mono text-xs">
          <li>Daily 02:00 — <code>node provider/cli.cjs nightly</code> (backups, domains, health)</li>
          <li>Every 10 minutes — <code>node provider/cli.cjs health</code></li>
        </ul>
        {canOperate(user) && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button busy={busy === 'health'} onClick={() => run('health', '/tasks/health')}><Play className="h-4 w-4" /> Run health now</Button>
            <Button busy={busy === 'domains'} onClick={() => run('domains', '/tasks/check-domains')}><Play className="h-4 w-4" /> Check all domains</Button>
            <Button busy={busy === 'backups'} onClick={() => run('backups', '/tasks/backup-all')}><Play className="h-4 w-4" /> Back up all clients</Button>
          </div>
        )}
        {result && <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{result}</pre>}
      </Card>
    </div>
  );
}
