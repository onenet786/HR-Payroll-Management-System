// Product edition (feature profile) of this installation.
//
// A small shop with 10-15 staff does not need FBR withholding, EOBI, social security or maker-checker
// approvals: the "lite" edition switches those off so payroll and attendance stay minimal. The edition is
// chosen by the vendor (OneNet) from the login screen with the rotating console password and is stored
// server-side, so every browser, kiosk and phone sees the same profile. The default is the full edition,
// which keeps every existing rule exactly as it was.
//
// src/data/edition.ts mirrors EDITION_FEATURE_KEYS and EDITION_PRESETS; src/data/edition.test.ts checks both stay equal.
const crypto = require('node:crypto');
const express = require('express');

const EDITION_FEATURE_KEYS = Object.freeze([
  'incomeTax', 'eobi', 'socialSecurity', 'providentFund', 'gratuity',
  'bankPayroll', 'makerChecker', 'requireEmployeeEmail',
  'recruitment', 'performance', 'assets', 'loans', 'salaryRevisions', 'parallelRun', 'goLiveChecklist',
]);

const EDITION_PRESETS = Object.freeze({
  full: Object.freeze(Object.fromEntries(EDITION_FEATURE_KEYS.map(key => [key, true]))),
  lite: Object.freeze({
    incomeTax: false, eobi: false, socialSecurity: false, providentFund: false, gratuity: false,
    bankPayroll: false, makerChecker: false, requireEmployeeEmail: false,
    recruitment: false, performance: false, assets: false, loans: true, salaryRevisions: true, parallelRun: false, goLiveChecklist: false,
  }),
});

const EDITION_LABELS = Object.freeze({ full: 'Full compliance edition', lite: 'Lite edition (small business)' });

/** Any stored or submitted value becomes a complete, valid edition; unknown input means the full edition. */
function normalizeEdition(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const id = source.id === 'lite' ? 'lite' : 'full';
  const features = { ...EDITION_PRESETS[id] };
  const overrides = source.features && typeof source.features === 'object' ? source.features : {};
  for (const key of EDITION_FEATURE_KEYS) if (typeof overrides[key] === 'boolean') features[key] = overrides[key];
  const edition = { id, label: EDITION_LABELS[id], features };
  if (typeof source.note === 'string' && source.note.trim()) edition.note = source.note.trim().slice(0, 500);
  if (typeof source.updatedAt === 'string') edition.updatedAt = source.updatedAt;
  if (typeof source.updatedBy === 'string') edition.updatedBy = source.updatedBy;
  return edition;
}

const FULL_EDITION = Object.freeze(normalizeEdition({ id: 'full' }));

// ─── Storage ──────────────────────────────────────────────────────────────────
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

let cache = { edition: null, expiresAt: 0 };
const CACHE_MS = 5000;

/** The edition in force. Works with the pool or a transaction client; a missing table means the full edition. */
async function loadEdition(queryable) {
  const now = Date.now();
  if (cache.edition && cache.expiresAt > now) return cache.edition;
  const db = queryable || require('./db.cjs').pool;
  let edition = FULL_EDITION;
  try {
    const result = await db.query(`SELECT data FROM app_settings WHERE key='edition'`);
    if (result.rows[0]?.data) edition = normalizeEdition(result.rows[0].data);
  } catch (error) {
    if (error?.code !== '42P01') throw error; // 42P01: table does not exist yet (migration 023 not applied)
  }
  cache = { edition, expiresAt: now + CACHE_MS };
  return edition;
}

function resetEditionCache() { cache = { edition: null, expiresAt: 0 }; }

