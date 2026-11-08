// The server the app talks to.
//
// In a browser the app is served by its own server, so API calls are relative ('' base) unless a build sets
// VITE_API_BASE_URL. The Android app (Capacitor) is one build for every client: on first launch the employee enters
// the company's connection code (HRM1.…, from the Provider Console or the company's IT) and the chosen server is
// stored on the phone. See ConnectServerScreen.
const STORAGE_KEY = 'hr_server_urls';

type CapacitorWindow = Window & { Capacitor?: { isNativePlatform?: () => boolean } };

/** True inside the Android/iOS shell (not in a normal browser). */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as CapacitorWindow).Capacitor;
  if (capacitor?.isNativePlatform?.()) return true;
  return window.location.protocol === 'capacitor:';
}

const clean = (value: string) => value.trim().replace(/\/+$/, '');

function storedUrls(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && /^https?:\/\//.test(item)).map(clean) : [];
  } catch { return []; }
}

/** Base URL for API calls ('' = same server that served the page). */
export function apiBase(): string {
  if (isNativeApp()) {
    const [first] = storedUrls();
    if (first) return first;
  }
  return clean(import.meta.env.VITE_API_BASE_URL || '');
}

/** True when the phone app has no company server yet and must show the connect screen. */
export function needsServerConnection(): boolean {
  return isNativeApp() && storedUrls().length === 0 && !import.meta.env.VITE_API_BASE_URL;
}

export interface ConnectionCode { clientName: string; urls: string[] }

/**
 * Reads a company connection code: HRM1.<base64url JSON {v:1, n, u:[urls]}>, or a plain address such as
 * "client.binishaqsoft.com" / "https://hr.client.com".
 */
export function parseConnectionCode(input: string): ConnectionCode {
  const text = input.replace(/\s+/g, '');
  if (!text) throw new Error('Enter the connection code or company address.');
  if (/^HRM1\./i.test(text)) {
    let payload: { v?: number; n?: string; u?: unknown };
    try {
      const base64 = text.slice(5).replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(decodeURIComponent(escape(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)))));
    } catch { throw new Error('The connection code is damaged. Copy it again.'); }
    const urls = (Array.isArray(payload.u) ? payload.u : []).filter((url): url is string => typeof url === 'string').map(clean).filter(url => /^https:\/\//.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url));
    if (!urls.length) throw new Error('The connection code has no valid server address.');
    return { clientName: String(payload.n || ''), urls: urls.slice(0, 2) };
  }
  if (/^HRK1\./i.test(text)) throw new Error('This is a kiosk setup code. Use the company connection code for the mobile app.');
  const address = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try { url = new URL(address); } catch { throw new Error('This is not a valid company address.'); }
  if (url.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) throw new Error('The company address must use https.');
  return { clientName: url.hostname, urls: [clean(`${url.protocol}//${url.host}`)] };
}

export function saveServerConnection(code: ConnectionCode) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(code.urls));
  localStorage.setItem('hr_server_name', code.clientName);
}

export function clearServerConnection() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('hr_server_name');
}

export function connectedServerName(): string {
  try { return localStorage.getItem('hr_server_name') || ''; } catch { return ''; }
}

/** Switches the phone app to the fallback address after the first one fails (called on network errors). */
export function rotateServerUrl(): boolean {
  const urls = storedUrls();
  if (!isNativeApp() || urls.length < 2) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...urls.slice(1), urls[0]]));
  return true;
}
