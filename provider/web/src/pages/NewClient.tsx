import React, { useEffect, useMemo, useState } from 'react';
import { Rocket } from 'lucide-react';
import { api } from '../api';
import { Button, Card, Field, inputClass, Notice } from '../ui';
import { navigate } from '../App';

const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 32).replace(/-+$/, '');
const inOneYear = () => { const date = new Date(); date.setFullYear(date.getFullYear() + 1); return date.toISOString().slice(0, 10); };

/** One form → a running installation. Everything else (domains, kiosks, data import) is done afterwards per client. */
export function NewClient() {
  const [settings, setSettings] = useState<{ server: { baseDomain: string }; template: { exists: boolean; release?: string; refreshedAt?: string }; releases: Array<{ name: string; ready: boolean }> } | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', slugTouched: false, adminName: '', adminEmail: '', contactPhone: '', edition: 'full', plan: '', expiresAt: inOneYear(), staffLimit: '', clientDataImport: false, release: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api('/settings').then(result => { setSettings(result); setForm(previous => ({ ...previous, release: result.releases.find((release: { ready: boolean }) => release.ready)?.name || result.releases[0]?.name || '' })); }).catch(loadError => setError(loadError.message)); }, []);
  const set = (patch: Partial<typeof form>) => setForm(previous => ({ ...previous, ...patch }));
  const slug = form.slugTouched ? form.slug : slugify(form.name);
  const slugValid = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(slug);
  const address = useMemo(() => (settings ? `${slug || 'client'}.${settings.server.baseDomain}` : ''), [slug, settings]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ clientId: string; jobId: string }>('/clients', { method: 'POST', body: {
        name: form.name, slug, adminName: form.adminName, adminEmail: form.adminEmail, contactName: form.adminName, contactEmail: form.adminEmail, contactPhone: form.contactPhone,
        edition: { id: form.edition }, licence: { plan: form.plan, expiresAt: form.expiresAt || null, staffLimit: form.staffLimit ? Number(form.staffLimit) : null },
        clientDataImport: form.clientDataImport, release: form.release, notes: form.notes,
      } });
      navigate(`/jobs/${result.jobId}`);
    } catch (submitError) { setError((submitError as Error).message); setBusy(false); }
  };

  if (!settings) return <p className="text-sm text-slate-500">{error || 'Loading…'}</p>;
  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-4">
      <div><h1 className="text-xl font-bold text-slate-900">New client</h1><p className="text-sm text-slate-500">Fill in one form; the console creates the database, settings, aaPanel project and HTTPS, then shows the progress.</p></div>
      {!settings.template.exists && <Notice tone="warn">The template database does not exist yet. Create it under <a href="#/settings" className="font-semibold underline">Server &amp; releases</a> first.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <Card title="Client">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2"><input required value={form.name} onChange={event => set({ name: event.target.value })} placeholder="e.g. Bin Ishaq Traders" className={inputClass} /></Field>
          <Field label="Address name" hint={<>Their system will be at <b className="font-mono">https://{address}</b>. Their own domain can be added later.</>}>
            <input required value={slug} onChange={event => set({ slug: event.target.value.toLowerCase(), slugTouched: true })} className={`${inputClass} font-mono ${slug && !slugValid ? 'border-rose-400' : ''}`} />
          </Field>
          <Field label="Phone"><input value={form.contactPhone} onChange={event => set({ contactPhone: event.target.value })} className={inputClass} /></Field>
        </div>
      </Card>

      <Card title="First administrator">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input required value={form.adminName} onChange={event => set({ adminName: event.target.value })} className={inputClass} /></Field>
          <Field label="Email (sign-in)" hint="A temporary password is shown once when the setup finishes."><input type="email" required value={form.adminEmail} onChange={event => set({ adminEmail: event.target.value })} className={inputClass} /></Field>
        </div>
      </Card>

      <Card title="Edition and licence">
        <div className="grid gap-3 sm:grid-cols-2">
          {[['full', 'Full compliance', 'FBR, EOBI, social security, PF, gratuity, bank payroll, maker-checker.'], ['lite', 'Lite (small business)', 'Attendance, leave, salaries, advances, payslips. No FBR data, cash payroll.']].map(([id, label, text]) => (
            <label key={id} className={`cursor-pointer rounded-lg border p-3 text-sm ${form.edition === id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type="radio" name="edition" value={id} checked={form.edition === id} onChange={() => set({ edition: id })} className="mr-2 accent-emerald-600" /><b>{label}</b>
              <span className="mt-1 block text-xs text-slate-500">{text}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Plan name"><input value={form.plan} onChange={event => set({ plan: event.target.value })} placeholder="e.g. Lite 15 staff" className={inputClass} /></Field>
          <Field label="Licence valid until" hint="Empty = no end date"><input type="date" value={form.expiresAt} onChange={event => set({ expiresAt: event.target.value })} className={inputClass} /></Field>
          <Field label="Active staff limit" hint="Empty = unlimited"><input type="number" min={1} value={form.staffLimit} onChange={event => set({ staffLimit: event.target.value })} className={inputClass} /></Field>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={form.clientDataImport} onChange={event => set({ clientDataImport: event.target.checked })} className="mt-1 accent-emerald-600" />
          <span><b>Allow the client's IT to import data from CyberAP</b><span className="block text-xs text-slate-500">Adds Data Import to their menu. Switch it off after go-live.</span></span></label>
      </Card>

      <Card title="Technical">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Application release" hint={settings.template.release ? `Template built from ${settings.template.release}` : undefined}>
            <select value={form.release} onChange={event => set({ release: event.target.value })} className={inputClass}>
              {settings.releases.map(release => <option key={release.name} value={release.name}>{release.name}{release.ready ? '' : ' (not ready)'}</option>)}
            </select>
          </Field>
          <Field label="Internal notes"><input value={form.notes} onChange={event => set({ notes: event.target.value })} className={inputClass} /></Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={() => navigate('/')}>Cancel</Button>
        <Button type="submit" variant="primary" busy={busy} disabled={!slugValid || !settings.template.exists}><Rocket className="h-4 w-4" /> Create client</Button>
      </div>
    </form>
  );
}
