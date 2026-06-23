/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Bell, BellOff, Plus, CheckCheck, Trash2, X } from 'lucide-react';
import { AppNotification, Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface NotificationCenterProps {
  notifications: AppNotification[];
  employees: Employee[];
  currentEmployeeId?: string;
  canManage: boolean;
  onAddNotification: (n: AppNotification) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteNotification: (id: string) => void;
}

const TYPE_ICONS: Record<AppNotification['type'], string> = {
  leave_approved: '✅', leave_rejected: '❌', payroll_processed: '💰',
  loan_approved: '🏦', loan_rejected: '🚫', asset_assigned: '💻',
  review_due: '⭐', holiday_reminder: '🎉', system: '🔔'
};
const TYPE_LABELS: Record<AppNotification['type'], string> = {
  leave_approved: 'Leave Approved', leave_rejected: 'Leave Rejected',
  payroll_processed: 'Payroll', loan_approved: 'Loan Approved',
  loan_rejected: 'Loan Rejected', asset_assigned: 'Asset',
  review_due: 'Review Due', holiday_reminder: 'Holiday', system: 'System'
};
const PRIORITY_COLORS: Record<AppNotification['priority'], string> = {
  high: 'rose', medium: 'amber', low: 'slate'
};

const ALL_TYPES: AppNotification['type'][] = [
  'leave_approved', 'leave_rejected', 'payroll_processed', 'loan_approved',
  'loan_rejected', 'asset_assigned', 'review_due', 'holiday_reminder', 'system'
];
const PRIORITIES: AppNotification['priority'][] = ['high', 'medium', 'low'];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationCenter({
  notifications, employees, currentEmployeeId, canManage,
  onAddNotification, onMarkRead, onMarkAllRead, onDeleteNotification
}: NotificationCenterProps) {
  const [filterType, setFilterType] = useState<'All' | AppNotification['type']>('All');
  const [filterPriority, setFilterPriority] = useState<'All' | AppNotification['priority']>('All');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    type: 'system' as AppNotification['type'],
    title: '',
    message: '',
    targetEmployeeId: '',
    priority: 'medium' as AppNotification['priority']
  });

  const isRead = (n: AppNotification) =>
    currentEmployeeId ? n.readBy.includes(currentEmployeeId) : n.readBy.length > 0;

  const visible = notifications
    .filter(n => filterType === 'All' || n.type === filterType)
    .filter(n => filterPriority === 'All' || n.priority === filterPriority)
    .filter(n => !showUnreadOnly || !isRead(n))
    .filter(n => !n.targetEmployeeId || !currentEmployeeId || n.targetEmployeeId === currentEmployeeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const unreadCount = notifications.filter(n =>
    (!n.targetEmployeeId || !currentEmployeeId || n.targetEmployeeId === currentEmployeeId) && !isRead(n)
  ).length;

  const handleSend = () => {
    if (!form.title || !form.message) return;
    const n: AppNotification = {
      id: `notif-${Date.now()}`,
      type: form.type,
      title: form.title,
      message: form.message,
      targetEmployeeId: form.targetEmployeeId || undefined,
      createdAt: new Date().toISOString(),
      readBy: [],
      priority: form.priority
    };
    onAddNotification(n);
    setShowForm(false);
    setForm({ type: 'system', title: '', message: '', targetEmployeeId: '', priority: 'medium' });
  };

  const getEmpName = (id?: string) => id ? (employees.find(e => e.id === id)?.fullName || id) : 'All Employees';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Notification Center</h2>
            <p className="text-xs text-slate-400 mt-0.5">In-app alerts and announcements for employees and administrators</p>
          </div>
          {unreadCount > 0 && (
            <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{unreadCount} unread</span>
          )}
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button onClick={onMarkAllRead}
              className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
              <CheckCheck size={13} /> Mark All Read
            </button>
          )}
          {canManage && (
            <button onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
              <Plus size={14} /> Send Notification
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', val: notifications.length, color: 'slate' },
          { label: 'Unread', val: unreadCount, color: 'rose' },
          { label: 'High Priority', val: notifications.filter(n => n.priority === 'high').length, color: 'amber' },
          { label: 'Broadcasts', val: notifications.filter(n => !n.targetEmployeeId).length, color: 'blue' }
        ].map(({ label, val, color }) => (
          <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-2xl p-4`}>
            <div className={`text-2xl font-bold text-${color}-400`}>{val}</div>
            <div className="text-xs text-slate-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterType('All')}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition border ${filterType === 'All' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>
            All Types
          </button>
          {ALL_TYPES.map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition border ${filterType === t ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>
              {TYPE_ICONS[t]} {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['All', 'high', 'medium', 'low'] as const).map(p => (
            <button key={p} onClick={() => setFilterPriority(p)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition border capitalize ${
                filterPriority === p
                  ? p === 'All' ? 'bg-slate-600 text-white border-slate-500' : `bg-${PRIORITY_COLORS[p as AppNotification['priority']]}-500 text-white border-transparent`
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>
              {p}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showUnreadOnly} onChange={e => setShowUnreadOnly(e.target.checked)}
            className="w-3.5 h-3.5 rounded accent-indigo-500" />
          <span className="text-xs text-slate-400">Unread only</span>
        </label>
      </div>

      {/* Notification Feed */}
      <div className="space-y-2">
        {visible.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm bg-slate-800/20 border border-slate-700/30 rounded-2xl">
            <BellOff size={28} className="mx-auto mb-3 opacity-40" />
            No notifications match the current filter.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map(n => {
              const read = isRead(n);
              const prioColor = PRIORITY_COLORS[n.priority];
              return (
                <motion.div key={n.id} layout
                  initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}
                  className={`flex gap-3 p-4 rounded-2xl border transition cursor-pointer group ${
                    read
                      ? 'bg-slate-800/20 border-slate-700/40 opacity-60 hover:opacity-80'
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                  }`}
                  onClick={() => !read && onMarkRead(n.id)}>
                  <div className="text-2xl flex-shrink-0 mt-0.5">{TYPE_ICONS[n.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{n.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${prioColor}-500/20 text-${prioColor}-300 border border-${prioColor}-500/30`}>
                        {n.priority}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-700 text-slate-400">{TYPE_LABELS[n.type]}</span>
                      {!n.targetEmployeeId && <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300">Broadcast</span>}
                      {!read && <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                      <span>{timeAgo(n.createdAt)}</span>
                      {n.targetEmployeeId && <span>→ {getEmpName(n.targetEmployeeId)}</span>}
                      {n.readBy.length > 0 && <span>{n.readBy.length} read</span>}
                      {!read && <span className="text-indigo-400 cursor-pointer hover:text-indigo-300" onClick={e => { e.stopPropagation(); onMarkRead(n.id); }}>Mark read</span>}
                    </div>
                  </div>
                  {canManage && (
                    <button onClick={e => { e.stopPropagation(); onDeleteNotification(n.id); }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition" aria-label="Delete notification">
                      <Trash2 size={14} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Send Notification Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-white">Send Notification</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white" aria-label="Close notification form"><X size={18} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value as AppNotification['type'] }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                    {ALL_TYPES.map(t => <option key={t} value={t}>{TYPE_ICONS[t]} {TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Priority</label>
                  <div className="flex gap-2">
                    {PRIORITIES.map(p => (
                      <button key={p} type="button" onClick={() => setForm(prev => ({ ...prev, priority: p }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize border transition ${
                          form.priority === p
                            ? `bg-${PRIORITY_COLORS[p]}-600 text-white border-transparent`
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Target (leave blank for broadcast)</label>
                  <select value={form.targetEmployeeId} onChange={e => setForm(p => ({ ...p, targetEmployeeId: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                    <option value="">📢 All Employees (Broadcast)</option>
                    {employees.filter(e => e.status === 'Active').map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Title *</label>
                  <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Notification title..."
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Message *</label>
                  <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                    rows={3} placeholder="Notification message..."
                    className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleSend} disabled={!form.title || !form.message}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition">
                  <Bell size={13} className="inline mr-1" /> Send
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
