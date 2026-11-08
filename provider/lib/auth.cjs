// Provider Console sign-in: email + password, then an authenticator app (TOTP) code. MFA is mandatory: a session is
// limited to MFA enrolment until the code is confirmed. Sessions are an httpOnly, SameSite=Strict cookie; changes
// also need the X-Requested-With header (blocks cross-site form posts).
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { pool } = require('./db.cjs');
const { config } = require('./config.cjs');
const { audit } = require('./audit.cjs');
const { newSecret, verifyTotp, encryptSecret, decryptSecret } = require('../../server/totp.cjs');

const COOKIE = 'pc_session';
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const ROLE_RANK = { viewer: 1, operator: 2, owner: 3 };
const DUMMY_HASH = bcrypt.hashSync('unused-account-placeholder', 12);

function readCookie(req) {
  const header = req.headers.cookie || '';
  const match = header.split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`));
  return match ? decodeURIComponent(match.slice(COOKIE.length + 1)) : '';
}

function setCookie(res, token, maxAgeSeconds) {
  const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`);
}

const publicUser = row => ({ id: row.id, email: row.email, name: row.name, role: row.role, totpEnabled: row.totp_enabled, status: row.status, lastLoginAt: row.last_login_at, createdAt: row.created_at });

async function createUser({ email, name, role, password }) {
  if (!ROLE_RANK[role]) throw new Error('Role must be owner, operator or viewer.');
  if (String(password || '').length < 12) throw new Error('Choose a password of at least 12 characters.');
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO provider_users(id, email, name, role, password_hash) VALUES($1, lower($2), $3, $4, $5)`, [id, email.trim(), name.trim(), role, await bcrypt.hash(password, 12)]);
  return id;
}

async function login(req, res) {
  const { email, password } = req.body || {};
  const row = (await pool.query(`SELECT * FROM provider_users WHERE email=lower($1)`, [String(email || '').trim()])).rows[0];
  const fail = () => res.status(401).json({ error: 'Invalid email or password.' });
  if (!row || row.status !== 'active') { await bcrypt.compare('x', DUMMY_HASH); return fail(); } // same time as a real check
  if (row.locked_until && new Date(row.locked_until) > new Date()) return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  if (!(await bcrypt.compare(String(password || ''), row.password_hash))) {
    const failed = row.failed_logins + 1;
    await pool.query(`UPDATE provider_users SET failed_logins=$2, locked_until=CASE WHEN $2 >= 5 THEN now() + interval '15 minutes' ELSE NULL END WHERE id=$1`, [row.id, failed >= 5 ? 0 : failed]);
    await audit(row.email, 'login_failed', { ip: req.ip });
    return fail();
  }
  await pool.query(`UPDATE provider_users SET failed_logins=0, locked_until=NULL WHERE id=$1`, [row.id]);
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO provider_sessions(token_hash, user_id, expires_at, ip, user_agent) VALUES($1,$2, now() + ($3 || ' hours')::interval, $4, $5)`,
    [sha256(token), row.id, String(config.sessionHours), req.ip, String(req.get('user-agent') || '').slice(0, 300)],
  );
  setCookie(res, token, config.sessionHours * 3600);
  res.json({ user: publicUser(row), mfaRequired: row.totp_enabled, mfaEnrollmentRequired: !row.totp_enabled });
}

/** Loads the session; with requireMfa=false the route is reachable before the TOTP code (enrolment, logout). */
function authenticate({ requireMfa = true, minRole = 'viewer' } = {}) {
  return async (req, res, next) => {
    try {
      const token = readCookie(req);
      if (!token) return res.status(401).json({ error: 'Sign in required.' });
      const row = (await pool.query(
        `SELECT s.token_hash, s.mfa_ok, u.* FROM provider_sessions s JOIN provider_users u ON u.id=s.user_id
          WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status='active'`,
        [sha256(token)],
      )).rows[0];
      if (!row) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
      if (requireMfa && !row.mfa_ok) return res.status(401).json({ error: 'Enter your authenticator code.', mfaRequired: true });
      if (req.method !== 'GET' && req.get('x-requested-with') !== 'provider-console') return res.status(403).json({ error: 'Request blocked (missing console header).' });
      if (ROLE_RANK[row.role] < ROLE_RANK[minRole]) return res.status(403).json({ error: `This needs the ${minRole} role.` });
      await pool.query(`UPDATE provider_sessions SET last_seen_at=now() WHERE token_hash=$1`, [row.token_hash]);
      req.provider = { user: publicUser(row), tokenHash: row.token_hash, mfaOk: row.mfa_ok, totpSecretCipher: row.totp_secret_cipher };
      req.actor = row.email;
      next();
    } catch (error) { next(error); }
  };
}

const requireRole = minRole => (req, res, next) => (ROLE_RANK[req.provider.user.role] >= ROLE_RANK[minRole] ? next() : res.status(403).json({ error: `This needs the ${minRole} role.` }));

async function mfaSetup(req, res) {
  if (req.provider.user.totpEnabled) return res.status(409).json({ error: 'The authenticator is already set up.' });
  const secret = newSecret();
  await pool.query(`UPDATE provider_users SET totp_secret_cipher=$2 WHERE id=$1`, [req.provider.user.id, encryptSecret(secret)]);
  const otpauth = `otpauth://totp/${encodeURIComponent(`OneNet Provider:${req.provider.user.email}`)}?secret=${secret}&issuer=${encodeURIComponent('OneNet Provider Console')}`;
  res.json({ secret, otpauth, qr: await QRCode.toDataURL(otpauth, { margin: 1, width: 220 }) });
}

async function mfaVerify(req, res) {
  const code = String(req.body?.code || '').replace(/\s/g, '');
  const cipher = (await pool.query(`SELECT totp_secret_cipher FROM provider_users WHERE id=$1`, [req.provider.user.id])).rows[0]?.totp_secret_cipher;
  if (!cipher) return res.status(400).json({ error: 'Set up the authenticator first.' });
  if (!verifyTotp(decryptSecret(cipher), code)) {
    await audit(req.actor, 'mfa_failed', { ip: req.ip });
    return res.status(401).json({ error: 'That code is not correct. Check the time on your phone.' });
  }
  await pool.query(`UPDATE provider_users SET totp_enabled=true, last_login_at=now() WHERE id=$1`, [req.provider.user.id]);
  await pool.query(`UPDATE provider_sessions SET mfa_ok=true WHERE token_hash=$1`, [req.provider.tokenHash]);
  await audit(req.actor, req.provider.user.totpEnabled ? 'login' : 'mfa_enrolled', { ip: req.ip });
  res.json({ ok: true });
}

async function logout(req, res) {
  await pool.query(`UPDATE provider_sessions SET revoked_at=now() WHERE token_hash=$1`, [req.provider.tokenHash]);
  setCookie(res, '', 0);
  res.status(204).end();
}

module.exports = { login, authenticate, requireRole, mfaSetup, mfaVerify, logout, createUser, publicUser, ROLE_RANK };
