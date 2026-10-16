import { useCallback, useEffect, useState } from 'react';
import { MonitorSmartphone } from 'lucide-react';
import { authenticatedApiRequest } from '../data/postgresStore';
import { formatDisplayDate } from '../utils/dateFormat';

interface KioskDevice {
  id: string;
  name: string;
  username: string | null;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

const seen = (iso: string | null) => {
  if (!iso) return 'Never synced';
  const time = new Date(iso);
  return `${formatDisplayDate(iso.slice(0, 10))} ${time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Registered Windows kiosk terminals; revoking one stops it syncing or uploading punches immediately. */
export default function KioskDevicesPanel() {
  const [devices, setDevices] = useState<KioskDevice[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await authenticatedApiRequest('/api/kiosk-devices') as { devices: KioskDevice[] };
      setDevices(result.devices || []);
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

  const active = devices.filter(device => !device.revoked_at);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="kiosk-devices-title">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700"><MonitorSmartphone className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0">
          <h3 id="kiosk-devices-title" className="font-mono text-xs font-bold uppercase tracking-wide text-slate-800">Kiosk terminals ({active.length} active)</h3>
          <p className="mt-1 text-xs text-slate-600">
            To add a kiosk: create a user with the <b>Kiosk Terminal</b> role, then on the kiosk PC open Settings → Server Registration and sign in with that account once.
            Android tablets sign in to the mobile app with the same account and open in kiosk mode.
          </p>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">{error}</p>}
      {!error && devices.length === 0 && <p className="mt-3 text-xs text-slate-500">No kiosk terminals registered yet.</p>}
      {devices.length > 0 && <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {devices.map(device => (
          <div key={device.id} className="flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-bold text-slate-900">{device.name} <span className="font-normal text-slate-500">· {device.username || 'deleted account'}</span></div>
              <p className="mt-0.5 text-[11px] text-slate-500">Registered {formatDisplayDate(device.created_at.slice(0, 10))} · Last sync {seen(device.last_seen_at)}</p>
            </div>
            {device.revoked_at
              ? <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-500">Disconnected {formatDisplayDate(device.revoked_at.slice(0, 10))}</span>
              : <button type="button" disabled={busyId === device.id} onClick={() => revoke(device)} className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50">Disconnect</button>}
          </div>
        ))}
      </div>}
    </section>
  );
}
