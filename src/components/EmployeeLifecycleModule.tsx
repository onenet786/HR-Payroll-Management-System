import React, { useMemo, useState } from 'react';
import { CheckCircle, ClipboardList, FileText, UserCheck } from 'lucide-react';
import type { Branch, Company, Department, Designation, Employee, LeaveRequest, LifecycleRequest, LifecycleRequestType, OnboardingChecklistItem, StatutoryConfig } from '../types';
import { annualLeaveBalance, experienceLetterHtml, MANUAL_ONBOARDING_ITEMS, ONBOARDING_ITEMS, onboardingStatus, openPrintableHtml } from '../data/lifecycle';

interface Props {
  employees: Employee[];
  branches: Branch[];
  departments: Department[];
  designations: Designation[];
  companies: Company[];
  lifecycleRequests: LifecycleRequest[];
  currentUserId: string;
  onCreate: (draft: Omit<LifecycleRequest, 'id' | 'status' | 'createdAt' | 'createdById' | 'createdBy'>) => Promise<boolean>;
  onReview: (id: string, decision: 'Approved' | 'Rejected', comment: string) => void;
  onUpdateOnboarding: (employeeId: string, item: OnboardingChecklistItem, done: boolean) => void;
  leaves: LeaveRequest[];
  statConfig: StatutoryConfig;
}

const TYPES: LifecycleRequestType[] = ['Probation Confirmation', 'Probation Extension', 'Transfer', 'Promotion', 'Resignation', 'Termination'];
const emptyForm = { employeeId: '', type: 'Probation Confirmation' as LifecycleRequestType, effectiveDate: new Date().toISOString().slice(0, 10), reason: '', newBranchId: '', newDepartmentId: '', newDesignationId: '', newBasicSalary: '', newProbationEndDate: '', noticeDays: '0', leaveEncashDays: '0' };

