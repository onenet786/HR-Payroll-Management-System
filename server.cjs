const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const rawAllowedOrigins = [
  process.env.ALLOWED_ORIGIN,
  process.env.ALLOWED_ORIGINS,
  process.env.APP_URL,
]
  .filter(Boolean)
  .flatMap(val => String(val).split(/[,;\s]+/))
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const appUrl = process.env.APP_URL?.trim();
if (isProduction && (rawAllowedOrigins.length === 0 || !appUrl || /replace-with/i.test(`${rawAllowedOrigins.join('')}${appUrl}`))) {
  throw new Error('Production startup refused: APP_URL and ALLOWED_ORIGIN must be configured.');
}
if (isProduction && process.env.DEBUG === 'true') {
  throw new Error('Production startup refused: DEBUG must be false.');
}

// Extra addresses (platform subdomain, custom domains) added by the Provider Console are read from the database
// every 30 seconds (server/installation.cjs), so a new domain works without editing .env or restarting.
let originRegistry = null;

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (!isProduction) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (origin === 'file://' || origin === 'null' || origin.startsWith('app://') || origin.startsWith('vscode-webview://')) return true;

  const normalized = origin.trim().replace(/\/+$/, '').toLowerCase();
  if (originRegistry?.has(normalized)) return true;
  for (const allowed of rawAllowedOrigins) {
    const cleanAllowed = allowed.toLowerCase();
    if (cleanAllowed === normalized) return true;
    if (cleanAllowed.includes('*')) {
      const pattern = new RegExp('^' + cleanAllowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
      if (pattern.test(normalized)) return true;
    }
  }

  // Automatic apex/subdomain pairing: if mcs.binishaqsoft.com or attendance.binishaqsoft.com are in same apex domain
  try {
    const originUrl = new URL(normalized);
    for (const allowed of rawAllowedOrigins) {
      try {
        const allowedUrl = new URL(allowed.replace(/\*/g, 'wildcard'));
        const allowedParts = allowedUrl.hostname.split('.');
        if (allowedParts.length >= 2) {
          const rootDomain = allowedParts.slice(-2).join('.');
          if (originUrl.hostname === rootDomain || originUrl.hostname.endsWith('.' + rootDomain)) {
            return true;
          }
        }
      } catch {
        // ignore malformed allowed URLs
      }
    }
  } catch {
    // ignore malformed origin
  }

  return false;
}

// Dynamic Company Identity Branding Provider - directly queries PostgreSQL System of Record
let cachedBranding = { name: null, subtitle: null, expiresAt: 0 };

