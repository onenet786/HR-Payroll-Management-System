import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, MonitorSmartphone } from 'lucide-react';
import { authenticatedApiRequest } from '../data/postgresStore';
import { formatDisplayDate } from '../utils/dateFormat';
import { localDateStr } from '../data/localDate';

interface KioskDevice {
  id: string;
  name: string;
  username: string | null;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

interface SetupCodeRow {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
}

interface NewSetupCode { id: string; code: string; expiresAt: string; maxUses: number; urls: string[] }

const seen = (iso: string | null) => {
  if (!iso) return 'Never synced';
  const time = new Date(iso);
  return `${formatDisplayDate(localDateStr(new Date(iso)))} ${time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};
const when = (iso: string) => `${formatDisplayDate(localDateStr(new Date(iso)))} ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

const codeState = (row: SetupCodeRow) => {
  if (row.revoked_at) return { text: 'Cancelled', live: false };
  if (row.uses >= row.max_uses) return { text: 'Used up', live: false };
  if (Date.parse(row.expires_at) <= Date.now()) return { text: 'Expired', live: false };
  return { text: `Valid until ${when(row.expires_at)}`, live: true };
};

/**
 * Registered Windows kiosk terminals, and setup codes to register new ones from the kiosk PC without anyone
 * having access to the hosting server. Revoking a terminal stops it syncing or uploading punches immediately.
 */
export default function KioskDevicesPanel() {
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [codes, setCodes] = useState<SetupCodeRow[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState({ label: '', maxUses: 1, expiresInHours: 72 });
  const [created, setCreated] = useState<NewSetupCode | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await authenticatedApiRequest('/api/kiosk-devices') as { devices: KioskDevice[] };
      setDevices(result.devices || []);
      const codeResult = await authenticatedApiRequest('/api/kiosk-devices/setup-codes') as { codes: SetupCodeRow[] };
      setCodes(codeResult.codes || []);
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Kiosk terminals could not be loaded.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const revoke = async (device: KioskDevice) => {
    if (!window.confirm(`Disconnect "${device.name}"? It will stop syncing and uploading punches until it is registered again.`)) return;
    setBusyId(device.id);
    try {
      await authenticatedApiRequest(`/api/kiosk-devices/${encodeURIComponent(device.id)}/revoke`, { method: 'POST', body: '{}' });
      await load();
    } catch (failure) {
      alert(failure instanceof Error ? failure.message : 'The kiosk could not be disconnected.');
    } finally {
      setBusyId('');
    }
  };

  const createCode = async () => {
    setBusyId('new-code');
    setCopied(false);
    try {
      const result = await authenticatedApiRequest('/api/kiosk-devices/setup-codes', {
        method: 'POST',
        body: JSON.stringify({ label: form.label.trim() || 'Kiosk', maxUses: form.maxUses, expiresInHours: form.expiresInHours }),
      }) as NewSetupCode;
      setCreated(result);
      await load();
    } catch (failure) {
      alert(failure instanceof Error ? failure.message : 'The setup code could not be created.');
    } finally {
      setBusyId('');
    }
  };

  const cancelCode = async (row: SetupCodeRow) => {
    if (!window.confirm(`Cancel the setup code "${row.label || 'Kiosk'}"? Kiosks already registered with it keep working.`)) return;
    setBusyId(row.id);
    try {
      await authenticatedApiRequest(`/api/kiosk-devices/setup-codes/${encodeURIComponent(row.id)}/revoke`, { method: 'POST', body: '{}' });
      if (created?.id === row.id) setCreated(null);
      await load();
    } catch (failure) {
      alert(failure instanceof Error ? failure.message : 'The setup code could not be cancelled.');
    } finally {
      setBusyId('');
    }
  };

  const copyCode = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.code); setCopied(true); } catch { setCopied(false); }
  };

