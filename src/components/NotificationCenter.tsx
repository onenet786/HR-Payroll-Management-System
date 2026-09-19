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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Notification Center</h2>
            <p className="text-xs text-slate-500 mt-0.5">In-app alerts and announcements for employees and administrators</p>
          </div>
          {unreadCount > 0 && (
            <span className="bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex gap-2.5">
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs text-xs font-bold px-3.5 py-2 rounded-xl transition"
            >
              <CheckCheck size={14} className="text-slate-500" /> Mark All Read
            </button>
          )}
          {canManage && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition"
            >
              <Plus size={15} /> Send Notification
            </button>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 shadow-2xs rounded-xl p-4.5">
          <div className="text-2xl font-black text-slate-900">{notifications.length}</div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Total</div>
        </div>

        <div className="bg-white border border-rose-200/80 shadow-2xs rounded-xl p-4.5">
          <div className="text-2xl font-black text-rose-600">{unreadCount}</div>
          <div className="text-xs font-semibold text-rose-700/80 uppercase tracking-wider mt-1">Unread</div>
        </div>

        <div className="bg-white border border-amber-200/80 shadow-2xs rounded-xl p-4.5">
          <div className="text-2xl font-black text-amber-600">
            {notifications.filter(n => n.priority === 'high').length}
          </div>
          <div className="text-xs font-semibold text-amber-700/80 uppercase tracking-wider mt-1">High Priority</div>
        </div>

        <div className="bg-white border border-indigo-200/80 shadow-2xs rounded-xl p-4.5">
          <div className="text-2xl font-black text-indigo-600">
            {notifications.filter(n => !n.targetEmployeeId).length}
          </div>
          <div className="text-xs font-semibold text-indigo-700/80 uppercase tracking-wider mt-1">Broadcasts</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 shadow-2xs rounded-xl p-3.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterType('All')}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition border ${
              filterType === 'All'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            All Types
          </button>
          {ALL_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition border flex items-center gap-1.5 ${
                filterType === t
                  ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <span>{TYPE_ICONS[t]}</span>
              <span>{TYPE_LABELS[t]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            {(['All', 'high', 'medium', 'low'] as const).map(p => {
              const active = filterPriority === p;
              let activeColor = 'bg-white text-slate-900 shadow-2xs font-bold';
              if (active && p === 'high') activeColor = 'bg-rose-600 text-white shadow-2xs font-bold';
              if (active && p === 'medium') activeColor = 'bg-amber-500 text-white shadow-2xs font-bold';
              if (active && p === 'low') activeColor = 'bg-slate-700 text-white shadow-2xs font-bold';

              return (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition capitalize ${
                    active ? activeColor : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none pl-2 border-l border-slate-200">
            <input
              type="checkbox"
              checked={showUnreadOnly}
              onChange={e => setShowUnreadOnly(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
            />
            <span className="text-xs font-semibold text-slate-700">Unread only</span>
          </label>
        </div>
      </div>

      {/* Notification Feed */}
      <div className="space-y-2.5">
        {visible.length === 0 ? (
          <div className="text-center py-14 bg-white border border-slate-200 rounded-2xl shadow-2xs">
            <BellOff size={32} className="mx-auto mb-3 text-slate-400" />
            <p className="text-slate-600 font-semibold text-sm">No notifications found</p>
            <p className="text-slate-400 text-xs mt-1">There are no notifications matching your current filters.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {visible.map(n => {
              const read = isRead(n);

              let prioClass = 'bg-slate-100 text-slate-700 border-slate-200';
              if (n.priority === 'high') prioClass = 'bg-rose-100 text-rose-800 border-rose-200';
              if (n.priority === 'medium') prioClass = 'bg-amber-100 text-amber-800 border-amber-200';

              return (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`flex gap-3.5 p-4 rounded-xl border transition cursor-pointer group ${
                    read
                      ? 'bg-slate-50/70 border-slate-200 hover:bg-white hover:shadow-2xs opacity-90'
                      : 'bg-white border-l-4 border-l-emerald-600 border-t border-r border-b border-slate-200 shadow-2xs hover:shadow-sm'
                  }`}
                  onClick={() => !read && onMarkRead(n.id)}
                >
                  <div className="text-2xl flex-shrink-0 mt-0.5 select-none">{TYPE_ICONS[n.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">{n.title}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border uppercase tracking-wider ${prioClass}`}>
                        {n.priority}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {TYPE_LABELS[n.type]}
                      </span>
                      {!n.targetEmployeeId && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Broadcast
                        </span>
                      )}
                      {!read && <span className="w-2 h-2 rounded-full bg-emerald-600 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-slate-700 mt-1.5 leading-relaxed font-normal">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                      <span>{timeAgo(n.createdAt)}</span>
                      {n.targetEmployeeId && (
                        <span className="text-slate-600 font-medium">→ {getEmpName(n.targetEmployeeId)}</span>
                      )}
                      {n.readBy.length > 0 && <span>{n.readBy.length} read</span>}
                      {!read && (
                        <button
                          type="button"
                          className="text-emerald-700 hover:text-emerald-900 hover:underline font-bold cursor-pointer"
                          onClick={e => {
                            e.stopPropagation();
                            onMarkRead(n.id);
                          }}
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteNotification(n.id);
                      }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition"
                      aria-label="Delete notification"
                      title="Delete notification"
                    >
                      <Trash2 size={15} />
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white border border-slate-200 shadow-2xl rounded-2xl w-full max-w-md p-6 space-y-4 text-slate-900"
            >
              <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Send Notification</h3>
                <button
                  onClick={() => setShowForm(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
                  aria-label="Close notification form"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label htmlFor="notif-type" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Type
                  </label>
                  <select
                    id="notif-type"
                    value={form.type}
                    onChange={e => setForm(p => ({ ...p, type: e.target.value as AppNotification['type'] }))}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
                  >
                    {ALL_TYPES.map(t => (
                      <option key={t} value={t}>
                        {TYPE_ICONS[t]} {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Priority
                  </label>
                  <div className="flex gap-2">
                    {PRIORITIES.map(p => {
                      const active = form.priority === p;
                      let activeStyle = 'bg-slate-800 text-white border-transparent';
                      if (active && p === 'high') activeStyle = 'bg-rose-600 text-white border-transparent';
                      if (active && p === 'medium') activeStyle = 'bg-amber-500 text-white border-transparent';
                      if (active && p === 'low') activeStyle = 'bg-slate-700 text-white border-transparent';

                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, priority: p }))}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize border transition ${
                            active
                              ? activeStyle
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="notif-target" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Target (leave blank for broadcast)
                  </label>
                  <select
                    id="notif-target"
                    value={form.targetEmployeeId}
                    onChange={e => setForm(p => ({ ...p, targetEmployeeId: e.target.value }))}
                    className="w-full bg-white border border-slate-300 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
                  >
                    <option value="">📢 All Employees (Broadcast)</option>
                    {employees
                      .filter(e => e.status === 'Active')
                      .map(e => (
                        <option key={e.id} value={e.id}>
                          {e.fullName}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="notif-title" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Title *
                  </label>
                  <input
                    id="notif-title"
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Notification title..."
                    className="w-full bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
                  />
                </div>

                <div>
                  <label htmlFor="notif-message" className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Message *
                  </label>
                  <textarea
                    id="notif-message"
                    value={form.message}
                    onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                    rows={3}
                    placeholder="Notification message..."
                    className="w-full bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold py-2.5 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!form.title || !form.message}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
                >
                  <Bell size={14} /> Send
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