async function getActiveBranding() {
  const now = Date.now();
  if (cachedBranding.name && cachedBranding.expiresAt > now) {
    return cachedBranding;
  }
  let companyName = null;
  let companySubtitle = null;

  // 1. Query PostgreSQL companies table for saved company identity (prioritize official legalName)
  try {
    const { pool } = require('./server/db.cjs');
    const compResult = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(data->>'legalName'), ''), NULLIF(TRIM(data->>'tradingName'), ''), NULLIF(TRIM(data->>'name'), ''), name) AS comp_name 
       FROM companies 
       WHERE data IS NOT NULL 
       ORDER BY updated_at DESC, id ASC 
       LIMIT 1`
    );
    if (compResult.rows[0]?.comp_name) {
      companyName = String(compResult.rows[0].comp_name).trim();
    }
  } catch {
    try {
      const { pool } = require('./server/db.cjs');
      const compResult = await pool.query(
        `SELECT COALESCE(NULLIF(TRIM(data->>'legalName'), ''), NULLIF(TRIM(data->>'tradingName'), ''), NULLIF(TRIM(data->>'name'), '')) AS comp_name 
         FROM hr_documents 
         WHERE collection_name = 'companies' 
         LIMIT 1`
      );
      if (compResult.rows[0]?.comp_name) {
        companyName = String(compResult.rows[0].comp_name).trim();
      }
    } catch {}
  }

  // 2. Default fallback if database has no company record yet
  if (!companyName) {
    companyName = 'OneNet Solutions Pk.';
  }

  companySubtitle = 'Payroll Compliance & Attendance Management';
  cachedBranding = { name: companyName, subtitle: companySubtitle, expiresAt: now + 2000 };
  return cachedBranding;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  req.correlationId = crypto.randomUUID();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

const connectSrcHosts = new Set([
  "'self'",
  'https:',
  'wss:',
  'https://mcs.binishaqsoft.com',
  'wss://mcs.binishaqsoft.com',
  'https://attendance.binishaqsoft.com',
  'wss://attendance.binishaqsoft.com',
  'http://localhost:*',
  'http://127.0.0.1:*',
  'https://*.googleapis.com',
  'ws://127.0.0.1:*',
  'ws://localhost:*',
]);

for (const origin of rawAllowedOrigins) {
  if (/^https?:\/\//i.test(origin) && !origin.includes('*')) {
    connectSrcHosts.add(origin);
    try {
      const u = new URL(origin);
      connectSrcHosts.add(`${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`);
    } catch {
      // ignore
    }
  }
}

// A self-hosted installation on a LAN may run on plain http://server:8080 (no certificate yet). Then the browser
// must not be told to upgrade every request to HTTPS (it would fetch https://server:8080 and fail) or to remember
// HSTS. Hosted installations (https APP_URL, or a certificate configured here) keep both.
const servesPlainHttp = !(process.env.HTTPS_PFX_PATH || process.env.HTTPS_CERT_PATH) && /^http:\/\//i.test(String(process.env.APP_URL || ''));

// gzip API and page responses: collections are large JSON (thousands of employees and attendance days) and
// compress 5-10x. Self-hosted installations have no nginx in front to do it.
// Optional: a server updated by copying server.cjs without `npm install` keeps running, only uncompressed.
try { app.use(require('compression')({ threshold: 2048 })); }
catch { console.warn('Response compression is off: run "npm install" to add the compression package.'); }

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      upgradeInsecureRequests: servesPlainHttp ? null : [],
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "'unsafe-eval'", 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: Array.from(connectSrcHosts),

      frameSrc: ["'self'", 'https://accounts.google.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
    },
  },

  frameguard: false,
  hsts: servesPlainHttp ? false : { maxAge: 31536000, includeSubDomains: true },
  crossOriginOpenerPolicy: servesPlainHttp ? false : undefined, // ignored by browsers on plain HTTP anyway
  originAgentCluster: !servesPlainHttp,
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
}));

app.use((req, res, next) => {
  const origin = req.get('origin');
  const allowed = isOriginAllowed(origin);

  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID, X-Requested-With, Accept, Origin');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  if (req.method === 'OPTIONS') {
    if (allowed) {
      return res.sendStatus(204);
    }
    return res.status(403).json({ error: 'Request origin is not allowed.', correlationId: req.correlationId });
  }

  if (allowed) {
    return next();
  }

  return res.status(403).json({ error: 'Request origin is not allowed.', correlationId: req.correlationId });
});


const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many authentication attempts.', correlationId: req.correlationId }),
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many password reset attempts.', correlationId: req.correlationId }),
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: Number(process.env.RATE_LIMIT_MAX || 10000),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests.', correlationId: req.correlationId }),
});


// These guards apply automatically when trusted server-side auth routes are added.
app.use('/api', apiLimiter, express.json({ limit: '2mb', strict: true }));
app.use(['/api/auth/login', '/api/auth/signup', '/api/auth/otp', '/api/auth/setup', '/api/vendor/login'], loginLimiter);
app.use('/api/auth/password-reset', resetLimiter);

if (!process.env.DATA_BACKEND || (process.env.DATA_BACKEND || '').trim().toLowerCase() === 'postgres') {
  const bcrypt = require('bcryptjs');
  const { authenticate } = require('./server/auth.cjs');
  const { createSession, revokeSession } = require('./server/sessions.cjs');
  const { router: mfaRoutes, publicRouter: mfaPublicRoutes, createLoginChallenge } = require('./server/mfa.cjs');
  const documentRoutes = require('./server/documents.cjs');
  const employeeDocumentRoutes = require('./server/employee-documents.cjs');
  const payrollDeliveryRoutes = require('./server/payroll-delivery.cjs');
  const { getTableName } = require('./server/collections.cjs');
  // Product edition (full / lite) chosen by the vendor; see server/edition.cjs.
  const edition = require('./server/edition.cjs');
  // Licence, domains, client data import and kiosk setup codes managed by the provider; see server/installation.cjs.
  const installation = require('./server/installation.cjs');
  const getPool = () => require('./server/db.cjs').pool;
  originRegistry = installation.createOriginRegistry(getPool);
  const licenceGate = installation.licenceGate(getPool);
  app.use('/api/vendor', edition.router);
  // Signed photo links from employee lists (no session: <img> tags cannot send one). See server/employee-photos.cjs.
  app.use('/api/employee-photos', require('./server/employee-photos.cjs').router);
  app.use('/api/documents', authenticate, licenceGate, documentRoutes);
  app.use('/api/reports', authenticate, licenceGate, require('./server/reports.cjs').router);
  app.use('/api/maintenance/database', authenticate, require('./server/db-maintenance.cjs').router);
  app.use('/api/employee-documents', authenticate, licenceGate, employeeDocumentRoutes);
  app.use('/api/payroll-delivery', authenticate, licenceGate, payrollDeliveryRoutes);
  app.use('/api/auth/mfa', mfaPublicRoutes);
  app.use('/api/auth/mfa', authenticate, licenceGate, mfaRoutes);
  // Legacy data import (CyberAP) run by the client's own administrator; see server/legacy-import/routes.cjs.
  app.use('/api/data-import', authenticate, licenceGate, require('./server/legacy-import/routes.cjs').clientRouter);

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { email, password, rememberMe } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }
      // The vendor signs in from the same screen (login "onenet", password OneNet + DDMonYYYY) and gets a
      // console-only token that can change the product edition and nothing else. No user record is involved.
      if (edition.vendorCredentialsValid(email, password)) {
        const session = edition.issueVendorToken();
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ vendorConsole: true, vendorToken: session.token, expiresAt: session.expiresAt, edition: await edition.loadEdition() });
      }
      const { pool } = require('./server/db.cjs');
      const licence = installation.licenceState(await installation.loadLicence(pool));
      if (licence.blocked) return res.status(403).json({ error: licence.message || installation.SUSPENDED_MESSAGE, licence });
      const userSecrets = require('./server/user-secrets.cjs');
      const found = await userSecrets.findLoginUser(pool, email);
      const userDoc = found && { document_id: found.id, data: found.data };
      if (!userDoc) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const user = userDoc.data;
      if (user.status !== 'Active') {
        return res.status(403).json({ error: 'Account is suspended. Contact your administrator.' });
      }

      // Legacy plain-text passwords are compared in constant time and stored hashed from then on.
      const passwordValid = await userSecrets.verifyUserPassword(pool, user, password);

      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (process.env.MFA_ENFORCE_PRIVILEGED === 'true' && !user.mfaEnabled) {
        const role = await pool.query(`SELECT data FROM roles WHERE id=$1`, [user.roleId]);
        const permissions = new Set(role.rows[0]?.data?.permissions || []);
        if (user.roleId === 'role-admin' || permissions.has('manage_payroll') || permissions.has('manage_access')) {
          return res.status(403).json({ error: 'MFA enrollment is required for this privileged account. Choose an authenticator app or email verification.' });
        }
      }

      if (user.mfaEnabled) {
        // A device that completed MFA recently (Remember me) signs in with the password alone.
        const { isTrustedDevice } = require('./server/trusted-devices.cjs');
        if (await isTrustedDevice(req.body?.trustedDeviceToken, userDoc.document_id, user, req)) {
          const token = await createSession(userDoc.document_id, req, rememberMe === true);
          const { passwordHash: _hash, password: _legacy, mfaSecretCipher: _secret, ...trustedUser } = user;
          res.setHeader('Cache-Control', 'no-store');
          return res.json({ token, user: trustedUser, trustedDevice: true });
        }
        const mfaChallenge = await createLoginChallenge(userDoc.document_id);
        res.setHeader('Cache-Control', 'no-store');
        const mfaMethods = user.mfaMethod === 'email' ? ['email'] : user.mfaMethod === 'totp' ? ['totp'] : ['totp', 'email'];
        return res.json({ mfaRequired: true, mfaChallenge, mfaMethods });
      }
      const token = await createSession(userDoc.document_id, req, rememberMe === true);
      const { passwordHash: _, password: _legacyPassword, mfaSecretCipher: _mfaSecret, ...safeUser } = user;
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ token, user: safeUser });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', authenticate, async (req, res, next) => {
    try {
      await revokeSession(req.identity.sessionToken);
      res.setHeader('Cache-Control', 'no-store');
      res.status(204).end();
    } catch (err) { next(err); }
  });

  app.get('/api/auth/session', authenticate, async (req, res, next) => {
    try {
      const { pool } = require('./server/db.cjs');
      const result = await pool.query(`SELECT data FROM users WHERE id=$1`, [req.identity.uid]);
      const user = result.rows[0]?.data;
      if (!user) return res.status(401).json({ error: 'Session user was not found.' });
      const { passwordHash, password, mfaSecretCipher, ...safeUser } = user;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ user: safeUser });
    } catch (err) { next(err); }
  });

  app.get('/api/auth/status', async (_req, res, next) => {
    try {
      const { pool } = require('./server/db.cjs');
      let result;
      try {
        result = await pool.query(`SELECT COUNT(*) FROM users`);
      } catch {
        result = await pool.query(
          `SELECT COUNT(*) FROM hr_documents WHERE collection_name = 'users'`,
        );
      }
      const userCount = Number(result.rows[0]?.count || 0);
      const branding = await getActiveBranding();
      const activeEdition = await edition.loadEdition().catch(() => edition.FULL_EDITION);
      const licence = installation.licenceState(await installation.loadLicence(pool));
      const clientDataImport = await installation.clientDataImportEnabled(pool).catch(() => false);

      return res.json({
        hasUsers: userCount > 0,
        userCount,
        companyName: branding.name,
        companySubtitle: branding.subtitle,
        edition: activeEdition,
        licence: { state: licence.state, daysLeft: licence.daysLeft, expiresAt: licence.expiresAt, graceDaysLeft: licence.graceDaysLeft, staffLimit: licence.staffLimit, message: licence.message },
        clientDataImport,
        managed: process.env.MANAGED_INSTALLATION === 'true',
      });
    } catch (err) {
      next(err);
    }
  });

  // Kiosk terminals authenticate with a per-device key issued by /api/kiosk/register (see server/kiosk.cjs).
  const kiosk = require('./server/kiosk.cjs');
  app.use('/api/kiosk/register', loginLimiter);
  app.use('/api/kiosk', kiosk.router);
  app.use('/api/kiosk-devices', authenticate, kiosk.adminRouter);

  app.post('/api/auth/setup', async (req, res, next) => {
    try {
      // On a hosted installation the provider creates the first administrator; nobody can claim it from the web.
      if (process.env.MANAGED_INSTALLATION === 'true') return res.status(403).json({ error: 'This installation is managed by your service provider, who creates the first administrator account.' });
      const { companyName, adminEmail, adminPassword, adminName } = req.body || {};
      if (!adminEmail || !adminPassword) {
        return res.status(400).json({ error: 'Admin email and password are required.' });
      }

      if (String(adminPassword).length < 12) {
        return res.status(400).json({ error: 'Choose an administrator password of at least 12 characters.' });
      }

      const { pool } = require('./server/db.cjs');
      const cleanEmail = String(adminEmail).trim().toLowerCase();
      const passwordHash = await bcrypt.hash(adminPassword, 10);

      const adminRole = {
        id: 'role-admin',
        name: 'Super Admin',
        permissions: ['view_dashboard', 'manage_settings', 'manage_access', 'manage_employees', 'manage_attendance', 'manage_leaves', 'manage_payroll', 'manage_mobile_duty', 'use_kiosk'],
      };

      const adminUser = {
        id: 'usr-admin',
        username: cleanEmail,
        email: cleanEmail,
        fullName: adminName || 'Super Administrator',
        passwordHash,
        roleId: 'role-admin',
        status: 'Active',
      };

      const company = {
        id: 'c1',
        name: companyName || 'OneNet Solutions',
        status: 'Active',
      };

      const branch = {
        id: 'b1',
        companyId: 'c1',
        name: 'Head Office',
        city: 'Karachi',
        province: 'Sindh',
        status: 'Active',
      };

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // First-time setup only: once any account exists this route must never create or overwrite an admin.
        await client.query(`SELECT pg_advisory_xact_lock(814201)`);
        const existingUsers = await client.query(`SELECT 1 FROM users LIMIT 1`).catch(() => ({ rowCount: 0 }));
        const legacyUsers = await client.query(`SELECT 1 FROM hr_documents WHERE collection_name='users' LIMIT 1`).catch(() => ({ rowCount: 0 }));
        if (existingUsers.rowCount || legacyUsers.rowCount) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This system is already set up. Sign in with an existing account.' });
        }
        try {
          await client.query(
            `INSERT INTO roles(id, name, status, data) VALUES('role-admin', 'Super Admin', 'Active', $1::jsonb) ON CONFLICT DO NOTHING`,
            [JSON.stringify(adminRole)],
          );
          await client.query(
            `INSERT INTO users(id, username, email, role_id, status, data) VALUES('usr-admin', $1, $1, 'role-admin', 'Active', $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, email = EXCLUDED.email`,
            [cleanEmail, JSON.stringify(adminUser)],
          );
          await client.query(
            `INSERT INTO companies(id, name, status, data) VALUES('c1', $1, 'Active', $2::jsonb) ON CONFLICT DO NOTHING`,
            [company.name, JSON.stringify(company)],
          );
          await client.query(
            `INSERT INTO branches(id, company_id, name, city, province, status, data) VALUES('b1', 'c1', 'Head Office', 'Karachi', 'Sindh', 'Active', $1::jsonb) ON CONFLICT DO NOTHING`,
            [JSON.stringify(branch)],
          );
        } catch {
          // fallback if individual tables are not created yet
          await client.query(
            `INSERT INTO hr_documents(collection_name, document_id, data) VALUES('roles', 'role-admin', $1::jsonb) ON CONFLICT DO NOTHING`,
            [JSON.stringify(adminRole)],
          );
          await client.query(
            `INSERT INTO hr_documents(collection_name, document_id, data) VALUES('users', 'usr-admin', $1::jsonb) ON CONFLICT (collection_name, document_id) DO UPDATE SET data = EXCLUDED.data`,
            [JSON.stringify(adminUser)],
          );
          await client.query(
            `INSERT INTO hr_documents(collection_name, document_id, data) VALUES('companies', 'c1', $1::jsonb) ON CONFLICT DO NOTHING`,
            [JSON.stringify(company)],
          );
          await client.query(
            `INSERT INTO hr_documents(collection_name, document_id, data) VALUES('branches', 'b1', $1::jsonb) ON CONFLICT DO NOTHING`,
            [JSON.stringify(branch)],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      const { passwordHash: _, ...safeUser } = adminUser;
      const token = await createSession(adminUser.id, req);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ token, user: safeUser });
    } catch (err) {
      next(err);
    }
  });


  app.get('/api/health', async (_req, res, next) => {
    try {
      const { pool } = require('./server/db.cjs');
      await pool.query('SELECT 1');
      // Public endpoint: confirm availability without describing the stack.
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
}

// Dynamic JS Asset delivery: automatically substitutes legacy static references with active company branding
let jsAssetCache = new Map();

app.get(/^\/assets\/index-.*\.js$/, async (req, res, next) => {
  try {
    const filePath = path.join(__dirname, 'dist', req.path);
    if (!fs.existsSync(filePath)) {
      return next();
    }
    const branding = await getActiveBranding();
    const stat = fs.statSync(filePath);
    const cacheKey = `${filePath}:${stat.mtimeMs}:${branding.name}`;

    let content = jsAssetCache.get(cacheKey);
    if (!content) {
      let raw = fs.readFileSync(filePath, 'utf8');
      if (raw.includes('BIN ISHAQ HR SUITE')) {
        raw = raw.replaceAll('BIN ISHAQ HR SUITE', branding.name);
      }
      if (raw.includes('BIN ISHAQ HR & PAYROLL')) {
        raw = raw.replaceAll('BIN ISHAQ HR & PAYROLL', `${branding.name} HR & PAYROLL`);
      }
      if (raw.includes('BIN ISHAQ')) {
        raw = raw.replaceAll('BIN ISHAQ', branding.name);
      }
      if (raw.includes('Bin Ishaq')) {
        raw = raw.replaceAll('Bin Ishaq', branding.name);
      }
      if (branding.name && branding.name !== 'OneNet Solutions' && raw.includes('OneNet Solutions') && !raw.includes(branding.name)) {
        raw = raw.replaceAll('OneNet Solutions', branding.name);
      }
      content = Buffer.from(raw, 'utf8');
      jsAssetCache.clear();
      jsAssetCache.set(cacheKey, content);
    }

    res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(content);
  } catch (err) {
    next(err);
  }
});

app.use(express.static(path.join(__dirname, 'dist'), { index: false, dotfiles: 'deny' }));

app.get('*', async (_req, res, next) => {
  try {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    const branding = await getActiveBranding();
    if (!fs.existsSync(indexPath)) {
      // The dist folder is being uploaded or was not deployed: staff see a short branded notice, not raw JSON.
      const name = String(branding.name || 'HR & Payroll').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
      res.status(503);
      res.setHeader('Retry-After', '30');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      return res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="30"><title>${name} - System update in progress</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font:15px/1.6 system-ui,Segoe UI,Roboto,sans-serif}
.card{max-width:460px;margin:24px;padding:32px;border:1px solid #1e293b;border-radius:20px;background:#020617;box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center}
.logo{width:56px;height:56px;margin:0 auto 16px;border-radius:16px;background:linear-gradient(135deg,#059669,#22c55e);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:20px}
h1{font-size:20px;margin:0 0 6px;color:#fff}p{margin:0;color:#94a3b8}.k{margin-top:18px;font-size:12px;color:#64748b}</style></head>
<body><div class="card"><div class="logo">HR</div><h1>${name}</h1><p>The HR &amp; Payroll system is being updated and will be back in a few minutes. This page refreshes automatically.</p>
<p class="k">If this notice stays for more than 15 minutes, contact your system administrator.</p></div></body></html>`);
    }
    // The edition is injected so the portal renders the right navigation on first paint (no full-to-lite flash).
    const editionModule = require('./server/edition.cjs');
    const activeEdition = await editionModule.loadEdition().catch(() => editionModule.FULL_EDITION);
    let html = fs.readFileSync(indexPath, 'utf8');
    html = html.replace(/<title>.*?<\/title>/i, `<title>${branding.name} - HR &amp; Payroll Management System</title>`);
    const configScript = `<script>window.__APP_CONFIG__=${JSON.stringify({ companyName: branding.name, companySubtitle: branding.subtitle, edition: activeEdition })};</script>`;
    html = html.replace('</head>', `${configScript}</head>`);
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(html);
  } catch (err) {
    next(err);
  }
});
app.use((req, res) => res.status(404).json({ error: 'Resource not found.', correlationId: req.correlationId }));

