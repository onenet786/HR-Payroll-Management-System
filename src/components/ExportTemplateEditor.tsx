import React, { useMemo, useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import type { PayrollRun, Payslip, StatutoryConfig } from '../types';
import { BATCH_TOKENS, ROW_TOKENS, STARTER_EXPORT_TEMPLATES, renderExport, type ColumnFormat, type ExportColumn, type ExportKind, type ExportTemplate } from '../data/exportTemplates';

const FORMATS: ColumnFormat[] = ['text', 'upper', 'digits', 'amount-2dp', 'amount-int', 'amount-paisa', 'date-yyyymmdd', 'date-ddmmyyyy', 'date-dd/mm/yyyy'];
const sampleRun = { id: 'preview-run', periodMonth: 10, periodYear: 2026 } as PayrollRun;
const sampleSheet = {
  id: 'preview', payrollRunId: 'preview-run', employeeId: 'preview-emp', employeeCode: 'EMP-001', employeeName: 'Ahmed Raza', cnic: '35202-1234567-1',
  iban: 'PK36SCBL0000001123456702', bankAccountNumber: '1123456702', bankName: 'HBL', netSalary: 98765.4, grossSalary: 120000, basicEarnings: 60000,
  eobiEmployeeDeduction: 370, eobiEmployerContribution: 1850, pessiEmployerContribution: 2400, province: 'Punjab',
} as Payslip;

export function ExportTemplateEditor({ editableConfig, onUpdateStatConfig }: { editableConfig: StatutoryConfig; onUpdateStatConfig: (config: StatutoryConfig) => void }) {
  const templates = editableConfig.exportTemplates?.length ? editableConfig.exportTemplates : STARTER_EXPORT_TEMPLATES;
  const [selectedId, setSelectedId] = useState(templates[0]?.id || '');
  const template = templates.find(item => item.id === selectedId) || templates[0];
  const save = (next: ExportTemplate[]) => onUpdateStatConfig({ ...editableConfig, exportTemplates: next });
  const update = (patch: Partial<ExportTemplate>) => template && save(templates.map(item => item.id === template.id ? { ...item, ...patch, ...(patch.verified === undefined && !('verified' in patch) ? { verified: false } : {}) } : item));
  const updateColumn = (index: number, patch: Partial<ExportColumn>) => template && update({ columns: template.columns.map((column, position) => position === index ? { ...column, ...patch } : column) });
  const preview = useMemo(() => template ? renderExport(template, [sampleSheet], {
    run: sampleRun, companyName: 'Sample Company', valueDate: '2026-10-31', batchReference: 'B0001',
    employees: [{ id: 'preview-emp', eobiNumber: 'EOBI-1001', socialSecurityNumber: 'SS-2002', bankBranchName: 'Model Town', contactNumber: '+923001234567' } as never],
  }) : undefined, [template]);
  if (!template) return null;
  const input = 'w-full rounded border border-slate-300 p-1.5 text-xs';
  const addTemplate = (base?: ExportTemplate) => {
    const id = `tpl-${Date.now()}`;
    const copy: ExportTemplate = base ? { ...base, id, name: `${base.name} (copy)`, verified: false } : { id, name: 'New template', kind: 'Bank Advice', format: 'Delimited', delimiter: ',', columns: [{ title: 'IBAN', value: '{iban}' }], verified: false };
    save([...templates, copy]);
    setSelectedId(id);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm" aria-labelledby="export-templates-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="export-templates-title" className="text-sm font-bold text-slate-900">Bank &amp; statutory upload file templates</h3>
          <p className="mt-1 text-slate-500">Transcribe each bank's or regulator's file specification here. Any edit clears “verified”; tick it only after a test batch is accepted. Changes follow the statutory approval control.</p>
        </div>
        <div className="flex gap-2">
          <select aria-label="Export template" value={template.id} onChange={event => setSelectedId(event.target.value)} className="rounded border border-slate-300 bg-white p-1.5">
            {templates.map(item => <option key={item.id} value={item.id}>{item.verified ? '✓ ' : '⚠ '}{item.name}</option>)}
          </select>
          <button type="button" onClick={() => addTemplate(template)} className="flex items-center gap-1 rounded border border-slate-300 px-2" title="Duplicate"><Copy size={13} />Copy</button>
          <button type="button" onClick={() => addTemplate()} className="flex items-center gap-1 rounded border border-slate-300 px-2"><Plus size={13} />New</button>
          <button type="button" disabled={templates.length <= 1} onClick={() => { if (window.confirm(`Remove template "${template.name}"?`)) { save(templates.filter(item => item.id !== template.id)); setSelectedId(templates[0].id); } }} className="flex items-center gap-1 rounded border border-rose-300 px-2 text-rose-700 disabled:opacity-40"><Trash2 size={13} />Remove</button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-slate-600">Name<input value={template.name} onChange={e => update({ name: e.target.value })} className={input} /></label>
        <label className="text-slate-600">Purpose<select value={template.kind} onChange={e => update({ kind: e.target.value as ExportKind })} className={input}><option>Bank Advice</option><option>EOBI Return</option><option>Social Security Return</option></select></label>
        <label className="text-slate-600">Institution<input value={template.bank || ''} onChange={e => update({ bank: e.target.value })} className={input} /></label>
        <label className="text-slate-600">Layout<select value={template.format} onChange={e => update({ format: e.target.value as ExportTemplate['format'] })} className={input}><option>Delimited</option><option>Fixed Width</option></select></label>
        {template.format === 'Delimited' && <>
          <label className="text-slate-600">Delimiter<select value={template.delimiter ?? ','} onChange={e => update({ delimiter: e.target.value })} className={input}><option value=",">Comma</option><option value="|">Pipe |</option><option value=";">Semicolon</option><option value={'\t'}>Tab</option></select></label>
          <label className="flex items-end gap-2 text-slate-600"><input type="checkbox" checked={Boolean(template.quoteValues)} onChange={e => update({ quoteValues: e.target.checked })} />Quote values</label>
          <label className="flex items-end gap-2 text-slate-600"><input type="checkbox" checked={Boolean(template.includeColumnTitles)} onChange={e => update({ includeColumnTitles: e.target.checked })} />Column title row</label>
        </>}
        <label className="text-slate-600">File extension<select value={template.fileExtension || (template.format === 'Delimited' ? 'csv' : 'txt')} onChange={e => update({ fileExtension: e.target.value as 'csv' | 'txt' })} className={input}><option>csv</option><option>txt</option></select></label>
        {template.kind === 'Bank Advice' && <label className="text-slate-600">Debit (payroll funding) account<input value={template.debitAccount || ''} onChange={e => update({ debitAccount: e.target.value })} className={`${input} font-mono`} /></label>}
        <label className="text-slate-600 sm:col-span-2">Specification reference (document, version, date)<input value={template.specReference || ''} onChange={e => update({ specReference: e.target.value })} className={input} /></label>
        <label className={`flex items-end gap-2 font-semibold ${template.verified ? 'text-emerald-700' : 'text-amber-700'}`}><input type="checkbox" checked={Boolean(template.verified)} disabled={!template.specReference?.trim()} onChange={e => update({ verified: e.target.checked })} />Verified with a bank-accepted test batch</label>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="text-slate-600">Header lines (one per line; batch tokens)<textarea value={(template.headerLines || []).join('\n')} onChange={e => update({ headerLines: e.target.value ? e.target.value.split('\n') : [] })} className={`${input} min-h-16 font-mono`} /></label>
        <label className="text-slate-600">Trailer lines<textarea value={(template.trailerLines || []).join('\n')} onChange={e => update({ trailerLines: e.target.value ? e.target.value.split('\n') : [] })} className={`${input} min-h-16 font-mono`} /></label>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Row tokens: {ROW_TOKENS.map(token => `{${token}}`).join(' ')} · Batch tokens: {BATCH_TOKENS.map(token => `{${token}}`).join(' ')} · Format a batch token inline as {'{valueDate|date-ddmmyyyy}'}.</p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr className="text-left text-slate-500"><th className="p-1">Column title</th><th className="p-1">Value / tokens</th><th className="p-1">Format</th>{template.format === 'Fixed Width' && <><th className="p-1">Width</th><th className="p-1">Align</th><th className="p-1">Pad</th></>}<th className="p-1">Required</th><th className="p-1"></th></tr></thead>
          <tbody>{template.columns.map((column, index) => <tr key={index} className="border-t border-slate-100">
            <td className="p-1"><input aria-label={`Column ${index + 1} title`} value={column.title} onChange={e => updateColumn(index, { title: e.target.value })} className={input} /></td>
            <td className="p-1"><input aria-label={`Column ${index + 1} value`} value={column.value} onChange={e => updateColumn(index, { value: e.target.value })} className={`${input} font-mono`} /></td>
            <td className="p-1"><select aria-label={`Column ${index + 1} format`} value={column.format || 'text'} onChange={e => updateColumn(index, { format: e.target.value as ColumnFormat })} className={input}>{FORMATS.map(format => <option key={format}>{format}</option>)}</select></td>
            {template.format === 'Fixed Width' && <>
              <td className="p-1"><input aria-label={`Column ${index + 1} width`} type="number" min="1" value={column.width || ''} onChange={e => updateColumn(index, { width: Number(e.target.value) || undefined })} className={`${input} w-16`} /></td>
              <td className="p-1"><select aria-label={`Column ${index + 1} align`} value={column.align || 'left'} onChange={e => updateColumn(index, { align: e.target.value as 'left' | 'right' })} className={input}><option>left</option><option>right</option></select></td>
              <td className="p-1"><input aria-label={`Column ${index + 1} pad`} maxLength={1} value={column.pad ?? ' '} onChange={e => updateColumn(index, { pad: e.target.value || ' ' })} className={`${input} w-10 font-mono`} /></td>
            </>}
            <td className="p-1 text-center"><input type="checkbox" aria-label={`Column ${index + 1} required`} checked={Boolean(column.required)} onChange={e => updateColumn(index, { required: e.target.checked })} /></td>
            <td className="p-1 whitespace-nowrap">
              <button type="button" disabled={index === 0} onClick={() => { const columns = [...template.columns]; [columns[index - 1], columns[index]] = [columns[index], columns[index - 1]]; update({ columns }); }} className="px-1 disabled:opacity-30" aria-label="Move up">↑</button>
              <button type="button" onClick={() => update({ columns: template.columns.filter((_, position) => position !== index) })} className="px-1 text-rose-700" aria-label="Remove column">✕</button>
            </td>
          </tr>)}</tbody>
        </table>
        <button type="button" onClick={() => update({ columns: [...template.columns, { title: 'New column', value: '' }] })} className="mt-1 font-semibold text-indigo-700 hover:underline">+ Add column</button>
      </div>

      {preview && <div className="mt-3">
        <p className="font-semibold text-slate-700">Preview (one sample employee)</p>
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-900 p-2 font-mono text-[11px] text-emerald-200">{preview.content}</pre>
        {preview.errors.map(error => <p key={error} className="text-rose-700">{error}</p>)}
      </div>}
    </section>
  );
}
