const crypto = require('node:crypto');
const express = require('express');
const { pool, transaction } = require('./db.cjs');
const { createSession } = require('./sessions.cjs');
const { newSecret, verifyTotp, encryptSecret, decryptSecret } = require('./totp.cjs');

const router = express.Router();
const publicRouter = express.Router();
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const cleanCode = value => String(value || '').replace(/\s/g, '');
const escapeLabel = value => encodeURIComponent(String(value || '').replace(/[\r\n]/g, ''));

async function userById(id) {
  const result = await pool.query(`SELECT id, data FROM users WHERE id=$1`, [id]);
  return result.rows[0];
}

router.post('/enroll', async (req, res, next) => {
  try {
    const secret = newSecret();
    const id = crypto.randomUUID();
    await pool.query(`DELETE FROM mfa_enrollments WHERE user_id=$1 OR expires_at<now()`, [req.identity.uid]);
    await pool.query(`INSERT INTO mfa_enrollments(id,user_id,secret_cipher,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')`, [id, req.identity.uid, encryptSecret(secret)]);
    const profile = await userById(req.identity.uid);
    const account = profile?.data?.email || req.identity.email || req.identity.uid;
    const issuer = process.env.MFA_ISSUER?.trim() || 'HR Payroll';
    res.setHeader('Cache-Control', 'no-store');
    res.json({ enrollmentId: id, secret, issuer, account, otpauthUri: `otpauth://totp/${escapeLabel(issuer)}:${escapeLabel(account)}?secret=${secret}&issuer=${escapeLabel(issuer)}&algorithm=SHA1&digits=6&period=30` });
  } catch (error) { next(error); }
});

router.post('/confirm', async (req, res, next) => {
  try {
    const { enrollmentId, code } = req.body || {};
    if (typeof enrollmentId !== 'string') return res.status(400).json({ error: 'MFA enrollment is required.' });
    const completed = await transaction(async client => {
      const pending = await client.query(`SELECT secret_cipher FROM mfa_enrollments WHERE id=$1 AND user_id=$2 AND expires_at>now() FOR UPDATE`, [enrollmentId, req.identity.uid]);
      if (!pending.rows[0]) return false;
      const secret = decryptSecret(pending.rows[0].secret_cipher);
      if (!verifyTotp(secret, cleanCode(code))) return false;
      const user = await client.query(`SELECT data FROM users WHERE id=$1 FOR UPDATE`, [req.identity.uid]);
      if (!user.rows[0]) throw new Error('User account was not found.');
      const updated = { ...user.rows[0].data, mfaEnabled: true, mfaSecretCipher: encryptSecret(secret), mfaEnrolledAt: new Date().toISOString() };
      await client.query(`UPDATE users SET data=$2::jsonb, updated_at=now() WHERE id=$1`, [req.identity.uid, JSON.stringify(updated)]);
      await client.query(`DELETE FROM mfa_enrollments WHERE user_id=$1`, [req.identity.uid]);
      await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL`, [req.identity.uid, hash(req.identity.sessionToken)]);
      return true;
    });
    if (!completed) return res.status(400).json({ error: 'Invalid or expired enrollment code.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

publicRouter.post('/verify-login', async (req, res, next) => {
  try {
    const { challenge, code } = req.body || {};
    if (typeof challenge !== 'string') return res.status(400).json({ error: 'MFA challenge is required.' });
    const user = await transaction(async client => {
      const item = await client.query(`SELECT user_id FROM mfa_login_challenges WHERE challenge_hash=$1 AND expires_at>now() AND consumed_at IS NULL AND attempts<5 FOR UPDATE`, [hash(challenge)]);
      if (!item.rows[0]) return null;
      const account = await client.query(`SELECT id,data FROM users WHERE id=$1 FOR UPDATE`, [item.rows[0].user_id]);
      const profile = account.rows[0];
      if (!profile?.data?.mfaEnabled || !profile.data.mfaSecretCipher || !verifyTotp(decryptSecret(profile.data.mfaSecretCipher), cleanCode(code))) {
        await client.query(`UPDATE mfa_login_challenges SET attempts=attempts+1 WHERE challenge_hash=$1`, [hash(challenge)]);
        return null;
      }
      await client.query(`UPDATE mfa_login_challenges SET consumed_at=now() WHERE challenge_hash=$1`, [hash(challenge)]);
      return profile;
    });
    if (!user) return res.status(401).json({ error: 'Invalid, expired, or already used authenticator code.' });
    const token = await createSession(user.id, req);
    const { passwordHash, password, mfaSecretCipher, ...safeUser } = user.data;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ token, user: safeUser });
  } catch (error) { next(error); }
});

module.exports = { router, publicRouter, createLoginChallenge: async userId => {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(`DELETE FROM mfa_login_challenges WHERE user_id=$1 OR expires_at<now()`, [userId]);
  await pool.query(`INSERT INTO mfa_login_challenges(id,challenge_hash,user_id,expires_at) VALUES($1,$2,$3,now()+interval '5 minutes')`, [crypto.randomUUID(), hash(token), userId]);
  return token;
} };
