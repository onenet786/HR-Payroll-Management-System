// Kiosk terminal API. A terminal registers once with a "Kiosk Terminal" account (use_kiosk permission) and
// receives a device key; every sync and punch must present it. Terminals read only the fields attendance
// needs and can write only attendance punches.
const crypto = require('node:crypto');
const express = require('express');
const { pool } = require('./db.cjs');
const { findLoginUser, verifyUserPassword } = require('./user-secrets.cjs');

const router = express.Router();
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\/\0]/.test(value);
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const pick = (record, fields) => Object.fromEntries(fields.filter(field => record[field] !== undefined).map(field => [field, record[field]]));
// Exactly what the terminal uses; salary, CNIC, bank, contact and payroll data never leave the server.
const SYNC = {
  employees: { table: 'employees', fields: ['id', 'employeeCode', 'fullName', 'status', 'companyId', 'branchId', 'departmentId', 'designationId', 'shift', 'pictureUrl', 'imageUrl', 'photoUrl', 'profileImage', 'faceDescriptors', 'fingerprintTemplates'] },
  biometricTemplates: { table: 'biometric_templates', fields: ['id', 'employeeId', 'employeeCode', 'fullName', 'fingerprintTemplates', 'faceDescriptors', 'updatedAt'] },
  branches: { table: 'branches', fields: ['id', 'companyId', 'name', 'code', 'city', 'province'] },
  departments: { table: 'departments', fields: ['id', 'branchId', 'name', 'code'] },
  designations: { table: 'designations', fields: ['id', 'departmentId', 'title', 'code'] },
  statConfig: { table: 'stat_config', fields: ['id', 'lowConfidenceBiometricPercent'] },
  attendances: { table: 'attendances', fields: null },
};
const PUNCH_METHODS = new Set(['Biometric', 'Camera', 'RFID', 'Mobile Kiosk']);
const REVIEW_FIELDS = ['regularizationApproved', 'reviewedAt', 'reviewedBy', 'reviewedById', 'reviewComment'];

async function permissionsOf(user) {
  if (user?.roleId === 'role-admin') return new Set(['use_kiosk']);
  const role = await pool.query(`SELECT data FROM roles WHERE id=$1`, [user?.roleId]);
  return new Set(role.rows[0]?.data?.permissions || []);
}

