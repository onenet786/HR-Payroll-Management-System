// Calls to the Provider Console API (same origin, session cookie). Changes carry the console header the server
// requires against cross-site requests.
export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) { super(message); }
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: init.method || 'GET',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'provider-console' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me') window.dispatchEvent(new CustomEvent('provider:signed-out'));
  if (!response.ok) throw new ApiError(body.error || `Request failed (${response.status}).`, response.status, body);
  return body as T;
}

export const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtBytes = (value?: number | null) => (value == null ? '—' : value > 1e9 ? `${(value / 1e9).toFixed(1)} GB` : value > 1e6 ? `${(value / 1e6).toFixed(1)} MB` : `${Math.round(value / 1e3)} KB`);
export const ago = (value?: string | null) => {
  if (!value) return 'never';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
};
