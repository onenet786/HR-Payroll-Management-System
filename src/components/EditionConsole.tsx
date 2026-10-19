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

  const presetCard = (id: EditionId, icon: React.ReactNode, summary: string) => (
    <button type="button" onClick={() => choosePreset(id)} aria-pressed={editionId === id}
      className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${editionId === id ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-950/40' : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}>
      <span className={`mt-0.5 rounded-xl p-2 ${editionId === id ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{icon}</span>
      <span>
        <span className="block text-sm font-bold text-white">{EDITION_LABELS[id]}</span>
        <span className="mt-1 block text-xs text-slate-400">{summary}</span>
        {initialEdition.id === id && <span className="mt-2 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">Currently in force</span>}
      </span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-4 py-8 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-gradient-to-tr from-emerald-600 to-green-500 p-3 text-white shadow-lg"><ShieldCheck className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-400">OneNet vendor console</p>
              <h1 className="text-xl font-bold text-white">Product edition for this installation</h1>
              <p className="mt-1 max-w-xl text-xs text-slate-400">
                Choose what this customer needs. The choice applies to every user, kiosk and phone at their next page load. Nothing in the customer&rsquo;s data is changed; switching the full edition back on restores every rule.
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] text-slate-500">
            {expiresAt && <p>Console session until {new Date(expiresAt).toLocaleTimeString()}</p>}
            {initialEdition.updatedAt && <p>Last set {new Date(initialEdition.updatedAt).toLocaleString()}{initialEdition.updatedBy ? ` by ${initialEdition.updatedBy}` : ''}</p>}
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-rose-900/60 bg-rose-950/40 p-3.5 text-xs text-rose-300">{error}</div>}
        {saved && !dirty && (
          <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-3.5 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Saved: this installation now runs the {saved.label.toLowerCase()}. Users see it when they next open or refresh the app.
          </div>
        )}

        <section aria-label="Edition presets" className="grid gap-3 md:grid-cols-2">
          {presetCard('full', <Settings2 className="h-5 w-5" />, 'Every compliance rule: FBR withholding, EOBI, social security, provident fund, gratuity, bank payroll and maker-checker approvals. For companies with a payroll department.')}
          {presetCard('lite', <Store className="h-5 w-5" />, 'Shops and small businesses with 10-15 staff: attendance, leave, salaries, advances and payslips. No FBR data, no statutory contributions, cash payroll allowed and one owner can run everything.')}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-white">Fine-tune the {EDITION_LABELS[editionId].toLowerCase()}</h2>
              <p className="text-xs text-slate-400">Start from the preset and switch single features on or off for this customer.</p>
            </div>
            {customized.length > 0 && <button type="button" onClick={() => choosePreset(editionId)} className="text-xs font-semibold text-emerald-300 underline">Reset to preset ({customized.length} changed)</button>}
          </div>
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            {GROUPS.map(group => (
              <fieldset key={group} className="space-y-2">
                <legend className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{group}</legend>
                {EDITION_FEATURE_KEYS.filter(key => EDITION_FEATURE_INFO[key].group === group).map(key => (
                  <label key={key} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition ${features[key] ? 'border-emerald-800/70 bg-emerald-950/30' : 'border-slate-800 bg-slate-900'}`}>
                    <input type="checkbox" checked={features[key]} onChange={() => toggle(key)} className="mt-0.5 h-4 w-4 accent-emerald-500" aria-describedby={`feature-${key}-detail`} />
                    <span>
                      <span className="block font-bold text-slate-100">{EDITION_FEATURE_INFO[key].label}</span>
                      <span id={`feature-${key}-detail`} className="mt-0.5 block text-[11px] leading-snug text-slate-400">{EDITION_FEATURE_INFO[key].detail}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
          <label className="block text-xs font-bold text-slate-300" htmlFor="edition-note">Note for this installation (optional)</label>
          <textarea id="edition-note" value={note} onChange={event => { setNote(event.target.value.slice(0, 500)); setSaved(null); }} rows={2} placeholder="e.g. Hardware shop, 12 staff, cash salaries, no FBR registration yet"
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500" />
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onExit} className="text-xs font-semibold text-slate-400 hover:text-white">Exit console and return to sign in</button>
          <button type="button" onClick={save} disabled={saving || !dirty}
            className="rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:from-emerald-500 hover:to-green-400 disabled:opacity-50">
            {saving ? 'Saving…' : `Apply ${EDITION_LABELS[editionId].toLowerCase()}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
