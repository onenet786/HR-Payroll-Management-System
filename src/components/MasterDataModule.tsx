import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Layers3, Map, MapPin, Pencil, Plus, Search, Tags, WalletCards, X } from 'lucide-react';
import type { Branch, Company, Department, Designation, Employee, UcTown, WageType, Zone } from '../types';
import { makeMasterId } from '../data/masterData';
import {
  generateMasterCode, masterCodeTrail, normalizeManualMasterCode, resolveDepartmentHierarchy, resolveDesignationHierarchy, resolveUcTownHierarchy,
  validateManualMasterCode,
} from '../data/masterCodes';

type Kind = 'branch' | 'department' | 'designation' | 'zone' | 'ucTown' | 'wageType';
type RecordType = Branch | Department | Designation | Zone | UcTown | WageType;
type Props = {
  companies: Company[]; branches: Branch[]; departments: Department[]; designations: Designation[];
  zones: Zone[]; ucTowns: UcTown[]; wageTypes: WageType[]; employees: Employee[];
  onSave: (kind: Kind, record: RecordType) => Promise<void>;
};

const tabs = [
  ['branch', 'Branches', Building2], ['department', 'Departments', Layers3], ['designation', 'Designations', Tags],
  ['zone', 'Zones', Map], ['ucTown', 'UC/Towns', MapPin], ['wageType', 'Wage Types', WalletCards],
] as const;
const label: Record<Kind, string> = { branch: 'Branch', department: 'Department', designation: 'Designation', zone: 'Zone', ucTown: 'UC/Town', wageType: 'Wage Type' };
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
const normalized = (value: string) => value.trim().toLocaleLowerCase();

