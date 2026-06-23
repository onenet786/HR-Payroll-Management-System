/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, RefreshCw } from 'lucide-react';
import { Holiday } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface HolidayModuleProps {
  holidays: Holiday[];
  onAddHoliday: (holiday: Holiday) => void;
  onUpdateHoliday: (holiday: Holiday) => void;
  onDeleteHoliday: (id: string) => void;
}

const HOLIDAY_TYPES = ['Public', 'Company', 'Optional'] as const;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const typeColors: Record<string, string> = {
  Public: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Company: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Optional: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
};

export function HolidayModule({ holidays, onAddHoliday, onUpdateHoliday, onDeleteHoliday }: HolidayModuleProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [filterType, setFilterType] = useState<string>('All');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const emptyForm = {
    name: '',
    date: `${filterYear}-01-01`,
    type: 'Public' as Holiday['type'],
    isRecurring: false,
    description: ''
  };
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingHoliday(null);
    setShowForm(true);
  };

  const openEdit = (holiday: Holiday) => {
    setForm({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
      isRecurring: holiday.isRecurring,
      description: holiday.description || ''
    });
    setEditingHoliday(holiday);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.date) return;
    const holiday: Holiday = {
      id: editingHoliday?.id || `hol-${Date.now()}`,
      name: form.name.trim(),
      date: form.date,
      type: form.type,
      isRecurring: form.isRecurring,
      description: form.description.trim() || undefined
    };
    if (editingHoliday) {
      onUpdateHoliday(holiday);
    } else {
      onAddHoliday(holiday);
    }
    setShowForm(false);
  };

  // Filter by year and type
  const filtered = holidays
    .filter(h => {
      const yearMatch = h.date.startsWith(String(filterYear)) || h.isRecurring;
      const typeMatch = filterType === 'All' || h.type === filterType;
      return yearMatch && typeMatch;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  // Group by month
  const grouped: Record<number, Holiday[]> = {};
  filtered.forEach(h => {
    const m = parseInt(h.date.split('-')[1], 10) - 1;
    if (!grouped[m]) grouped[m] = [];
    grouped[m].push(h);
  });

  const totalPublic = holidays.filter(h => h.type === 'Public').length;
  const totalCompany = holidays.filter(h => h.type === 'Company').length;
  const totalOptional = holidays.filter(h => h.type === 'Optional').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Holiday Calendar</h2>
          <p className="text-xs text-slate-400 mt-0.5">Manage public and company holidays that affect payroll and attendance</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition"
        >
          <Plus size={14} /> Add Holiday
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Public Holidays', count: totalPublic, color: 'emerald', icon: '🏛️' },
          { label: 'Company Holidays', count: totalCompany, color: 'blue', icon: '🏢' },
          { label: 'Optional Holidays', count: totalOptional, color: 'amber', icon: '⭐' }
        ].map(({ label, count, color, icon }) => (
          <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-2xl p-4`}>
            <div className="text-xl mb-1">{icon}</div>
            <div className={`text-2xl font-bold text-${color}-400`}>{count}</div>
            <div className="text-xs text-slate-400">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterYear}
          onChange={e => setFilterYear(Number(e.target.value))}
          aria-label="Filter holidays by year"
          className="bg-slate-800 border border-slate-700 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1">
          {['All', 'Public', 'Company', 'Optional'].map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`text-xs font-bold px-3 py-2 rounded-xl transition ${filterType === t ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Holiday Calendar Grid */}
      <div className="space-y-4">
        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">
            No holidays found for {filterYear}. Add holidays above.
          </div>
        ) : (
          Object.entries(grouped).map(([monthIdx, monthHolidays]) => (
            <div key={monthIdx} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-700/40 border-b border-slate-700/50">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  {MONTH_NAMES[Number(monthIdx)]} {filterYear}
                </span>
                <span className="ml-2 text-xs text-slate-500">({monthHolidays.length} holiday{monthHolidays.length !== 1 ? 's' : ''})</span>
              </div>
              <div className="divide-y divide-slate-700/30">
                {monthHolidays.map(holiday => (
                  <div key={holiday.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-700/20 transition group">
                    <div className="flex items-center gap-3">
                      <div className="text-center min-w-[3rem]">
                        <div className="text-lg font-bold text-white leading-none">{holiday.date.split('-')[2]}</div>
                        <div className="text-[10px] text-slate-500 uppercase">{MONTH_NAMES[Number(holiday.date.split('-')[1]) - 1]}</div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{holiday.name}</span>
                          {holiday.isRecurring && (
                            <RefreshCw size={11} className="text-slate-400" />
                          )}
                        </div>
                        {holiday.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{holiday.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${typeColors[holiday.type]}`}>
                        {holiday.type}
                      </span>
                      <button onClick={() => openEdit(holiday)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition" aria-label="Edit holiday">
                        <Edit2 size={13} />
                      </button>
                      {confirmDelete === holiday.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => { onDeleteHoliday(holiday.id); setConfirmDelete(null); }}
                            className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition" aria-label="Confirm delete holiday">
                            <Check size={13} />
                          </button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 transition" aria-label="Cancel delete holiday">
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                          <button onClick={() => setConfirmDelete(holiday.id)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition" aria-label="Delete holiday">
                            <Trash2 size={13} />
                          </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4"
            >
              <h3 className="text-base font-bold text-white">
                {editingHoliday ? 'Edit Holiday' : 'Add New Holiday'}
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Holiday Name *</label>
                  <input
                    type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Eid ul Fitr, Independence Day"
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="holiday-date" className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date *</label>
                    <input
                      id="holiday-date" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                    <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as Holiday['type'] }))}
                      aria-label="Holiday type" className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {HOLIDAY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Description</label>
                  <input
                    type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Optional description"
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox" checked={form.isRecurring} onChange={e => setForm(p => ({ ...p, isRecurring: e.target.checked }))}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <div>
                    <span className="text-sm text-white font-medium">Recurring annually</span>
                    <p className="text-[10px] text-slate-400">This holiday repeats every year on the same date</p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={!form.name.trim() || !form.date}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  {editingHoliday ? 'Update Holiday' : 'Add Holiday'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
