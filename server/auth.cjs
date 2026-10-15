const { pool } = require('./db.cjs');
const { tokenHash, userAgentHash } = require('./sessions.cjs');

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.', correlationId: req.correlationId });
    }
    const tokenStr = header.slice(7).trim();
    if (!tokenStr) {
      return res.status(401).json({ error: 'Authentication token required.', correlationId: req.correlationId });
    }
    const sessionResult = await pool.query(
      `SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL
       AND idle_expires_at>now() AND absolute_expires_at>now() AND user_agent_hash=$2 FOR UPDATE`,
      [tokenHash(tokenStr), userAgentHash(req)],
    );
    const session = sessionResult.rows[0];
    if (!session) return res.status(401).json({ error: 'Session expired or invalid.', correlationId: req.correlationId });
    const idleMinutes = Math.max(5, Number(process.env.SESSION_IDLE_MINUTES || 30));
    await pool.query(`UPDATE auth_sessions SET last_seen_at=now(),idle_expires_at=LEAST(absolute_expires_at,now()+($2*interval '1 minute')) WHERE token_hash=$1`, [tokenHash(tokenStr), idleMinutes]);
    const token = { uid: session.user_id };

    let result;
    try {
      result = await pool.query(`SELECT data FROM users WHERE id = $1`, [token.uid]);
    } catch {
      result = await pool.query(
        `SELECT data FROM hr_documents WHERE collection_name = 'users' AND document_id = $1`,
        [token.uid],
      );
    }
    let profile = result.rows[0]?.data;

    if (!profile || profile.status !== 'Active') {
      return res.status(403).json({ error: 'Active user profile required.', correlationId: req.correlationId });
    }

    let roleResult;
    try {
      roleResult = await pool.query(`SELECT data FROM roles WHERE id = $1`, [profile.roleId]);
    } catch {
      roleResult = await pool.query(
        `SELECT data FROM hr_documents WHERE collection_name = 'roles' AND document_id = $1`,
        [profile.roleId],
      );
    }

    req.identity = {
      uid: token.uid,
      email: token.email || profile.email,
      roleId: profile.roleId,
      employeeId: profile.employeeId || null,
      permissions: new Set(roleResult.rows[0]?.data?.permissions || []),
      sessionToken: tokenStr,
    };
    next();
  } catch (error) {
    console.warn(`[${req.correlationId}] Authentication rejected:`, error?.code || error?.message);
    res.status(401).json({ error: 'Invalid or expired authentication token.', correlationId: req.correlationId });
  }
}

module.exports = { authenticate };
