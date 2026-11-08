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

// https:// only; http:// is accepted for localhost / 127.0.0.1 (any port) so a test server can be used.
// Returns the address without a trailing slash, or throws a user-facing error.
function normalizePortalUrl(value) {
  const text = String(value || '').trim();
  let url;
  try {
    url = new URL(text);
  } catch {
    throw setupCodeError('The setup code contains an invalid server address');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw setupCodeError('Server address must use https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw setupCodeError('The setup code contains an invalid server address');
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
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
  orderedPortalUrls,
  isNetworkFailure,
  tryPortalUrls,
};
