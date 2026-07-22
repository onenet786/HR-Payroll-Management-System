import React, { useMemo, useState } from 'react';
import { AlertTriangle, Building2, Check, ChevronLeft, ChevronRight, CircleCheck, Landmark, Loader2, Plus, Trash2 } from 'lucide-react';
import type { Branch, Company, CompanySetupPayload, Department, Designation, Province, StatutoryConfig, TaxSlab } from '../types';
import { generateMasterCode } from '../data/masterCodes';

interface Props {
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  statutoryConfig: StatutoryConfig;
  taxSlabs: TaxSlab[];
  onSave: (payload: CompanySetupPayload) => Promise<void>;
}

const provinces: Province[] = ['Punjab', 'Sindh', 'KPK', 'Balochistan'];
const uid = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
const upper = (value: string) => value.trim().toUpperCase();
const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
const labelClass = 'text-sm font-semibold text-slate-700';

export function CompanySetupModule({ companies, branches, departments, designations, statutoryConfig, taxSlabs, onSave }: Props) {
  const existing = companies[0];
  const existingBranch = branches.find(b => b.companyId === existing?.id);
  const hydratedCompanyId = React.useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadedExisting, setLoadedExisting] = useState(Boolean(existing));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedAction, setSavedAction] = useState<'created'|'updated'>('created');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [sameAddress, setSameAddress] = useState(true);
  const [company, setCompany] = useState<Company>(() => ({
    id: existing?.id || uid('company'), name: existing?.name || '', legalName: existing?.legalName || '', code: existing?.code || '',
    industry: existing?.industry || '', legalType: existing?.legalType || 'Private Limited Company', ntn: existing?.ntn || existing?.taxRegistrationNumber || '',
    taxRegistrationNumber: existing?.taxRegistrationNumber || '', strn: existing?.strn || '', eobiRegistration: existing?.eobiRegistration || existing?.eobiRegistrationNumber || '',
    eobiRegistrationNumber: existing?.eobiRegistrationNumber || '', socialSecurityRegistration: existing?.socialSecurityRegistration || '',
    socialSecurityRegion: existing?.socialSecurityRegion || 'Punjab', registeredAddress: existing?.registeredAddress || '', city: existing?.city || '',
    province: existing?.province || 'Punjab', postalCode: existing?.postalCode || '', phone: existing?.phone || '', email: existing?.email || '', website: existing?.website || '',
    fiscalYearStartMonth: existing?.fiscalYearStartMonth || 7, payrollFrequency: existing?.payrollFrequency || 'Monthly', defaultCurrency: 'PKR', timezone: 'Asia/Karachi', status: 'Active'
  }));
  const [branch, setBranch] = useState<Branch>(() => ({ id: existingBranch?.id || uid('branch'), companyId: existing?.id || '', code: existingBranch?.code || 'HQ', name: existingBranch?.name || 'Head Office', city: existingBranch?.city || '', province: existingBranch?.province || 'Punjab', address: existingBranch?.address || '' }));
  const [deptRows, setDeptRows] = useState<Department[]>(() => departments);
  const [desgRows, setDesgRows] = useState<Designation[]>(() => designations.length ? designations : []);
  const [config, setConfig] = useState({ ...statutoryConfig });
  const [registrations, setRegistrations] = useState({ eobi: Boolean(existing?.eobiRegistration || existing?.eobiRegistrationNumber), social: Boolean(existing?.socialSecurityRegistration) });
  const [registrationStatus, setRegistrationStatus] = useState<{eobi:'Registered'|'Pending'|'Not applicable';social:'Registered'|'Pending'|'Not applicable'}>({ eobi: existing?.eobiRegistration || existing?.eobiRegistrationNumber ? 'Registered' : 'Pending', social: existing?.socialSecurityRegistration ? 'Registered' : 'Pending' });

  const hydrateSavedSetup = React.useCallback((force = false) => {
    const savedCompany = companies[0];
    if (!savedCompany || (!force && (dirty || hydratedCompanyId.current === savedCompany.id))) return;
    const savedBranch = branches.find(item => item.companyId === savedCompany.id);
    const scopedDepartments = savedBranch ? departments.filter(item => item.branchId === savedBranch.id) : [];
    const departmentIds = new Set(scopedDepartments.map(item => item.id));
    const scopedDesignations = designations.filter(item => departmentIds.has(item.departmentId));
    setCompany({ ...savedCompany, code: savedCompany.code || '', legalName: savedCompany.legalName || savedCompany.name, ntn: savedCompany.ntn || savedCompany.taxRegistrationNumber, strn: savedCompany.strn || '', eobiRegistration: savedCompany.eobiRegistration || savedCompany.eobiRegistrationNumber, socialSecurityRegistration: savedCompany.socialSecurityRegistration || '', registeredAddress: savedCompany.registeredAddress || '', city: savedCompany.city || '', province: savedCompany.province || 'Punjab', postalCode: savedCompany.postalCode || '', phone: savedCompany.phone || '', email: savedCompany.email || '', website: savedCompany.website || '', legalType: savedCompany.legalType || 'Private Limited Company', fiscalYearStartMonth: savedCompany.fiscalYearStartMonth || 7, payrollFrequency: savedCompany.payrollFrequency || 'Monthly', defaultCurrency: savedCompany.defaultCurrency || 'PKR', timezone: savedCompany.timezone || 'Asia/Karachi', status: savedCompany.status || 'Active' });
    if (savedBranch) setBranch(savedBranch);
    if (scopedDepartments.length) setDeptRows(scopedDepartments);
    else setDeptRows([]);
    setDesgRows(scopedDesignations);
    setConfig({ ...statutoryConfig });
    setRegistrationStatus({ eobi: savedCompany.eobiRegistration || savedCompany.eobiRegistrationNumber ? 'Registered' : 'Pending', social: savedCompany.socialSecurityRegistration ? 'Registered' : 'Pending' });
    setRegistrations({ eobi: Boolean(savedCompany.eobiRegistration || savedCompany.eobiRegistrationNumber), social: Boolean(savedCompany.socialSecurityRegistration) });
    if (savedBranch) setSameAddress(savedBranch.address === (savedCompany.registeredAddress || '') && savedBranch.city === (savedCompany.city || '') && savedBranch.province === (savedCompany.province || 'Punjab'));
    hydratedCompanyId.current = savedCompany.id; setLoadedExisting(true); setDirty(false); setError(''); setFieldErrors({});
  }, [companies, branches, departments, designations, statutoryConfig, dirty]);

  React.useEffect(() => { hydrateSavedSetup(); }, [hydrateSavedSetup]);
  React.useEffect(() => {
    const savedCompany = companies[0];
    if (savedCompany && dirty && !hydratedCompanyId.current) {
      // Preserve visible edits while adopting the authoritative primary-company identity.
      setCompany(current => ({ ...current, id: savedCompany.id, createdAt: savedCompany.createdAt || current.createdAt }));
      const savedBranch = branches.find(item => item.companyId === savedCompany.id);
      if (savedBranch) {
        setBranch(current => ({ ...current, id: savedBranch.id, companyId: savedCompany.id }));
        const scopedDepartments = departments.filter(item => item.branchId === savedBranch.id);
        const savedDepartmentIds = new Set(scopedDepartments.map(item => item.id));
        const scopedDesignations = designations.filter(item => savedDepartmentIds.has(item.departmentId));
        const normalize = (value?: string) => (value || '').trim().toLocaleLowerCase();
        setDeptRows(current => {
          const idMap = new Map<string, string>();
          const reconciled = current.map(item => {
            const match = scopedDepartments.find(saved =>
              (normalize(item.code) && normalize(saved.code) === normalize(item.code)) ||
              (normalize(item.name) && normalize(saved.name) === normalize(item.name))
            );
            const authoritativeId = match?.id || item.id;
            idMap.set(item.id, authoritativeId);
            return { ...item, id: authoritativeId, branchId: savedBranch.id };
          });
          setDesgRows(currentDesignations => currentDesignations.map(item => {
            const mappedDepartmentId = idMap.get(item.departmentId) || item.departmentId;
            const match = scopedDesignations.find(saved =>
              saved.departmentId === mappedDepartmentId &&
              normalize(saved.title) === normalize(item.title) &&
              (!normalize(item.grade) || normalize(saved.grade) === normalize(item.grade))
            );
            return { ...item, id: match?.id || item.id, departmentId: mappedDepartmentId };
          }));
          return reconciled;
        });
      }
      hydratedCompanyId.current = savedCompany.id;
      setLoadedExisting(true);
    }
  }, [companies, branches, departments, designations, dirty]);

  const reloadSaved = () => {
    if (dirty && !globalThis.confirm('Discard unsaved changes and reload the saved company setup?')) return;
    hydrateSavedSetup(true); setStep(0); setConfirmed(false); setSaved(false);
  };

  const steps = ['Company identity', 'Office & branch', 'Organization', 'Payroll compliance', loadedExisting ? 'Review & update' : 'Review & create'];
  const validate = () => {
    const errors: Record<string,string> = {};
    if (step === 0) { if(!company.legalName?.trim()) errors['legal-name']='Legal name is required.'; if(!company.name.trim()) errors['display-trading-name']='Display name is required.'; if(!company.code?.trim()) errors['company-code']='Company code is required.'; if(!company.industry.trim()) errors.industry='Industry is required.'; if(!company.ntn?.trim()) errors.ntn='NTN is required.'; if(company.email&&!/^\S+@\S+\.\S+$/.test(company.email)) errors['contact-email']='Enter a valid email.'; }
    if (step === 1) { if(!company.registeredAddress?.trim()) errors['street-address']='Address is required.'; if(!company.city?.trim()) errors.city='City is required.'; if(!branch.name.trim()) errors['branch-name']='Branch name is required.'; if(!branch.code?.trim()) errors['branch-code']='Branch code is required.'; if(!sameAddress&&!branch.address.trim()) errors['branch-address']='Branch address is required.'; if(!sameAddress&&!branch.city.trim()) errors['branch-city']='Branch city is required.'; }
    if (step === 2) { if(!deptRows.length) errors.organization='At least one department is required.'; deptRows.forEach((d,i)=>{if(!d.name.trim())errors[`department-${i+1}-name`]='Department name is required.';if(!d.code.trim())errors[`department-${i+1}-code`]='Code is required.'}); if(new Set(deptRows.map(d=>upper(d.code))).size!==deptRows.length) errors.organization='Department codes must be unique.'; desgRows.forEach((d,i)=>{if(!d.title.trim())errors[`designation-${i+1}-title`]='Title is required.';if(!deptRows.some(dep=>dep.id===d.departmentId))errors[`designation-${i+1}-department`]='Choose a valid department.'}); }
    const numeric = [config.minimumWage, config.eobiEmployerRate, config.eobiEmployeeRate, config.pessiEmployerRate, config.gratuityRateDaysPerYear, config.providentFundMaxEmployeeContribution, config.socialSecurityWageCeiling || 0, config.overtimeMultiplier || 0, config.standardMonthlyHours || 0];
    if (step === 3 && numeric.some(v => !Number.isFinite(v) || v < 0)) errors.compliance='Statutory values must be valid non-negative numbers.';
    if (step === 3 && [config.eobiEmployerRate, config.eobiEmployeeRate, config.pessiEmployerRate, config.providentFundMaxEmployeeContribution].some(v => v > 100)) errors.compliance='Percentage rates cannot exceed 100%.';
    if(step===3&&registrationStatus.eobi==='Registered'&&!company.eobiRegistration?.trim()) errors['eobi-registration-number']='Registration number is required.';
    if(step===3&&registrationStatus.social==='Registered'&&!company.socialSecurityRegistration?.trim()) errors['social-security-registration-number']='Registration number is required.';
    if (step === 4 && !confirmed) errors.confirmation='Review confirmation is required.';
    setFieldErrors(errors); const first=Object.keys(errors)[0]; if(first) requestAnimationFrame(()=>{ const indexed=first.match(/(department|designation)-(\d+)-/); const fallback=indexed?document.querySelector<HTMLElement>(`[aria-label^="Starter ${indexed[1]}s row ${indexed[2]}"]`):first==='confirmation'?document.querySelector<HTMLElement>('input[type="checkbox"]'):first==='organization'?document.querySelector<HTMLElement>('[aria-label^="Starter departments"]'):null; (document.getElementById(first)||fallback)?.focus(); });
    return first ? errors[first] : '';
  };
  const next = () => { const issue = validate(); setError(issue); if (!issue) setStep(s => Math.min(4, s + 1)); };
  const submit = async () => {
    const issue = validate(); if (issue) return setError(issue);
    setSaving(true); setError('');
    const now = new Date().toISOString();
    const savedCompany: Company = { ...company, name: company.name.trim(), legalName: company.legalName?.trim(), code: upper(company.code || ''), ntn: company.ntn?.trim(), taxRegistrationNumber: company.ntn?.trim() || '', eobiRegistrationNumber: registrationStatus.eobi === 'Registered' ? company.eobiRegistration?.trim() || '' : '', socialSecurityRegistration: registrationStatus.social === 'Registered' ? company.socialSecurityRegistration?.trim() : undefined, socialSecurityRegion: company.province || '', updatedAt: now, createdAt: company.createdAt || now, setupCompletedAt: now };
    const savedBranch = { ...branch, companyId: savedCompany.id, address: sameAddress ? company.registeredAddress || '' : branch.address.trim(), city: sameAddress ? company.city || '' : branch.city.trim(), province: sameAddress ? company.province || 'Punjab' : branch.province };
    const savedDepartments = deptRows.map(d => ({ ...d, branchId: savedBranch.id, name: d.name.trim(), code: upper(d.code) }));
    const savedDesignations = desgRows.reduce<Designation[]>((result, designation) => {
      const department = savedDepartments.find(item => item.id === designation.departmentId);
      const departmentDesignations = [...designations, ...result].filter(item => item.departmentId === designation.departmentId);
      const code = designation.code || generateMasterCode('designation', {
        name: '', title: designation.title, company: savedCompany, branch: savedBranch, department,
      }, departmentDesignations, designation.id);
      result.push({ ...designation, code, title: designation.title.trim(), grade: upper(designation.grade) });
      return result;
    }, []);
    try {
      await onSave({ company: savedCompany, branch: savedBranch, departments: savedDepartments, designations: savedDesignations, statutoryConfig: { ...config, updatedAt: now } });
      setSavedAction(loadedExisting ? 'updated' : 'created'); setLoadedExisting(true); hydratedCompanyId.current=savedCompany.id; setDirty(false); setSaved(true);
    } catch { setError('Company setup could not be saved. Please try again.'); }
    finally { setSaving(false); }
  };
  const summary = useMemo(() => ({ departments: deptRows.length, designations: desgRows.length }), [deptRows, desgRows]);
  const input = (label: string, value: string | number | undefined, onChange: (v: string) => void, required = false, type = 'text') => { const id=label.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); const issue=fieldErrors[id]; const shownValue=label==='Branch code'?branch.code:value; const change=label==='Branch code'?(v:string)=>setBranch({...branch,code:v.toUpperCase()}):onChange; return <label className={labelClass} htmlFor={id}>{label}{(required||label==='Branch code') && <span className="text-rose-600"> *</span>}<input id={id} className={`${fieldClass} ${issue?'border-rose-400':''}`} type={type} value={shownValue ?? ''} onChange={e => change(e.target.value)} aria-invalid={Boolean(issue)} aria-describedby={issue?`${id}-error`:undefined}/>{issue&&<span id={`${id}-error`} className="mt-1 block text-xs text-rose-600">{issue}</span>}</label> };

  if (saved) return <section className="mx-auto max-w-3xl rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><CircleCheck className="mx-auto h-14 w-14 text-emerald-600"/><p className="mt-4 text-xs font-bold uppercase tracking-wider text-emerald-700">Primary company {savedAction}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{company.name} is ready</h2><p className="mt-2 text-slate-600">The populated company and organization baseline remain available for review and updates.</p><button onClick={() => { setSaved(false); setStep(0); }} className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">View populated setup</button></section>;

  return <section className="mx-auto max-w-6xl space-y-5 max-sm:[&_header>div]:flex-col max-sm:[&_header>div]:items-stretch max-sm:[&_header_button]:w-full" onChangeCapture={() => setDirty(true)}>
    <header className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-4"><div className="rounded-xl bg-emerald-500/15 p-3"><Building2 className="h-7 w-7 text-emerald-400"/></div><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-400">{loadedExisting?'Existing company setup':'New company setup'}</p><h1 className="mt-1 text-2xl font-bold">{loadedExisting?'Update primary company':'Create primary company'}</h1><p className="mt-1 max-w-2xl text-sm text-slate-300">{loadedExisting?'Review or update the saved organization and payroll baseline.':'Create the organization records and reviewed Pakistan payroll baseline required to start operations.'}</p></div></div>{loadedExisting&&<button type="button" onClick={reloadSaved} className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">{dirty?'Discard & reload saved data':'Reload saved data'}</button>}</div></header>
    <nav aria-label="Setup progress" className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-5">{steps.map((s, i) => <button key={s} aria-current={i===step?'step':undefined} disabled={i >= step} onClick={() => { setError(''); setFieldErrors({}); setStep(i); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold disabled:cursor-default ${i === step ? 'bg-slate-900 text-white' : i < step ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'text-slate-400'}`}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current">{i < step ? <Check className="h-3.5 w-3.5"/> : i + 1}</span>{s}</button>)}</nav>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7" aria-live="polite"><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Step {step + 1} of 5</p><h2 className="mt-1 text-xl font-bold text-slate-900">{steps[step]}</h2>
      {error && <div id="validation-error" className="mt-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle className="h-5 w-5 shrink-0"/>{error}</div>}
      {step === 0 && <div className="mt-6 grid gap-5 md:grid-cols-2">{input('Legal name', company.legalName, v => setCompany({...company, legalName:v}), true)}{input('Display / trading name', company.name, v => setCompany({...company, name:v}), true)}{input('Company code', company.code, v => setCompany({...company, code:v.toUpperCase()}), true)}{input('Industry', company.industry, v => setCompany({...company, industry:v}), true)}<label className={labelClass}>Legal type<select className={fieldClass} value={company.legalType} onChange={e=>setCompany({...company,legalType:e.target.value})}><option>Private Limited Company</option><option>Public Limited Company</option><option>Partnership</option><option>Sole Proprietorship</option><option>Non-profit</option></select></label>{input('NTN', company.ntn, v=>setCompany({...company,ntn:v}),true)}{input('STRN (optional)',company.strn,v=>setCompany({...company,strn:v}))}{input('Contact email',company.email,v=>setCompany({...company,email:v}),false,'email')}{input('Phone',company.phone,v=>setCompany({...company,phone:v}))}{input('Website',company.website,v=>setCompany({...company,website:v}),false,'url')}<label className={labelClass}>Fiscal year starts<select className={fieldClass} value={company.fiscalYearStartMonth} onChange={e=>setCompany({...company,fiscalYearStartMonth:Number(e.target.value)})}>{['January','February','March','April','May','June','July','August','September','October','November','December'].map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select></label><label className={labelClass}>Payroll frequency<select className={fieldClass} value={company.payrollFrequency} onChange={e=>setCompany({...company,payrollFrequency:e.target.value as Company['payrollFrequency']})}><option>Monthly</option><option>Biweekly</option><option>Weekly</option></select></label>{input('Currency',company.defaultCurrency,v=>setCompany({...company,defaultCurrency:v.toUpperCase()}),true)}{input('Timezone',company.timezone,v=>setCompany({...company,timezone:v}),true)}</div>}
      {step === 1 && <div className="mt-6 space-y-6"><fieldset className="grid gap-5 md:grid-cols-2"><legend className="mb-4 font-bold text-slate-900">Registered office</legend><div className="md:col-span-2">{input('Street address',company.registeredAddress,v=>setCompany({...company,registeredAddress:v}),true)}</div>{input('City',company.city,v=>setCompany({...company,city:v}),true)}<label className={labelClass}>Province *<select className={fieldClass} value={company.province} onChange={e=>setCompany({...company,province:e.target.value as Province})}>{provinces.map(p=><option key={p}>{p}</option>)}</select></label>{input('Postal code',company.postalCode,v=>setCompany({...company,postalCode:v}))}</fieldset><fieldset className="border-t border-slate-200 pt-5"><legend className="font-bold text-slate-900">Main branch</legend><label className="mt-3 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={sameAddress} onChange={e=>setSameAddress(e.target.checked)} className="accent-emerald-600"/>Same as registered office</label><div className="mt-4 grid gap-5 md:grid-cols-2">{input('Branch name',branch.name,v=>setBranch({...branch,name:v}),true)}{input('Branch code','HQ',()=>{})}{!sameAddress&&<><div className="md:col-span-2">{input('Branch address',branch.address,v=>setBranch({...branch,address:v}),true)}</div>{input('Branch city',branch.city,v=>setBranch({...branch,city:v}),true)}<label className={labelClass}>Branch province<select className={fieldClass} value={branch.province} onChange={e=>setBranch({...branch,province:e.target.value as Province})}>{provinces.map(p=><option key={p}>{p}</option>)}</select></label></>}</div></fieldset></div>}
      {step === 2 && <div className="mt-6 space-y-7"><EditableRows title="Starter departments" note="At least one department is required." rows={deptRows} onAdd={()=>setDeptRows([...deptRows,{id:uid('dept'),branchId:branch.id,name:'',code:''}])} onRemove={id=>setDeptRows(deptRows.filter(d=>d.id!==id))}>{deptRows.map((d,i)=><div key={d.id} className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_10rem_auto]"><input aria-label={`Department ${i+1} name`} className={fieldClass} value={d.name} placeholder="Department name" onChange={e=>setDeptRows(deptRows.map(x=>x.id===d.id?{...x,name:e.target.value}:x))}/><input aria-label={`Department ${i+1} code`} className={fieldClass} value={d.code} placeholder="Code" onChange={e=>setDeptRows(deptRows.map(x=>x.id===d.id?{...x,code:e.target.value.toUpperCase()}:x))}/><button aria-label="Remove department" onClick={()=>setDeptRows(deptRows.filter(x=>x.id!==d.id))} className="self-end p-2.5 text-rose-600"><Trash2 className="h-4 w-4"/></button></div>)}</EditableRows><EditableRows title="Starter designations" note="Optional now, but every employee will eventually need a designation." rows={desgRows} onAdd={()=>setDesgRows([...desgRows,{id:uid('desg'),departmentId:deptRows[0]?.id||'',title:'',grade:''}])} onRemove={id=>setDesgRows(desgRows.filter(d=>d.id!==id))}>{desgRows.map(d=><div key={d.id} className="grid gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-[1fr_1fr_8rem_auto]"><input className={fieldClass} value={d.title} placeholder="Title" onChange={e=>setDesgRows(desgRows.map(x=>x.id===d.id?{...x,title:e.target.value}:x))}/><select className={fieldClass} value={d.departmentId} onChange={e=>setDesgRows(desgRows.map(x=>x.id===d.id?{...x,departmentId:e.target.value}:x))}>{deptRows.map(dep=><option key={dep.id} value={dep.id}>{dep.name||'Unnamed'}</option>)}</select><input className={fieldClass} value={d.grade} placeholder="Grade" onChange={e=>setDesgRows(desgRows.map(x=>x.id===d.id?{...x,grade:e.target.value}:x))}/><button onClick={()=>setDesgRows(desgRows.filter(x=>x.id!==d.id))} className="self-end p-2.5 text-rose-600"><Trash2 className="h-4 w-4"/></button></div>)}</EditableRows></div>}
      {step === 3 && <div className="mt-6 space-y-6"><div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0"/><p>These are configurable templates. Verify all rates and thresholds against current FBR, EOBI and provincial requirements before running payroll.</p></div><div className="grid gap-5 md:grid-cols-3">{[['Tax year','taxYear'],['Effective from','effectiveFrom'],['Minimum wage','minimumWage'],['EOBI employee %','eobiEmployeeRate'],['EOBI employer %','eobiEmployerRate'],['Social security %','pessiEmployerRate'],['Wage ceiling','socialSecurityWageCeiling'],['Gratuity days / year','gratuityRateDaysPerYear'],['PF maximum %','providentFundMaxEmployeeContribution'],['Overtime multiplier','overtimeMultiplier'],['Monthly hours','standardMonthlyHours']].map(([label,key])=>input(label,config[key as keyof StatutoryConfig] as string|number,v=>setConfig({...config,[key]:key==='taxYear'||key==='effectiveFrom'?v:Number(v)}),false,key==='effectiveFrom'?'date':key==='taxYear'?'text':'number'))}</div><div className="grid gap-3 md:grid-cols-2"><label className="rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={registrations.eobi} onChange={e=>setRegistrations({...registrations,eobi:e.target.checked})} className="mr-2 accent-emerald-600"/>EOBI registration is available (otherwise pending/not applicable)</label><label className="rounded-lg border border-slate-200 p-3 text-sm"><input type="checkbox" checked={registrations.social} onChange={e=>setRegistrations({...registrations,social:e.target.checked})} className="mr-2 accent-emerald-600"/>Social-security registration is available</label></div><div><h3 className="font-bold text-slate-900">Current FBR tax slabs</h3><p className="mt-1 text-sm text-slate-500">Existing customized slabs are preserved and shown for review.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">Annual from</th><th className="p-3">Annual to</th><th className="p-3">Base tax</th><th className="p-3">Rate</th></tr></thead><tbody>{taxSlabs.map(s=><tr key={s.id} className="border-b"><td className="p-3">{s.minIncome.toLocaleString()}</td><td className="p-3">{s.maxIncome.toLocaleString()}</td><td className="p-3">{s.baseTax.toLocaleString()}</td><td className="p-3">{s.percentage}%</td></tr>)}</tbody></table></div></div></div>}
      {step === 4 && <div className="mt-6 space-y-6"><div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5"><div className="flex items-center gap-3"><Landmark className="h-6 w-6 text-emerald-700"/><div><h3 className="font-bold text-slate-900">{company.name}</h3><p className="text-sm text-slate-600">{company.code} · {company.legalName} · NTN {company.ntn}</p></div></div><div className="mt-5 grid gap-3 border-l-2 border-emerald-300 pl-5 md:grid-cols-3"><Summary label="Main branch" value={`${branch.name}, ${sameAddress?company.city:branch.city}`}/><Summary label="Departments" value={`${summary.departments} records`}/><Summary label="Designations" value={`${summary.designations} records`}/></div></div><div className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold text-slate-900">Payroll baseline</h3><p className="mt-1 text-sm text-slate-600">PKR · Monthly · {company.timezone} · Minimum wage PKR {config.minimumWage.toLocaleString()}</p></div><label className="flex items-start gap-3 rounded-xl border border-slate-300 p-4 text-sm text-slate-700"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5 accent-emerald-600"/><span><strong className="block text-slate-900">I reviewed these details and statutory settings.</strong>I understand the setup creates or updates the application’s single primary company and organization baseline.</span></label></div>}
      {step === 3 && <fieldset className="mt-6 rounded-xl border border-slate-200 p-4"><legend className="px-1 font-bold text-slate-900">Registration status</legend><div className="grid gap-5 md:grid-cols-2">{(['eobi','social'] as const).map(kind=><div key={kind}><label className={labelClass}>{kind==='eobi'?'EOBI':'Social security'} status<select className={fieldClass} value={registrationStatus[kind]} onChange={e=>setRegistrationStatus({...registrationStatus,[kind]:e.target.value as 'Registered'|'Pending'|'Not applicable'})}><option>Registered</option><option>Pending</option><option>Not applicable</option></select></label>{registrationStatus[kind]==='Registered'&&input(`${kind==='eobi'?'EOBI':'Social security'} registration number`,kind==='eobi'?company.eobiRegistration:company.socialSecurityRegistration,v=>setCompany({...company,[kind==='eobi'?'eobiRegistration':'socialSecurityRegistration']:v}),true)}</div>)}</div></fieldset>}
      <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5"><button disabled={step===0||saving} onClick={()=>{setError('');setFieldErrors({});setStep(s=>s-1)}} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4"/>Back</button>{step<4?<button onClick={next} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Continue<ChevronRight className="h-4 w-4"/></button>:<button disabled={saving} onClick={submit} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{saving?'Creating records…':existing?'Update primary company':'Create primary company'}</button>}</footer>
      {step === 4 && <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5" aria-label="Organization hierarchy"><h3 className="font-bold text-slate-900">Records to be generated</h3><div className="mt-4 border-l-2 border-emerald-500 pl-4"><p className="font-bold text-slate-900">{company.name} <span className="font-normal text-slate-500">({company.code})</span></p><div className="mt-3 border-l-2 border-slate-300 pl-4"><p className="font-semibold text-slate-800">Main branch: {branch.name} ({branch.code})</p>{deptRows.map(dept=><div key={dept.id} className="mt-3 border-l border-slate-300 pl-4"><p className="font-medium text-slate-700">Department: {dept.name} ({dept.code})</p><ul className="mt-1 list-disc pl-5 text-sm text-slate-600">{desgRows.filter(d=>d.departmentId===dept.id).map(d=><li key={d.id}>Designation: {d.title} ({d.grade||'No grade'})</li>)}</ul></div>)}</div></div><div className="mt-5 grid gap-2 border-t border-slate-200 pt-4 text-sm text-slate-700 md:grid-cols-2"><p><strong>Payroll:</strong> {company.defaultCurrency} / {company.payrollFrequency}</p><p><strong>Fiscal year:</strong> starts month {company.fiscalYearStartMonth}</p><p><strong>EOBI:</strong> {registrationStatus.eobi}</p><p><strong>Social security:</strong> {registrationStatus.social} ({company.province})</p><p><strong>Minimum wage:</strong> PKR {config.minimumWage.toLocaleString()}</p><p><strong>Tax baseline:</strong> {config.taxYear||'Current'} · {taxSlabs.length} slabs preserved</p></div></section>}
    </div>
  </section>;
}

function EditableRows({ title, note, rows, onAdd, children }: { title:string; note:string; rows:{id:string}[]; onAdd:()=>void; onRemove:(id:string)=>void; children:React.ReactNode }) { const named=React.Children.map(children,(row,rowIndex)=>{if(!React.isValidElement<{children?:React.ReactNode}>(row))return row;return React.cloneElement(row,{children:React.Children.map(row.props.children,(control,columnIndex)=>React.isValidElement<Record<string,unknown>>(control)?React.cloneElement(control,{'aria-label':`${title} row ${rowIndex+1} ${columnIndex===0?'name or title':columnIndex===1?'code or department':columnIndex===2?'grade':'remove'}`}):control)});}); return <fieldset><div className="mb-3 flex items-end justify-between"><div><legend className="font-bold text-slate-900">{title}</legend><p className="text-sm text-slate-500">{note}</p></div><button onClick={onAdd} className="flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700"><Plus className="h-4 w-4"/>Add row</button></div>{rows.length?<div className="space-y-2">{named}</div>:<p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">No rows added.</p>}</fieldset> }
function Summary({label,value}:{label:string;value:string}) { return <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div> }