app.use((error, req, res, _next) => {
  console.error(`[${req.correlationId}]`, error);
  const status = Number(error.status) >= 400 && Number(error.status) < 500 ? Number(error.status) : 500;
  res.status(status).json({ error: status === 500 ? 'An unexpected error occurred.' : error.message, correlationId: req.correlationId });
});

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

// Optional HTTPS served by the app itself, for a self-hosted Windows Server without a reverse proxy:
//   HTTPS_PFX_PATH (+ HTTPS_PFX_PASSPHRASE)  or  HTTPS_CERT_PATH + HTTPS_KEY_PATH  (PEM, e.g. from win-acme)
//   HTTPS_PORT (default 443); PORT then becomes a plain-HTTP listener that redirects to HTTPS.
// A renewed certificate file is picked up without a restart.
function tlsOptions() {
  const fs = require('node:fs');
  if (process.env.HTTPS_PFX_PATH) return { pfx: fs.readFileSync(process.env.HTTPS_PFX_PATH), passphrase: process.env.HTTPS_PFX_PASSPHRASE || undefined };
  if (process.env.HTTPS_CERT_PATH && process.env.HTTPS_KEY_PATH) return { cert: fs.readFileSync(process.env.HTTPS_CERT_PATH), key: fs.readFileSync(process.env.HTTPS_KEY_PATH) };
  return null;
}

