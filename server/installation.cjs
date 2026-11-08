// Installation-wide settings managed by the hosting provider (OneNet Provider Console, provider/) or, for a
// self-hosted installation, by the vendor console. All are rows of app_settings:
//
//   licence           { status: 'active'|'suspended', expiresAt, graceDays, autoSuspend, staffLimit, message }
//   domains           { platformUrl, publicUrl, allowedOrigins: [...] }   extra addresses users may open the app at
//   clientDataImport  { enabled }                                       client admins may import legacy data
//
// and one-time kiosk setup codes (table kiosk_setup_tokens). Every function takes a pg Pool/Client, so the Provider
// Console can call them against each client's database; nothing here opens a connection by itself.
const crypto = require('node:crypto');

const CACHE_MS = 15_000;
const cache = new Map();

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const isMissingTable = error => error?.code === '42P01';

async function readSetting(db, key) {
  try {
    return (await db.query(`SELECT data FROM app_settings WHERE key=$1`, [key])).rows[0]?.data || null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function cachedSetting(db, key) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;
  const value = await readSetting(db, key);
  cache.set(key, { value, expiresAt: now + CACHE_MS });
  return value;
}

function resetInstallationCache() { cache.clear(); }

async function writeSetting(db, key, data) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'), version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await db.query(
    `INSERT INTO app_settings(key, data, version, updated_at) VALUES($1, $2::jsonb, 1, now())
     ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data, version=app_settings.version+1, updated_at=now()`,
    [key, JSON.stringify(data)],
  );
  cache.delete(key);
}

// ─── Licence ──────────────────────────────────────────────────────────────────

const ymdOrNull = value => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const positiveIntOrNull = value => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);

/** Any stored value as a complete licence. No row means an unlimited, active licence (self-hosted default). */
function normalizeLicence(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    status: source.status === 'suspended' ? 'suspended' : 'active',
    expiresAt: ymdOrNull(source.expiresAt),
    graceDays: Number.isInteger(source.graceDays) && source.graceDays >= 0 ? Math.min(source.graceDays, 90) : 7,
    autoSuspend: source.autoSuspend !== false,
    staffLimit: positiveIntOrNull(source.staffLimit),
    message: typeof source.message === 'string' ? source.message.slice(0, 300) : '',
    plan: typeof source.plan === 'string' ? source.plan.slice(0, 60) : '',
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
    updatedBy: typeof source.updatedBy === 'string' ? source.updatedBy : undefined,
  };
}

