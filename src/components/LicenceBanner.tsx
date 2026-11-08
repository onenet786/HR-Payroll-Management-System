import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { apiBase } from '../data/apiBase';

interface LicenceSummary { state: 'active' | 'expiring' | 'grace' | 'suspended'; daysLeft: number | null; expiresAt: string | null; graceDaysLeft: number | null }

/** Warns signed-in users before the installation's licence stops access (expiring within 14 days, or in grace). */
export function LicenceBanner() {
  const [licence, setLicence] = useState<LicenceSummary | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => fetch(`${apiBase()}/api/auth/status`).then(response => response.json()).then(body => { if (active) setLicence(body?.licence || null); }).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 30 * 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  if (!licence || (licence.state !== 'expiring' && licence.state !== 'grace')) return null;
  const text = licence.state === 'grace'
    ? `Your licence expired on ${licence.expiresAt}. Access stops in ${licence.graceDaysLeft ?? 0} day(s) unless it is renewed.`
    : `Your licence expires on ${licence.expiresAt} (${licence.daysLeft} day${licence.daysLeft === 1 ? '' : 's'} left). Contact your service provider to renew.`;
  return (
    <div role="status" className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${licence.state === 'grace' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" /> {text}
    </div>
  );
}
