import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { api } from '../api';
import { Button, Field, inputClass, Notice } from '../ui';
import type { ProviderUser } from '../App';

/** Email + password, then the authenticator app: enrol (QR) the first time, a 6-digit code every time after. */
export function LoginScreen({ user, onSignedIn }: { user: ProviderUser | null; onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'password' | 'enroll' | 'verify'>(user ? (user.totpEnabled ? 'verify' : 'enroll') : 'password');
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stage !== 'enroll' || setup) return;
    api<{ qr: string; secret: string }>('/auth/mfa/setup', { method: 'POST' }).then(setSetup).catch(setupError => setError(setupError.message));
  }, [stage, setup]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ mfaRequired: boolean; mfaEnrollmentRequired: boolean }>('/auth/login', { method: 'POST', body: { email, password } });
      setStage(result.mfaEnrollmentRequired ? 'enroll' : 'verify'); setPassword('');
    } catch (loginError) { setError((loginError as Error).message); } finally { setBusy(false); }
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/auth/mfa/verify', { method: 'POST', body: { code } }); onSignedIn(); }
    catch (verifyError) { setError((verifyError as Error).message); setCode(''); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-xl bg-emerald-600 p-2.5 text-white"><ShieldCheck className="h-5 w-5" /></span>
          <div><h1 className="text-lg font-bold text-slate-900">OneNet Provider Console</h1><p className="text-xs text-slate-500">Hosted client management</p></div>
        </div>
        {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}
        {stage === 'password' && (
          <form onSubmit={signIn} className="space-y-3">
            <Field label="Email"><input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} className={inputClass} /></Field>
            <Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className={inputClass} /></Field>
            <Button type="submit" variant="primary" busy={busy} className="w-full py-2"><KeyRound className="h-4 w-4" /> Sign in</Button>
          </form>
        )}
        {stage === 'enroll' && (
          <form onSubmit={verify} className="space-y-3">
            <Notice tone="info">Two-step verification is required. Scan this code with Google Authenticator, Microsoft Authenticator or similar, then enter the 6-digit code.</Notice>
            {setup ? <img src={setup.qr} alt="Authenticator QR code" className="mx-auto h-48 w-48" /> : <p className="py-10 text-center text-sm text-slate-500">Preparing…</p>}
            {setup && <p className="break-all text-center font-mono text-[11px] text-slate-500">{setup.secret}</p>}
            <Field label="6-digit code"><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className={`${inputClass} text-center font-mono text-lg tracking-[.4em]`} /></Field>
            <Button variant="primary" busy={busy} className="w-full py-2" type="submit"><Smartphone className="h-4 w-4" /> Confirm</Button>
          </form>
        )}
        {stage === 'verify' && (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-slate-600">Enter the 6-digit code from your authenticator app.</p>
            <input inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} aria-label="Authenticator code" className={`${inputClass} text-center font-mono text-lg tracking-[.4em]`} />
            <Button variant="primary" busy={busy} className="w-full py-2" type="submit">Verify</Button>
          </form>
        )}
      </div>
    </div>
  );
}