export function EmployeeLifecycleModule({ employees, branches, departments, designations, companies, lifecycleRequests, currentUserId, onCreate, onReview, onUpdateOnboarding, leaves, statConfig }: Props) {
  const [view, setView] = useState<'requests' | 'onboarding' | 'letters'>('requests');
  const [form, setForm] = useState(emptyForm);
  const active = employees.filter(employee => employee.status !== 'Terminated');
  const name = (id?: string) => employees.find(employee => employee.id === id)?.fullName || 'Employee';
  const designationTitle = (id?: string) => designations.find(item => item.id === id)?.title || '—';
  const departmentName = (id?: string) => departments.find(item => item.id === id)?.name || '—';
  const selected = employees.find(employee => employee.id === form.employeeId);
  const destinationDepartments = departments.filter(item => item.branchId === (form.newBranchId || selected?.branchId));
  const destinationDesignations = designations.filter(item => item.departmentId === (form.newDepartmentId || selected?.departmentId));
  const pending = lifecycleRequests.filter(item => item.status === 'Pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const decided = lifecycleRequests.filter(item => item.status !== 'Pending').sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || '')).slice(0, 12);
  const onboardingQueue = useMemo(() => active.map(employee => ({ employee, status: onboardingStatus(employee) }))
    .filter(item => Object.values(item.status).some(done => !done))
    .sort((a, b) => b.employee.dateOfJoining.localeCompare(a.employee.dateOfJoining)), [active]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await onCreate({
      employeeId: form.employeeId, type: form.type, effectiveDate: form.effectiveDate, reason: form.reason,
      ...(form.type === 'Transfer' && { newBranchId: form.newBranchId || undefined, newDepartmentId: form.newDepartmentId || undefined, newDesignationId: form.newDesignationId || undefined }),
      ...(form.type === 'Promotion' && { newDesignationId: form.newDesignationId || undefined, newBasicSalary: form.newBasicSalary ? Number(form.newBasicSalary) : undefined }),
      ...(form.type === 'Probation Extension' && { newProbationEndDate: form.newProbationEndDate }),
      ...((form.type === 'Resignation' || form.type === 'Termination') && { noticeDays: Number(form.noticeDays) || 0, leaveEncashDays: Number(form.leaveEncashDays) || 0 }),
    });
    if (ok) setForm({ ...emptyForm });
  };
  const review = (request: LifecycleRequest, decision: 'Approved' | 'Rejected') => {
    const comment = window.prompt(decision === 'Approved' ? `Approve ${request.type} for ${name(request.employeeId)} — approval comment:` : 'Reason for rejecting:')?.trim();
    if (comment) onReview(request.id, decision, comment);
  };
  const detail = (request: LifecycleRequest) => {
    if (request.type === 'Transfer') return `→ ${branches.find(item => item.id === request.newBranchId)?.name || 'same branch'} / ${departmentName(request.newDepartmentId)} / ${designationTitle(request.newDesignationId)}`;
    if (request.type === 'Promotion') return `→ ${designationTitle(request.newDesignationId)}${request.newBasicSalary ? ` · proposed PKR ${request.newBasicSalary.toLocaleString()} (separate salary approval)` : ''}`;
    if (request.type === 'Probation Extension') return `→ new review date ${request.newProbationEndDate}`;
    if (request.type === 'Resignation' || request.type === 'Termination') return `Notice ${request.noticeDays || 0} day(s) · leave encashment ${request.leaveEncashDays || 0} day(s) · settlement created on approval`;
    return '';
  };
  const input = 'mt-1 w-full rounded border border-slate-300 bg-white p-2 text-xs';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Employee Lifecycle</h2>
          <p className="text-xs text-slate-500">Onboarding, probation, transfers, promotions and separations — every change needs a second approver.</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs font-bold">
          {([['requests', 'Requests', UserCheck], ['onboarding', `Onboarding (${onboardingQueue.length})`, ClipboardList], ['letters', 'Letters', FileText]] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setView(key)} className={`flex items-center gap-1 rounded px-3 py-1.5 ${view === key ? 'bg-white text-slate-900 shadow' : 'text-slate-600'}`}><Icon size={13} />{label}</button>
          ))}
        </div>
      </div>

      {view === 'requests' && <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Raise a request</h3>
          <label className="block text-slate-600">Employee<select required value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value, newBranchId: '', newDepartmentId: '', newDesignationId: '' })} className={input}><option value="">Select employee</option>{active.map(employee => <option key={employee.id} value={employee.id}>{employee.fullName} ({employee.employeeCode})</option>)}</select></label>
          <label className="block text-slate-600">Request type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as LifecycleRequestType })} className={input}>{TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="block text-slate-600">Effective date<input type="date" required value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} className={input} /></label>
          {form.type === 'Transfer' && <>
            <label className="block text-slate-600">Destination branch<select value={form.newBranchId} onChange={e => setForm({ ...form, newBranchId: e.target.value, newDepartmentId: '', newDesignationId: '' })} className={input}><option value="">Same branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className="block text-slate-600">Destination department<select value={form.newDepartmentId} onChange={e => setForm({ ...form, newDepartmentId: e.target.value, newDesignationId: '' })} className={input}><option value="">Same department</option>{destinationDepartments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </>}
          {(form.type === 'Transfer' || form.type === 'Promotion') && <label className="block text-slate-600">{form.type === 'Promotion' ? 'New designation' : 'Designation'}<select value={form.newDesignationId} onChange={e => setForm({ ...form, newDesignationId: e.target.value })} className={input}><option value="">Select designation</option>{destinationDesignations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}
          {form.type === 'Promotion' && <label className="block text-slate-600">Proposed salary (optional, PKR)<input type="number" min="0" value={form.newBasicSalary} onChange={e => setForm({ ...form, newBasicSalary: e.target.value })} className={input} placeholder={selected ? `Current ${selected.basicSalary.toLocaleString()}` : ''} /></label>}
          {form.type === 'Probation Extension' && <label className="block text-slate-600">New probation review date<input type="date" value={form.newProbationEndDate} onChange={e => setForm({ ...form, newProbationEndDate: e.target.value })} className={input} /></label>}
          {(form.type === 'Resignation' || form.type === 'Termination') && <div className="grid grid-cols-2 gap-2">
            <label className="text-slate-600">Notice pay days<input type="number" min="0" value={form.noticeDays} onChange={e => setForm({ ...form, noticeDays: e.target.value })} className={input} /></label>
            <label className="text-slate-600">Leave encash days<input type="number" min="0" value={form.leaveEncashDays} onChange={e => setForm({ ...form, leaveEncashDays: e.target.value })} className={input} /></label>
            {selected && (() => {
              const balance = Math.min(statConfig.maxLeaveEncashDays ?? 30, annualLeaveBalance(selected, leaves, form.effectiveDate, statConfig));
              return <button type="button" onClick={() => setForm({ ...form, leaveEncashDays: String(balance) })} className="col-span-2 text-left text-[11px] font-semibold text-indigo-700 hover:underline">Earned annual leave balance: {balance} day(s) — use it</button>;
            })()}
          </div>}
          <label className="block text-slate-600">Reason / justification<textarea required minLength={10} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className={`${input} min-h-20`} /></label>
          <button type="submit" className="w-full rounded-lg bg-emerald-700 py-2 font-bold text-white hover:bg-emerald-800">Submit for approval</button>
        </form>
        <div className="space-y-4">
          <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">Awaiting approval ({pending.length})</h3>
            {pending.length === 0 ? <p className="mt-2 text-slate-500">No pending lifecycle requests.</p> : <ul className="mt-3 space-y-2">
              {pending.map(request => <li key={request.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap justify-between gap-2"><span className="font-bold text-slate-900">{request.type} — {name(request.employeeId)}</span><span className="font-mono text-slate-500">effective {request.effectiveDate}</span></div>
                <p className="mt-1 text-slate-600">{detail(request)}</p>
                <p className="mt-1 italic text-slate-500">“{request.reason}” — raised by {request.createdBy}</p>
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" disabled={request.createdById === currentUserId} onClick={() => review(request, 'Rejected')} className="rounded border border-slate-300 px-3 py-1 font-semibold text-slate-600 disabled:opacity-40">Reject</button>
                  <button type="button" disabled={request.createdById === currentUserId} title={request.createdById === currentUserId ? 'Raised by you; another authorized user must approve.' : 'Approve and apply'} onClick={() => review(request, 'Approved')} className="flex items-center gap-1 rounded bg-emerald-700 px-3 py-1 font-bold text-white disabled:opacity-40"><CheckCircle size={13} />Approve</button>
                </div>
              </li>)}
            </ul>}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900">Recent decisions</h3>
            {decided.length === 0 ? <p className="mt-2 text-slate-500">No decisions yet.</p> : <ul className="mt-2 divide-y divide-slate-100">
              {decided.map(request => <li key={request.id} className="flex flex-wrap justify-between gap-2 py-2"><span><strong>{request.type}</strong> — {name(request.employeeId)} ({request.effectiveDate})</span><span className={request.status === 'Approved' ? 'text-emerald-700' : 'text-rose-700'}>{request.status} by {request.reviewedBy}{request.settlementId ? ' · settlement created' : ''}{request.salaryRevisionId ? ' · salary revision drafted' : ''}</span></li>)}
            </ul>}
          </section>
        </div>
      </div>}

      {view === 'onboarding' && <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
        <p className="text-slate-500">Items marked “auto” are confirmed from the employee record and cannot be ticked by hand.</p>
        {onboardingQueue.length === 0 ? <p className="mt-4 font-semibold text-emerald-700">All active employees have completed onboarding.</p> : <div className="mt-3 space-y-3">
          {onboardingQueue.slice(0, 40).map(({ employee, status }) => {
            const doneCount = Object.values(status).filter(Boolean).length;
            return <div key={employee.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap justify-between gap-2"><span className="font-bold text-slate-900">{employee.fullName} ({employee.employeeCode})</span><span className="text-slate-500">Joined {employee.dateOfJoining} · {doneCount}/8 complete</span></div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                {(Object.keys(ONBOARDING_ITEMS) as OnboardingChecklistItem[]).map(item => {
                  const manual = MANUAL_ONBOARDING_ITEMS.includes(item);
                  return <label key={item} className={`flex items-center gap-2 rounded p-1.5 ${status[item] ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>
                    <input type="checkbox" checked={status[item]} disabled={!manual} onChange={event => onUpdateOnboarding(employee.id, item, event.target.checked)} />
                    <span>{ONBOARDING_ITEMS[item]}{manual ? '' : ' (auto)'}</span>
                  </label>;
                })}
              </div>
            </div>;
          })}
        </div>}
      </section>}

      {view === 'letters' && <section className="rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
        <p className="text-slate-500">Employment letters for current staff and experience certificates for separated staff open as printable pages.</p>
        <ul className="mt-3 divide-y divide-slate-100">
          {employees.slice().sort((a, b) => a.fullName.localeCompare(b.fullName)).map(employee => <li key={employee.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><strong>{employee.fullName}</strong> · {designationTitle(employee.designationId)} · {employee.status}{employee.separationDate ? ` (left ${employee.separationDate})` : ''}</span>
            <button type="button" onClick={() => { try { openPrintableHtml(experienceLetterHtml(employee, designationTitle(employee.designationId), departmentName(employee.departmentId), companies.find(item => item.id === employee.companyId) || companies[0])); } catch (error) { alert(error instanceof Error ? error.message : 'Letter could not be opened.'); } }} className="rounded border border-emerald-300 px-3 py-1 font-semibold text-emerald-700 hover:bg-emerald-50">
              {employee.status === 'Terminated' ? 'Experience certificate' : 'Employment letter'}
            </button>
          </li>)}
        </ul>
      </section>}
    </div>
  );
}
