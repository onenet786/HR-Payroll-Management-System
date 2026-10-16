const crypto = require('node:crypto');
const express = require('express');
const nodemailer = require('nodemailer');
const { pool, transaction } = require('./db.cjs');
const { createSession } = require('./sessions.cjs');
const { newSecret, verifyTotp, encryptSecret, decryptSecret } = require('./totp.cjs');

const router = express.Router();
const publicRouter = express.Router();
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const cleanCode = value => String(value || '').replace(/\s/g, '');
const escapeLabel = value => encodeURIComponent(String(value || '').replace(/[\r\n]/g, ''));
const canManageAccess = identity => identity.roleId === 'role-admin' || identity.permissions.has('manage_access');
const emailCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

function mailTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass || !process.env.SMTP_FROM?.trim()) return null;
  return nodemailer.createTransport({ host, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: { user, pass }, requireTLS: process.env.SMTP_REQUIRE_TLS !== 'false' });
}

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
      const updated = { ...user.rows[0].data, mfaEnabled: true, mfaMethod: 'totp', mfaSecretCipher: encryptSecret(secret), mfaEnrolledAt: new Date().toISOString() };
      await client.query(`UPDATE users SET data=$2::jsonb, updated_at=now() WHERE id=$1`, [req.identity.uid, JSON.stringify(updated)]);
      await client.query(`DELETE FROM mfa_enrollments WHERE user_id=$1`, [req.identity.uid]);
      await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL`, [req.identity.uid, hash(req.identity.sessionToken)]);
      return true;
    });
    if (!completed) return res.status(400).json({ error: 'Invalid or expired enrollment code.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/email-enroll/request', async (req, res, next) => {
  try {
    const profile = await userById(req.identity.uid);
    const recipient = profile?.data?.email || req.identity.email;
    const transport = mailTransport();
    if (!validEmail(recipient)) return res.status(409).json({ error: 'A valid email address is required for email MFA.' });
    if (!transport) return res.status(503).json({ error: 'Email MFA is unavailable. Configure SMTP first.' });
    const id = crypto.randomUUID(); const code = emailCode();
    await transaction(async client => {
      await client.query(`DELETE FROM mfa_email_enrollments WHERE user_id=$1 OR expires_at<now()`, [req.identity.uid]);
      await client.query(`INSERT INTO mfa_email_enrollments(id,user_id,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')`, [id, req.identity.uid, hash(`${id}:${code}`)]);
    });
    try {
      await transport.sendMail({ from: process.env.SMTP_FROM, to: recipient, subject: 'HR Payroll email MFA setup code', text: `Your HR Payroll email MFA setup code is ${code}. It expires in 10 minutes. Do not share it.`, html: `<p>Your HR Payroll email MFA setup code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. Do not share it.</p>` });
    } catch (error) { await pool.query(`DELETE FROM mfa_email_enrollments WHERE id=$1`, [id]); throw error; }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ enrollmentId: id, email: recipient });
  } catch (error) { next(error); }
});

router.post('/email-enroll/confirm', async (req, res, next) => {
  try {
    const { enrollmentId, code } = req.body || {};
    if (typeof enrollmentId !== 'string') return res.status(400).json({ error: 'Email MFA enrollment is required.' });
    const completed = await transaction(async client => {
      const pending = await client.query(`SELECT code_hash FROM mfa_email_enrollments WHERE id=$1 AND user_id=$2 AND expires_at>now() AND attempts<5 FOR UPDATE`, [enrollmentId, req.identity.uid]);
      if (!pending.rows[0]) return false;
      if (!crypto.timingSafeEqual(Buffer.from(pending.rows[0].code_hash, 'hex'), Buffer.from(hash(`${enrollmentId}:${cleanCode(code)}`), 'hex'))) { await client.query(`UPDATE mfa_email_enrollments SET attempts=attempts+1 WHERE id=$1`, [enrollmentId]); return false; }
      const user = await client.query(`SELECT data FROM users WHERE id=$1 FOR UPDATE`, [req.identity.uid]);
      if (!user.rows[0]) throw new Error('User account was not found.');
      const { mfaSecretCipher, mfaEnrolledAt, ...withoutTotp } = user.rows[0].data;
      await client.query(`UPDATE users SET data=$2::jsonb,updated_at=now() WHERE id=$1`, [req.identity.uid, JSON.stringify({ ...withoutTotp, mfaEnabled: true, mfaMethod: 'email', mfaEmailEnrolledAt: new Date().toISOString() })]);
      await client.query(`DELETE FROM mfa_email_enrollments WHERE user_id=$1`, [req.identity.uid]);
      await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL`, [req.identity.uid, hash(req.identity.sessionToken)]);
      return true;
    });
    if (!completed) return res.status(400).json({ error: 'Invalid or expired email verification code.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/recovery-request', async (req, res, next) => {
  try {
    const targetUserId = typeof req.body?.userId === 'string' && req.body.userId ? req.body.userId : req.identity.uid;
    const reason = String(req.body?.reason || '').trim();
    if (targetUserId !== req.identity.uid && !canManageAccess(req.identity)) return res.status(403).json({ error: 'Only access administrators can request recovery for another user.' });
    if (reason.length < 10 || reason.length > 500) return res.status(400).json({ error: 'Provide a recovery reason between 10 and 500 characters.' });
    const target = await userById(targetUserId);
    if (!target?.data?.mfaEnabled) return res.status(409).json({ error: 'This account does not have MFA enabled.' });
    const duplicate = await pool.query(`SELECT 1 FROM mfa_recovery_requests WHERE user_id=$1 AND status='Pending'`, [targetUserId]);
    if (duplicate.rowCount) return res.status(409).json({ error: 'A recovery request is already pending for this account.' });
    const id = crypto.randomUUID();
    await pool.query(`INSERT INTO mfa_recovery_requests(id,user_id,requested_by_id,reason,status) VALUES($1,$2,$3,$4,'Pending')`, [id, targetUserId, req.identity.uid, reason]);
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,'mfa_recovery_requested','users',$3,$4::jsonb,$5,$6)`, [req.identity.uid, req.identity.roleId, targetUserId, JSON.stringify({ requestId: id, reason }), req.correlationId, req.ip]);
    res.status(201).json({ id, status: 'Pending' });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'A recovery request is already pending for this account.' });
    next(error);
  }
});

