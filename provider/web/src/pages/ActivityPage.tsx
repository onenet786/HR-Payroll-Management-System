import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { ActivityList } from './ClientDetail';

export function ActivityPage() {
  const [entries, setEntries] = useState<any[] | null>(null);
  useEffect(() => { api('/audit').then(result => setEntries(result.entries)).catch(() => setEntries([])); }, []);
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold text-slate-900">Activity log</h1><p className="text-sm text-slate-500">Every action in the Provider Console: who did what, for which client. Kept permanently.</p></div>
      {entries ? <ActivityList entries={entries} showClient /> : <p className="text-sm text-slate-500">Loading…</p>}
    </div>
  );
}
