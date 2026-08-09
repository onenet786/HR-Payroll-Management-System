const express = require('express');
const { transaction, pool } = require('./db.cjs');
const { policyFor, allowed } = require('./collections.cjs');

const router = express.Router();
const safeName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(value);
const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\/\0]/.test(value);
const employeeIdOf = data => typeof data?.employeeId === 'string' ? data.employeeId : null;

async function authorizeWrite(client, name, id, identity, existing, next) {
  const policy = policyFor(name);
  const employeeId = employeeIdOf(next) || (name === 'employees' || name === 'biometricTemplates' ? id : null);
  if (!policy || !allowed(policy.write, identity, id, employeeId)) return false;
  if (identity.roleId === 'role-admin' || allowed(policy.write, identity, id, '__not_self__')) return true;
  if (!identity.employeeId || identity.employeeId !== employeeId) return false;
  if (name === 'leaves') return !existing && next.status === 'Pending';
  if (name === 'loanAdvances') return !existing && next.status === 'Pending';
  if (name !== 'attendances') return false;
  if (existing && existing.data.employeeId !== next.employeeId) return false;
  if (!existing && next.regularizationRequested === true) return true;
  if (next.method !== 'Mobile GPS' || typeof next.mobileDutyAuthorizationId !== 'string') return false;
  const authorization = await client.query(
    `SELECT data FROM hr_documents WHERE collection_name='mobileDutyAuthorizations' AND document_id=$1`,
    [next.mobileDutyAuthorizationId],
  );
  const duty = authorization.rows[0]?.data;
  return Boolean(duty && duty.employeeId === employeeId && duty.status === 'Approved' && duty.validFrom <= next.date && duty.validTo >= next.date);
}

router.get('/:collection', async (req, res, next) => {
  try {
    const name = req.params.collection;
    const policy = policyFor(name);
    if (!safeName(name) || !policy) return res.status(404).json({ error: 'Unknown collection.' });
    const requestedEmployee = typeof req.query.employeeId === 'string' ? req.query.employeeId : null;
    const canReadAll = policy.read.startsWith('selfUserOr:')
      ? allowed(policy.read, req.identity, '__not_self__', null)
      : allowed(policy.read, req.identity, '', null) && !policy.read.startsWith('selfEmployeeOr:') && policy.read !== 'selfUser';
    const managedRead = policy.read.startsWith('selfEmployeeOr:') && allowed(policy.read, req.identity, '', '__not_self__');
    let employeeFilter = requestedEmployee;
    if (!canReadAll && !managedRead) employeeFilter = req.identity.employeeId;
    if ((policy.read === 'selfUser' || policy.read.startsWith('selfUserOr:')) && !canReadAll) {
      const result = await pool.query(`SELECT document_id, data, version, updated_at FROM hr_documents WHERE collection_name=$1 AND document_id=$2`, [name, req.identity.uid]);
      return res.json({ documents: result.rows });
    }
    if (!allowed(policy.read, req.identity, '', employeeFilter)) return res.status(403).json({ error: 'Insufficient permission.' });
    const params = [name];
    let sql = `SELECT document_id, data, version, updated_at FROM hr_documents WHERE collection_name=$1`;
    if (employeeFilter) { params.push(employeeFilter); sql += ` AND employee_id=$2`; }
    sql += ` ORDER BY document_id LIMIT 10000`;
    const result = await pool.query(sql, params);
    res.json({ documents: result.rows });
  } catch (error) { next(error); }
});

router.get('/:collection/:id', async (req, res, next) => {
  try {
    const { collection: name, id } = req.params;
    const policy = policyFor(name);
    if (!safeName(name) || !safeId(id) || !policy) return res.status(404).json({ error: 'Unknown resource.' });
    const result = await pool.query(`SELECT document_id, employee_id, data, version, updated_at FROM hr_documents WHERE collection_name=$1 AND document_id=$2`, [name, id]);
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Resource not found.' });
    if (!allowed(policy.read, req.identity, id, row.employee_id)) return res.status(403).json({ error: 'Insufficient permission.' });
    res.setHeader('ETag', `"${row.version}"`);
    res.json(row);
  } catch (error) { next(error); }
});