async function audit(req, action, documentId, data) {
  await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,$3,'kioskDevices',$4,$5::jsonb,$6,$7)`,
    [req.kiosk?.userId || 'kiosk', 'role-kiosk', action, documentId, JSON.stringify(data || {}), req.correlationId, req.ip]).catch(() => undefined);
}

/** POST /api/kiosk/register {email, password, terminalName} → { deviceToken } */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, terminalName } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) return res.status(400).json({ error: 'Enter the kiosk account email and password.' });
    // Same lookup and password check as the web login, so an account that signs in there registers here.
    const found = await findLoginUser(pool, email);
    const user = found?.data;
    const valid = user ? await verifyUserPassword(pool, user, password) : false;
    if (!user || !valid) return res.status(401).json({ error: 'Invalid kiosk account email or password.' });
    if (user.status !== 'Active') return res.status(403).json({ error: 'This kiosk account is not active.' });
    const permissions = await permissionsOf(user);
    if (user.roleId === 'role-admin' || !permissions.has('use_kiosk')) {
      return res.status(403).json({ error: 'Use an account with the Kiosk Terminal role. Administrator accounts must not be stored on a kiosk.' });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    const id = crypto.randomUUID();
    const name = String(terminalName || 'Kiosk terminal').slice(0, 120);
    await pool.query(`INSERT INTO kiosk_devices(id,user_id,name,token_hash,created_ip) VALUES($1,$2,$3,$4,$5)`, [id, found.id, name, sha256(token), req.ip]);
    req.kiosk = { userId: found.id };
    await audit(req, 'kiosk_device_registered', id, { name });
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ deviceToken: token, deviceId: id, name });
  } catch (error) { next(error); }
});

async function requireKiosk(req, res, next) {
  try {
    const token = req.get('x-kiosk-token') || '';
    if (!token || token.length > 200) return res.status(401).json({ error: 'Kiosk is not registered. Open Settings and sign in with the kiosk account.' });
    const device = (await pool.query(`SELECT id, user_id FROM kiosk_devices WHERE token_hash=$1 AND revoked_at IS NULL`, [sha256(token)])).rows[0];
    if (!device) return res.status(401).json({ error: 'This kiosk has been removed or its key is invalid. Register it again in Settings.' });
    const user = (await pool.query(`SELECT data FROM users WHERE id=$1`, [device.user_id])).rows[0]?.data;
    if (!user || user.status !== 'Active' || !(await permissionsOf(user)).has('use_kiosk')) return res.status(403).json({ error: 'The kiosk account is disabled or no longer has kiosk access.' });
    await pool.query(`UPDATE kiosk_devices SET last_seen_at=now() WHERE id=$1`, [device.id]);
    req.kiosk = { deviceId: device.id, userId: device.user_id };
    next();
  } catch (error) { next(error); }
}

router.get('/sync/:collection', requireKiosk, async (req, res, next) => {
  try {
    const spec = SYNC[req.params.collection];
    if (!spec) return res.status(404).json({ error: 'Not available to kiosks.' });
    const result = spec.table === 'attendances'
      // Recent history only: enough for today's state, cooldowns and an offline backlog.
      ? await pool.query(`SELECT id, data FROM attendances WHERE date >= CURRENT_DATE - 14 ORDER BY id LIMIT 20000`)
      : await pool.query(`SELECT id, data FROM ${spec.table} ORDER BY id LIMIT 10000`);
    const documents = result.rows.map(row => {
      const record = { id: row.id, ...row.data };
      return spec.fields ? pick(record, spec.fields) : record;
    }).filter(record => req.params.collection !== 'employees' || ['Active', 'On Leave'].includes(record.status));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ documents });
  } catch (error) { next(error); }
});

router.post('/punch', requireKiosk, async (req, res, next) => {
  try {
    const { collection, documentId, data } = req.body || {};
    if (collection !== 'attendances') return res.status(403).json({ error: 'Kiosks can only record attendance.' });
    if (!safeId(documentId) || !data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Invalid punch.' });
    if (!safeId(data.employeeId) || !isoDate(data.date) || !PUNCH_METHODS.has(data.method)) return res.status(400).json({ error: 'Punch is missing employee, date or a valid method.' });
    const ageDays = (Date.now() - Date.parse(`${data.date}T00:00:00Z`)) / 86_400_000;
    if (ageDays > 8 || ageDays < -2) return res.status(400).json({ error: 'Punch date is outside the allowed window.' });
    const employee = (await pool.query(`SELECT data FROM employees WHERE id=$1`, [data.employeeId])).rows[0]?.data;
    if (!employee || !['Active', 'On Leave'].includes(employee.status)) return res.status(403).json({ error: 'Employee is not active.' });
    if (employee.separationDate && data.date > employee.separationDate) return res.status(403).json({ error: `Employee's last working day was ${employee.separationDate}.` });
    const locked = await pool.query(`SELECT 1 FROM attendance_periods WHERE id=$1 AND status='Locked'`, [`attendance-period-${data.date.slice(0, 7)}`]);
    if (locked.rowCount) return res.status(409).json({ error: 'That month is locked for payroll.' });
    const existing = (await pool.query(`SELECT data FROM attendances WHERE id=$1`, [documentId])).rows[0]?.data;
    if (existing && (existing.employeeId !== data.employeeId || existing.date !== data.date)) {
      return res.status(409).json({ error: 'This attendance record cannot be changed from a kiosk.' });
    }
    // Kiosks may raise a review (low-confidence match) but never decide one; an HR decision already on the record is kept.
    const record = { ...Object.fromEntries(Object.entries(data).filter(([key]) => !REVIEW_FIELDS.includes(key))), id: documentId, kioskDeviceId: req.kiosk.deviceId };
    for (const field of REVIEW_FIELDS) if (existing?.[field] !== undefined) record[field] = existing[field];
    record.requestedById = existing?.requestedById || (record.regularizationRequested ? req.kiosk.userId : undefined);
    if (record.requestedById === undefined) delete record.requestedById;
    await pool.query(
      `INSERT INTO attendances (id, employee_id, date, status, data, version, updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,1,now())
       ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, status=EXCLUDED.status, version=attendances.version+1, updated_at=now()`,
      [documentId, data.employeeId, data.date, typeof data.status === 'string' ? data.status : null, JSON.stringify(record)],
    );
    await audit(req, 'kiosk_punch', documentId, { employeeId: data.employeeId, date: data.date, method: data.method });
    res.json({ ok: true, id: documentId });
  } catch (error) { next(error); }
});

// Administration (mounted behind authenticate): list and revoke registered terminals.
const adminRouter = express.Router();
const canManage = identity => identity.roleId === 'role-admin' || identity.permissions.has('manage_access') || identity.permissions.has('manage_settings');
adminRouter.get('/', async (req, res, next) => {
  try {
    if (!canManage(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    const result = await pool.query(`SELECT d.id, d.name, d.user_id, u.data->>'username' AS username, d.created_at, d.last_seen_at, d.revoked_at
      FROM kiosk_devices d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.revoked_at NULLS FIRST, d.last_seen_at DESC NULLS LAST, d.created_at DESC LIMIT 200`);
    res.json({ devices: result.rows });
  } catch (error) { next(error); }
});
adminRouter.post('/:id/revoke', async (req, res, next) => {
  try {
    if (!canManage(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    const result = await pool.query(`UPDATE kiosk_devices SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id`, [req.params.id]);
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,correlation_id,source_ip) VALUES($1,$2,'kiosk_device_revoked','kioskDevices',$3,$4,$5)`,
      [req.identity.uid, req.identity.roleId, req.params.id, req.correlationId, req.ip]);
    res.json({ revoked: result.rowCount });
  } catch (error) { next(error); }
});

module.exports = { router, adminRouter, requireKiosk, SYNC };
