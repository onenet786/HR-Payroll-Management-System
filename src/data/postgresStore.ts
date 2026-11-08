import { apiBase } from './apiBase';
type CollectionRef = { kind: 'collection'; name: string };
type DocumentRef = { kind: 'document'; collection: string; id: string };
type QueryRef = { kind: 'query'; collection: string; filters: Array<{ field: string; op: '=='; value: unknown }> };
type StoreRef = CollectionRef | DocumentRef | QueryRef;
type DeleteSentinel = { readonly __deleteField: true };

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

export async function authenticatedApiRequest(path: string, init: RequestInit = {}) {
  const token = localAuthToken || (import.meta.env.DEV ? 'dev-token' : null);
  if (!token) throw new Error('Authentication required.');
  const response = await fetch(`${apiBase()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401 && typeof window !== 'undefined') {
    setAuthToken(null);
    window.dispatchEvent(new CustomEvent('hr:session-expired'));
  }
  if (!response.ok) throw Object.assign(new Error(body.error || `API request failed (${response.status}).`), { status: response.status });
  return body;
}

async function request(path: string, init: RequestInit = {}) {
  const token = localAuthToken || (import.meta.env.DEV ? 'dev-token' : null);
  if (!token) throw new Error('Authentication required.');

  const response = await fetch(`${apiBase()}/api/documents${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (response.status === 401 && typeof window !== 'undefined') {
    setAuthToken(null);
    window.dispatchEvent(new CustomEvent('hr:session-expired'));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const method = String(init.method || 'GET').toUpperCase();
    if (method !== 'GET' && response.status !== 401 && typeof window !== 'undefined') {
      const what = path.split('/')[1] ? decodeURIComponent(path.split('/')[1]).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() : 'record';
      const message = response.status === 403
        ? `Not saved: your role is not allowed to make this change (${what}), or a rule blocks it (for example a locked month or an approval by the same person). The screen will refresh.`
        : `Not saved (${what}): ${body.error || `server error ${response.status}`}. The screen will refresh.`;
      window.dispatchEvent(new CustomEvent('hr:save-failed', { detail: { message, status: response.status } }));
    }
    throw new Error(body.error || `API request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

const stripDeleted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripDeleted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => !(item as DeleteSentinel)?.__deleteField).map(([key, item]) => [key, stripDeleted(item)]));
};

export const db = {};
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

const FULL_REFRESH_MS = 600_000;

type CollectionRow = { document_id: string; data: Record<string, unknown>; updated_at?: string };
interface CollectionRead { rows: CollectionRow[]; etag: string | null; delta: boolean; count: number | null }

/** Employee lists carry photo links (server/employee-photos.cjs); make them absolute when the API is on another origin. */
function absolutePhotoLinks(rows: CollectionRow[]): CollectionRow[] {
  const base = apiBase();
  if (!base) return rows;
  return rows.map(row => {
    const picture = row.data?.pictureUrl;
    return typeof picture === 'string' && picture.startsWith('/api/employee-photos/') ? { ...row, data: { ...row.data, pictureUrl: `${base}${picture}` } } : row;
  });
}

/**
 * Reads a collection. With an ETag the server answers 304 (null here) when nothing changed; with `since` it sends
 * only rows changed after that time (delta), plus the total row count so the caller can detect deletions.
 */
async function fetchCollection(ref: CollectionRef | QueryRef, options: { etag?: string | null; since?: string | null } = {}): Promise<CollectionRead | null> {
  const token = localAuthToken || (import.meta.env.DEV ? 'dev-token' : null);
  if (!token) throw new Error('Authentication required.');
  const collectionName = ref.kind === 'collection' ? ref.name : ref.collection;
  const employeeFilter = ref.kind === 'query' ? ref.filters.find(filter => filter.field === 'employeeId' && filter.op === '==') : undefined;
  const params = new URLSearchParams();
  if (employeeFilter) params.set('employeeId', String(employeeFilter.value));
  if (options.since) params.set('since', options.since);
  const query = params.toString();
  const response = await fetch(`${apiBase()}/api/documents/${encodeURIComponent(collectionName)}${query ? `?${query}` : ''}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(options.etag ? { 'If-None-Match': options.etag } : {}) },
  });
  if (response.status === 304) return null;
  if (response.status === 401 && typeof window !== 'undefined') {
    setAuthToken(null);
    window.dispatchEvent(new CustomEvent('hr:session-expired'));
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `API request failed (${response.status}).`);
  }
  const result = await response.json();
  const countHeader = response.headers.get('X-Collection-Count');
  return {
    rows: absolutePhotoLinks(result.documents as CollectionRow[]),
    etag: response.headers.get('ETag'),
    delta: response.headers.get('X-Delta') === '1',
    count: countHeader !== null && countHeader !== '' ? Number(countHeader) : null,
  };
}

/**
 * Live collection: the first read loads the working set; after that each poll asks "what changed since the newest
 * row I hold?" (304 when nothing did) and merges the answer, so a kiosk punch costs one row instead of the whole
 * month. When the server's row count differs from what is held after merging (a deletion, or a row that left the
 * window) the collection is reloaded in full; FULL_REFRESH_MS is a further safety net.
 */
export function onSnapshot(ref: StoreRef, success: (snapshot: any) => void, failure?: (error: unknown) => void) {
  let active = true;
  let busy = false;
  let etag: string | null = null;
  let lastFull = 0;
  let rows = new Map<string, CollectionRow>();
  let newest: string | null = null;
  const remember = (list: CollectionRow[]) => { for (const row of list) if (row.updated_at && (!newest || String(row.updated_at) > newest)) newest = String(row.updated_at); };
  const emit = () => {
    let documents = [...rows.values()];
    if (ref.kind === 'query') documents = documents.filter(item => ref.filters.every(filter => item.data[filter.field] === filter.value));
    success(querySnapshot(documents));
  };
  const loadFull = async () => {
    const result = await fetchCollection(ref as CollectionRef | QueryRef);
    if (!active || !result) return;
    rows = new Map(result.rows.map(row => [row.document_id, row]));
    newest = null; remember(result.rows);
    etag = result.etag; lastFull = Date.now();
    emit();
  };
  const refresh = async () => {
    if (!active || busy) return;
    busy = true;
    try {
      if (ref.kind === 'document') { success(await read(ref)); return; }
      if (!etag || lastFull === 0 || Date.now() - lastFull >= FULL_REFRESH_MS) { await loadFull(); return; }
      const result = await fetchCollection(ref, { etag, since: newest });
      if (!active || !result) return;
      if (!result.delta) { rows = new Map(result.rows.map(row => [row.document_id, row])); newest = null; remember(result.rows); etag = result.etag; lastFull = Date.now(); emit(); return; }
      // Merge: changed rows replace theirs; new rows go first (lists are newest-first, e.g. attendance).
      const fresh = result.rows.filter(row => !rows.has(row.document_id));
      for (const row of result.rows) if (rows.has(row.document_id)) rows.set(row.document_id, row);
      if (fresh.length) rows = new Map([...fresh.map(row => [row.document_id, row] as [string, CollectionRow]), ...rows]);
      remember(result.rows);
      etag = result.etag;
      if (result.count !== null && result.count !== rows.size) { await loadFull(); return; }
      if (result.rows.length) emit();
    } catch (error) { failure?.(error); }
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