export function MasterDataModule(props: Props) {
  const [kind, setKind] = useState<Kind>('branch');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<RecordType | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoCode, setAutoCode] = useState(true);
  const firstInput = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const primaryCompany = props.companies[0];
  const records: Record<Kind, RecordType[]> = { branch: props.branches, department: props.departments, designation: props.designations, zone: props.zones, ucTown: props.ucTowns, wageType: props.wageTypes };
  const current = records[kind];
  const generatedCodeKind = ['department', 'designation', 'zone', 'ucTown', 'wageType'].includes(kind);

  useEffect(() => {
    if (editing === null) return;
    firstInput.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-labelledby="master-form-title"]');
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [editing, saving]);
  const open = (record?: RecordType) => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setErrors({}); setSaveError(''); setEditing(record ?? ({} as RecordType));
    const data = record ? Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value ?? '')])) : {};
    const hierarchyCompanyId = kind === 'department' && record
      ? resolveDepartmentHierarchy((record as Department).branchId, props.branches, props.companies).company?.id
      : kind === 'designation' && record
        ? resolveDesignationHierarchy((record as Designation).departmentId, props.departments, props.branches, props.companies).company?.id
      : kind === 'ucTown' && record
        ? resolveUcTownHierarchy((record as UcTown).zoneId, props.zones, props.companies).company?.id
        : 'companyId' in (record ?? {}) ? (record as Zone | WageType).companyId : undefined;
    setAutoCode(!record || (generatedCodeKind && !('code' in record && record.code)));
    setForm({ status: 'Active', calculationBasis: 'Monthly', companyId: hierarchyCompanyId ?? primaryCompany?.id ?? '', ...data });
  };
  const close = () => { if (!saving) { setEditing(null); requestAnimationFrame(() => returnFocusRef.current?.focus()); } };

  const filtered = useMemo(() => current.filter(item => Object.values(item).some(value => normalized(String(value)).includes(normalized(query)))), [current, query]);
  const set = (field: string, value: string) => setForm(old => ({ ...old, [field]: value }));
  const selectedCompany = props.companies.find(company => company.id === form.companyId);
  const companyBranches = props.branches.filter(branch => branch.companyId === form.companyId);
  const companyBranchIds = new Set(companyBranches.map(branch => branch.id));
  const companyDepartments = props.departments.filter(department => companyBranchIds.has(department.branchId));
  const companyZones = props.zones.filter(zone => zone.companyId === form.companyId);
  const departmentHierarchy = resolveDepartmentHierarchy(form.branchId ?? '', props.branches, props.companies);
  const designationHierarchy = resolveDesignationHierarchy(form.departmentId ?? '', props.departments, props.branches, props.companies);
  const ucTownHierarchy = resolveUcTownHierarchy(form.zoneId ?? '', props.zones, props.companies);
  const scopedCodeRecords = kind === 'department'
    ? props.departments.filter(item => item.branchId === form.branchId)
    : kind === 'designation'
      ? props.designations.filter(item => item.departmentId === form.departmentId)
    : kind === 'zone'
      ? props.zones.filter(item => item.companyId === form.companyId)
      : kind === 'ucTown'
        ? props.ucTowns.filter(item => item.zoneId === form.zoneId)
        : kind === 'wageType'
          ? props.wageTypes.filter(item => item.companyId === form.companyId)
          : current;
  const codeInput = {
    name: form.name ?? '', title: form.title ?? '',
    company: kind === 'department' ? departmentHierarchy.company : kind === 'designation' ? designationHierarchy.company : kind === 'ucTown' ? ucTownHierarchy.company : selectedCompany,
    branch: kind === 'department' ? departmentHierarchy.branch : designationHierarchy.branch, department: designationHierarchy.department, zone: ucTownHierarchy.zone,
  };
  const generatedCode = generatedCodeKind ? generateMasterCode(kind as 'department' | 'designation' | 'zone' | 'ucTown' | 'wageType', codeInput, scopedCodeRecords as Array<Department | Designation | Zone | UcTown | WageType>, form.id ?? '') : '';
  const generatedTrail = generatedCodeKind && generatedCode ? masterCodeTrail(kind as 'department' | 'designation' | 'zone' | 'ucTown' | 'wageType', codeInput, generatedCode) : [];
  const effectiveCode = autoCode && generatedCodeKind ? generatedCode : normalizeManualMasterCode(form.code ?? '');
  const referenceCount = (item: RecordType) => {
    if (kind === 'branch') return props.departments.filter(x => x.branchId === item.id).length + props.employees.filter(x => x.branchId === item.id).length;
    if (kind === 'department') return props.designations.filter(x => x.departmentId === item.id).length + props.employees.filter(x => x.departmentId === item.id).length;
    if (kind === 'designation') return props.employees.filter(x => x.designationId === item.id).length;
    if (kind === 'zone') return props.ucTowns.filter(x => x.zoneId === item.id).length + props.employees.filter(x => x.zoneId === item.id).length;
    if (kind === 'ucTown') return props.employees.filter(x => x.ucTownId === item.id).length;
    return props.employees.filter(x => x.wageTypeId === item.id).length;
  };
  const parentText = (item: RecordType) => {
    if (kind === 'department') return props.branches.find(x => x.id === (item as Department).branchId)?.name ?? 'Unknown branch';
    if (kind === 'designation') return props.departments.find(x => x.id === (item as Designation).departmentId)?.name ?? 'Unknown department';
    if (kind === 'ucTown') return props.zones.find(x => x.id === (item as UcTown).zoneId)?.name ?? 'Unknown zone';
    if (kind === 'branch') return (item as Branch).city;
    if (kind === 'wageType') return `${(item as WageType).calculationBasis} calculation`;
    return 'Primary company';
  };

  const validate = () => {
    const next: Record<string, string> = {};
    const require = (key: string, title: string) => { if (!form[key]?.trim()) next[key] = `${title} is required.`; };
    if (kind === 'designation') { require('title', 'Title'); require('departmentId', 'Department'); }
    else { require('name', 'Name'); if (!generatedCodeKind) require('code', 'Code'); }
    if (kind === 'branch') { require('city', 'City'); require('province', 'Province'); require('address', 'Address'); }
    if (kind === 'department') require('branchId', 'Branch');
    if (kind === 'ucTown') require('zoneId', 'Zone');
    if ((kind === 'zone' || kind === 'wageType') && !form.companyId) require('companyId', 'Company');
    if (generatedCodeKind) {
      if (autoCode && !generatedCode) next.code = kind === 'department' ? 'Select a Branch and enter a department name first.' : kind === 'designation' ? 'Select a Department and enter a title first.' : kind === 'ucTown' ? 'Select a Zone and enter a UC/Town name first.' : `Select a Company and enter a ${label[kind].toLowerCase()} name first.`;
      else if (!autoCode) {
        const codeError = validateManualMasterCode(form.code ?? '', scopedCodeRecords as Array<{ id: string; code?: string }>, form.id ?? '');
        if (codeError) next.code = codeError;
      }
    }
    const code = normalized(form.code ?? '');
    const parentKey = kind === 'department' ? 'branchId' : kind === 'ucTown' ? 'zoneId' : 'companyId';
    if (!generatedCodeKind && code && current.some(x => x.id !== form.id && normalized((x as any).code ?? '') === code && (parentKey === 'companyId' || (x as any)[parentKey] === form[parentKey]))) next.code = 'This code is already in use for the selected parent.';
    const refs = form.id ? referenceCount({ id: form.id } as RecordType) : 0;
    if (refs && kind === 'department' && props.departments.find(x => x.id === form.id)?.branchId !== form.branchId) next.branchId = 'Branch cannot change while this department is referenced.';
    if (refs && kind === 'designation' && props.designations.find(x => x.id === form.id)?.departmentId !== form.departmentId) next.departmentId = 'Department cannot change while this designation is referenced.';
    if (refs && kind === 'wageType' && props.wageTypes.find(x => x.id === form.id)?.calculationBasis !== form.calculationBasis) next.calculationBasis = 'Calculation basis is locked because employees use this wage type.';
    setErrors(next); return !Object.keys(next).length;
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!validate()) return;
    setSaving(true); setSaveError('');
    const id = form.id || makeMasterId(kind);
    let record: RecordType;
    if (kind === 'branch') record = { id, companyId: primaryCompany?.id ?? 'primary-company', code: form.code.trim().toUpperCase(), name: form.name.trim(), city: form.city.trim(), province: form.province as Branch['province'], address: form.address.trim() };
    else if (kind === 'department') record = { id, branchId: form.branchId, code: effectiveCode, name: form.name.trim() };
    else if (kind === 'designation') record = { id, departmentId: form.departmentId, code: effectiveCode, title: form.title.trim(), grade: form.grade?.trim() ?? '' };
    else if (kind === 'zone') record = { id, companyId: form.companyId, code: effectiveCode, name: form.name.trim(), status: form.status as Zone['status'] };
    else if (kind === 'ucTown') record = { id, zoneId: form.zoneId, code: effectiveCode, name: form.name.trim(), status: form.status as UcTown['status'] };
    else record = { id, companyId: form.companyId, code: effectiveCode, name: form.name.trim(), calculationBasis: form.calculationBasis as WageType['calculationBasis'], status: form.status as WageType['status'] };
    try { await props.onSave(kind, record); setEditing(null); requestAnimationFrame(() => returnFocusRef.current?.focus()); } catch { setSaveError('Unable to save this record.'); } finally { setSaving(false); }
  };
  const field = (key: string, title: string, type = 'text') => <label className="block text-sm font-semibold text-slate-700">{title}<input ref={key === (kind === 'designation' ? 'title' : 'name') ? firstInput : undefined} type={type} value={form[key] ?? ''} onChange={e => set(key, e.target.value)} className={inputClass} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${kind}-${key}-error` : undefined} />{errors[key] && <span id={`${kind}-${key}-error`} className="mt-1 block text-xs text-rose-600">{errors[key]}</span>}</label>;
  const select = (key: string, title: string, options: { id: string; name: string }[], locked = false) => <label className="block text-sm font-semibold text-slate-700">{title}<select value={form[key] ?? ''} onChange={e => set(key, e.target.value)} disabled={locked} className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${kind}-${key}-error` : undefined}><option value="">Select {title.toLowerCase()}</option>{options.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>{errors[key] && <span id={`${kind}-${key}-error`} className="mt-1 block text-xs text-rose-600">{errors[key]}</span>}</label>;
  const hierarchyLocked = !!form.id && referenceCount({ id: form.id } as RecordType) > 0;
  const companyControl = (locked = false) => props.companies.length > 1 ? <label className="block text-sm font-semibold text-slate-700">Company<select value={form.companyId ?? ''} onChange={event => setForm(old => ({ ...old, companyId: event.target.value, branchId: '', departmentId: '', zoneId: '' }))} disabled={locked} className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`} aria-invalid={!!errors.companyId} aria-describedby={errors.companyId ? `${kind}-companyId-error` : undefined}><option value="">Select company</option>{props.companies.map(company => <option key={company.id} value={company.id}>{company.name}{company.code ? ` (${company.code})` : ''}</option>)}</select>{errors.companyId && <span id={`${kind}-companyId-error`} className="mt-1 block text-xs text-rose-600">{errors.companyId}</span>}</label> : <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Company context</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{selectedCompany?.name ?? 'No company configured'}{selectedCompany?.code ? <span className="ml-2 font-mono text-xs text-emerald-700">{selectedCompany.code}</span> : null}</p></div>;
  const codeGuidance = () => {
    if (kind === 'department') return !form.branchId ? 'Select a Branch first.' : !(form.name ?? '').trim() ? 'Enter a Department name.' : 'Company is resolved from the selected Branch.';
    if (kind === 'designation') return !form.departmentId ? 'Select a Department first.' : !(form.title ?? '').trim() ? 'Enter a Designation title.' : 'Company, Branch, and Department are resolved from the selected Department.';
    if (kind === 'ucTown') return !form.zoneId ? 'Select a Zone first.' : !(form.name ?? '').trim() ? 'Enter a UC/Town name.' : 'The selected Zone code supplies the company and location prefix.';
    if (!form.companyId) return 'Select a Company first.';
    if (!(form.name ?? '').trim()) return `Enter a ${label[kind].toLowerCase()} name.`;
    return kind === 'zone' ? 'Pattern: company · ZN · zone.' : 'Pattern: company · WT · wage type.';
  };
  const manualScope = kind === 'department' ? 'Branch' : kind === 'designation' ? 'Department' : kind === 'ucTown' ? 'Zone' : 'Company';
  const codeField = () => <section aria-labelledby={`${kind}-code-label`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span id={`${kind}-code-label`} className="text-sm font-semibold text-slate-700">Code</span>
      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={autoCode} onChange={event => { const checked = event.target.checked; if (!checked) set('code', generatedCode || form.code || ''); setAutoCode(checked); }} className="h-4 w-4 rounded border-slate-300 accent-emerald-600"/>Auto-generate code</label>
    </div>
    {autoCode ? <>
      <output aria-live="polite" aria-labelledby={`${kind}-code-label`} aria-describedby={`${kind}-code-guidance${errors.code ? ` ${kind}-code-error` : ''}`} className={`mt-1 block min-h-10 w-full break-all rounded-lg border px-3 py-2 font-mono text-sm font-bold tracking-wide ${generatedCode ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 font-sans font-normal tracking-normal text-slate-500'}`}>{generatedCode || 'Waiting for required fields'}</output>
      {generatedCode && <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-[10px] font-black uppercase tracking-[.14em] text-emerald-700">Generated hierarchy</p><span className="text-[10px] font-semibold text-slate-400">source trail</span></div><ol className="flex flex-wrap gap-x-1.5 gap-y-2" aria-label="Code hierarchy segments">{generatedTrail.map((item, index) => <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">{index > 0 && <span aria-hidden="true" className="text-slate-300">/</span>}<span className="rounded border border-slate-200 bg-white px-1.5 py-1 font-mono text-[11px] font-bold text-slate-800 break-all">{item.value}</span><span className="text-[10px] font-medium text-slate-500">{item.label}</span></li>)}</ol></div>}
    </> : <>
      <input id={`${kind}-code`} value={form.code ?? ''} onChange={event => set('code', event.target.value.toUpperCase())} className={`${inputClass} mt-1 font-mono tracking-wide`} placeholder="BI-HQ-IT-SSE" aria-invalid={!!errors.code} aria-labelledby={`${kind}-code-label`} aria-describedby={`${kind}-code-guidance${errors.code ? ` ${kind}-code-error` : ''}`}/>
      <div className="mt-2 flex flex-wrap items-start gap-2"><span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600">Manual override</span><p className="min-w-0 flex-1 text-xs text-slate-500">Must be unique within this {manualScope}; turn Auto-generate on to restore the calculated value.</p></div>
    </>}
    <p id={`${kind}-code-guidance`} className={`mt-1.5 text-xs ${autoCode && !generatedCode ? 'text-amber-700' : 'text-slate-500'}`}>{autoCode ? codeGuidance() : `Use uppercase letters, numbers, and single hyphens only.`}</p>
    {errors.code && <span id={`${kind}-code-error`} className="mt-1 block text-xs font-semibold text-rose-600">{errors.code}</span>}
  </section>;
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault(); setKind(tabs[next][0]); setQuery(''); tabRefs.current[next]?.focus();
  };
  const titleFor = (item: RecordType) => 'title' in item ? item.title : item.name;

  return <section className="space-y-5">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">Reference data console</p><h2 className="mt-1 text-2xl font-black text-slate-900">Master Data</h2><p className="mt-1 text-sm text-slate-500">Maintain organization, location, and payroll reference records.</p></div><button onClick={() => open()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-400"><Plus size={17}/> Add {label[kind]}</button></header>
    <div role="tablist" aria-label="Master data categories" className="flex gap-1 overflow-x-auto border-b border-slate-200">{tabs.map(([id, text, Icon], index) => <button ref={element => { tabRefs.current[index] = element; }} key={id} role="tab" tabIndex={kind === id ? 0 : -1} aria-selected={kind === id} onKeyDown={event => onTabKeyDown(event, index)} onClick={() => { setKind(id); setQuery(''); }} className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold ${kind === id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={16}/>{text}</button>)}</div>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-bold text-slate-900">{tabs.find(x => x[0] === kind)?.[1]}</h3><p className="text-xs text-slate-500">{current.length} total{['zone','ucTown','wageType'].includes(kind) ? ` · ${current.filter(x => (x as any).status === 'Active').length} active` : ''}</p></div><label className="relative block sm:w-72"><span className="sr-only">Search</span><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${label[kind].toLowerCase()}s`} className={`${inputClass} pl-9`}/></label></div>
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{filtered.length ? <div className="divide-y divide-slate-100">{filtered.map(item => <article key={item.id} className="flex flex-col gap-3 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><h4 className="truncate font-bold text-slate-900">{titleFor(item)}</h4>{'status' in item && <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${item.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{item.status}</span>}</div><p className="mt-1 text-xs text-slate-500">{'code' in item && item.code ? `${item.code} · ` : ''}{parentText(item)} · {referenceCount(item)} references</p></div><button onClick={() => open(item)} className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-700"><Pencil size={14}/> Edit</button></article>)}</div> : <div className="px-6 py-14 text-center"><Layers3 className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-bold text-slate-700">No {label[kind].toLowerCase()} records found</p><p className="mt-1 text-sm text-slate-500">{query ? 'Try a different search.' : 'Add the first record to begin.'}</p></div>}</div>
    {editing !== null && <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/55" role="dialog" aria-modal="true" aria-labelledby="master-form-title" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl"><form onSubmit={save} className="flex min-h-full flex-col"><header className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-600">{form.id ? 'Edit record' : 'New record'}</p><h3 id="master-form-title" className="text-xl font-black text-slate-900">{label[kind]}</h3></div><button type="button" onClick={close} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X/></button></header><div className="flex-1 space-y-4 p-6">
      {kind === 'branch' && <>{field('name','Branch name')}{field('code','Branch code')}{field('city','City')}{field('province','Province')}{field('address','Address')}</>}
      {kind === 'department' && <>{companyControl(hierarchyLocked)}{select('branchId','Branch',companyBranches.map(item => ({ ...item, name: `${item.name}${item.code ? ` (${item.code})` : ''}` })), hierarchyLocked)}{field('name','Department name')}{codeField()}</>}
      {kind === 'designation' && <>{companyControl(hierarchyLocked)}{select('departmentId','Department',companyDepartments.map(item => ({ ...item, name: `${item.name} (${props.branches.find(branch => branch.id === item.branchId)?.code || props.branches.find(branch => branch.id === item.branchId)?.name || 'Unknown branch'})` })), hierarchyLocked)}{field('title','Designation title')}{codeField()}{field('grade','Grade')}</>}
      {kind === 'zone' && <>{companyControl(hierarchyLocked)}{field('name','Zone name')}{codeField()}</>}
      {kind === 'ucTown' && <>{companyControl(hierarchyLocked)}{select('zoneId','Zone',companyZones.map(item => ({ ...item, name: `${item.name} (${item.code})` })), hierarchyLocked)}{field('name','UC/Town name')}{codeField()}</>}
      {kind === 'wageType' && <>{companyControl(hierarchyLocked)}{field('name','Wage type name')}{codeField()}{select('calculationBasis','Calculation basis',[{id:'Monthly',name:'Monthly'},{id:'Daily',name:'Daily'}], hierarchyLocked)}</>}
      {['zone','ucTown','wageType'].includes(kind) && select('status','Status',[{id:'Active',name:'Active'},{id:'Inactive',name:'Inactive'}])}
      {saveError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{saveError}</div>}
    </div><footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4"><button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save record'}</button></footer></form></div></div>}
  </section>;
}