const initialTls = tlsOptions();
const listening = () => {
  // Older builds stored User Management passwords in plain text; hash any that remain.
  if (process.env.DATABASE_URL) {
    const { pool } = require('./server/db.cjs');
    require('./server/default-roles.cjs').ensureDefaultRoles(pool)
      .then(count => { if (count) console.info(`Added ${count} standard role(s).`); })
      .catch(error => console.warn('Standard roles check failed:', error.message));
    require('./server/user-secrets.cjs').hashLegacyPasswords(pool)
      .then(count => { if (count) console.info(`Secured ${count} legacy plain-text password(s).`); })
      .catch(() => undefined);
  }
};

if (initialTls) {
  const https = require('node:https');
  const http = require('node:http');
  const fs = require('node:fs');
  const httpsPort = Number(process.env.HTTPS_PORT || 443);
  const secure = https.createServer(initialTls, app);
  secure.listen(httpsPort, host, () => { console.info(`Production server listening on https://${host}:${httpsPort}.`); listening(); });
  // Certificates renewed on disk (win-acme every ~60 days) are reloaded without dropping connections.
  let reloadTimer = null;
  const reload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      try { secure.setSecureContext(tlsOptions()); console.info('HTTPS certificate reloaded.'); }
      catch (error) { console.error('HTTPS certificate reload failed (keeping the previous one):', error.message); }
    }, 2000);
  };
  for (const file of [process.env.HTTPS_PFX_PATH, process.env.HTTPS_CERT_PATH, process.env.HTTPS_KEY_PATH].filter(Boolean)) fs.watchFile(file, { interval: 60_000 }, reload);
  if (process.env.HTTP_REDIRECT !== 'false') {
    http.createServer((req, res) => {
      const hostHeader = String(req.headers.host || '').replace(/:\d+$/, '');
      res.writeHead(301, { Location: `https://${hostHeader}${httpsPort === 443 ? '' : `:${httpsPort}`}${req.url || '/'}` });
      res.end();
    }).listen(port, host, () => console.info(`Redirecting http://${host}:${port} to HTTPS.`));
  }
} else {
  app.listen(port, host, () => { console.info(`Production server listening on http://${host}:${port}.`); listening(); });
}
