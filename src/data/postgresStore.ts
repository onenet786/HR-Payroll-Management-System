type CollectionRef = { kind: 'collection'; name: string };
type DocumentRef = { kind: 'document'; collection: string; id: string };
type QueryRef = { kind: 'query'; collection: string; filters: Array<{ field: string; op: '=='; value: unknown }> };
type StoreRef = CollectionRef | DocumentRef | QueryRef;
type DeleteSentinel = { readonly __deleteField: true };

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const pollMs = Math.max(2000, Number(import.meta.env.VITE_API_POLL_MS || 5000));

let localAuthToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('hr_auth_token') : null;

export function setAuthToken(token: string | null) {
  localAuthToken = token;
  if (token) {
    localStorage.setItem('hr_auth_token', token);
  } else {
    localStorage.removeItem('hr_auth_token');
  }
}

export function getAuthToken(): string | null {
  return localAuthToken;
}

async function request(path: string, init: RequestInit = {}) {
  const token = localAuthToken || (import.meta.env.DEV ? 'dev-token' : null);
  if (!token) throw new Error('Authentication required.');

  const response = await fetch(`${API_BASE}/api/documents${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `API request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

const stripDeleted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripDeleted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => !(item as DeleteSentinel)?.__deleteField).map(([key, item]) => [key, stripDeleted(item)]));
};

export const collection = (_db: unknown, name: string): CollectionRef => ({ kind: 'collection', name });
export const doc = (_db: unknown, collectionName: string, id: string): DocumentRef => ({ kind: 'document', collection: collectionName, id });
export const where = (field: string, op: '==', value: unknown) => ({ field, op, value });
export const query = (source: CollectionRef, ...filters: Array<{ field: string; op: '=='; value: unknown }>): QueryRef => ({ kind: 'query', collection: source.name, filters });
export const deleteField = (): DeleteSentinel => ({ __deleteField: true });

const documentSnapshot = (id: string, data: Record<string, unknown> | undefined) => ({ id, exists: () => Boolean(data), data: () => data });
const querySnapshot = (documents: Array<{ document_id: string; data: Record<string, unknown> }>) => ({
  size: documents.length,
  empty: documents.length === 0,
  docs: documents.map(item => documentSnapshot(item.document_id, item.data)),
  forEach: (callback: (snapshot: ReturnType<typeof documentSnapshot>) => void) => documents.forEach(item => callback(documentSnapshot(item.document_id, item.data))),
});

async function read(ref: StoreRef) {
  if (ref.kind === 'document') {
    try { const result = await request(`/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`); return documentSnapshot(ref.id, result.data); }
    catch (error) { if ((error as Error).message === 'Resource not found.') return documentSnapshot(ref.id, undefined); throw error; }
  }
  const collectionName = ref.kind === 'collection' ? ref.name : ref.collection;
  const employeeFilter = ref.kind === 'query' ? ref.filters.find(filter => filter.field === 'employeeId' && filter.op === '==') : undefined;
  const suffix = employeeFilter ? `?employeeId=${encodeURIComponent(String(employeeFilter.value))}` : '';
  const result = await request(`/${encodeURIComponent(collectionName)}${suffix}`);
  let documents = result.documents as Array<{ document_id: string; data: Record<string, unknown> }>;
  if (ref.kind === 'query') documents = documents.filter(item => ref.filters.every(filter => item.data[filter.field] === filter.value));
  return querySnapshot(documents);
}

export const getDoc = (ref: DocumentRef) => read(ref) as Promise<ReturnType<typeof documentSnapshot>>;
export const getDocs = (ref: CollectionRef | QueryRef) => read(ref) as Promise<ReturnType<typeof querySnapshot>>;

export async function setDoc<T extends object>(ref: DocumentRef, value: T, options?: { merge?: boolean }) {
  let next: object = value;
  if (options?.merge) {
    const current = await getDoc(ref);
    next = { ...(current.data() || {}), ...value };
  }
  await request(`/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`, { method: 'PUT', body: JSON.stringify(stripDeleted(next)) });
}

export async function updateDoc<T extends object>(ref: DocumentRef, value: T) {
  const current = await getDoc(ref);
  if (!current.exists()) throw new Error('Resource not found.');
  await setDoc(ref, { ...(current.data() || {}), ...value });
}

export async function deleteDoc(ref: DocumentRef) {
  await request(`/${encodeURIComponent(ref.collection)}/${encodeURIComponent(ref.id)}`, { method: 'DELETE' });
}

export function onSnapshot(ref: StoreRef, success: (snapshot: any) => void, failure?: (error: unknown) => void) {
  let active = true;
  let busy = false;
  const refresh = async () => {
    if (!active || busy) return;
    busy = true;
    try { success(await read(ref)); } catch (error) { failure?.(error); }
    finally { busy = false; }
  };
  void refresh();
  const timer = window.setInterval(refresh, pollMs);
  return () => { active = false; window.clearInterval(timer); };
}

export function writeBatch(_db: unknown) {
  const operations: Array<() => Promise<void>> = [];
  return {
    set: <T extends object>(ref: DocumentRef, value: T, options?: { merge?: boolean }) => operations.push(() => setDoc(ref, value, options)),
    delete: (ref: DocumentRef) => operations.push(() => deleteDoc(ref)),
    commit: async () => { for (const operation of operations) await operation(); },
  };
}
