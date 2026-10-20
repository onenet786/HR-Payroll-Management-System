import React, { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, BarChart3, Briefcase, CalendarCheck, Lightbulb, TrendingDown, TrendingUp, UserMinus, UserPlus, Users, Wallet } from 'lucide-react';
import type { AttendanceLog, Branch, Department, Employee, JobApplication, JobPosting, LeaveRequest, PerformanceReview } from '../types';
import type { EditionFeatures } from '../data/edition';
import { computeHrKpis, monthKey, type KpiMetric } from '../data/hrKpis';

interface Props {
  employees: Employee[];
  attendances: AttendanceLog[];
  leaves: LeaveRequest[];
  departments: Department[];
  branches: Branch[];
  jobPostings: JobPosting[];
  jobApplications: JobApplication[];
  performanceReviews: PerformanceReview[];
  features: EditionFeatures;
  pendingTasks: { count: number; overdue: number; detail: string };
}

const PALETTE = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#64748b'];
const RATING_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#2563eb', '#10b981'];
const number = (value: number) => value.toLocaleString('en-PK');
const compact = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : String(value);

/** Month-over-month change chip; `lowerIsBetter` flips the colour for attrition. */
function Delta({ metric, suffix = '', lowerIsBetter = false, label = 'vs. last month' }: { metric: KpiMetric; suffix?: string; lowerIsBetter?: boolean; label?: string }) {
  if (metric.delta === 0) return <p className="text-[10px] text-slate-400">No change {label}</p>;
  const up = metric.delta > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  const text = metric.deltaPercent !== null && Math.abs(metric.deltaPercent) <= 999 ? `${Math.abs(metric.deltaPercent)}%` : `${Math.abs(metric.delta)}${suffix}`;
  return <p className={`flex items-center gap-1 text-[10px] font-semibold ${good ? 'text-emerald-600' : 'text-rose-600'}`}><Icon className="h-3 w-3" />{up ? '+' : '−'}{text} <span className="font-normal text-slate-400">{label}</span></p>;
}

function Tile({ icon, tone, label, value, children }: { icon: React.ReactNode; tone: string; label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3.5 ${tone}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-sm">{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <p className="text-xl font-bold leading-tight text-slate-900">{value}</p>
        {children}
      </div>
    </div>
  );
}

