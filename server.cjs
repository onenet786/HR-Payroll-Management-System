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

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (!isProduction) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (origin === 'file://' || origin === 'null' || origin.startsWith('app://') || origin.startsWith('vscode-webview://')) return true;

  const normalized = origin.trim().replace(/\/+$/, '').toLowerCase();
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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
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
  hsts: { maxAge: 31536000, includeSubDomains: true },
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
app.use(['/api/auth/login', '/api/auth/signup', '/api/auth/otp'], loginLimiter);
app.use('/api/auth/password-reset', resetLimiter);

if (!process.env.DATA_BACKEND || (process.env.DATA_BACKEND || '').trim().toLowerCase() === 'postgres') {
  const bcrypt = require('bcryptjs');
  const { authenticate } = require('./server/auth.cjs');
  const documentRoutes = require('./server/documents.cjs');
  const { getTableName } = require('./server/collections.cjs');
  app.use('/api/documents', authenticate, documentRoutes);

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();

      const { pool } = require('./server/db.cjs');
      let result;
      try {
        result = await pool.query(
          `SELECT id AS document_id, data FROM users WHERE (LOWER(email) = $1 OR LOWER(username) = $1 OR LOWER(data->>'email') = $1 OR LOWER(data->>'username') = $1)`,
          [cleanEmail],
        );
      } catch {
        result = await pool.query(
          `SELECT document_id, data FROM hr_documents WHERE collection_name = 'users' AND (LOWER(data->>'email') = $1 OR LOWER(data->>'username') = $1)`,
          [cleanEmail],
        );
      }

      const userDoc = result.rows[0];
      if (!userDoc) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const user = userDoc.data;
      if (user.status !== 'Active') {
        return res.status(403).json({ error: 'Account is suspended. Contact your administrator.' });
      }

      let passwordValid = false;
      if (user.passwordHash) {
        passwordValid = await bcrypt.compare(password, user.passwordHash);
      } else if (user.password) {
        passwordValid = (password === user.password);
      }

      if (!passwordValid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const token = userDoc.document_id;
      const { passwordHash: _, ...safeUser } = user;
      return res.json({ token, user: safeUser });
    } catch (err) {
      next(err);
    }
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

      let companyName = null;
      let companySubtitle = null;

      // 1. Query PostgreSQL companies table for the saved company identity (e.g. OneNet Solutions)
      try {
        const compResult = await pool.query(
          `SELECT COALESCE(data->>'name', data->>'tradingName', data->>'legalName', name) AS comp_name, data 
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
          const compResult = await pool.query(
            `SELECT COALESCE(data->>'name', data->>'tradingName', data->>'legalName') AS comp_name 
             FROM hr_documents 
             WHERE collection_name = 'companies' 
             LIMIT 1`
          );
          if (compResult.rows[0]?.comp_name) {
            companyName = String(compResult.rows[0].comp_name).trim();
          }
        } catch {}
      }

      // 2. If no company in DB yet, check explicit server environment override
      if (!companyName && process.env.COMPANY_NAME) {
        companyName = process.env.COMPANY_NAME.trim();
      }

      // 3. Fallback default
      if (!companyName) {
        companyName = 'BIN ISHAQ HR SUITE';
      }

      if (!companySubtitle) {
        companySubtitle = process.env.COMPANY_SUBTITLE || 'Payroll Compliance & Attendance Management';
      }

      return res.json({
        hasUsers: userCount > 0,
        userCount,
        companyName,
        companySubtitle,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/kiosk/sync/:collection', async (req, res, next) => {
    try {
      const name = req.params.collection;
      const table = getTableName(name);
      if (!table) {
        return res.status(404).json({ error: 'Unknown collection.' });
      }
      const { pool } = require('./server/db.cjs');
      let result;
      try {
        result = await pool.query(
          `SELECT id AS document_id, data FROM ${table} ORDER BY id LIMIT 10000`
        );
      } catch {
        result = await pool.query(
          `SELECT document_id, data FROM hr_documents WHERE collection_name = $1 ORDER BY document_id LIMIT 10000`,
          [name]
        );
      }
      const items = result.rows.map(row => ({ id: row.document_id, ...row.data }));
      return res.json({ documents: items });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/kiosk/punch', async (req, res, next) => {
    try {
      const { collection, documentId, data } = req.body || {};
      if (!collection || !documentId || !data) {
        return res.status(400).json({ error: 'collection, documentId, and data are required.' });
      }
      const table = getTableName(collection);
      const { pool } = require('./server/db.cjs');
      const employeeId = data.employeeId || null;
      const status = typeof data.status === 'string' ? data.status : null;

      if (table === 'attendances') {
        const punchDate = data.date || (typeof data.punchIn === 'string' && data.punchIn.length >= 10 ? data.punchIn.slice(0, 10) : null);
        try {
          await pool.query(
            `INSERT INTO attendances (id, employee_id, date, status, data, version, updated_at)
             VALUES ($1, $2, $3, $4, $5::jsonb, 1, NOW())
             ON CONFLICT (id)
             DO UPDATE SET data = EXCLUDED.data,
                           employee_id = COALESCE(EXCLUDED.employee_id, attendances.employee_id),
                           date = COALESCE(EXCLUDED.date, attendances.date),
                           status = COALESCE(EXCLUDED.status, attendances.status),
                           version = attendances.version + 1,
                           updated_at = NOW()`,
            [documentId, employeeId, punchDate, status, JSON.stringify(data)]
          );
          return res.json({ ok: true, id: documentId });
        } catch {
          // fall through to fallback
        }
      } else if (table) {
        try {
          await pool.query(
            `INSERT INTO ${table} (id, employee_id, status, data, version, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, 1, NOW())
             ON CONFLICT (id)
             DO UPDATE SET data = EXCLUDED.data, employee_id = COALESCE(EXCLUDED.employee_id, ${table}.employee_id), status = COALESCE(EXCLUDED.status, ${table}.status), version = ${table}.version + 1, updated_at = NOW()`,
            [documentId, employeeId, status, JSON.stringify(data)]
          );
          return res.json({ ok: true, id: documentId });
        } catch {
          // fall through to fallback
        }
      }

      await pool.query(
        `INSERT INTO hr_documents (collection_name, document_id, data)
         VALUES ($1, $2, $3)
         ON CONFLICT (collection_name, document_id)
         DO UPDATE SET data = EXCLUDED.data, version = hr_documents.version + 1, updated_at = NOW()`,
        [collection, documentId, JSON.stringify(data)]
      );
      return res.json({ ok: true, id: documentId });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/setup', async (req, res, next) => {
    try {
      const { companyName, adminEmail, adminPassword, adminName } = req.body || {};
      if (!adminEmail || !adminPassword) {
        return res.status(400).json({ error: 'Admin email and password are required.' });
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
        name: companyName || 'Bin Ishaq Logistics Ltd.',
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
      return res.json({ token: 'usr-admin', user: safeUser });
    } catch (err) {
      next(err);
    }
  });


  app.get('/api/health', async (_req, res, next) => {
    try {
      const { pool } = require('./server/db.cjs');
      await pool.query('SELECT 1');
      res.json({ ok: true, backend: 'postgres' });
    } catch (error) { next(error); }
  });
}

app.use(express.static(path.join(__dirname, 'dist'), { index: false, dotfiles: 'deny' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.use((req, res) => res.status(404).json({ error: 'Resource not found.', correlationId: req.correlationId }));

app.use((error, req, res, _next) => {
  console.error(`[${req.correlationId}]`, error);
  const status = Number(error.status) >= 400 && Number(error.status) < 500 ? Number(error.status) : 500;
  res.status(status).json({ error: status === 500 ? 'An unexpected error occurred.' : error.message, correlationId: req.correlationId });
});

const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => console.info(`Production server listening on http://${host}:${port}.`));

