import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Database, KeyRound, ShieldAlert } from 'lucide-react';

interface Licence { status: 'active' | 'suspended'; expiresAt: string | null; graceDays: number; autoSuspend: boolean; staffLimit: number | null; message: string; plan: string }
interface LicenceState { state: string; daysLeft: number | null }
interface Props { apiBase: string; vendorToken: string }

const STATE_LABEL: Record<string, string> = { active: 'Active', expiring: 'Expiring soon', grace: 'Expired · grace period', suspended: 'Suspended' };

/**
 * Vendor console tab for a self-hosted installation: licence and whether the client's own administrator may import
 * legacy data (Settings → Data Import). Hosted clients are managed from the Provider Console instead.
 */
export function VendorInstallationPanel({ apiBase, vendorToken }: Props) {
  const [licence, setLicence] = useState<Licence | null>(null);
  const [state, setState] = useState<LicenceState | null>(null);
  const [dataImport, setDataImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const apply = (body: { licence: Licence; licenceState: LicenceState; clientDataImport: boolean }) => {
    setLicence(body.licence); setState(body.licenceState); setDataImport(body.clientDataImport);
  };
  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/vendor/installation`, { headers: { Authorization: `Bearer ${vendorToken}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not load the installation settings.');
      apply(body);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load.'); }
  }, [apiBase, vendorToken]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!licence) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch(`${apiBase}/api/vendor/installation`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ clientDataImport: dataImport, licence }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not save.');
      apply(body); setMessage('Saved. Users see the change within 15 seconds.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Could not save.'); }
    finally { setSaving(false); }
  };

  if (!licence) return <p className="mt-4 text-xs text-slate-400">{error || 'Loading…'}</p>;
  const set = (patch: Partial<Licence>) => { setLicence({ ...licence, ...patch }); setMessage(''); };
  const input = 'mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs text-slate-400">For a self-hosted installation. Hosted clients are managed from the OneNet Provider Console.</p>
      {error && <div role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</div>}
      {message && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"><CheckCircle2 className="h-4 w-4" />{message}</div>}

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300"><Database className="h-4 w-4 text-emerald-400" /> Client data import</h2>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-xs">
          <input type="checkbox" checked={dataImport} onChange={event => { setDataImport(event.target.checked); setMessage(''); }} className="mt-0.5 h-4 w-4 accent-emerald-500" />
          <span>
            <span className="block font-semibold text-slate-100">Allow the client's administrator to import legacy CyberAP data</span>
            <span className="block text-[11px] text-slate-400">Adds Settings → Data Import for Super Admins and users with the "Data import" permission. Switch it off after go-live.</span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300"><KeyRound className="h-4 w-4 text-emerald-400" /> Licence</h2>
          {state && <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${state.state === 'active' ? 'bg-emerald-900/60 text-emerald-200' : state.state === 'suspended' ? 'bg-rose-900/60 text-rose-200' : 'bg-amber-900/60 text-amber-200'}`}>{STATE_LABEL[state.state] || state.state}{state.daysLeft !== null ? ` · ${state.daysLeft} days` : ''}</span>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-400">Plan<input value={licence.plan} onChange={event => set({ plan: event.target.value })} placeholder="e.g. Lite 15 staff" className={input} /></label>
          <label className="text-xs text-slate-400">Expires on<input type="date" value={licence.expiresAt || ''} onChange={event => set({ expiresAt: event.target.value || null })} className={input} /></label>
          <label className="text-xs text-slate-400">Active staff limit<input type="number" min={1} value={licence.staffLimit ?? ''} onChange={event => set({ staffLimit: event.target.value ? Number(event.target.value) : null })} placeholder="Unlimited" className={input} /></label>
          <label className="text-xs text-slate-400">Grace days after expiry<input type="number" min={0} max={90} value={licence.graceDays} onChange={event => set({ graceDays: Math.max(0, Number(event.target.value) || 0) })} className={input} /></label>
          <label className="flex items-center gap-2 text-xs text-slate-300 sm:col-span-2"><input type="checkbox" checked={licence.autoSuspend} onChange={event => set({ autoSuspend: event.target.checked })} className="h-4 w-4 accent-emerald-500" /> Suspend automatically when the grace period ends</label>
          <label className="text-xs text-slate-400 sm:col-span-3">Message shown to users when suspended<input value={licence.message} onChange={event => set({ message: event.target.value })} placeholder="This installation is suspended. Contact your service provider." className={input} /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {licence.status === 'suspended'
            ? <button type="button" onClick={() => set({ status: 'active' })} className="rounded-lg border border-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-950">Resume installation</button>
            : <button type="button" onClick={() => set({ status: 'suspended' })} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-800 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-950"><ShieldAlert className="h-3.5 w-3.5" /> Suspend now</button>}
          <span className="text-[11px] text-slate-500">Suspended: nobody can sign in; kiosks keep recording attendance so no punches are lost.</span>
        </div>
      </section>

      <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-gradient-to-r from-emerald-600 to-green-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save installation settings'}</button>
    </div>
  );
}
