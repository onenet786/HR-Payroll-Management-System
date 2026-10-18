import React, { useMemo, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import type { ComplianceAlert, ComplianceCategory } from '../data/complianceAlerts';

const tone = { Critical: 'border-rose-200 bg-rose-50 text-rose-800', Warning: 'border-amber-200 bg-amber-50 text-amber-900', Info: 'border-slate-200 bg-slate-50 text-slate-700' } as const;

export function ComplianceAlertsPanel({ alerts, onOpenEmployees }: { alerts: ComplianceAlert[]; onOpenEmployees: () => void }) {
  const [category, setCategory] = useState<ComplianceCategory | 'All'>('All');
  const [showInfo, setShowInfo] = useState(false);
  const counts = useMemo(() => alerts.reduce((map, alert) => map.set(alert.category, (map.get(alert.category) || 0) + 1), new Map<ComplianceCategory, number>()), [alerts]);
  const visible = alerts.filter(alert => (category === 'All' || alert.category === category) && (showInfo || alert.severity !== 'Info'));
  const critical = alerts.filter(alert => alert.severity === 'Critical').length;
  const exportCsv = () => {
    const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const csv = [['Severity', 'Category', 'Employee', 'Date', 'Issue'], ...visible.map(alert => [alert.severity, alert.category, alert.employeeName, alert.date || '', alert.message])]
      .map(row => row.map(cell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'compliance-alerts.csv'; link.click(); URL.revokeObjectURL(url);
  };
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="compliance-alerts-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="compliance-alerts-title" className="flex items-center gap-2 text-sm font-bold text-slate-900"><AlertTriangle size={16} className={critical ? 'text-rose-600' : 'text-amber-600'} />Compliance alerts</h3>
          <p className="mt-1 text-xs text-slate-500">{critical} critical · {alerts.length - critical} other — overtime, weekly rest, GPS spoofing, biometric confidence, documents, registrations, bank and minimum wage (last 45 days).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select aria-label="Alert category" value={category} onChange={event => setCategory(event.target.value as ComplianceCategory | 'All')} className="rounded border border-slate-300 bg-white px-2 py-1.5">
            <option value="All">All categories ({alerts.length})</option>
            {[...counts].map(([key, count]) => <option key={key} value={key}>{key} ({count})</option>)}
          </select>
          <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={showInfo} onChange={event => setShowInfo(event.target.checked)} />Show info</label>
          <button type="button" onClick={exportCsv} className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"><Download size={13} />CSV</button>
          <button type="button" onClick={onOpenEmployees} className="rounded border border-emerald-300 px-2 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-50">Fix records</button>
        </div>
      </div>
      {visible.length === 0 ? <p className="mt-4 text-sm font-semibold text-emerald-700">No open compliance alerts in this view.</p> : (
        <ul className="mt-4 grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">
          {visible.slice(0, 60).map(alert => (
            <li key={alert.id} className={`rounded-lg border p-3 text-xs ${tone[alert.severity]}`}>
              <div className="flex justify-between gap-2 font-bold"><span className="truncate">{alert.employeeName}</span><span className="shrink-0 uppercase tracking-wide text-[10px]">{alert.severity} · {alert.category}</span></div>
              <p className="mt-1">{alert.message}</p>
            </li>
          ))}
        </ul>
      )}
      {visible.length > 60 && <p className="mt-2 text-[11px] text-slate-500">Showing 60 of {visible.length}. Export CSV for the full list.</p>}
    </section>
  );
}
