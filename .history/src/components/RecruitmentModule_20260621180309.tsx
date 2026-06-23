/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Briefcase, ChevronRight, X } from 'lucide-react';
import { JobPosting, JobApplication, AppStage, Department, Branch } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface RecruitmentModuleProps {
  jobPostings: JobPosting[];
  applications: JobApplication[];
  departments: Department[];
  branches: Branch[];
  canManage: boolean;
  onAddPosting: (posting: JobPosting) => void;
  onUpdatePosting: (posting: JobPosting) => void;
  onAddApplication: (app: JobApplication) => void;
  onUpdateApplication: (app: JobApplication) => void;
}

const STAGES: AppStage[] = ['Applied', 'Shortlisted', 'Interview Scheduled', 'Interviewed', 'Offer Extended', 'Hired', 'Rejected'];
const STAGE_COLORS: Record<AppStage, string> = {
  'Applied': 'slate', 'Shortlisted': 'blue', 'Interview Scheduled': 'violet',
  'Interviewed': 'amber', 'Offer Extended': 'emerald', 'Hired': 'green', 'Rejected': 'rose'
};
const JOB_TYPES: JobPosting['jobType'][] = ['Full Time', 'Part Time', 'Contract', 'Internship'];
const JOB_STATUSES: JobPosting['status'][] = ['Open', 'Closed', 'On Hold', 'Filled'];
const STATUS_COLORS: Record<JobPosting['status'], string> = {
  'Open': 'emerald', 'Closed': 'slate', 'On Hold': 'amber', 'Filled': 'blue'
};

function PKR(n?: number) { return n != null ? 'PKR ' + n.toLocaleString('en-PK') : '—'; }

