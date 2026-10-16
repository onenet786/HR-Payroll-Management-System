import React from 'react';
import { CheckCircle2, CircleAlert, CircleDashed } from 'lucide-react';
import type { ReadinessItem } from '../data/goLiveReadiness';

const icon = { Ready: <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />, 'Action needed': <CircleAlert size={16} className="shrink-0 text-rose-600" />, Optional: <CircleDashed size={16} className="shrink-0 text-slate-400" /> };

export function GoLiveReadinessPanel({ items }: { items: ReadinessItem[] }) {
  const required = items.filter(item => item.status !== 'Optional');
  const ready = required.filter(item => item.status === 'Ready').length;
  const complete = ready === required.length;
  return (
    <section className={`rounded-xl border p-5 shadow-sm ${complete ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-white'}`} aria-labelledby="go-live-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="go-live-title" className="text-sm font-bold text-slate-900">Live payroll readiness</h3>
          <p className="mt-1 text-xs text-slate-500">{complete ? 'All required checks pass. Live payroll can start.' : `${ready} of ${required.length} required checks pass. Resolve the rest before paying salaries from this system alone.`}</p>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={required.length} aria-valuenow={ready} aria-label="Readiness progress">
          <div className={`h-full ${complete ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${required.length ? (ready / required.length) * 100 : 0}%` }} />
        </div>
      </div>
      <ul className="mt-4 grid gap-2 md:grid-cols-2">
        {items.map(item => (
          <li key={item.id} className="flex gap-2 rounded-lg border border-slate-100 bg-white p-3 text-xs">
            {icon[item.status]}
            <div className="min-w-0">
              <p className="font-bold text-slate-900">{item.label}{item.status === 'Optional' && <span className="ml-1 font-normal text-slate-400">(optional)</span>}</p>
              <p className="mt-0.5 text-slate-600">{item.detail}</p>
              {item.status !== 'Ready' && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.where}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