/** What the licence means today (Pakistan time): active / expiring (14 days) / grace / suspended. */
function licenceState(licence, now = Date.now()) {
  const today = new Date(now + 5 * 3_600_000).toISOString().slice(0, 10);
  const dayMs = 86_400_000;
  const daysLeft = licence.expiresAt ? Math.round((Date.parse(`${licence.expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / dayMs) : null;
  let state = 'active';
  if (licence.status === 'suspended') state = 'suspended';
  else if (daysLeft !== null && daysLeft < 0) state = licence.autoSuspend && -daysLeft > licence.graceDays ? 'suspended' : 'grace';
  else if (daysLeft !== null && daysLeft <= 14) state = 'expiring';
  return {
    state,
    blocked: state === 'suspended',
    daysLeft,
    expiresAt: licence.expiresAt,
    staffLimit: licence.staffLimit,
    graceDaysLeft: state === 'grace' ? licence.graceDays + daysLeft : null,
    message: licence.message,
  };
}

async function loadLicence(db) { return normalizeLicence(await cachedSetting(db, 'licence')); }
async function saveLicence(db, raw, actor) {
  const licence = normalizeLicence({ ...raw, updatedAt: new Date().toISOString(), updatedBy: actor });
  await writeSetting(db, 'licence', licence);
  return licence;
}

const SUSPENDED_MESSAGE = 'This installation is suspended. Contact your service provider to restore access.';

/** Express middleware: refuses signed-in API use while the licence is suspended. Kiosks keep recording. */
function licenceGate(getDb) {
  return async (req, res, next) => {
    try {
      const state = licenceState(await loadLicence(getDb()));
      if (!state.blocked) return next();
      return res.status(403).json({ error: state.message || SUSPENDED_MESSAGE, licence: state, correlationId: req.correlationId });
    } catch (error) { next(error); }
  };
}

/** Throws a 403 when making one more employee active would pass the licence's staff limit. */
async function assertStaffLimit(db, employeeId, nextStatus, previousStatus) {
  if (nextStatus !== 'Active' || previousStatus === 'Active') return;
  const licence = await loadLicence(db);
  if (!licence.staffLimit) return;
  const active = Number((await db.query(`SELECT count(*)::int AS n FROM employees WHERE COALESCE(data->>'status','Active')='Active' AND id<>$1`, [employeeId])).rows[0].n);
  if (active >= licence.staffLimit) {
    const error = new Error(`Your licence allows ${licence.staffLimit} active employees and ${active} are active. Mark a former employee as left, or ask your service provider to raise the limit.`);
    error.status = 403;
    throw error;
  }
}

// ─── Domains ──────────────────────────────────────────────────────────────────

const originOf = value => {
  try {
    const url = new URL(String(value).trim());
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch { return null; }
};

function normalizeDomains(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const allowedOrigins = [...new Set((Array.isArray(source.allowedOrigins) ? source.allowedOrigins : []).map(originOf).filter(Boolean))].slice(0, 50);
  return { platformUrl: originOf(source.platformUrl) || null, publicUrl: originOf(source.publicUrl) || null, allowedOrigins };
}

async function loadDomains(db) { return normalizeDomains(await cachedSetting(db, 'domains')); }
async function saveDomains(db, raw) { const domains = normalizeDomains(raw); await writeSetting(db, 'domains', domains); return domains; }

/**
 * Keeps an in-memory set of the extra origins (platform, public and custom domains) for the synchronous CORS check in
 * server.cjs, refreshed every 30 seconds so a domain added by the Provider Console works without a restart.
 */
function createOriginRegistry(getDb, intervalMs = 30_000) {
  let origins = new Set();
  const refresh = async () => {
    try {
      cache.delete('domains');
      const domains = await loadDomains(getDb());
      origins = new Set([domains.platformUrl, domains.publicUrl, ...domains.allowedOrigins].filter(Boolean));
    } catch { /* keep the previous set; the database may be starting */ }
  };
  void refresh();
  const timer = setInterval(refresh, intervalMs);
  timer.unref?.();
  return { has: origin => origins.has(String(origin || '').trim().replace(/\/+$/, '').toLowerCase()), refresh, list: () => [...origins] };
}

// ─── Client data import switch ────────────────────────────────────────────────

async function clientDataImportEnabled(db) { return (await cachedSetting(db, 'clientDataImport'))?.enabled === true; }
async function setClientDataImport(db, enabled, actor) {
  await writeSetting(db, 'clientDataImport', { enabled: enabled === true, updatedAt: new Date().toISOString(), updatedBy: actor });
}

// ─── Kiosk setup codes ────────────────────────────────────────────────────────
// HRK1.<base64url JSON {v:1, n: client name, u: [primary url, fallback url?], t: token}>
// The kiosk (windows-kiosk/setup-code.cjs) registers by POST {u[0]}/api/kiosk/register {setupToken, terminalName}.

function encodeSetupCode({ clientName, urls, token }) {
  const u = urls.map(originOf).filter(Boolean).slice(0, 2);
  if (!u.length) throw new Error('A kiosk setup code needs the server address.');
  return `HRK1.${Buffer.from(JSON.stringify({ v: 1, n: String(clientName || '').slice(0, 120), u, t: token })).toString('base64url')}`;
}

/** Mobile app connection code: HRM1.<base64url JSON {v:1, n, u}> (no secret; employees still sign in). */
function encodeMobileCode({ clientName, urls }) {
  const u = urls.map(originOf).filter(Boolean).slice(0, 2);
  return `HRM1.${Buffer.from(JSON.stringify({ v: 1, n: String(clientName || '').slice(0, 120), u })).toString('base64url')}`;
}

/** The Kiosk Terminal service account a setup code registers devices under (created when missing; it cannot sign in to the web). */
async function ensureKioskServiceUser(db) {
  const existing = (await db.query(`SELECT id FROM users WHERE data->>'roleId'='role-kiosk' AND COALESCE(data->>'status','Active')='Active' ORDER BY (id='kiosk-service') DESC, id LIMIT 1`)).rows[0];
  if (existing) return existing.id;
  const user = { id: 'kiosk-service', name: 'Kiosk service account', email: 'kiosk-service@installation.local', roleId: 'role-kiosk', status: 'Active', serviceAccount: true, createdAt: new Date().toISOString() };
  await db.query(`INSERT INTO users(id, employee_id, status, data, version, updated_at) VALUES($1, NULL, 'Active', $2::jsonb, 1, now()) ON CONFLICT (id) DO NOTHING`, [user.id, JSON.stringify(user)]);
  return user.id;
}

async function createKioskSetupToken(db, { label = '', createdBy, expiresInHours = 72, maxUses = 1, clientName, urls }) {
  await db.query(`CREATE TABLE IF NOT EXISTS kiosk_setup_tokens (id UUID PRIMARY KEY, token_hash CHAR(64) NOT NULL UNIQUE, user_id VARCHAR(240) NOT NULL, label TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, max_uses INT NOT NULL DEFAULT 1 CHECK (max_uses > 0), uses INT NOT NULL DEFAULT 0, revoked_at TIMESTAMPTZ)`);
  const userId = await ensureKioskServiceUser(db);
  const token = crypto.randomBytes(24).toString('base64url');
  const id = crypto.randomUUID();
  const hours = Math.min(Math.max(Number(expiresInHours) || 72, 1), 24 * 30);
  const uses = Math.min(Math.max(Number(maxUses) || 1, 1), 100);
  const row = (await db.query(
    `INSERT INTO kiosk_setup_tokens(id, token_hash, user_id, label, created_by, expires_at, max_uses) VALUES($1,$2,$3,$4,$5, now() + ($6 || ' hours')::interval, $7) RETURNING expires_at`,
    [id, sha256(token), userId, String(label).slice(0, 120), String(createdBy || 'unknown').slice(0, 120), String(hours), uses],
  )).rows[0];
  return { id, code: encodeSetupCode({ clientName, urls, token }), expiresAt: row.expires_at, maxUses: uses };
}

/** Uses one registration of a setup token; returns the kiosk service user id, or null when invalid, used up or expired. */
async function consumeKioskSetupToken(db, token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) return null;
  try {
    const row = (await db.query(
      `UPDATE kiosk_setup_tokens SET uses = uses + 1
        WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now() AND uses < max_uses
        RETURNING user_id, label`,
      [sha256(token)],
    )).rows[0];
    return row ? { userId: row.user_id, label: row.label } : null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
}

async function listKioskSetupTokens(db) {
  try {
    return (await db.query(`SELECT id, label, created_by, created_at, expires_at, max_uses, uses, revoked_at FROM kiosk_setup_tokens ORDER BY created_at DESC LIMIT 50`)).rows;
  } catch (error) { if (isMissingTable(error)) return []; throw error; }
}

async function revokeKioskSetupToken(db, id) {
  await db.query(`UPDATE kiosk_setup_tokens SET revoked_at = now() WHERE id=$1 AND revoked_at IS NULL`, [id]);
}

/** The addresses devices should use, in order: the platform subdomain first (stable), then the public/custom domain. */
async function deviceUrls(db, fallbackAppUrl) {
  const domains = await loadDomains(db);
  return [...new Set([domains.platformUrl, originOf(fallbackAppUrl), domains.publicUrl].filter(Boolean))].slice(0, 2);
}

module.exports = {
  normalizeLicence, licenceState, loadLicence, saveLicence, licenceGate, assertStaffLimit, SUSPENDED_MESSAGE,
  normalizeDomains, loadDomains, saveDomains, createOriginRegistry, originOf,
  clientDataImportEnabled, setClientDataImport,
  encodeSetupCode, encodeMobileCode, ensureKioskServiceUser, createKioskSetupToken, consumeKioskSetupToken, listKioskSetupTokens, revokeKioskSetupToken, deviceUrls,
  readSetting, writeSetting, resetInstallationCache,
};
