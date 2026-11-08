const { pool } = require('./db.cjs');

/** Records a provider action (who, what, which client). Never blocks the action itself. */
async function audit(actor, action, { clientId = null, target = null, detail = {}, ip = null } = {}) {
  await pool.query(
    `INSERT INTO provider_audit(actor, action, client_id, target, detail, ip) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [actor, action, clientId, target, JSON.stringify(detail || {}), ip],
  ).catch(error => console.error('Audit write failed:', error.message));
}

module.exports = { audit };
