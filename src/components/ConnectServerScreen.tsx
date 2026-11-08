import React, { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Link2 } from 'lucide-react';
import { parseConnectionCode, saveServerConnection, type ConnectionCode } from '../data/apiBase';

/**
 * First screen of the phone app: one app serves every company, so the employee enters the company's connection code
 * (HRM1.…, printed by the Provider Console or given by the company's IT) or simply the company address.
 */
export function ConnectServerScreen() {
  const [input, setInput] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const parsed = useMemo<{ code?: ConnectionCode; error?: string }>(() => {
    if (!input.trim()) return {};
    try { return { code: parseConnectionCode(input) }; } catch (parseError) { return { error: (parseError as Error).message }; }
  }, [input]);

  const connect = async () => {
    if (!parsed.code) return;
    setChecking(true); setError('');
    for (const url of parsed.code.urls) {
      try {
        const response = await fetch(`${url}/api/auth/status`, { headers: { Accept: 'application/json' } });
        if (response.ok) {
          const body = await response.json().catch(() => ({}));
          saveServerConnection({ clientName: body.companyName || parsed.code.clientName, urls: [url, ...parsed.code.urls.filter(item => item !== url)] });
          window.location.reload();
          return;
        }
      } catch { /* try the next address */ }
    }
    setChecking(false);
    setError('The company server could not be reached. Check the code and your internet connection.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 px-4 py-8 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-slate-800 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-xl bg-emerald-600 p-2.5 text-white"><Building2 className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Connect to your company</h1>
            <p className="text-xs text-slate-500">Enter the connection code from your HR department.</p>
          </div>
        </div>
        <label className="block text-xs font-semibold text-slate-600" htmlFor="connection-code">Connection code or company address</label>
        <textarea id="connection-code" value={input} onChange={event => { setInput(event.target.value); setError(''); }} rows={3} autoCapitalize="off" autoCorrect="off" spellCheck={false}
          placeholder="HRM1.… or yourcompany.binishaqsoft.com"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
        {parsed.error && <p className="mt-1 text-xs text-rose-600">{parsed.error}</p>}
        {parsed.code && (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {parsed.code.clientName || 'Company'} · {parsed.code.urls[0].replace(/^https?:\/\//, '')}
          </p>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
        <button type="button" onClick={connect} disabled={!parsed.code || checking}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
          <Link2 className="h-4 w-4" /> {checking ? 'Connecting…' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
