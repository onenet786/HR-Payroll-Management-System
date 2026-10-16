import { authenticatedApiRequest, getAuthToken } from '../data/postgresStore';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const EVIDENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export async function uploadEmployeeDocument(employeeId: string, documentType: string, file: File): Promise<string> {
  if (!EVIDENCE_TYPES.includes(file.type) || file.size > MAX_EVIDENCE_BYTES) throw new Error('Attach a PDF, JPEG or PNG file no larger than 10 MB.');
  const result = await authenticatedApiRequest('/api/employee-documents/upload', {
    method: 'POST', headers: { 'Content-Type': file.type, 'X-Employee-Id': employeeId, 'X-Document-Type': documentType, 'X-File-Name': file.name }, body: file,
  }) as { id: string };
  return result.id;
}

export async function downloadEmployeeDocument(id: string, filename = 'evidence') {
  const token = getAuthToken();
  if (!token) throw new Error('Authentication required.');
  const response = await fetch(`${API_BASE}/api/employee-documents/${encodeURIComponent(id)}/download`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Evidence download failed.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
