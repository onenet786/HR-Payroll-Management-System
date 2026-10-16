import React from 'react';
import { JURISDICTIONS } from '../data/provincialCompliance';
import { ShieldCheck } from 'lucide-react';
import type { JournalAccountKey, StatutoryChangeRequest, StatutoryConfig } from '../types';
import { JOURNAL_ACCOUNT_LABELS, resolveJournalAccounts } from '../data/accountingJournal';
import { ExportTemplateEditor } from './ExportTemplateEditor';
import { downloadEmployeeDocument, uploadEmployeeDocument } from '../utils/employeeDocuments';
import { DEFAULT_LEAVE_ENTITLEMENTS, leaveEntitlementFor } from '../data/leavePolicy';
import { DEFAULT_LOW_CONFIDENCE_BIOMETRIC_PERCENT, DEFAULT_MAX_CONSECUTIVE_WORK_DAYS, DEFAULT_MAX_WEEKLY_OVERTIME_HOURS } from '../data/complianceAlerts';

interface Props {
  editableConfig: StatutoryConfig;
  pendingRequest?: StatutoryChangeRequest;
  recentDecisions: StatutoryChangeRequest[];
  currentUserId: string;
  onUpdateStatConfig: (config: StatutoryConfig) => void;
  onReviewStatutoryChange: (id: string, decision: 'Approved' | 'Rejected', comment: string) => void;
}

