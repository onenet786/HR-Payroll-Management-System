import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Layers3, Map, MapPin, Pencil, Plus, Search, Tags, WalletCards, X } from 'lucide-react';
import type { Branch, Company, Department, Designation, Employee, UcTown, WageType, Zone } from '../types';
import { makeMasterId } from '../data/masterData';

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
  const firstInput = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const primaryCompany = props.companies[0];
  const records: Record<Kind, RecordType[]> = { branch: props.branches, department: props.departments, designation: props.designations, zone: props.zones, ucTown: props.ucTowns, wageType: props.wageTypes };
  const current = records[kind];

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
    setForm({ status: 'Active', calculationBasis: 'Monthly', ...data });
  };
  const close = () => { if (!saving) { setEditing(null); requestAnimationFrame(() => returnFocusRef.current?.focus()); } };

  const filtered = useMemo(() => current.filter(item => Object.values(item).some(value => normalized(String(value)).includes(normalized(query)))), [current, query]);
  const set = (field: string, value: string) => setForm(old => ({ ...old, [field]: value }));
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
    else { require('name', 'Name'); if (kind !== 'branch' || true) require('code', 'Code'); }
    if (kind === 'branch') { require('city', 'City'); require('province', 'Province'); require('address', 'Address'); }
    if (kind === 'department') require('branchId', 'Branch');
    if (kind === 'ucTown') require('zoneId', 'Zone');
    const code = normalized(form.code ?? '');
    const parentKey = kind === 'department' ? 'branchId' : kind === 'ucTown' ? 'zoneId' : 'companyId';
    if (code && current.some(x => x.id !== form.id && normalized((x as any).code ?? '') === code && (parentKey === 'companyId' || (x as any)[parentKey] === form[parentKey]))) next.code = 'This code is already in use for the selected parent.';
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
    else if (kind === 'department') record = { id, branchId: form.branchId, code: form.code.trim().toUpperCase(), name: form.name.trim() };
    else if (kind === 'designation') record = { id, departmentId: form.departmentId, title: form.title.trim(), grade: form.grade?.trim() ?? '' };
    else if (kind === 'zone') record = { id, companyId: primaryCompany?.id ?? 'primary-company', code: form.code.trim().toUpperCase(), name: form.name.trim(), status: form.status as Zone['status'] };
    else if (kind === 'ucTown') record = { id, zoneId: form.zoneId, code: form.code.trim().toUpperCase(), name: form.name.trim(), status: form.status as UcTown['status'] };
    else record = { id, companyId: primaryCompany?.id ?? 'primary-company', code: form.code.trim().toUpperCase(), name: form.name.trim(), calculationBasis: form.calculationBasis as WageType['calculationBasis'], status: form.status as WageType['status'] };
    try { await props.onSave(kind, record); setEditing(null); requestAnimationFrame(() => returnFocusRef.current?.focus()); } catch { setSaveError('Unable to save this record.'); } finally { setSaving(false); }
  };
  const field = (key: string, title: string, type = 'text') => <label className="block text-sm font-semibold text-slate-700">{title}<input ref={key === (kind === 'designation' ? 'title' : 'name') ? firstInput : undefined} type={type} value={form[key] ?? ''} onChange={e => set(key, e.target.value)} className={inputClass} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${kind}-${key}-error` : undefined} />{errors[key] && <span id={`${kind}-${key}-error`} className="mt-1 block text-xs text-rose-600">{errors[key]}</span>}</label>;
  const select = (key: string, title: string, options: { id: string; name: string }[], locked = false) => <label className="block text-sm font-semibold text-slate-700">{title}<select value={form[key] ?? ''} onChange={e => set(key, e.target.value)} disabled={locked} className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${kind}-${key}-error` : undefined}><option value="">Select {title.toLowerCase()}</option>{options.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>{errors[key] && <span id={`${kind}-${key}-error`} className="mt-1 block text-xs text-rose-600">{errors[key]}</span>}</label>;
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
      {kind === 'department' && <>{select('branchId','Branch',props.branches, !!form.id && referenceCount({id: form.id} as RecordType)>0)}{field('name','Department name')}{field('code','Department code')}</>}
      {kind === 'designation' && <>{select('departmentId','Department',props.departments, !!form.id && referenceCount({id: form.id} as RecordType)>0)}{field('title','Designation title')}{field('grade','Grade')}</>}
      {kind === 'zone' && <>{field('name','Zone name')}{field('code','Zone code')}</>}
      {kind === 'ucTown' && <>{select('zoneId','Zone',props.zones)}{field('name','UC/Town name')}{field('code','UC/Town code')}</>}
      {kind === 'wageType' && <>{field('name','Wage type name')}{field('code','Wage type code')}{select('calculationBasis','Calculation basis',[{id:'Monthly',name:'Monthly'},{id:'Daily',name:'Daily'}], !!form.id && referenceCount({id: form.id} as RecordType)>0)}</>}
      {['zone','ucTown','wageType'].includes(kind) && select('status','Status',[{id:'Active',name:'Active'},{id:'Inactive',name:'Inactive'}])}
      {saveError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{saveError}</div>}
    </div><footer className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4"><button type="button" onClick={close} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Save record'}</button></footer></form></div></div>}
  </section>;
}