router.get('/recovery-requests', async (req, res, next) => {
  try {
    if (!canManageAccess(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    const result = await pool.query(`SELECT r.id,r.user_id,r.requested_by_id,r.reason,r.status,r.requested_at,r.resolved_at,r.resolved_by_id,r.resolution_note, u.data AS user_data, requester.data AS requester_data FROM mfa_recovery_requests r JOIN users u ON u.id=r.user_id JOIN users requester ON requester.id=r.requested_by_id WHERE r.status='Pending' ORDER BY r.requested_at ASC LIMIT 100`);
    res.json({ requests: result.rows.map(row => ({ id: row.id, userId: row.user_id, requestedById: row.requested_by_id, reason: row.reason, status: row.status, requestedAt: row.requested_at, userName: row.user_data?.username || row.user_data?.email || row.user_id, email: row.user_data?.email, roleName: row.user_data?.roleId, requestedBy: row.requester_data?.username || row.requester_data?.email || row.requested_by_id })) });
  } catch (error) { next(error); }
});

router.post('/recovery-request/:id/resolve', async (req, res, next) => {
  try {
    if (!canManageAccess(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    const decision = req.body?.decision;
    const note = String(req.body?.note || '').trim().slice(0, 500);
    if (!['Approved', 'Rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be Approved or Rejected.' });
    const resolved = await transaction(async client => {
      const request = await client.query(`SELECT * FROM mfa_recovery_requests WHERE id=$1 AND status='Pending' FOR UPDATE`, [req.params.id]);
      const item = request.rows[0];
      if (!item) return null;
      if (item.requested_by_id === req.identity.uid) throw new Error('Maker-checker control: the request creator cannot resolve it.');
      if (decision === 'Approved') {
        const user = await client.query(`SELECT data FROM users WHERE id=$1 FOR UPDATE`, [item.user_id]);
        if (!user.rows[0]) throw new Error('User account was not found.');
        const { mfaSecretCipher, mfaEnrolledAt, ...withoutMfa } = user.rows[0].data;
        await client.query(`UPDATE users SET data=$2::jsonb,updated_at=now() WHERE id=$1`, [item.user_id, JSON.stringify({ ...withoutMfa, mfaEnabled: false, mfaResetAt: new Date().toISOString(), mfaResetById: req.identity.uid })]);
        await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [item.user_id]);
      }
      await client.query(`UPDATE mfa_recovery_requests SET status=$2,resolved_at=now(),resolved_by_id=$3,resolution_note=$4 WHERE id=$1`, [item.id, decision, req.identity.uid, note || null]);
      return item;
    });
    if (!resolved) return res.status(404).json({ error: 'Pending recovery request was not found.' });
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,$3,'users',$4,$5::jsonb,$6,$7)`, [req.identity.uid, req.identity.roleId, decision === 'Approved' ? 'mfa_recovery_approved' : 'mfa_recovery_rejected', resolved.user_id, JSON.stringify({ requestId: resolved.id, note }), req.correlationId, req.ip]);
    res.json({ ok: true, status: decision });
  } catch (error) { if (error.message?.startsWith('Maker-checker')) error.status = 403; next(error); }
});

publicRouter.post('/send-email-login-code', async (req, res, next) => {
  try {
    const { challenge } = req.body || {};
    if (typeof challenge !== 'string') return res.status(400).json({ error: 'MFA challenge is required.' });
    const transport = mailTransport();
    if (!transport) return res.status(503).json({ error: 'Email verification is unavailable. Ask your administrator to configure SMTP.' });
    const code = emailCode();
    const recipient = await transaction(async client => {
      const pending = await client.query(`SELECT user_id FROM mfa_login_challenges WHERE challenge_hash=$1 AND expires_at>now() AND consumed_at IS NULL AND attempts<5 FOR UPDATE`, [hash(challenge)]);
      const item = pending.rows[0];
      if (!item) return null;
      const previousCode = await client.query(`SELECT sent_at,send_count FROM mfa_email_login_codes WHERE challenge_hash=$1 FOR UPDATE`, [hash(challenge)]);
      if (previousCode.rows[0]?.sent_at && new Date(previousCode.rows[0].sent_at).getTime() > Date.now() - 60_000) throw Object.assign(new Error('Please wait one minute before requesting another code.'), { status: 429 });
      if ((previousCode.rows[0]?.send_count || 0) >= 5) throw Object.assign(new Error('Too many email code requests. Sign in again to start over.'), { status: 429 });
      const account = await client.query(`SELECT data FROM users WHERE id=$1`, [item.user_id]);
      const email = account.rows[0]?.data?.email;
      if (!validEmail(email)) throw Object.assign(new Error('This account does not have a valid registered email address.'), { status: 409 });
      await client.query(`INSERT INTO mfa_email_login_codes(challenge_hash,code_hash,expires_at,sent_at,send_count) VALUES($1,$2,now()+interval '10 minutes',now(),1) ON CONFLICT(challenge_hash) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,sent_at=now(),send_count=mfa_email_login_codes.send_count+1`, [hash(challenge), hash(`${challenge}:${code}`)]);
      return email;
    });
    if (!recipient) return res.status(400).json({ error: 'MFA challenge is invalid or expired.' });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: recipient,
      subject: 'HR Payroll sign-in verification code',
      text: `Your HR Payroll sign-in verification code is ${code}. It expires in 10 minutes. Do not share this code.`,
      html: `<p>Your HR Payroll sign-in verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>This code expires in 10 minutes. Do not share it.</p>`
    });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  } catch (error) { if (error.status) return res.status(error.status).json({ error: error.message }); next(error); }
});

publicRouter.post('/verify-login', async (req, res, next) => {
  try {
    const { challenge, code, method, rememberMe } = req.body || {};
    if (typeof challenge !== 'string') return res.status(400).json({ error: 'MFA challenge is required.' });
    const useEmail = method === 'email';
    const user = await transaction(async client => {
      const item = await client.query(`SELECT user_id FROM mfa_login_challenges WHERE challenge_hash=$1 AND expires_at>now() AND consumed_at IS NULL AND attempts<5 FOR UPDATE`, [hash(challenge)]);
      if (!item.rows[0]) return null;
      const account = await client.query(`SELECT id,data FROM users WHERE id=$1 FOR UPDATE`, [item.rows[0].user_id]);
      const profile = account.rows[0];
      const emailCodeRecord = useEmail ? await client.query(`SELECT code_hash FROM mfa_email_login_codes WHERE challenge_hash=$1 AND expires_at>now() FOR UPDATE`, [hash(challenge)]) : null;
      const emailAccepted = Boolean(emailCodeRecord?.rows[0]?.code_hash) && crypto.timingSafeEqual(Buffer.from(emailCodeRecord.rows[0].code_hash, 'hex'), Buffer.from(hash(`${challenge}:${cleanCode(code)}`), 'hex'));
      const authenticated = useEmail ? emailAccepted : profile?.data?.mfaSecretCipher && verifyTotp(decryptSecret(profile.data.mfaSecretCipher), cleanCode(code));
      if (!profile?.data?.mfaEnabled || !authenticated) {
        await client.query(`UPDATE mfa_login_challenges SET attempts=attempts+1 WHERE challenge_hash=$1`, [hash(challenge)]);
        return null;
      }
      await client.query(`UPDATE mfa_login_challenges SET consumed_at=now() WHERE challenge_hash=$1`, [hash(challenge)]);
      await client.query(`DELETE FROM mfa_email_login_codes WHERE challenge_hash=$1`, [hash(challenge)]);
      return profile;
    });
    if (!user) return res.status(401).json({ error: 'Invalid, expired, or already used verification code.' });
    const token = await createSession(user.id, req, rememberMe === true);
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
