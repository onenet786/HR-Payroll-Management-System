// A signed-in user changes their own password. The current password is checked, the new one is stored hashed,
// every other session of the account is signed out, and remembered (trusted) devices stop skipping MFA because
// their fingerprint includes the password hash (server/trusted-devices.cjs).
const crypto = require('node:crypto');
const userSecrets = require('./user-secrets.cjs');

async function changeOwnPassword(pool, identity, body, { correlationId = null, ip = null } = {}) {
  const { currentPassword, newPassword } = body || {};
  const reply = (status, error) => ({ status, body: { error } });
  if (typeof currentPassword !== 'string' || !currentPassword) return reply(400, 'Enter your current password.');
  if (typeof newPassword !== 'string' || newPassword.length < userSecrets.MIN_PASSWORD_LENGTH || newPassword.length > 200) {
    return reply(400, `The new password must be at least ${userSecrets.MIN_PASSWORD_LENGTH} characters.`);
  }
  if (newPassword === currentPassword) return reply(400, 'The new password must be different from the current one.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(`SELECT data FROM users WHERE id=$1 FOR UPDATE`, [identity.uid]);
    const user = found.rows[0]?.data;
    if (!user || user.serviceAccount) { await client.query('ROLLBACK'); return reply(403, 'This account cannot change its password here.'); }
    if (!await userSecrets.verifyUserPassword(pool, user, currentPassword)) { await client.query('ROLLBACK'); return reply(400, 'The current password is not correct.'); }
    const { record } = await userSecrets.prepareUserWrite({ ...user, password: newPassword }, user);
    await client.query(`UPDATE users SET data=$2::jsonb, version=version+1, updated_at=now() WHERE id=$1`, [identity.uid, JSON.stringify(record)]);
    const currentToken = crypto.createHash('sha256').update(String(identity.sessionToken || '')).digest('hex');
    const others = await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL AND token_hash<>$2`, [identity.uid, currentToken]);
    await client.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,'password_changed_by_user','users',$1,$3::jsonb,$4,$5)`,
      [identity.uid, identity.roleId || null, JSON.stringify({ otherSessionsSignedOut: others.rowCount }), correlationId, ip]);
    await client.query('COMMIT');
    return { status: 200, body: { ok: true, otherSessionsSignedOut: others.rowCount } };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

module.exports = { changeOwnPassword };