  const active = devices.filter(device => !device.revoked_at);
  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="kiosk-devices-title">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><MonitorSmartphone className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0">
          <h3 id="kiosk-devices-title" className="font-mono text-xs font-bold uppercase tracking-wide text-slate-800">Kiosk terminals ({active.length} active)</h3>
          <p className="mt-1 text-xs text-slate-600">
            To add a kiosk, either create a <b>setup code</b> below and paste it on the kiosk PC (Settings → Server Registration → Setup code),
            or create a user with the <b>Kiosk Terminal</b> role and sign in with it there once. Administrator accounts cannot register a kiosk.
            Android tablets sign in to the mobile app with a Kiosk Terminal account and open in kiosk mode.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-900"><KeyRound className="h-4 w-4" aria-hidden="true" /> Create a setup code</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
          <label className="text-[11px] text-slate-600 sm:col-span-2">Label (which kiosk or branch)
            <input className={inputClass} maxLength={120} value={form.label} placeholder="e.g. Mall 12 entrance" onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
          </label>
          <label className="text-[11px] text-slate-600">Kiosks it can register
            <input className={inputClass} type="number" min={1} max={100} value={form.maxUses} onChange={e => setForm(p => ({ ...p, maxUses: Math.min(100, Math.max(1, Number(e.target.value) || 1)) }))} />
          </label>
          <label className="text-[11px] text-slate-600">Valid for
            <select className={inputClass} value={form.expiresInHours} onChange={e => setForm(p => ({ ...p, expiresInHours: Number(e.target.value) }))}>
              <option value={24}>1 day</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
              <option value={720}>30 days</option>
            </select>
          </label>
        </div>
        <button type="button" onClick={createCode} disabled={busyId === 'new-code'} className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
          {busyId === 'new-code' ? 'Creating…' : 'Create setup code'}
        </button>
        {created && (
          <div className="mt-3 rounded-lg border border-emerald-300 bg-white p-3">
            <p className="text-[11px] font-bold text-emerald-900">Setup code (shown only now: copy it before leaving this page)</p>
            <textarea readOnly value={created.code} rows={3} aria-label="Setup code" onFocus={e => e.currentTarget.select()}
              className="mt-1 w-full resize-none break-all rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-900" />
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <button type="button" onClick={copyCode} className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 font-bold text-slate-800 hover:bg-slate-50"><Copy className="h-3 w-3" aria-hidden="true" />{copied ? 'Copied' : 'Copy'}</button>
              <span>Registers up to {created.maxUses} kiosk{created.maxUses === 1 ? '' : 's'} · valid until {when(created.expiresAt)} · server {created.urls.join(', ')}</span>
            </div>
            <p className="mt-2 text-[11px] text-slate-600">On the kiosk PC: Settings → Server Registration → <b>Setup code</b> → paste → <b>Register this kiosk</b>.</p>
          </div>
        )}
        {codes.length > 0 && (
          <div className="mt-3 divide-y divide-emerald-100 rounded-lg border border-emerald-100 bg-white">
            {codes.slice(0, 10).map(row => {
              const state = codeState(row);
              return (
                <div key={row.id} className="flex flex-col gap-1 p-2 text-[11px] sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0 text-slate-700"><b className="text-slate-900">{row.label || 'Kiosk'}</b> · used {row.uses} of {row.max_uses} · created {when(row.created_at)} · <span className={state.live ? 'text-emerald-700' : 'text-slate-500'}>{state.text}</span></span>
                  {state.live && <button type="button" disabled={busyId === row.id} onClick={() => cancelCode(row)} className="shrink-0 rounded border border-rose-200 bg-rose-50 px-2 py-1 font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50">Cancel code</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
      {!error && devices.length === 0 && <p className="mt-3 text-xs text-slate-500">No kiosk terminals registered yet.</p>}
      {devices.length > 0 && <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {devices.map(device => (
          <div key={device.id} className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-bold text-slate-900">{device.name} <span className="font-normal text-slate-500">· {device.username || 'deleted account'}</span></div>
              <p className="mt-0.5 text-[11px] text-slate-500">Registered {formatDisplayDate(localDateStr(new Date(device.created_at)))} · Last sync {seen(device.last_seen_at)}</p>
            </div>
            {device.revoked_at
              ? <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Disconnected {formatDisplayDate(localDateStr(new Date(device.revoked_at)))}</span>
              : <button type="button" disabled={busyId === device.id} onClick={() => revoke(device)} className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50">Disconnect</button>}
          </div>
        ))}
      </div>}
    </section>
  );
}
