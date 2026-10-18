// "Don't ask for a verification code on this device": after a successful MFA sign-in with Remember me,
// the device receives a random token (only its hash is stored). It is bound to the user, the device's
// user agent and a fingerprint of the account's current credentials, so a password change, MFA reset or
// re-enrolment silently invalidates every trusted device without hooking each code path.
const crypto = require('node:crypto');
const { pool } = require('./db.cjs');
const { userAgentHash } = require('./sessions.cjs');

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const trustDays = () => Math.min(30, Math.max(1, Number(process.env.MFA_TRUSTED_DEVICE_DAYS || 5)));

function credentialFingerprint(user) {
  return sha256(JSON.stringify([user?.passwordHash || user?.password || '', user?.mfaSecretCipher || '', user?.mfaMethod || '', user?.mfaEnabled === true, user?.mfaEnrolledAt || '', user?.mfaResetAt || '']));
}

async function issueTrustedDevice(userId, user, request) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(`DELETE FROM mfa_trusted_devices WHERE user_id=$1 AND (expires_at<now() OR revoked_at IS NOT NULL)`, [userId]);
  await pool.query(
    `INSERT INTO mfa_trusted_devices(id,user_id,token_hash,user_agent_hash,credential_fingerprint,expires_at)
     VALUES($1,$2,$3,$4,$5,now()+($6*interval '1 day'))`,
    [crypto.randomUUID(), userId, sha256(token), userAgentHash(request), credentialFingerprint(user), trustDays()],
  );
  return token;
}

/** True when the token is a live trust for this user, device and unchanged credentials. Never throws. */
async function isTrustedDevice(token, userId, user, request) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return false;
  try {
    const result = await pool.query(
      `UPDATE mfa_trusted_devices SET last_used_at=now()
       WHERE token_hash=$1 AND user_id=$2 AND user_agent_hash=$3 AND credential_fingerprint=$4 AND revoked_at IS NULL AND expires_at>now()
       RETURNING id`,
      [sha256(token), userId, userAgentHash(request), credentialFingerprint(user)],
    );
    return result.rowCount === 1;
  } catch {
    // Missing table (migration not yet applied) or a transient error: fall back to asking for the code.
    return false;
  }
}

async function revokeTrustedDevices(userId) {
  const result = await pool.query(`UPDATE mfa_trusted_devices SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
  return result.rowCount;
}

module.exports = { issueTrustedDevice, isTrustedDevice, revokeTrustedDevices, credentialFingerprint, trustDays };
