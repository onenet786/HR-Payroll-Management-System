/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { PerformanceReview, KpiScore, Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface PerformanceModuleProps {
  reviews: PerformanceReview[];
  employees: Employee[];
  currentUserAccount: { username: string; employeeId?: string };
  canManage: boolean;
  onAddReview: (review: PerformanceReview) => void;
  onUpdateReview: (review: PerformanceReview) => void;
}

const ratingLabels: Record<number, string> = { 1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Good', 5: 'Excellent' };
const ratingColors: Record<number, string> = {
  1: 'text-rose-400', 2: 'text-orange-400', 3: 'text-amber-400', 4: 'text-emerald-400', 5: 'text-blue-400'
};

const DEFAULT_KPIS = ['Technical Delivery', 'Quality of Work', 'Team Collaboration', 'Communication', 'Attendance & Punctuality'];
const PERIODS = ['H1-2026', 'H2-2026', 'Annual-2025', 'Annual-2026', 'Q1-2026', 'Q2-2026'];

function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button" disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={`text-lg leading-none transition ${n <= value ? 'text-amber-400' : 'text-slate-600'} ${readOnly ? '' : 'hover:text-amber-300 cursor-pointer'}`}>
          ★
        </button>
      ))}
    </div>
  );
}

export function PerformanceModule({ reviews, employees, currentUserAccount, canManage, onAddReview }: PerformanceModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterEmpId, setFilterEmpId] = useState('All');

  const emptyKpis: KpiScore[] = DEFAULT_KPIS.map(k => ({ kpi: k, weight: 20, selfScore: 3, managerScore: 3 }));
  const [form, setForm] = useState({
    employeeId: employees[0]?.id || '',
    period: 'H1-2026',
    reviewDate: new Date().toISOString().split('T')[0],
    kpis: emptyKpis,
    strengths: '',
    areasOfImprovement: '',
    managerComments: '',
    incrementRecommended: false,
    incrementPercent: 0
  });

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.fullName || 'Unknown';

  const computeWeightedRating = (kpis: KpiScore[], field: 'selfScore' | 'managerScore') => {
    const totalWeight = kpis.reduce((s, k) => s + k.weight, 0);
    if (totalWeight === 0) return 0;
    const weighted = kpis.reduce((s, k) => s + (k[field] * k.weight), 0);
    return parseFloat((weighted / totalWeight).toFixed(2));
  };

  const handleSave = () => {
    if (!form.employeeId || !form.period) return;
    const review: PerformanceReview = {
      id: `pr-${Date.now()}`,
      employeeId: form.employeeId,
      reviewerId: currentUserAccount.username,
      period: form.period,
      reviewDate: form.reviewDate,
      kpis: form.kpis,
      overallSelfRating: computeWeightedRating(form.kpis, 'selfScore'),
      overallManagerRating: computeWeightedRating(form.kpis, 'managerScore'),
      strengths: form.strengths,
      areasOfImprovement: form.areasOfImprovement,
      managerComments: form.managerComments,
      status: 'Reviewed',
      incrementRecommended: form.incrementRecommended,
      incrementPercent: form.incrementRecommended ? form.incrementPercent : undefined
    };
    onAddReview(review);
    setShowForm(false);
  };

  const updateKpi = (idx: number, field: keyof KpiScore, value: number | string) => {
    setForm(p => {
      const kpis = [...p.kpis];
      kpis[idx] = { ...kpis[idx], [field]: value };
      return { ...p, kpis };
    });
  };

  const addKpi = () => {
    setForm(p => ({ ...p, kpis: [...p.kpis, { kpi: '', weight: 10, selfScore: 3, managerScore: 3 }] }));
  };

  const removeKpi = (idx: number) => {
    setForm(p => ({ ...p, kpis: p.kpis.filter((_, i) => i !== idx) }));
  };

  const filtered = reviews.filter(r => filterEmpId === 'All' || r.employeeId === filterEmpId)
    .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));

  const avgRating = reviews.length > 0
    ? reviews.reduce((s, r) => s + r.overallManagerRating, 0) / reviews.length : 0;
  const excellentCount = reviews.filter(r => r.overallManagerRating >= 4.5).length;
  const pendingCount = reviews.filter(r => r.status === 'Submitted').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Performance Appraisals</h2>
          <p className="text-xs text-slate-400 mt-0.5">KPI-based performance reviews with weighted scoring and increment recommendations</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
            <Plus size={14} /> New Review
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Reviews', val: reviews.length, color: 'slate', icon: '📋' },
          { label: 'Avg Manager Rating', val: avgRating.toFixed(1) + ' / 5', color: 'emerald', icon: '⭐' },
          { label: 'Excellent Performers', val: excellentCount, color: 'blue', icon: '🏆' },
          { label: 'Pending Review', val: pendingCount, color: 'amber', icon: '⏳' }
        ].map(({ label, val, color, icon }) => (
          <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-2xl p-4`}>
            <div className="text-xl mb-1">{icon}</div>
            <div className={`text-2xl font-bold text-${color}-400`}>{val}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <select value={filterEmpId} onChange={e => setFilterEmpId(e.target.value)}
        aria-label="Filter performance reviews by employee"
        className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500">
        <option value="All">All Employees</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
      </select>

      {/* Review Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">No performance reviews found.</div>
        ) : filtered.map(review => {
          const isExpanded = expandedId === review.id;
          const emp = employees.find(e => e.id === review.employeeId);
          return (
            <div key={review.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/20 transition"
                onClick={() => setExpandedId(isExpanded ? null : review.id)}>
                <div className="flex items-center gap-3">
                  {emp?.pictureUrl
                    ? <img src={emp.pictureUrl} className="w-9 h-9 rounded-xl object-cover" alt="" />
                    : <div className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300">{getEmpName(review.employeeId)[0]}</div>
                  }
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{getEmpName(review.employeeId)}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30">{review.period}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                        review.status === 'Acknowledged' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                        review.status === 'Reviewed' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                        'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>{review.status}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">Reviewed by {review.reviewerId} on {review.reviewDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-lg font-bold ${ratingColors[Math.round(review.overallManagerRating)]}`}>
                      {review.overallManagerRating.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-slate-500">Manager Rating</div>
                  </div>
                  {review.incrementRecommended && (
                    <div className="text-right">
                      <div className="text-sm font-bold text-emerald-400">+{review.incrementPercent}%</div>
                      <div className="text-[10px] text-slate-500">Increment</div>
                    </div>
                  )}
                  {isExpanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="border-t border-slate-700/50 overflow-hidden">
                    <div className="p-4 space-y-4">
                      {/* KPI Table */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">KPI Breakdown</h4>
                        <table className="w-full text-xs">
                          <thead><tr className="text-slate-500 border-b border-slate-700">
                            <th className="text-left pb-1">KPI</th>
                            <th className="text-center pb-1">Weight</th>
                            <th className="text-center pb-1">Self</th>
                            <th className="text-center pb-1">Manager</th>
                            <th className="text-left pb-1">Comments</th>
                          </tr></thead>
                          <tbody className="divide-y divide-slate-700/30">
                            {review.kpis.map((k, i) => (
                              <tr key={i}>
                                <td className="py-1.5 text-slate-200 font-medium">{k.kpi}</td>
                                <td className="py-1.5 text-center text-slate-400">{k.weight}%</td>
                                <td className="py-1.5 text-center"><span className={`font-bold ${ratingColors[k.selfScore]}`}>{k.selfScore}</span></td>
                                <td className="py-1.5 text-center"><span className={`font-bold ${ratingColors[k.managerScore]}`}>{k.managerScore}</span></td>
                                <td className="py-1.5 text-slate-400 text-[10px]">{k.comment || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Weighted Summary */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-900/60 rounded-xl p-3">
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Self Rating</p>
                          <div className="flex items-center gap-2">
                            <StarRating value={Math.round(review.overallSelfRating)} readOnly />
                            <span className={`font-bold ${ratingColors[Math.round(review.overallSelfRating)]}`}>{review.overallSelfRating.toFixed(2)}</span>
                            <span className="text-slate-400 text-xs">— {ratingLabels[Math.round(review.overallSelfRating)]}</span>
                          </div>
                        </div>
                        <div className="bg-slate-900/60 rounded-xl p-3">
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Manager Rating</p>
                          <div className="flex items-center gap-2">
                            <StarRating value={Math.round(review.overallManagerRating)} readOnly />
                            <span className={`font-bold ${ratingColors[Math.round(review.overallManagerRating)]}`}>{review.overallManagerRating.toFixed(2)}</span>
                            <span className="text-slate-400 text-xs">— {ratingLabels[Math.round(review.overallManagerRating)]}</span>
                          </div>
                        </div>
                      </div>

                      {/* Qualitative Feedback */}
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        {[
                          { label: 'Strengths', text: review.strengths, color: 'emerald' },
                          { label: 'Areas of Improvement', text: review.areasOfImprovement, color: 'amber' },
                          { label: 'Manager Comments', text: review.managerComments, color: 'blue' }
                        ].map(({ label, text, color }) => (
                          <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-xl p-3`}>
                            <p className={`text-[10px] font-bold text-${color}-400 uppercase tracking-wider mb-1`}>{label}</p>
                            <p className="text-slate-300">{text || '—'}</p>
                          </div>
                        ))}
                      </div>

                      {review.incrementRecommended && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300">
                          <strong>Increment Recommended:</strong> +{review.incrementPercent}% salary increase recommended for next revision cycle.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* New Review Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl p-6 space-y-5 my-8">
              <h3 className="text-base font-bold text-white">New Performance Review</h3>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="perf-employee" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Employee *</label>
                  <select id="perf-employee" value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {employees.filter(e => e.status === 'Active').map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="perf-period" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Review Period</label>
                  <select id="perf-period" value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                    {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="perf-review-date" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Review Date</label>
                  <input id="perf-review-date" type="date" value={form.reviewDate} onChange={e => setForm(p => ({ ...p, reviewDate: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              {/* KPI Grid */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">KPI Scores</label>
                  <button type="button" onClick={addKpi}
                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1">
                    <Plus size={11} /> Add KPI
                  </button>
                </div>
                <div className="space-y-2">
                  {form.kpis.map((kpi, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <label htmlFor={`perf-kpi-${idx}`} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">KPI Name</label>
                        <input id={`perf-kpi-${idx}`} value={kpi.kpi} onChange={e => updateKpi(idx, 'kpi', e.target.value)}
                          placeholder="KPI Name" className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none" />
                      </div>
                      <div className="col-span-1 flex items-center gap-1">
                        <label htmlFor={`perf-weight-${idx}`} className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Wt</label>
                        <input id={`perf-weight-${idx}`} type="number" min="5" max="100" value={kpi.weight} onChange={e => updateKpi(idx, 'weight', Number(e.target.value))}
                          className="w-12 bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 py-1.5 focus:outline-none" />
                        <span className="text-slate-500 text-xs">%</span>
                      </div>
                      <div className="col-span-3">
                        <div className="text-[10px] text-slate-500 mb-0.5">Self</div>
                        <StarRating value={kpi.selfScore} onChange={v => updateKpi(idx, 'selfScore', v)} />
                      </div>
                      <div className="col-span-3">
                        <div className="text-[10px] text-slate-500 mb-0.5">Manager</div>
                        <StarRating value={kpi.managerScore} onChange={v => updateKpi(idx, 'managerScore', v)} />
                      </div>
                      <button type="button" onClick={() => removeKpi(idx)}
                        className="col-span-1 text-slate-600 hover:text-rose-400 transition text-base font-bold">×</button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Weighted Score Preview — Self: <span className="text-emerald-400 font-bold">{computeWeightedRating(form.kpis, 'selfScore').toFixed(2)}</span>
                  {' '}| Manager: <span className="text-blue-400 font-bold">{computeWeightedRating(form.kpis, 'managerScore').toFixed(2)}</span>
                  {' '}| Weight Total: <span className={form.kpis.reduce((s,k)=>s+k.weight,0)===100?'text-emerald-400':'text-rose-400'} >{form.kpis.reduce((s,k)=>s+k.weight,0)}%</span>
                </div>
              </div>

              {/* Qualitative */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Strengths', field: 'strengths' as const },
                  { label: 'Areas of Improvement', field: 'areasOfImprovement' as const },
                  { label: 'Manager Comments', field: 'managerComments' as const }
                ].map(({ label, field }) => (
                  <div key={field}>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</label>
                    <textarea aria-label={label} value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                      rows={3} placeholder={`${label}...`}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                  </div>
                ))}
              </div>

              {/* Increment */}
              <div className="flex items-center gap-4 bg-slate-800/60 rounded-xl p-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.incrementRecommended}
                    onChange={e => setForm(p => ({ ...p, incrementRecommended: e.target.checked }))}
                    className="w-4 h-4 rounded accent-emerald-500" />
                  <span className="text-sm text-white font-medium">Recommend Salary Increment</span>
                </label>
                {form.incrementRecommended && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="perf-increment" className="text-xs text-slate-400">Increment %</label>
                    <input id="perf-increment" type="number" min="0" max="100" value={form.incrementPercent}
                      onChange={e => setForm(p => ({ ...p, incrementPercent: Number(e.target.value) }))}
                      className="w-16 bg-slate-700 border border-slate-600 text-white text-sm rounded-lg px-2 py-1 focus:outline-none" />
                    <span className="text-slate-400 text-sm">%</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleSave}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold py-2.5 rounded-xl transition">Submit Review</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