router.put('/:collection/:id', async (req, res, next) => {
  try {
    const { collection: name, id } = req.params;
    const policy = policyFor(name);
    if (!safeName(name) || !safeId(id) || !policy || !req.body || Array.isArray(req.body)) return res.status(400).json({ error: 'Invalid document.' });
    const result = await transaction(async client => {
      const current = await client.query(`SELECT data, version FROM hr_documents WHERE collection_name=$1 AND document_id=$2 FOR UPDATE`, [name, id]);
      const existing = current.rows[0];
      const employeeId = employeeIdOf(req.body) || (name === 'employees' || name === 'biometricTemplates' ? id : null);
      if (!await authorizeWrite(client, name, id, req.identity, existing, req.body)) {
        const forbidden = new Error('Insufficient permission.'); forbidden.status = 403; throw forbidden;
      }
      const expected = req.get('if-match')?.replaceAll('"', '');
      if (expected && existing && Number(expected) !== Number(existing.version)) {
        const conflict = new Error('Document changed since it was read.'); conflict.status = 409; throw conflict;
      }
      const version = existing ? Number(existing.version) + 1 : 1;
      await client.query(
        `INSERT INTO hr_documents(collection_name,document_id,employee_id,status,data,version)
         VALUES($1,$2,$3,$4,$5::jsonb,$6)
         ON CONFLICT(collection_name,document_id) DO UPDATE SET employee_id=EXCLUDED.employee_id,status=EXCLUDED.status,data=EXCLUDED.data,version=EXCLUDED.version,updated_at=now()`,
        [name, id, employeeId, typeof req.body.status === 'string' ? req.body.status : null, JSON.stringify({ ...req.body, id }), version],
      );
      await client.query(
        `INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,previous_version,new_version,previous_data,new_data,correlation_id,source_ip)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`,
        [req.identity.uid, req.identity.roleId, existing ? 'update' : 'create', name, id, existing?.version || null, version, existing ? JSON.stringify(existing.data) : null, JSON.stringify(req.body), req.correlationId, req.ip],
      );
      return version;
    });
    res.setHeader('ETag', `"${result}"`);
    res.status(200).json({ id, version: result });
  } catch (error) { next(error); }
});

router.patch('/:collection/:id', async (req, res, next) => {
  try {
    const current = await pool.query(`SELECT data FROM hr_documents WHERE collection_name=$1 AND document_id=$2`, [req.params.collection, req.params.id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Resource not found.' });
    req.body = { ...current.rows[0].data, ...req.body };
    router.handle({ ...req, method: 'PUT', url: `/${req.params.collection}/${req.params.id}` }, res, next);
  } catch (error) { next(error); }
});

router.delete('/:collection/:id', async (req, res, next) => {
  try {
    const { collection: name, id } = req.params;
    const policy = policyFor(name);
    const current = await pool.query(`SELECT data,employee_id,version FROM hr_documents WHERE collection_name=$1 AND document_id=$2`, [name, id]);
    const row = current.rows[0];
    if (!row) return res.status(204).end();
    const canDelete = policy && (req.identity.roleId === 'role-admin' || allowed(policy.write, req.identity, id, '__not_self__'));
    if (!canDelete || (name === 'attendances' && !req.identity.permissions.has('manage_attendance'))) return res.status(403).json({ error: 'Insufficient permission.' });
    await transaction(async client => {
      await client.query(`DELETE FROM hr_documents WHERE collection_name=$1 AND document_id=$2`, [name, id]);
      await client.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,previous_version,previous_data,correlation_id,source_ip) VALUES($1,$2,'delete',$3,$4,$5,$6::jsonb,$7,$8)`, [req.identity.uid, req.identity.roleId, name, id, row.version, JSON.stringify(row.data), req.correlationId, req.ip]);
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