function Card({ title, icon, children, className = '' }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm ${className}`} aria-label={title}>
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-700">{icon}{title}</h3>
      <div className="flex-1 p-3">{children}</div>
    </section>
  );
}

function Donut({ data, total, centre }: { data: { label: string; value: number }[]; total: number; centre: string }) {
  if (!total) return <p className="py-10 text-center text-xs text-slate-400">No active employees in this selection.</p>;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
              {data.map((_, index) => <Cell key={index} fill={PALETTE[index % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [`${value} (${Math.round((value / total) * 100)}%)`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-[10px] text-slate-500">{centre}</span><span className="text-xl font-bold text-slate-900">{total}</span></div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1 text-xs">
        {data.slice(0, 7).map((slice, index) => (
          <li key={slice.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[index % PALETTE.length] }} /><span className="min-w-0 flex-1 truncate text-slate-700">{slice.label}</span><span className="font-semibold text-slate-900">{slice.value}</span><span className="w-9 text-right text-slate-400">{Math.round((slice.value / total) * 100)}%</span></li>
        ))}
      </ul>
    </div>
  );
}

/** KPI dashboard in the "HR KPI" style: filters, month-over-month tiles, charts and auto-generated insights, all from live records. */
export function KpiDashboard({ employees, attendances, leaves, departments, branches, jobPostings, jobApplications, performanceReviews, features, pendingTasks }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(monthKey(today));
  const [departmentId, setDepartmentId] = useState('');
  const [branchId, setBranchId] = useState('');
  const scopedDepartments = branchId ? departments.filter(department => department.branchId === branchId) : departments;
  const kpis = useMemo(() => computeHrKpis({ employees, attendances, leaves, departments, branches, jobPostings, jobApplications, performanceReviews, today }, { month, departmentId: departmentId || undefined, branchId: branchId || undefined }),
    [employees, attendances, leaves, departments, branches, jobPostings, jobApplications, performanceReviews, today, month, departmentId, branchId]);
  const mix = kpis.attendanceMix;
  const worked = mix.present + mix.late + mix.halfDay;
  const attendanceTotal = worked + mix.absent;
  const ring = attendanceTotal ? kpis.attendanceRate.value : 0;
  const select = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100';
  const tileCount = 5 + (features.recruitment ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-white lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300"><BarChart3 className="h-5 w-5" /></div>
          <div>
            <h2 className="text-base font-bold leading-tight">HR KPI Dashboard</h2>
            <p className="text-[11px] text-slate-400">People · Performance · Progress — {kpis.monthLabel}, compared with the month before</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5"><span className="text-slate-400">Month</span><input type="month" aria-label="Dashboard month" value={month} max={monthKey(today)} onChange={event => event.target.value && setMonth(event.target.value)} className={select} /></label>
          <label className="flex items-center gap-1.5"><span className="text-slate-400">Location</span><select aria-label="Dashboard branch" value={branchId} onChange={event => { setBranchId(event.target.value); setDepartmentId(''); }} className={select}><option value="">All</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className="flex items-center gap-1.5"><span className="text-slate-400">Department</span><select aria-label="Dashboard department" value={departmentId} onChange={event => setDepartmentId(event.target.value)} className={select}><option value="">All</option>{scopedDepartments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
        </div>
      </div>

      <div className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${tileCount === 6 ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
        <Tile icon={<Users className="h-5 w-5 text-emerald-600" />} tone="border-emerald-200 bg-emerald-50/60" label="Total employees" value={number(kpis.totalEmployees.value)}><Delta metric={kpis.totalEmployees} /></Tile>
        <Tile icon={<UserPlus className="h-5 w-5 text-blue-600" />} tone="border-blue-200 bg-blue-50/60" label="New hires" value={number(kpis.newHires.value)}><Delta metric={kpis.newHires} /></Tile>
        <Tile icon={<UserMinus className="h-5 w-5 text-purple-600" />} tone="border-purple-200 bg-purple-50/60" label="Attrition rate" value={`${kpis.attritionRate.value}%`}><Delta metric={kpis.attritionRate} suffix=" pts" lowerIsBetter /></Tile>
        <Tile icon={<CalendarCheck className="h-5 w-5 text-amber-600" />} tone="border-amber-200 bg-amber-50/60" label="Attendance rate" value={attendanceTotal ? `${kpis.attendanceRate.value}%` : '—'}>{attendanceTotal ? <Delta metric={kpis.attendanceRate} suffix=" pts" /> : <p className="text-[10px] text-slate-400">No attendance this month</p>}</Tile>
        {features.recruitment && <Tile icon={<Briefcase className="h-5 w-5 text-cyan-600" />} tone="border-cyan-200 bg-cyan-50/60" label="Open vacancies" value={number(kpis.openVacancies.value)}><Delta metric={kpis.openVacancies} /></Tile>}
        <Tile icon={<Wallet className="h-5 w-5 text-rose-600" />} tone="border-rose-200 bg-rose-50/60" label="Monthly wage bill" value={`PKR ${compact(kpis.wageBill.value)}`}><Delta metric={kpis.wageBill} /></Tile>
      </div>

      {pendingTasks.count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" /><strong>{pendingTasks.count} pending approval(s)</strong>{pendingTasks.overdue ? <span className="rounded bg-rose-100 px-1.5 py-0.5 font-bold text-rose-800">{pendingTasks.overdue} overdue</span> : null}<span className="text-amber-800">{pendingTasks.detail}</span></div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Headcount trend" icon={<BarChart3 className="h-4 w-4 text-blue-600" />}>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kpis.trend} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip formatter={(value: number, name: string) => [value, name === 'headcount' ? 'Headcount' : name]} />
                <Bar dataKey="headcount" fill="#2563eb" radius={[4, 4, 0, 0]}><LabelList dataKey="headcount" position="top" style={{ fontSize: 10, fill: '#1e293b', fontWeight: 600 }} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Department-wise employees" icon={<Users className="h-4 w-4 text-emerald-600" />}>
          <Donut data={kpis.departments} total={kpis.totalEmployees.value} centre="Total" />
        </Card>
      </div>

      <div className={`grid gap-4 md:grid-cols-2 ${features.performance ? 'xl:grid-cols-3' : ''}`}>
        <Card title="Attendance rate" icon={<CalendarCheck className="h-4 w-4 text-emerald-600" />}>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0" role="img" aria-label={`Attendance ${ring}%`}>
              <circle cx="60" cy="60" r="48" fill="none" stroke="#e2e8f0" strokeWidth="12" />
              <circle cx="60" cy="60" r="48" fill="none" stroke="#10b981" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(ring / 100) * 301.6} 301.6`} transform="rotate(-90 60 60)" />
              <text x="60" y="56" textAnchor="middle" className="fill-slate-900" style={{ fontSize: 22, fontWeight: 700 }}>{attendanceTotal ? `${ring}%` : '—'}</text>
              <text x="60" y="74" textAnchor="middle" style={{ fontSize: 10, fill: '#64748b' }}>Present</text>
            </svg>
            <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 text-xs">
              {([['On time', mix.present, 'text-emerald-700'], ['Late', mix.late, 'text-amber-700'], ['Half day', mix.halfDay, 'text-amber-700'], ['Absent', mix.absent, 'text-rose-700'], ['On leave', mix.onLeave, 'text-slate-600']] as const).map(([label, value, tone]) => (
                <div key={label} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"><dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt><dd className={`text-sm font-bold ${tone}`}>{value}</dd></div>
              ))}
              <div className="col-span-2"><Delta metric={kpis.attendanceRate} suffix=" pts" /></div>
            </dl>
          </div>
        </Card>
        {features.performance && (
          <Card title="Performance rating" icon={<TrendingUp className="h-4 w-4 text-blue-600" />}>
            {kpis.reviewedEmployees === 0 ? <p className="py-10 text-center text-xs text-slate-400">No performance reviews recorded yet.</p> : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpis.performance} margin={{ top: 18, right: 4, left: -22, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip formatter={(value: number) => [value, 'Employees']} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}><LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#1e293b', fontWeight: 600 }} />{kpis.performance.map((_, index) => <Cell key={index} fill={RATING_COLORS[index]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        )}
        <Card title="Gender diversity" icon={<Users className="h-4 w-4 text-pink-600" />}>
          <Donut data={kpis.gender} total={kpis.totalEmployees.value} centre="Employees" />
        </Card>
      </div>

      <div className={`grid gap-4 md:grid-cols-2 ${features.recruitment ? 'xl:grid-cols-3' : ''}`}>
        {features.recruitment && (
          <Card title="Recruitment funnel" icon={<Briefcase className="h-4 w-4 text-cyan-600" />}>
            {kpis.funnel[0].value === 0 ? <p className="py-10 text-center text-xs text-slate-400">No applications yet.</p> : (
              <ul className="space-y-1.5">
                {kpis.funnel.map((stage, index) => (
                  <li key={stage.label} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 text-slate-600">{stage.label}</span>
                    <span className="h-5 flex-1 overflow-hidden rounded bg-slate-100"><span className="block h-full rounded" style={{ width: `${Math.max(stage.percent, 2)}%`, background: PALETTE[index] }} /></span>
                    <span className="w-16 text-right font-semibold text-slate-900">{stage.value} <span className="font-normal text-slate-400">({stage.percent}%)</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card title="Attrition rate trend" icon={<TrendingDown className="h-4 w-4 text-purple-600" />}>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={kpis.trend} margin={{ top: 16, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip formatter={(value: number, name: string) => [`${value}%`, name === 'attritionRate' ? 'Attrition' : name]} />
                <Line type="monotone" dataKey="attritionRate" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 4, fill: '#7c3aed' }}><LabelList dataKey="attritionRate" position="top" formatter={(value: number) => `${value}%`} style={{ fontSize: 10, fill: '#4c1d95', fontWeight: 600 }} /></Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Top reasons for leaving (12 months)" icon={<UserMinus className="h-4 w-4 text-rose-600" />}>
          {kpis.leavingReasons.length === 0 ? <p className="py-10 text-center text-xs text-slate-400">No separations in the last 12 months.</p> : (
            <ul className="space-y-2">
              {kpis.leavingReasons.map((reason, index) => {
                const total = kpis.leavingReasons.reduce((sum, item) => sum + item.value, 0);
                return (
                  <li key={reason.label} className="text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-slate-700" title={reason.label}>{reason.label}</span><span className="shrink-0 font-semibold text-slate-900">{reason.value} · {Math.round((reason.value / total) * 100)}%</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded bg-slate-100"><div className="h-full rounded" style={{ width: `${(reason.value / total) * 100}%`, background: PALETTE[(index + 3) % PALETTE.length] }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Approved leave in ${kpis.monthLabel}`} icon={<CalendarCheck className="h-4 w-4 text-amber-600" />}>
          {kpis.leaveMix.length === 0 ? <p className="py-6 text-center text-xs text-slate-400">No approved leave touches this month.</p> : (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kpis.leaveMix} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={64} tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: number) => [value, 'Requests']} />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={14}><LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: '#1e293b', fontWeight: 600 }} /></Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Insights & next steps" icon={<Lightbulb className="h-4 w-4 text-amber-500" />} className="bg-gradient-to-br from-indigo-50/60 to-white">
          <ul className="space-y-1.5 text-xs text-slate-700">
            {kpis.insights.map(insight => <li key={insight} className="flex gap-2"><span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />{insight}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
