import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';

export function Card({ title, actions, children, className = '' }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Tone = 'green' | 'amber' | 'red' | 'slate' | 'blue' | 'violet';
const TONES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200', red: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200', blue: 'bg-sky-50 text-sky-700 ring-sky-200', violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};
export function Badge({ tone = 'slate', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

export function Button({ variant = 'secondary', busy, children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  const styles = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm', secondary: 'border border-slate-300 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-700',
    danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm', ghost: 'text-slate-600 hover:bg-slate-100',
  }[variant];
  return (
    <button type="button" {...props} disabled={props.disabled || busy} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 disabled:bg-slate-50';

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: React.ReactNode }) {
  const map = {
    info: ['border-sky-200 bg-sky-50 text-sky-800', Info], warn: ['border-amber-200 bg-amber-50 text-amber-900', AlertTriangle],
    error: ['border-rose-200 bg-rose-50 text-rose-800', XCircle], success: ['border-emerald-200 bg-emerald-50 text-emerald-800', CheckCircle2],
  } as const;
  const [classes, Icon] = map[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${classes}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" /><div className="min-w-0">{children}</div></div>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'red' | 'amber' | 'green' }) {
  const color = tone === 'red' ? 'text-rose-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-600' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Copyable({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}
      className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 hover:border-emerald-500 hover:text-emerald-700">
      {copied ? 'Copied' : label}
    </button>
  );
}

export function licenceTone(state?: string): Tone {
  return state === 'active' ? 'green' : state === 'expiring' ? 'amber' : state === 'grace' || state === 'suspended' ? 'red' : 'slate';
}
export const LICENCE_LABEL: Record<string, string> = { active: 'Licence active', expiring: 'Expiring soon', grace: 'Expired · grace', suspended: 'Suspended' };
export function statusTone(status?: string): Tone {
  return status === 'active' ? 'green' : status === 'provisioning' ? 'blue' : status === 'suspended' || status === 'failed' ? 'red' : 'slate';
}