export function StatutoryGovernancePanel({ editableConfig, pendingRequest, recentDecisions, currentUserId, onUpdateStatConfig, onReviewStatutoryChange }: Props) {
  const accounts = resolveJournalAccounts(editableConfig);
  const isProposer = pendingRequest?.createdById === currentUserId;
  const update = (patch: Partial<StatutoryConfig>) => onUpdateStatConfig({ ...editableConfig, ...patch });
  const updateAccount = (key: JournalAccountKey, field: 'code' | 'name', value: string) =>
    update({ journalAccounts: { ...(editableConfig.journalAccounts || {}), [key]: { ...accounts[key], [field]: value } } });
  const review = (decision: 'Approved' | 'Rejected') => {
    if (!pendingRequest) return;
    if (decision === 'Rejected' && isProposer) { if (window.confirm('Withdraw your pending statutory change?')) onReviewStatutoryChange(pendingRequest.id, 'Rejected', ''); return; }
    const comment = window.prompt(decision === 'Approved'
      ? 'Approval comment — cite the FBR / EOBI / provincial notification you verified:'
      : 'Reason for rejecting this statutory change:')?.trim();
    if (comment) onReviewStatutoryChange(pendingRequest.id, decision, comment);
  };

  return (
    <div className="space-y-4">
      <section className={`rounded-xl border p-4 text-xs ${pendingRequest ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50/60'}`} aria-labelledby="statutory-governance-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="statutory-governance-title" className="flex items-center gap-2 text-sm font-bold text-slate-900"><ShieldCheck size={16} className="text-emerald-700" />Statutory change control (maker-checker)</h3>
            <p className="mt-1 text-slate-600">Edits on this page are saved as a proposal. Payroll keeps using the live rates until a different authorized user approves the change.</p>
          </div>
          {pendingRequest && <div className="flex gap-2">
            <button type="button" onClick={() => review('Rejected')} className="rounded-lg border border-rose-300 bg-white px-3 py-2 font-bold text-rose-700 hover:bg-rose-50">{isProposer ? 'Withdraw' : 'Reject'}</button>
            <button type="button" disabled={isProposer} title={isProposer ? 'You proposed this change; another authorized user must approve it.' : 'Approve and apply to live payroll'} onClick={() => review('Approved')} className="rounded-lg bg-emerald-700 px-3 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Approve &amp; apply</button>
          </div>}
        </div>
        {pendingRequest ? (
          <p className="mt-3 rounded-lg bg-white/70 p-2 text-amber-900">
            <strong>Pending proposal</strong> by {pendingRequest.createdBy} since {new Date(pendingRequest.createdAt).toLocaleString('en-PK')} — changed: {pendingRequest.changedFields.length ? pendingRequest.changedFields.join(', ') : 'no differences yet'}.
            {' '}The values shown on this page are the proposed values.
          </p>
        ) : <p className="mt-3 font-semibold text-emerald-800">No pending changes. Live configuration{editableConfig.changeRequestId ? ` approved under ${editableConfig.changeRequestId}` : ''}.</p>}
        {recentDecisions.length > 0 && <ul className="mt-3 space-y-1 text-[11px] text-slate-600">
          {recentDecisions.slice(0, 3).map(item => <li key={item.id}>{item.status} by {item.reviewedBy} on {item.reviewedAt?.slice(0, 10)} — {item.changedFields.join(', ') || 'no fields'}{item.reviewComment ? ` (“${item.reviewComment}”)` : ''}</li>)}
        </ul>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="statutory-source-title">
        <h3 id="statutory-source-title" className="text-sm font-bold text-slate-900">Source of these rates</h3>
        <label className="mt-2 block text-slate-600">Official FBR / EOBI / provincial notification number or URL (required before approval)
          <input value={editableConfig.sourceReference || ''} onChange={e => update({ sourceReference: e.target.value })} placeholder="e.g. Finance Act 2026, FBR withholding rate card TY2027 — https://www.fbr.gov.pk/..." className="mt-1 w-full rounded border border-slate-300 p-2" />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">Attach notification (PDF/image)
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={async event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                const id = await uploadEmployeeDocument('statutory-sources', 'statutory-source', file);
                update({ sourceDocuments: [...(editableConfig.sourceDocuments || []), { id, name: file.name, uploadedAt: new Date().toISOString() }] });
              } catch (error) { alert(error instanceof Error ? error.message : 'Upload failed.'); }
            }} />
          </label>
          {(editableConfig.sourceDocuments || []).map(document => (
            <span key={document.id} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1">
              <button type="button" onClick={() => downloadEmployeeDocument(document.id, document.name).catch(error => alert(error instanceof Error ? error.message : 'Download failed.'))} className="font-semibold text-indigo-700 hover:underline">{document.name}</button>
              <button type="button" aria-label={`Detach ${document.name}`} onClick={() => update({ sourceDocuments: (editableConfig.sourceDocuments || []).filter(item => item.id !== document.id) })} className="text-rose-700">✕</button>
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="tax-engine-title">
        <h3 id="tax-engine-title" className="text-sm font-bold text-slate-900">Salary tax rules</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-slate-600">Medical allowance exempt (% of basic)
            <input type="number" min="0" max="100" value={editableConfig.medicalAllowanceExemptPercentOfBasic ?? 0} onChange={e => update({ medicalAllowanceExemptPercentOfBasic: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
          <label className="text-slate-600">Surcharge rate (% of tax)
            <input type="number" min="0" step="0.5" value={editableConfig.surchargeRatePercent ?? 0} onChange={e => update({ surchargeRatePercent: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
          <label className="text-slate-600">Surcharge applies above (annual taxable PKR)
            <input type="number" min="0" value={editableConfig.surchargeThresholdAnnual ?? 10000000} onChange={e => update({ surchargeThresholdAnnual: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Set these from the Finance Act for the tax year. Perquisites (car, accommodation, other) are entered per employee and added to taxable income.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="social-security-rules-title">
        <h3 id="social-security-rules-title" className="text-sm font-bold text-slate-900">Provincial social security coverage</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-slate-600">Eligibility
            <select value={editableConfig.socialSecurityEligibility || 'Capped wage for all'} onChange={e => update({ socialSecurityEligibility: e.target.value as StatutoryConfig['socialSecurityEligibility'] })} className="mt-1 w-full rounded border border-slate-300 bg-white p-2">
              <option>Capped wage for all</option>
              <option>Only employees within wage ceiling</option>
            </select>
          </label>
          <div className="text-slate-600">Excluded worker categories
            <div className="mt-1 flex flex-wrap gap-2">{(['Supervisory', 'Managerial', 'Contract', 'Apprentice'] as const).map(category => (
              <label key={category} className="flex items-center gap-1"><input type="checkbox" checked={Boolean(editableConfig.socialSecurityExcludedCategories?.includes(category))} onChange={e => update({ socialSecurityExcludedCategories: e.target.checked ? [...(editableConfig.socialSecurityExcludedCategories || []), category] : (editableConfig.socialSecurityExcludedCategories || []).filter(item => item !== category) })} />{category}</label>
            ))}</div>
          </div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">{JURISDICTIONS.map(province => (
          <label key={province} className="text-slate-600">{province} wage ceiling (PKR)
            <input type="number" min="0" value={editableConfig.provincialSocialSecurityCeilings?.[province] ?? editableConfig.socialSecurityWageCeiling ?? 0} onChange={e => update({ provincialSocialSecurityCeilings: { ...(editableConfig.provincialSocialSecurityCeilings || {}), [province]: Number(e.target.value) } })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
        ))}</div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="leave-entitlements-title">
        <h3 id="leave-entitlements-title" className="text-sm font-bold text-slate-900">Leave entitlements (days per calendar year)</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{(Object.keys(DEFAULT_LEAVE_ENTITLEMENTS) as Array<keyof typeof DEFAULT_LEAVE_ENTITLEMENTS>).map(type => (
          <label key={type} className="text-slate-600">{type}
            <input type="number" min="0" value={leaveEntitlementFor(editableConfig, type)} onChange={e => update({ leaveEntitlements: { ...(editableConfig.leaveEntitlements || {}), [type]: Number(e.target.value) }, ...(type === 'Annual' && { annualLeaveDaysPerYear: Number(e.target.value) }) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
        ))}</div>
        <p className="mt-2 text-[10px] text-slate-500">Annual and casual leave are pro-rated for joiners. Requests and approvals beyond the remaining balance are blocked; the excess must be taken as unpaid leave.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="establishment-rules-title">
        <h3 id="establishment-rules-title" className="text-sm font-bold text-slate-900">Factories vs shops &amp; establishments</h3>
        <p className="mt-1 text-slate-500">Each branch is tagged with its labour-law category in Master Data. Leave a field blank to use the global setting.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead><tr className="text-left text-slate-500"><th className="p-1">Category</th><th className="p-1">Overtime multiplier</th><th className="p-1">Max weekly overtime (h)</th><th className="p-1">Max consecutive days</th><th className="p-1">Minimum wage override (PKR)</th></tr></thead>
            <tbody>{(['Factory', 'Shop / Commercial', 'Industrial / Other'] as const).map(type => {
              const rule = editableConfig.establishmentRules?.[type] || {};
              const set = (field: keyof NonNullable<StatutoryConfig['establishmentRules']>[typeof type] & string, value: string) => update({
                establishmentRules: { ...(editableConfig.establishmentRules || {}), [type]: { ...rule, [field]: value === '' ? undefined : Number(value) } },
              });
              return <tr key={type} className="border-t border-slate-100">
                <td className="p-1 font-semibold text-slate-700">{type}</td>
                {(['overtimeMultiplier', 'maxWeeklyOvertimeHours', 'maxConsecutiveWorkDays', 'minimumWage'] as const).map(field => (
                  <td key={field} className="p-1"><input aria-label={`${type} ${field}`} type="number" min="0" step={field === 'overtimeMultiplier' ? '0.25' : '1'} value={rule[field] ?? ''} placeholder="global" onChange={e => set(field, e.target.value)} className="w-full rounded border border-slate-300 p-1.5 font-mono" /></td>
                ))}
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="settlement-rules-title">
        <h3 id="settlement-rules-title" className="text-sm font-bold text-slate-900">Gratuity, settlement &amp; leave rules</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-slate-600">Daily rate divisor<select value={editableConfig.settlementDailyRateDivisor || 30} onChange={e => update({ settlementDailyRateDivisor: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 bg-white p-2"><option value={30}>Monthly ÷ 30</option><option value={26}>Monthly ÷ 26</option></select></label>
          <label className="text-slate-600">Min. service for gratuity (years)<input type="number" min="0" step="0.5" value={editableConfig.gratuityMinimumServiceYears ?? 1} onChange={e => update({ gratuityMinimumServiceYears: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" /></label>
          <label className="text-slate-600">Resignation &lt; 5 yrs (% paid)<input type="number" min="0" max="100" value={editableConfig.gratuityResignationUnderFiveYearsPercent ?? 100} onChange={e => update({ gratuityResignationUnderFiveYearsPercent: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" /></label>
          <label className="flex items-end gap-2 text-slate-600"><input type="checkbox" checked={Boolean(editableConfig.gratuityCountPartYearOverSixMonths)} onChange={e => update({ gratuityCountPartYearOverSixMonths: e.target.checked })} />Count part-year &gt; 6 months as a year</label>
          <label className="text-slate-600">Annual leave days / year<input type="number" min="0" value={editableConfig.annualLeaveDaysPerYear ?? 14} onChange={e => update({ annualLeaveDaysPerYear: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" /></label>
          <label className="text-slate-600">Max leave encash days<input type="number" min="0" value={editableConfig.maxLeaveEncashDays ?? 30} onChange={e => update({ maxLeaveEncashDays: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" /></label>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">One rule drives the Gratuity module, offboarding and lifecycle approvals. Confirm it against your standing orders, gratuity scheme rules and appointment letters.</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="compliance-limits-title">
        <h3 id="compliance-limits-title" className="text-sm font-bold text-slate-900">Compliance alert limits &amp; settlement tax</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-slate-600">Max overtime per week (hours)
            <input type="number" min="0" value={editableConfig.maxWeeklyOvertimeHours ?? DEFAULT_MAX_WEEKLY_OVERTIME_HOURS} onChange={e => update({ maxWeeklyOvertimeHours: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
          <label className="text-slate-600">Max consecutive work days
            <input type="number" min="1" value={editableConfig.maxConsecutiveWorkDays ?? DEFAULT_MAX_CONSECUTIVE_WORK_DAYS} onChange={e => update({ maxConsecutiveWorkDays: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
          <label className="text-slate-600">Low-confidence biometric below (%)
            <input type="number" min="0" max="100" value={editableConfig.lowConfidenceBiometricPercent ?? DEFAULT_LOW_CONFIDENCE_BIOMETRIC_PERCENT} onChange={e => update({ lowConfidenceBiometricPercent: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
          <label className="text-slate-600">Tax-exempt gratuity (PKR)
            <input type="number" min="0" value={editableConfig.gratuityTaxExemptAmount ?? 0} onChange={e => update({ gratuityTaxExemptAmount: Number(e.target.value) })} className="mt-1 w-full rounded border border-slate-300 p-2 font-mono" />
          </label>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Biometric review cutoff: each face or fingerprint match reports a strength from 0% (just inside the acceptance threshold) to 100% (exact). Punches below the cutoff are accepted but sent to supervisor review; kiosks pick up the value on their next sync. Your workflow diagram's 85% rule is reproduced by entering 85 — expect far more reviews than at the default 25.</p>
        <p className="mt-2 text-[10px] text-slate-500">Set limits from your standing orders and applicable Factories Act / Shops &amp; Establishments rules. The gratuity exemption depends on whether your scheme is an approved fund (Second Schedule, Part I, clause 13) — confirm with your tax adviser; 0 treats the full gratuity as taxable.</p>
      </section>

      <ExportTemplateEditor editableConfig={editableConfig} onUpdateStatConfig={onUpdateStatConfig} />

      <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="coa-title">
        <h3 id="coa-title" className="text-sm font-bold text-slate-900">Chart of accounts mapping (payroll journal)</h3>
        <p className="mt-1 text-slate-500">Map each payroll posting to your general-ledger account. Changes follow the same approval control.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {(Object.keys(JOURNAL_ACCOUNT_LABELS) as JournalAccountKey[]).map(key => (
            <div key={key} className="grid grid-cols-[minmax(0,1.2fr)_5rem_minmax(0,1.5fr)] items-center gap-2 rounded-lg bg-slate-50 p-2">
              <span className="font-semibold text-slate-700">{JOURNAL_ACCOUNT_LABELS[key]}</span>
              <input aria-label={`${JOURNAL_ACCOUNT_LABELS[key]} account code`} value={accounts[key].code} onChange={e => updateAccount(key, 'code', e.target.value)} className="rounded border border-slate-300 p-1.5 font-mono" />
              <input aria-label={`${JOURNAL_ACCOUNT_LABELS[key]} account name`} value={accounts[key].name} onChange={e => updateAccount(key, 'name', e.target.value)} className="rounded border border-slate-300 p-1.5" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
