const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config({ quiet: true });

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
      scriptSrc: ["'self'", 'https://apis.google.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://*.googleapis.com', 'https://*.firebaseio.com', 'wss://*.firebaseio.com', 'ws://127.0.0.1:*', 'ws://localhost:*'],
      frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  frameguard: { action: 'deny' },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
}));

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin || !allowedOrigin || origin === allowedOrigin) {
    if (origin && allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    return next();
  }
  return res.status(403).json({ error: 'Request origin is not allowed.', correlationId: req.correlationId });
});

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
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
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many requests.', correlationId: req.correlationId }),
});

// These guards apply automatically when trusted server-side auth routes are added.
app.use('/api', apiLimiter, express.json({ limit: '32kb', strict: true }));
app.use(['/api/auth/login', '/api/auth/signup', '/api/auth/otp'], loginLimiter);
app.use('/api/auth/password-reset', resetLimiter);

app.use(express.static(path.join(__dirname, 'dist'), { index: false, dotfiles: 'deny' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.use((req, res) => res.status(404).json({ error: 'Resource not found.', correlationId: req.correlationId }));

app.use((error, req, res, _next) => {
  console.error(`[${req.correlationId}]`, error);
  res.status(500).json({ error: 'An unexpected error occurred.', correlationId: req.correlationId });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, '127.0.0.1', () => console.info(`Production server listening on port ${port}.`));