export function RecruitmentModule({
  jobPostings, applications, departments, branches, canManage,
  onAddPosting, onUpdatePosting, onAddApplication, onUpdateApplication
}: RecruitmentModuleProps) {
  const [activeTab, setActiveTab] = useState<'postings' | 'pipeline'>('postings');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showJobForm, setShowJobForm] = useState(false);
  const [showAppForm, setShowAppForm] = useState(false);
  const [appDetailId, setAppDetailId] = useState<string | null>(null);

  const emptyJob: Partial<JobPosting> = {
    title: '', departmentId: departments[0]?.id || '', branchId: branches[0]?.id || '',
    vacancies: 1, experienceRequired: '', qualificationRequired: '', salaryRange: '',
    jobType: 'Full Time', postedDate: new Date().toISOString().split('T')[0],
    closingDate: '', status: 'Open', description: ''
  };
  const [jobForm, setJobForm] = useState<Partial<JobPosting>>(emptyJob);

  const emptyApp: Partial<JobApplication> = {
    jobPostingId: selectedJobId || '', applicantName: '', applicantEmail: '',
    applicantPhone: '', cnic: '', currentSalary: 0, expectedSalary: 0,
    appliedDate: new Date().toISOString().split('T')[0], stage: 'Applied'
  };
  const [appForm, setAppForm] = useState<Partial<JobApplication>>(emptyApp);

  const getDeptName = (id: string) => departments.find(d => d.id === id)?.name || id;
  const getBranchName = (id: string) => branches.find(b => b.id === id)?.name || id;
  const getJobTitle = (id: string) => jobPostings.find(j => j.id === id)?.title || id;

  const pipelineApps = selectedJobId
    ? applications.filter(a => a.jobPostingId === selectedJobId)
    : applications;

  const handleAddJob = () => {
    if (!jobForm.title || !jobForm.closingDate) return;
    onAddPosting({ id: `job-${Date.now()}`, ...(jobForm as Omit<JobPosting, 'id'>) });
    setShowJobForm(false);
    setJobForm(emptyJob);
  };

  const handleAddApp = () => {
    if (!appForm.applicantName || !appForm.jobPostingId) return;
    onAddApplication({ id: `app-${Date.now()}`, ...(appForm as Omit<JobApplication, 'id'>) });
    setShowAppForm(false);
    setAppForm(emptyApp);
  };

  const moveStage = (app: JobApplication, dir: 1 | -1) => {
    const idx = STAGES.indexOf(app.stage);
    const next = STAGES[idx + dir];
    if (next) onUpdateApplication({ ...app, stage: next });
  };

  const appDetail = appDetailId ? applications.find(a => a.id === appDetailId) : null;

  const openCount = jobPostings.filter(j => j.status === 'Open').length;
  const totalApps = applications.length;
  const hiredCount = applications.filter(a => a.stage === 'Hired').length;
  const pendingInterviews = applications.filter(a => a.stage === 'Interview Scheduled').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Recruitment</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage job postings and track applicants through the hiring pipeline</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button onClick={() => { setShowAppForm(true); setAppForm({ ...emptyApp, jobPostingId: selectedJobId || jobPostings[0]?.id || '' }); }}
              className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
              <Plus size={13} /> Add Applicant
            </button>
            <button onClick={() => setShowJobForm(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
              <Briefcase size={13} /> Post Job
            </button>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Open Positions', val: openCount, color: 'emerald', icon: '📢' },
          { label: 'Total Applicants', val: totalApps, color: 'blue', icon: '👥' },
          { label: 'Interviews Pending', val: pendingInterviews, color: 'violet', icon: '📅' },
          { label: 'Hired', val: hiredCount, color: 'amber', icon: '🎉' }
        ].map(({ label, val, color, icon }) => (
          <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-2xl p-4`}>
            <div className="text-xl mb-1">{icon}</div>
            <div className={`text-2xl font-bold text-${color}-400`}>{val}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700/50 pb-0">
        {(['postings', 'pipeline'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`pb-2 px-1 text-xs font-bold capitalize border-b-2 transition ${
              activeTab === t ? 'border-violet-500 text-violet-300' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            {t === 'postings' ? `Job Postings (${jobPostings.length})` : `Applicant Pipeline (${applications.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'postings' && (
        <div className="space-y-3">
          {jobPostings.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">No job postings yet.</div>
          ) : jobPostings.map(job => {
            const appCount = applications.filter(a => a.jobPostingId === job.id).length;
            const statusColor = STATUS_COLORS[job.status];
            return (
              <div key={job.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-4 hover:border-slate-600 transition">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-white">{job.title}</h3>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${statusColor}-500/20 text-${statusColor}-300 border border-${statusColor}-500/30`}>{job.status}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-700 text-slate-300">{job.jobType}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {getDeptName(job.departmentId)} · {getBranchName(job.branchId)} · {job.vacancies} vacanc{job.vacancies === 1 ? 'y' : 'ies'} · {job.salaryRange}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Exp: {job.experienceRequired} · Qual: {job.qualificationRequired}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">{job.description}</div>
                  </div>
                  <div className="ml-4 text-right flex-shrink-0">
                    <div className="text-lg font-bold text-blue-400">{appCount}</div>
                    <div className="text-[10px] text-slate-500">applicants</div>
                    <div className="text-[10px] text-slate-500 mt-2">Closes {job.closingDate}</div>
                    {canManage && job.status === 'Open' && (
                      <div className="flex gap-1 mt-2 justify-end">
                        <button onClick={() => onUpdatePosting({ ...job, status: 'On Hold' })}
                          className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-lg hover:bg-amber-500/20 transition">Hold</button>
                        <button onClick={() => onUpdatePosting({ ...job, status: 'Filled' })}
                          className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition">Filled</button>
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => { setActiveTab('pipeline'); setSelectedJobId(job.id); }}
                  className="mt-3 text-[10px] font-bold text-violet-400 hover:text-violet-300 flex items-center gap-1 transition">
                  View Pipeline <ChevronRight size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="space-y-4">
          {/* Job filter */}
          <select value={selectedJobId || ''} onChange={e => setSelectedJobId(e.target.value || null)} aria-label="Filter by job posting"
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500">
            <option value="">All Jobs</option>
            {jobPostings.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>

          {/* Kanban columns */}
          <div className="grid grid-cols-7 gap-2">
            {STAGES.map(stage => {
              const stageApps = pipelineApps.filter(a => a.stage === stage);
              const color = STAGE_COLORS[stage];
              return (
                <div key={stage} className={`bg-${color}-500/5 border border-${color}-500/20 rounded-2xl p-2`}>
                  <div className={`text-[10px] font-bold text-${color}-400 uppercase tracking-wider mb-2 text-center`}>
                    {stage} ({stageApps.length})
                  </div>
                  <div className="space-y-2">
                    {stageApps.map(app => (
                      <div key={app.id}
                        className={`bg-slate-800 border border-${color}-500/30 rounded-xl p-2 cursor-pointer hover:border-${color}-400 transition text-xs`}
                        onClick={() => setAppDetailId(app.id)}>
                        <div className="text-white font-bold text-[10px] line-clamp-1">{app.applicantName}</div>
                        <div className="text-slate-500 text-[9px] mt-0.5 line-clamp-1">{getJobTitle(app.jobPostingId)}</div>
                        {app.expectedSalary && <div className="text-slate-400 text-[9px]">{PKR(app.expectedSalary)}</div>}
                        {canManage && stage !== 'Hired' && stage !== 'Rejected' && (
                          <div className="flex gap-1 mt-1.5">
                            <button onClick={e => { e.stopPropagation(); moveStage(app, -1); }}
                              disabled={stage === 'Applied'}
                              className="flex-1 text-[8px] bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white py-0.5 rounded transition">←</button>
                            <button onClick={e => { e.stopPropagation(); moveStage(app, 1); }}
                              className="flex-1 text-[8px] bg-violet-700 hover:bg-violet-600 text-white py-0.5 rounded transition">→</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Applicant Detail Modal */}
      <AnimatePresence>
        {appDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex justify-between items-start">
                <h3 className="text-base font-bold text-white">{appDetail.applicantName}</h3>
                <button onClick={() => setAppDetailId(null)} className="text-slate-500 hover:text-white transition" aria-label="Close applicant details"><X size={18} /></button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {[
                    ['Job', getJobTitle(appDetail.jobPostingId)],
                    ['Email', appDetail.applicantEmail],
                    ['Phone', appDetail.applicantPhone],
                    ['CNIC', appDetail.cnic || '—'],
                    ['Applied', appDetail.appliedDate],
                    ['Current Salary', PKR(appDetail.currentSalary)],
                    ['Expected Salary', PKR(appDetail.expectedSalary)],
                    ['Interview Date', appDetail.interviewDate || '—']
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span className="text-slate-500">{k}: </span>
                      <span className="text-slate-200 font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                {appDetail.interviewNotes && (
                  <div className="bg-slate-800 rounded-xl p-3 text-xs">
                    <div className="text-slate-500 mb-1">Interview Notes:</div>
                    <div className="text-slate-300">{appDetail.interviewNotes}</div>
                  </div>
                )}
              </div>
              {canManage && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Move to Stage</label>
                  <div className="flex flex-wrap gap-1">
                    {STAGES.map(s => (
                      <button key={s} onClick={() => { onUpdateApplication({ ...appDetail, stage: s }); setAppDetailId(null); }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition ${
                          appDetail.stage === s
                            ? `bg-${STAGE_COLORS[s]}-500/30 text-${STAGE_COLORS[s]}-300 border-${STAGE_COLORS[s]}-500/50`
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post Job Modal */}
      <AnimatePresence>
        {showJobForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6 space-y-4 my-8">
              <h3 className="text-base font-bold text-white">Post New Job</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Job Title *</label>
                  <input value={jobForm.title || ''} onChange={e => setJobForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Senior React Developer"
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
                {[
                  { label: 'Department', key: 'departmentId', type: 'select', opts: departments.map(d => ({ v: d.id, l: d.name })) },
                  { label: 'Branch', key: 'branchId', type: 'select', opts: branches.map(b => ({ v: b.id, l: b.name })) },
                  { label: 'Job Type', key: 'jobType', type: 'select', opts: JOB_TYPES.map(t => ({ v: t, l: t })) },
                  { label: 'Status', key: 'status', type: 'select', opts: JOB_STATUSES.map(s => ({ v: s, l: s })) }
                ].map(({ label, key, opts }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</label>
                    <select value={(jobForm as any)[key] || ''} onChange={e => setJobForm(p => ({ ...p, [key]: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                      {opts?.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                ))}
                {[
                  { label: 'Vacancies', key: 'vacancies', type: 'number' },
                  { label: 'Salary Range', key: 'salaryRange', placeholder: 'PKR 100,000 – 150,000' },
                  { label: 'Experience Required', key: 'experienceRequired', placeholder: '2-4 years' },
                  { label: 'Qualification', key: 'qualificationRequired', placeholder: 'BS Computer Science' },
                  { label: 'Posted Date', key: 'postedDate', type: 'date' },
                  { label: 'Closing Date *', key: 'closingDate', type: 'date' }
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</label>
                    <input type={type || 'text'} placeholder={placeholder}
                      value={(jobForm as any)[key] || ''}
                      onChange={e => setJobForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Job Description</label>
                  <textarea value={jobForm.description || ''} onChange={e => setJobForm(p => ({ ...p, description: e.target.value }))}
                    rows={3} placeholder="Describe responsibilities, requirements, and benefits..."
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowJobForm(false); setJobForm(emptyJob); }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleAddJob}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold py-2.5 rounded-xl transition">Post Job</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Application Modal */}
      <AnimatePresence>
        {showAppForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl p-6 space-y-4 my-8">
              <h3 className="text-base font-bold text-white">Add Applicant</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Job Posting *</label>
                  <select value={appForm.jobPostingId || ''} onChange={e => setAppForm(p => ({ ...p, jobPostingId: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                    {jobPostings.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
                  </select>
                </div>
                {[
                  { label: 'Full Name *', key: 'applicantName', placeholder: 'Muhammad Ali' },
                  { label: 'Email *', key: 'applicantEmail', placeholder: 'applicant@email.com' },
                  { label: 'Phone', key: 'applicantPhone', placeholder: '0300-1234567' },
                  { label: 'CNIC', key: 'cnic', placeholder: '42101-XXXXXXX-X' },
                  { label: 'Current Salary (PKR)', key: 'currentSalary', type: 'number' },
                  { label: 'Expected Salary (PKR)', key: 'expectedSalary', type: 'number' },
                  { label: 'Applied Date', key: 'appliedDate', type: 'date' },
                  { label: 'Interview Date', key: 'interviewDate', type: 'date' }
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</label>
                    <input type={type || 'text'} placeholder={placeholder}
                      value={(appForm as any)[key] || ''}
                      onChange={e => setAppForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Interview Notes</label>
                  <textarea value={appForm.interviewNotes || ''} onChange={e => setAppForm(p => ({ ...p, interviewNotes: e.target.value }))}
                    rows={2} className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowAppForm(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleAddApp}
                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold py-2.5 rounded-xl transition">Add Applicant</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
