import React, { useMemo, useState } from 'react';
import { CheckCircle2, Settings2, ShieldCheck, Store } from 'lucide-react';
import {
  EDITION_FEATURE_INFO, EDITION_FEATURE_KEYS, EDITION_LABELS, EDITION_PRESETS, resolveEdition,
  type AppEdition, type EditionFeatureGroup, type EditionFeatureKey, type EditionFeatures, type EditionId,
} from '../data/edition';

interface Props {
  apiBase: string;
  vendorToken: string;
  expiresAt?: string;
  initialEdition: AppEdition;
  onSaved: (edition: AppEdition) => void;
  onExit: () => void;
}

const GROUPS: EditionFeatureGroup[] = ['Statutory deductions', 'Payroll controls', 'Modules'];
const PRESET_SUMMARY: Record<EditionId, string> = {
  full: 'FBR, EOBI, social security, PF, gratuity, bank payroll and maker-checker approvals.',
  lite: 'Attendance, leave, salaries, advances and payslips. No FBR data, cash payroll, one owner runs it all.',
};

/**
 * Vendor (OneNet) console: chooses the edition this installation runs in. Opened from the login screen with the
 * rotating console password; it can read and write only the edition, never customer data.
 */
export function EditionConsole({ apiBase, vendorToken, expiresAt, initialEdition, onSaved, onExit }: Props) {
  const [editionId, setEditionId] = useState<EditionId>(initialEdition.id);
  const [features, setFeatures] = useState<EditionFeatures>({ ...initialEdition.features });
  const [note, setNote] = useState(initialEdition.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<AppEdition | null>(null);

  const customized = useMemo(() => EDITION_FEATURE_KEYS.filter(key => features[key] !== EDITION_PRESETS[editionId][key]), [features, editionId]);
  const enabledCount = EDITION_FEATURE_KEYS.filter(key => features[key]).length;
  const dirty = editionId !== initialEdition.id || note.trim() !== (initialEdition.note || '')
    || EDITION_FEATURE_KEYS.some(key => features[key] !== initialEdition.features[key]);

  const choosePreset = (id: EditionId) => { setEditionId(id); setFeatures({ ...EDITION_PRESETS[id] }); setSaved(null); };
  const toggle = (key: EditionFeatureKey) => { setFeatures(previous => ({ ...previous, [key]: !previous[key] })); setSaved(null); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const response = await fetch(`${apiBase}/api/vendor/edition`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${vendorToken}` },
        body: JSON.stringify({ id: editionId, features, note: note.trim() || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `The edition could not be saved (${response.status}).`);
      const edition = resolveEdition(body.edition);
      setSaved(edition);
      onSaved(edition);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The edition could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const presetCard = (id: EditionId, icon: React.ReactNode) => {
    const active = editionId === id;
    return (
      <button type="button" onClick={() => choosePreset(id)} aria-pressed={active}
        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-emerald-500/80 bg-emerald-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'}`}>
        <span className={`shrink-0 rounded-lg p-2 ${active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{icon}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-white">{EDITION_LABELS[id]}</span>
            {initialEdition.id === id && <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-300">In force</span>}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{PRESET_SUMMARY[id]}</span>
        </span>
      </button>
    );
  };

  return (
    // #root is a fixed 100vh box with overflow hidden (app shell), so the console owns its own scrolling viewport.
    <div className="h-screen w-full overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-100 font-sans">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-4 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-tr from-emerald-600 to-green-500 p-2.5 text-white shadow-lg"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-400">OneNet vendor console</p>
              <h1 className="text-lg font-bold leading-tight text-white">Product edition for this installation</h1>
            </div>
          </div>
          <div className="text-[11px] leading-snug text-slate-500 sm:text-right">
            {expiresAt && <p>Session until {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
            {initialEdition.updatedAt && <p>Last set {new Date(initialEdition.updatedAt).toLocaleString()}{initialEdition.updatedBy ? ` · ${initialEdition.updatedBy}` : ''}</p>}
          </div>
        </header>

        <p className="mt-3 text-xs text-slate-400">Applies to every user, kiosk and phone at their next page load. No customer data is changed; switching the full edition back on restores every rule.</p>

        {error && <div role="alert" className="mt-3 rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</div>}
        {saved && !dirty && (
          <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Saved. This installation now runs the {saved.label.toLowerCase()}; users see it when they next open or refresh the app.
          </div>
        )}

        <section aria-label="Edition presets" className="mt-3 grid gap-3 sm:grid-cols-2">
          {presetCard('full', <Settings2 className="h-4 w-4" />)}
          {presetCard('lite', <Store className="h-4 w-4" />)}
        </section>

        <section className="mt-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Features <span className="ml-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-400">{enabledCount} of {EDITION_FEATURE_KEYS.length} on</span></h2>
            {customized.length > 0
              ? <button type="button" onClick={() => choosePreset(editionId)} className="text-[11px] font-semibold text-emerald-300 hover:underline">Reset to preset ({customized.length} changed)</button>
              : <span className="text-[11px] text-slate-500">Matches the {EDITION_LABELS[editionId].toLowerCase()} preset</span>}
          </div>
          <div className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {GROUPS.map(group => (
              <fieldset key={group} className="min-w-0 space-y-1.5">
                <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{group}</legend>
                {EDITION_FEATURE_KEYS.filter(key => EDITION_FEATURE_INFO[key].group === group).map(key => (
                  <label key={key} title={EDITION_FEATURE_INFO[key].detail}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition ${features[key] ? 'border-emerald-900/70 bg-emerald-950/30' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'}`}>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs font-semibold ${features[key] ? 'text-slate-100' : 'text-slate-400'}`}>{EDITION_FEATURE_INFO[key].label}</span>
                      <span className="block truncate text-[10px] text-slate-500">{EDITION_FEATURE_INFO[key].detail}</span>
                    </span>
                    <input type="checkbox" checked={features[key]} onChange={() => toggle(key)} className="peer sr-only" aria-label={EDITION_FEATURE_INFO[key].label} />
                    <span aria-hidden="true" className="relative h-5 w-9 shrink-0 rounded-full bg-slate-700 transition peer-checked:bg-emerald-500 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-400 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </section>

        <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400" htmlFor="edition-note">
          <span className="font-semibold text-slate-300">Note</span>
          <input id="edition-note" value={note} onChange={event => { setNote(event.target.value.slice(0, 500)); setSaved(null); }} placeholder="e.g. Hardware shop, 12 staff, cash salaries"
            className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-emerald-500" />
        </label>

        <footer className="sticky bottom-0 mt-auto -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <button type="button" onClick={onExit} className="text-xs font-semibold text-slate-400 hover:text-white">Exit console and return to sign in</button>
          <button type="button" onClick={save} disabled={saving || !dirty}
            className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-green-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition hover:from-emerald-500 hover:to-green-400 disabled:opacity-50 sm:w-auto">
            {saving ? 'Saving…' : `Apply ${EDITION_LABELS[editionId].toLowerCase()}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
