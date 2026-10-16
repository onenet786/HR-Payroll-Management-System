import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload, X } from 'lucide-react';
import { authenticatedApiRequest, getAuthToken } from '../data/postgresStore';
import type { Employee } from '../types';

type StoredDocument = { id: string; document_type: string; original_name: string; mime_type: string; byte_size: number; created_at: string };
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const labels: Record<string, string> = { cnic: 'CNIC', contract: 'Contract', 'appointment-letter': 'Appointment letter', certificate: 'Certificate', resume: 'Resume', other: 'Other' };

export function EmployeeDocumentVault({ employee, canManage, onClose }: { employee: Employee; canManage: boolean; onClose: () => void }) {
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [documentType, setDocumentType] = useState('cnic');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const load = async () => {
    setBusy(true);
    try { const data = await authenticatedApiRequest(`/api/employee-documents/employee/${encodeURIComponent(employee.id)}`) as { documents: StoredDocument[] }; setDocuments(data.documents || []); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Documents could not be loaded.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, [employee.id]);
  const upload = async (file?: File) => {
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 10 * 1024 * 1024) { setMessage('Choose a PDF, JPEG, or PNG file no larger than 10 MB.'); return; }
    setBusy(true); setMessage('');
    try {
      await authenticatedApiRequest('/api/employee-documents/upload', { method: 'POST', headers: { 'Content-Type': file.type, 'X-Employee-Id': employee.id, 'X-Document-Type': documentType, 'X-File-Name': file.name }, body: file });
      await load(); setMessage('Document uploaded securely.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed.'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; }
  };
  const download = async (record: StoredDocument) => {
    try {
      const token = getAuthToken(); if (!token) throw new Error('Authentication required.');
      const response = await fetch(`${API_BASE}/api/employee-documents/${encodeURIComponent(record.id)}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Document download failed.');
      const url = URL.createObjectURL(await response.blob()); const link = window.document.createElement('a'); link.href = url; link.download = record.original_name; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Download failed.'); }
  };
  const remove = async (id: string) => { if (!window.confirm('Delete this document permanently?')) return; setBusy(true); try { await authenticatedApiRequest(`/api/employee-documents/${encodeURIComponent(id)}`, { method: 'DELETE' }); await load(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Delete failed.'); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/65 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-bold text-slate-900">Employee Document Vault</h2><p className="text-xs text-slate-500">{employee.fullName} · private, audited server storage</p></div><button onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div><div className="space-y-4 p-5">{canManage && <div className="flex flex-wrap gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><select value={documentType} onChange={event => setDocumentType(event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-2 text-xs">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={event => void upload(event.target.files?.[0])}/><button disabled={busy} onClick={() => inputRef.current?.click()} className="flex items-center gap-1 rounded bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Upload size={14}/>Upload document</button><span className="self-center text-[10px] text-slate-600">PDF, JPEG or PNG · max 10 MB</span></div>}{message && <p className="text-xs font-medium text-amber-700">{message}</p>}<div className="space-y-2">{busy && !documents.length ? <p className="py-6 text-center text-xs text-slate-500">Loading secure documents…</p> : documents.length === 0 ? <p className="py-8 text-center text-xs text-slate-500">No documents uploaded.</p> : documents.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="flex items-center gap-2 truncate text-xs font-bold text-slate-900"><FileText size={15} className="text-emerald-700"/>{item.original_name}</p><p className="mt-1 text-[10px] text-slate-500">{labels[item.document_type] || item.document_type} · {(item.byte_size / 1024).toFixed(0)} KB · {new Date(item.created_at).toLocaleDateString('en-PK')}</p></div><div className="flex gap-1"><button onClick={() => void download(item)} className="rounded p-2 text-emerald-700 hover:bg-emerald-50" title="Download"><Download size={15}/></button>{canManage && <button onClick={() => void remove(item.id)} className="rounded p-2 text-rose-700 hover:bg-rose-50" title="Delete"><Trash2 size={15}/></button>}</div></div>)}</div></div></div></div>;
}
