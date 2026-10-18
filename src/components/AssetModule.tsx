/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DateField } from './DateField';
import { RequiredMark, RequiredNote } from './RequiredMark';
import { Plus, Package, Laptop, Smartphone, Car, Wrench } from 'lucide-react';
import { CompanyAsset, Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import ListSearch from './ListSearch';
import { matchesSearch } from '../data/listSearch';

interface AssetModuleProps {
  assets: CompanyAsset[];
  employees: Employee[];
  canManage: boolean;
  onAddAsset: (asset: CompanyAsset) => void;
  onUpdateAsset: (asset: CompanyAsset) => void;
}

const CATEGORY_ICONS: Record<CompanyAsset['category'], React.ReactNode> = {
  'Laptop': <Laptop size={16} />, 'Mobile': <Smartphone size={16} />, 'SIM Card': <Smartphone size={16} />,
  'Vehicle': <Car size={16} />, 'Furniture': <Package size={16} />, 'Tool': <Wrench size={16} />, 'Other': <Package size={16} />
};
const CATEGORY_COLORS: Record<CompanyAsset['category'], string> = {
  'Laptop': 'blue', 'Mobile': 'indigo', 'SIM Card': 'indigo', 'Vehicle': 'emerald',
  'Furniture': 'amber', 'Tool': 'orange', 'Other': 'slate'
};
const STATUS_COLORS: Record<CompanyAsset['status'], string> = {
  'Available': 'emerald', 'Assigned': 'blue', 'Under Repair': 'amber', 'Retired': 'slate'
};
const CONDITION_COLORS: Record<CompanyAsset['condition'], string> = {
  'New': 'emerald', 'Good': 'blue', 'Fair': 'amber', 'Poor': 'rose'
};
const CATEGORIES: CompanyAsset['category'][] = ['Laptop', 'Mobile', 'SIM Card', 'Vehicle', 'Furniture', 'Tool', 'Other'];
const STATUSES: CompanyAsset['status'][] = ['Available', 'Assigned', 'Under Repair', 'Retired'];
const CONDITIONS: CompanyAsset['condition'][] = ['New', 'Good', 'Fair', 'Poor'];

function PKR(n: number) { return 'PKR ' + n.toLocaleString('en-PK'); }

export function AssetModule({ assets, employees, canManage, onAddAsset, onUpdateAsset }: AssetModuleProps) {
  const [filterCat, setFilterCat] = useState<'All' | CompanyAsset['category']>('All');
  const [filterStatus, setFilterStatus] = useState<'All' | CompanyAsset['status']>('All');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [assignModal, setAssignModal] = useState<CompanyAsset | null>(null);
  const [returnModal, setReturnModal] = useState<CompanyAsset | null>(null);
  const [assignToId, setAssignToId] = useState('');

  const emptyForm: Partial<CompanyAsset> = {
    assetTag: '', name: '', category: 'Laptop', condition: 'Good',
    purchaseDate: new Date().toISOString().split('T')[0], purchaseCost: 0, status: 'Available'
  };
  const [form, setForm] = useState<Partial<CompanyAsset>>(emptyForm);

  const getEmpName = (id?: string) => employees.find(e => e.id === id)?.fullName || '—';

  const filtered = assets
    .filter(a => filterCat === 'All' || a.category === filterCat)
    .filter(a => filterStatus === 'All' || a.status === filterStatus)
    .filter(a => { const holder = employees.find(e => e.id === a.assignedTo); return matchesSearch(search, a.assetTag, a.name, a.serialNumber, a.category, a.status, a.condition, a.notes, holder?.fullName, holder?.employeeCode); });

  const totalValue = assets.reduce((s, a) => s + a.purchaseCost, 0);
  const assignedCount = assets.filter(a => a.status === 'Assigned').length;
  const availableCount = assets.filter(a => a.status === 'Available').length;
  const repairCount = assets.filter(a => a.status === 'Under Repair').length;

  const handleAdd = () => {
    if (!form.assetTag || !form.name) return;
    const asset: CompanyAsset = {
      id: `ast-${Date.now()}`,
      assetTag: form.assetTag!, name: form.name!, category: form.category as CompanyAsset['category'],
      serialNumber: form.serialNumber, purchaseDate: form.purchaseDate!, purchaseCost: form.purchaseCost || 0,
      condition: form.condition as CompanyAsset['condition'], status: 'Available', notes: form.notes
    };
    onAddAsset(asset);
    setShowForm(false);
    setForm(emptyForm);
  };

  const handleAssign = () => {
    if (!assignModal || !assignToId) return;
    onUpdateAsset({ ...assignModal, assignedTo: assignToId, assignedDate: new Date().toISOString().split('T')[0], status: 'Assigned' });
    setAssignModal(null);
    setAssignToId('');
  };

  const handleReturn = () => {
    if (!returnModal) return;
    onUpdateAsset({ ...returnModal, returnDate: new Date().toISOString().split('T')[0], status: 'Available', assignedTo: undefined, assignedDate: undefined });
    setReturnModal(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Asset Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">Track company assets, assignments, and lifecycle status</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
            <Plus size={14} /> Add Asset
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Assets', val: assets.length, sub: PKR(totalValue), color: 'slate' },
          { label: 'Assigned', val: assignedCount, sub: 'In use', color: 'blue' },
          { label: 'Available', val: availableCount, sub: 'Unallocated', color: 'emerald' },
          { label: 'Under Repair', val: repairCount, sub: 'Maintenance', color: 'amber' }
        ].map(({ label, val, sub, color }) => (
          <div key={label} className={`bg-${color}-50 border border-${color}-200 rounded-2xl p-4`}>
            <div className={`text-2xl font-bold text-${color}-700`}>{val}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
            <div className={`text-[10px] text-${color}-700/70 mt-1`}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <ListSearch value={search} onChange={setSearch} placeholder="Search tag, name, serial, holder…" total={assets.length} shown={filtered.length} />
        <div className="flex gap-1 flex-wrap">
          {(['All', ...CATEGORIES] as const).map(c => (
            <button key={c} onClick={() => setFilterCat(c)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition border ${
                filterCat === c ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['All', ...STATUSES] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition border ${
                filterStatus === s ? 'bg-slate-200 text-slate-900 border-slate-500' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Asset Table */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-200">
            <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
              {['Asset Tag', 'Name', 'Category', 'Condition', 'Status', 'Assigned To', 'Date', 'Cost', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-slate-500">{search.trim() ? `No assets match “${search.trim()}”.` : 'No assets found.'}</td></tr>
            ) : filtered.map(asset => {
              const catColor = CATEGORY_COLORS[asset.category];
              const statusColor = STATUS_COLORS[asset.status];
              const condColor = CONDITION_COLORS[asset.condition];
              return (
                <tr key={asset.id} className="hover:bg-slate-100 transition">
                  <td className="px-4 py-3 font-mono text-slate-600 text-[10px]">{asset.assetTag}</td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900 font-medium">{asset.name}</div>
                    {asset.serialNumber && <div className="text-[10px] text-slate-500">{asset.serialNumber}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${catColor}-50 text-${catColor}-700 border border-${catColor}-200`}>
                      {CATEGORY_ICONS[asset.category]} {asset.category}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${condColor}-50 text-${condColor}-700 border border-${condColor}-200`}>
                      {asset.condition}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg bg-${statusColor}-50 text-${statusColor}-700 border border-${statusColor}-200`}>
                      {asset.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{getEmpName(asset.assignedTo)}</td>
                  <td className="px-4 py-3 text-slate-500">{asset.assignedDate || asset.purchaseDate}</td>
                  <td className="px-4 py-3 text-slate-600">{PKR(asset.purchaseCost)}</td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex gap-1">
                        {asset.status === 'Available' && (
                          <button onClick={() => { setAssignModal(asset); setAssignToId(''); }}
                            className="text-[10px] font-bold text-blue-700 hover:text-blue-700 bg-blue-50 hover:bg-blue-500/20 px-2 py-1 rounded-lg transition">Assign</button>
                        )}
                        {asset.status === 'Assigned' && (
                          <button onClick={() => setReturnModal(asset)}
                            className="text-[10px] font-bold text-amber-700 hover:text-amber-700 bg-amber-50 hover:bg-amber-500/20 px-2 py-1 rounded-lg transition">Return</button>
                        )}
                        {asset.status !== 'Retired' && (
                          <button onClick={() => onUpdateAsset({ ...asset, status: asset.status === 'Under Repair' ? 'Available' : 'Under Repair' })}
                            className="text-[10px] font-bold text-slate-500 hover:text-slate-600 bg-slate-100 hover:bg-slate-100 px-2 py-1 rounded-lg transition">
                            {asset.status === 'Under Repair' ? 'Fixed' : 'Repair'}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Asset Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Add New Asset</h3>
              <RequiredNote />
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Asset Tag', field: 'assetTag', placeholder: 'ASSET-LPT-004', required: true },
                  { label: 'Name', field: 'name', placeholder: 'Dell Latitude 5420', required: true },
                  { label: 'Serial Number', field: 'serialNumber', placeholder: 'Optional' },
                  { label: 'Purchase Cost (PKR)', field: 'purchaseCost', placeholder: '150000', type: 'number' }
                ].map(({ label, field, placeholder, type, required }) => (
                  <div key={field}>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{label}{required && <RequiredMark />}</label>
                    <input type={type || 'text'} placeholder={placeholder}
                      aria-label={label} aria-required={required || undefined}
                      value={(form as any)[field] || ''}
                      onChange={e => setForm(p => ({ ...p, [field]: type === 'number' ? Number(e.target.value) : e.target.value }))}
                      className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as CompanyAsset['category'] }))}
                    aria-label="Category"
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Condition</label>
                  <select value={form.condition} onChange={e => setForm(p => ({ ...p, condition: e.target.value as CompanyAsset['condition'] }))}
                    aria-label="Condition"
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none">
                    {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Purchase Date</label>
                  <DateField value={form.purchaseDate || ''}
                    aria-label="Purchase Date"
                    onChange={e => setForm(p => ({ ...p, purchaseDate: e.target.value }))}
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Notes</label>
                  <textarea aria-label="Notes" value={form.notes || ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                    rows={2} placeholder="Any additional notes..."
                    className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setShowForm(false); setForm(emptyForm); }}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleAdd} disabled={!form.assetTag || !form.name}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-bold py-2.5 rounded-xl transition">Add Asset</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assign Modal */}
      <AnimatePresence>
        {assignModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Assign: {assignModal.name}</h3>
              <RequiredNote />
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Assign To Employee<RequiredMark /></label>
                <select value={assignToId} onChange={e => setAssignToId(e.target.value)}
                  aria-label="Assign To Employee" aria-required="true"
                  className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select Employee —</option>
                  {employees.filter(e => e.status === 'Active').map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAssignModal(null)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleAssign} disabled={!assignToId}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold py-2.5 rounded-xl transition">Assign</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Return Modal */}
      <AnimatePresence>
        {returnModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-base font-bold text-slate-900">Return Asset</h3>
              <p className="text-sm text-slate-600">
                Confirm return of <strong className="text-slate-900">{returnModal.name}</strong> from <strong className="text-slate-900">{getEmpName(returnModal.assignedTo)}</strong>?
              </p>
              <p className="text-xs text-slate-500">Status will be updated to "Available" and return date set to today.</p>
              <div className="flex gap-3">
                <button onClick={() => setReturnModal(null)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-900 text-sm font-bold py-2.5 rounded-xl transition">Cancel</button>
                <button onClick={handleReturn}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold py-2.5 rounded-xl transition">Confirm Return</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
