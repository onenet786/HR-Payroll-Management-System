// Kiosk setup codes and the per-client server address list.
//
// A setup code is "HRK1." + base64url(JSON.stringify({ v: 1, n: clientName, u: [primaryUrl, fallbackUrl?], t: token })),
// issued by the client's own server. The kiosk learns its server addresses from it instead of a baked kiosk.env, and
// keeps working when one address fails. Pure functions only, so they run under `node --test` without Electron.

const SETUP_CODE_PREFIX = 'HRK1.';

function setupCodeError(message) {
  const error = new Error(message);
  error.code = 'SETUP_CODE_INVALID';
  return error;
}

// True for addresses that can only be reached inside the client's own network: localhost, loopback, private IPv4
// (10/8, 172.16/12, 192.168/16, 169.254/16), private/loopback IPv6, single-label names (HEADOFFICE) and
// .local / .lan / .internal / .home.arpa names. Self-hosted servers (e.g. the Windows Server package) run there on
// plain http://, so http is allowed for these and nowhere else.
function isLocalNetworkHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1, 3).map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.includes(':')) return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  if (!host.includes('.')) return true;
  return /\.(local|lan|internal|home\.arpa)$/.test(host);
}

// https:// everywhere; http:// only for local-network addresses (see isLocalNetworkHost).
// Returns the address without a trailing slash, or throws a user-facing error.
function normalizePortalUrl(value, invalidMessage = 'The setup code contains an invalid server address') {
  const text = String(value || '').trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw setupCodeError(invalidMessage);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalNetworkHost(url.hostname))) {
    throw setupCodeError(url.protocol === 'http:'
      ? 'Server address must use https (http is allowed only for local network addresses such as 192.168.x.x)'
      : 'Server address must use https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw setupCodeError(invalidMessage);
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

// A server address typed by the operator in Settings, e.g. "192.168.86.83:8080", "http://localhost:8080" or
// "hr.company.com". Without a scheme, local-network addresses get http:// and everything else https://.
function normalizeServerAddress(value) {
  const text = String(value || '').trim();
  if (!text) throw setupCodeError('Enter the server address');
  let withScheme = text;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let host = '';
    try { host = new URL(`http://${text}`).hostname; } catch { throw setupCodeError('The server address is not valid'); }
    withScheme = `${isLocalNetworkHost(host) ? 'http' : 'https'}://${text}`;
  }
  return normalizePortalUrl(withScheme, 'The server address is not valid');
}

// Returns { clientName, urls, token } or throws an Error whose message can be shown to the operator as is.
function parseSetupCode(text) {
  // Codes arrive by e-mail, WhatsApp or a printed sheet: drop every space and line break the paste picked up.
  const compact = String(text || '').replace(/\s+/g, '');
  if (!compact) throw setupCodeError('Paste the setup code');
  if (!compact.toUpperCase().startsWith(SETUP_CODE_PREFIX.toUpperCase())) {
    throw setupCodeError('This is not a kiosk setup code');
  }
  const body = compact.slice(SETUP_CODE_PREFIX.length);
  // Buffer's base64url decoder silently skips bad characters, so check the alphabet first.
  if (!body || !/^[A-Za-z0-9_-]+={0,2}$/.test(body)) throw setupCodeError('The setup code is damaged');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw setupCodeError('The setup code is damaged');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw setupCodeError('The setup code is damaged');
  if (payload.v !== 1) throw setupCodeError('This setup code is for a newer kiosk version. Update the kiosk app.');
  const urls = Array.isArray(payload.u) ? payload.u : [];
  if (urls.length < 1 || urls.length > 2) throw setupCodeError('The setup code is damaged');
  const normalized = [...new Set(urls.map(normalizePortalUrl))];
  const token = typeof payload.t === 'string' ? payload.t.trim() : '';
  if (!token) throw setupCodeError('The setup code is damaged');
  const clientName = typeof payload.n === 'string' ? payload.n.trim().slice(0, 120) : '';
  return { clientName, urls: normalized, token };
}

// Inverse of parseSetupCode (tests, tools). The server builds its own codes.
function buildSetupCode({ clientName, urls, token }) {
  const json = JSON.stringify({ v: 1, n: clientName, u: urls, t: token });
  return SETUP_CODE_PREFIX + Buffer.from(json, 'utf8').toString('base64url');
}

const trimUrl = value => String(value || '').trim().replace(/\/+$/, '');

// Server addresses for this kiosk, preferred first:
// registration.portalUrls (setup code) → [registration.portalUrl] (older registration files) → [envDefault].
// The address that last answered (in memory, else the one saved in the registration file) is moved to the front.
function orderedPortalUrls(registration, envDefault, preferred) {
  const fromCode = Array.isArray(registration?.portalUrls) ? registration.portalUrls.map(trimUrl).filter(Boolean) : [];
  const saved = trimUrl(registration?.portalUrl);
  const list = [...new Set(fromCode.length ? fromCode : saved ? [saved] : [trimUrl(envDefault)])].filter(Boolean);
  const first = [trimUrl(preferred), saved].find(url => url && list.includes(url));
  return first ? [first, ...list.filter(url => url !== first)] : list;
}

// A failure with no HTTP status (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET, bad address…) means the address
// could not be reached. Any HTTP answer, 4xx or 5xx, came from the server and must not be retried elsewhere.
function isNetworkFailure(error) {
  return !!error && !error.statusCode;
}

// Calls attempt(url) for each address in turn, moving on only after a network-level failure.
// Resolves { url, result } for the address that answered; rejects with the HTTP error (error.portalUrl set) or,
// when no address answered, with the last network error (error.triedUrls lists every address tried).
async function tryPortalUrls(urls, attempt) {
  let lastError = null;
  for (const url of urls) {
    try {
      return { url, result: await attempt(url) };
    } catch (error) {
      if (error && typeof error === 'object') error.portalUrl = url;
      if (!isNetworkFailure(error)) throw error;
      lastError = error;
    }
  }
  const error = lastError || new Error('No server address is configured');
  if (typeof error === 'object') error.triedUrls = [...urls];
  throw error;
}

module.exports = {
  SETUP_CODE_PREFIX,
  parseSetupCode,
  buildSetupCode,
  normalizePortalUrl,
  normalizeServerAddress,
  isLocalNetworkHost,
  orderedPortalUrls,
  isNetworkFailure,
  tryPortalUrls,
};