async function saveEdition(queryable, raw, actor, request = {}) {
  const db = queryable || require('./db.cjs').pool;
  const edition = normalizeEdition({ ...raw, updatedAt: new Date().toISOString(), updatedBy: actor });
  await db.query(CREATE_TABLE_SQL);
  const previous = (await db.query(`SELECT data, version FROM app_settings WHERE key='edition'`)).rows[0];
  const version = previous ? Number(previous.version) + 1 : 1;
  await db.query(
    `INSERT INTO app_settings(key, data, version, updated_at) VALUES('edition', $1::jsonb, $2, now())
     ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data, version=EXCLUDED.version, updated_at=now()`,
    [JSON.stringify(edition), version],
  );
  await db.query(
    `INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,previous_version,new_version,previous_data,new_data,correlation_id,source_ip)
     VALUES($1,'vendor',$2,'appSettings','edition',$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
    [actor, previous ? 'update' : 'create', previous?.version || null, version, previous ? JSON.stringify(previous.data) : null, JSON.stringify(edition), request.correlationId || null, request.ip || null],
  ).catch(() => undefined); // the audit row must never block the edition change
  resetEditionCache();
  return edition;
}

// ─── Vendor console credentials ───────────────────────────────────────────────
// Login "onenet" with password OneNet + DDMonYYYY (for example OneNet19Oct2026) opens the edition console.
// The password rotates daily on Pakistan time; the day before and after are accepted for clock drift.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KARACHI_OFFSET_MS = 5 * 3_600_000;
const vendorLogin = () => String(process.env.VENDOR_LOGIN || 'onenet').trim().toLowerCase();
const vendorPrefix = () => String(process.env.VENDOR_PASSWORD_PREFIX || 'OneNet');

function vendorPasswordFor(now = Date.now(), dayOffset = 0) {
  const date = new Date(now + KARACHI_OFFSET_MS + dayOffset * 86_400_000);
  return `${vendorPrefix()}${String(date.getUTCDate()).padStart(2, '0')}${MONTHS[date.getUTCMonth()]}${date.getUTCFullYear()}`;
}

const sameSecret = (given, expected) => {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

function vendorConsoleEnabled() { return process.env.VENDOR_CONSOLE_DISABLED !== 'true'; }

/** True only for the vendor login name with today's (+/-1 day) console password. */
function vendorCredentialsValid(login, password, now = Date.now()) {
  if (!vendorConsoleEnabled()) return false;
  if (String(login || '').trim().toLowerCase() !== vendorLogin()) return false;
  // Every candidate is compared so timing does not reveal which day matched.
  return [-1, 0, 1].map(offset => sameSecret(password, vendorPasswordFor(now, offset))).some(Boolean);
}

const VENDOR_TOKEN_TTL_MS = 30 * 60_000;
const vendorTokens = new Map();
function issueVendorToken(now = Date.now()) {
  for (const [token, expiresAt] of vendorTokens) if (expiresAt <= now) vendorTokens.delete(token);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + VENDOR_TOKEN_TTL_MS;
  vendorTokens.set(token, expiresAt);
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}
function vendorTokenValid(token, now = Date.now()) {
  const expiresAt = vendorTokens.get(String(token || ''));
  return Boolean(expiresAt && expiresAt > now);
}

function vendorAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!vendorConsoleEnabled() || !vendorTokenValid(token)) {
    return res.status(401).json({ error: 'Vendor console session expired. Sign in again with the current console password.', correlationId: req.correlationId });
  }
  next();
}

// The console only reads and writes the edition; it never touches payroll, employee or user data.
const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { login, email, password } = req.body || {};
    if (!vendorCredentialsValid(login || email, password)) return res.status(401).json({ error: 'Invalid vendor console credentials.', correlationId: req.correlationId });
    const session = issueVendorToken();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ vendorConsole: true, vendorToken: session.token, expiresAt: session.expiresAt, edition: await loadEdition(), presets: EDITION_PRESETS });
  } catch (error) { next(error); }
});

router.get('/edition', vendorAuth, async (_req, res, next) => {
  try {
    resetEditionCache();
    res.setHeader('Cache-Control', 'no-store');
    res.json({ edition: await loadEdition(), presets: EDITION_PRESETS });
  } catch (error) { next(error); }
});

router.put('/edition', vendorAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    if (body.id !== 'full' && body.id !== 'lite') return res.status(400).json({ error: 'Edition must be "full" or "lite".', correlationId: req.correlationId });
    const unknown = Object.keys(body.features || {}).filter(key => !EDITION_FEATURE_KEYS.includes(key));
    if (unknown.length) return res.status(400).json({ error: `Unknown feature(s): ${unknown.join(', ')}.`, correlationId: req.correlationId });
    const edition = await saveEdition(null, body, `vendor:${vendorLogin()}`, req);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ edition });
  } catch (error) { next(error); }
});

module.exports = {
  EDITION_FEATURE_KEYS, EDITION_PRESETS, EDITION_LABELS, FULL_EDITION,
  normalizeEdition, loadEdition, saveEdition, resetEditionCache,
  vendorPasswordFor, vendorCredentialsValid, vendorConsoleEnabled, issueVendorToken, vendorTokenValid, vendorAuth,
  router,
};
