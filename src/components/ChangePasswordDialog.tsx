import { useState } from 'react';
import { authenticatedApiRequest } from '../data/postgresStore';

/** "Change my password" for any signed-in user (POST /api/auth/change-password). Other sessions are signed out. */
export function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: (message: string) => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.current) return setError('Enter your current password.');
    if (form.next.length < 12) return setError('The new password must be at least 12 characters.');
    if (form.next !== form.confirm) return setError('The two new passwords do not match.');
    setSaving(true); setError('');
    try {
      const result = await authenticatedApiRequest('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }) }) as { otherSessionsSignedOut?: number };
      onChanged(`Password changed.${result?.otherSessionsSignedOut ? ` ${result.otherSessionsSignedOut} other session(s) were signed out.` : ''}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The password could not be changed.');
      setSaving(false);
    }
  };
  const field = (key: keyof typeof form, label: string, autoComplete: string) => (
    <label className="block text-xs font-bold text-slate-700">{label}
      <input type="password" autoComplete={autoComplete} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" />
    </label>
  );
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="change-password-title" className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/70 p-4"
      onKeyDown={event => { if (event.key === 'Escape') onClose(); }}>
      <form onSubmit={event => { event.preventDefault(); void submit(); }} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-2xl">
        <h2 id="change-password-title" className="text-base font-bold text-slate-900">Change my password</h2>
        <p className="text-xs text-slate-600">At least 12 characters. Your other signed-in devices will be signed out.</p>
        {field('current', 'Current password', 'current-password')}
        {field('next', 'New password', 'new-password')}
        {field('confirm', 'Repeat new password', 'new-password')}
        {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-3 py-2 text-xs font-semibold text-slate-600 underline">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save new password'}</button>
        </div>
      </form>
    </div>
  );
}
