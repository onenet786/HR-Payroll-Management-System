const crypto = require('node:crypto');

const tokenHash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
const userAgentHash = request => crypto.createHash('sha256').update(String(request.get('user-agent') || '')).digest('hex');

async function createSession(userId, request) {
  const { pool } = require('./db.cjs');
  const token = crypto.randomBytes(32).toString('base64url');
  const idleMinutes = Math.max(5, Number(process.env.SESSION_IDLE_MINUTES || 30));
  const absoluteHours = Math.max(1, Number(process.env.SESSION_ABSOLUTE_HOURS || 12));
  await pool.query(
    `INSERT INTO auth_sessions(id,user_id,token_hash,idle_expires_at,absolute_expires_at,ip_address,user_agent_hash)
     VALUES($1,$2,$3,now()+($4*interval '1 minute'),now()+($5*interval '1 hour'),$6,$7)`,
    [crypto.randomUUID(), userId, tokenHash(token), idleMinutes, absoluteHours, request.ip, userAgentHash(request)],
  );
  return token;
}

async function revokeSession(token) {
  if (!token) return;
  const { pool } = require('./db.cjs');
  await pool.query(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_hash=$1`, [tokenHash(token)]);
}

module.exports = { createSession, revokeSession, tokenHash, userAgentHash };
