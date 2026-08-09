const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigin = process.env.ALLOWED_ORIGIN?.trim();
const appUrl = process.env.APP_URL?.trim();
if (isProduction && (!allowedOrigin || !appUrl || /replace-with/i.test(`${allowedOrigin}${appUrl}`))) {
  throw new Error('Production startup refused: APP_URL and ALLOWED_ORIGIN must be configured.');
}
if (isProduction && process.env.DEBUG === 'true') {
  throw new Error('Production startup refused: DEBUG must be false.');
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  req.correlationId = crypto.randomUUID();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "'unsafe-eval'", 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https:', 'wss:', 'https://mcs.binishaqsoft.com', 'wss://mcs.binishaqsoft.com', 'http://localhost:*', 'http://127.0.0.1:*', 'https://*.googleapis.com', 'ws://127.0.0.1:*', 'ws://localhost:*'],


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
  const isLocalhost = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const isElectronOrFile = origin === 'file://' || origin === 'null' || (origin && origin.startsWith('app://')) || (origin && origin.startsWith('vscode-webview://'));
  const isAllowed = !origin || isLocalhost || isElectronOrFile || origin === allowedOrigin || !isProduction;

  if (origin && isAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  if (isAllowed) {
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
  app.use('/api/documents', authenticate, documentRoutes);

  app.post('/api/auth/login', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }
      const cleanEmail = String(email).trim().toLowerCase();

      const { pool } = require('./server/db.cjs');
      const result = await pool.query(
        `SELECT document_id, data FROM hr_documents WHERE collection_name = 'users' AND (LOWER(data->>'email') = $1 OR LOWER(data->>'username') = $1)`,
        [cleanEmail],
      );

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
      const result = await pool.query(
        `SELECT COUNT(*) FROM hr_documents WHERE collection_name = 'users'`,
      );
      const userCount = Number(result.rows[0]?.count || 0);
      return res.json({ hasUsers: userCount > 0, userCount });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/kiosk/sync/:collection', async (req, res, next) => {
    try {
      const name = req.params.collection;
      const allowedCollections = ['branches', 'departments', 'designations', 'employees', 'biometricTemplates', 'attendances', 'companies'];
      if (!allowedCollections.includes(name)) {
        return res.status(404).json({ error: 'Unknown collection.' });
      }
      const { pool } = require('./server/db.cjs');
      const result = await pool.query(
        `SELECT document_id, data FROM hr_documents WHERE collection_name = $1 ORDER BY document_id LIMIT 10000`,
        [name]
      );
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
      const { pool } = require('./server/db.cjs');
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

