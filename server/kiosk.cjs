// Kiosk terminal API. A terminal registers once with a "Kiosk Terminal" account (use_kiosk permission) and
// receives a device key; every sync and punch must present it. Terminals read only the fields attendance
// needs and can write only attendance punches.
const crypto = require('node:crypto');
const express = require('express');
const { pool } = require('./db.cjs');
const { findLoginUser, verifyUserPassword } = require('./user-secrets.cjs');
const installation = require('./installation.cjs');

const router = express.Router();
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\/\0]/.test(value);
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

const pick = (record, fields) => Object.fromEntries(fields.filter(field => record[field] !== undefined).map(field => [field, record[field]]));
// Exactly what the terminal uses; salary, CNIC, bank, contact and payroll data never leave the server.
const SYNC = {
  employees: { table: 'employees', fields: ['id', 'employeeCode', 'fullName', 'status', 'companyId', 'branchId', 'departmentId', 'designationId', 'shift', 'pictureUrl', 'imageUrl', 'photoUrl', 'profileImage', 'faceDescriptors', 'fingerprintTemplates'] },
  biometricTemplates: { table: 'biometric_templates', fields: ['id', 'employeeId', 'employeeCode', 'fullName', 'fingerprintTemplates', 'faceDescriptors', 'updatedAt'] },
  branches: { table: 'branches', fields: ['id', 'companyId', 'name', 'code', 'city', 'province', 'openingTime', 'halfTimeCutoff', 'personalOutAllowanceMinutes'] },
  departments: { table: 'departments', fields: ['id', 'branchId', 'name', 'code'] },
  designations: { table: 'designations', fields: ['id', 'departmentId', 'title', 'code'] },
  // attendancePolicy / companyOptions (optional, see src/types.ts) drive the kiosk's exit buttons and late rules offline.
  statConfig: { table: 'stat_config', fields: ['id', 'updatedAt', 'lowConfidenceBiometricPercent', 'attendancePolicy', 'companyOptions'] },
  attendances: { table: 'attendances', fields: null },
};
const PUNCH_METHODS = new Set(['Biometric', 'Camera', 'RFID', 'Mobile Kiosk']);
const REVIEW_FIELDS = ['regularizationApproved', 'reviewedAt', 'reviewedBy', 'reviewedById', 'reviewComment'];
// Set by the server on every kiosk write; whatever a kiosk sends for these is ignored.
const SERVER_FIELDS = ['kioskDeviceId', 'kioskVersion', 'serverReceivedAt', 'deviceClockSkewSeconds', 'kioskTimeFlags', 'deviceClockUnverified'];
// Status values a kiosk can produce (windows-kiosk/attendance-rules.cjs). 'Holiday' and the rest are HR decisions.
const KIOSK_STATUSES = new Set(['Present', 'Late', 'Half Day', 'On Leave', 'Absent']);
// A punch sent live whose time differs from the server's clock by more than this is flagged for review, as is any
// request from a kiosk whose clock is that far off.
const CLOCK_TOLERANCE_MS = 10 * 60_000;
// A punch that reaches the server from the offline queue more than this many hours after it was made is flagged.
const LATE_UPLOAD_HOURS = (() => { const value = Number(process.env.KIOSK_LATE_PUNCH_HOURS); return Number.isFinite(value) && value > 0 ? value : 12; })();
// Kiosks older than this server do not send their UTC offset; the product runs in Pakistan (UTC+5) by default.
const DEFAULT_UTC_OFFSET_MINUTES = (() => { const value = Number(process.env.KIOSK_DEFAULT_UTC_OFFSET_MINUTES); return Number.isInteger(value) && Math.abs(value) <= 840 ? value : 300; })();
// What a kiosk may still change on a record HR reviewed or edited: the day's progress after the existing punch-in,
// never the punch-in itself, the status HR set, completed exits or the review.
const PROGRESS_FIELDS = ['punchOut', 'outReason', 'breaks', 'lastPunchAt', 'overtimeMinutes', 'personalOutMinutes', 'personalOutExceeded',
  'terminalId', 'terminalLocation', 'evidenceId', 'kioskInstallIds', 'terminalBranchId', 'crossBranch', 'deviceUtcOffsetMinutes'];

// Seconds since midnight for 'HH:MM[:SS]' or an ISO date-time, else null.
function secondsOfDay(value) {
  const match = /(?:^|T)(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value || ''));
  if (!match) return null;
  const [h, m, s] = match.slice(1).map(part => Number(part || 0));
  return h < 24 && m < 60 && s < 60 ? h * 3600 + m * 60 + s : null;
}

// Minutes between punch-in and punch-out; a punch-out earlier in the day than the punch-in crossed midnight.
function punchSpanMinutes(record) {
  const start = secondsOfDay(record.punchIn);
  const end = secondsOfDay(record.punchOut);
  if (start === null || end === null) return 0;
  return Math.floor(((end - start + 86_400) % 86_400) / 60);
}

// Instant of the record's latest event (lastPunchAt, else punch-out / punch-in) from its date and the kiosk's UTC offset.
function latestEventInstant(record) {
  const at = secondsOfDay(record.lastPunchAt) ?? secondsOfDay(record.punchOut) ?? secondsOfDay(record.punchIn);
  if (at === null) return null;
  const offset = Number.isInteger(record.deviceUtcOffsetMinutes) && Math.abs(record.deviceUtcOffsetMinutes) <= 840 ? record.deviceUtcOffsetMinutes : DEFAULT_UTC_OFFSET_MINUTES;
  const start = secondsOfDay(record.punchIn);
  const nextDay = start !== null && at < start ? 86_400_000 : 0;
  return Date.parse(`${record.date}T00:00:00Z`) + at * 1000 + nextDay - offset * 60_000;
}

// PostgreSQL jsonb stores object keys in its own order, so stored and incoming records are compared key-order-free.
const canonicalJson = value => (Array.isArray(value) ? value.map(canonicalJson)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])])) : value);
const sameRecord = (left, right) => JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
const minutesText = ms => `${Math.round(Math.abs(ms) / 60_000)} min`;

// Reasons to put a kiosk punch in front of HR because its time cannot be trusted as sent. sentAt is the kiosk's clock
// when it sent the request; queued is true for punches sent from the offline queue.
function timeFlags(record, { now, sentAt, queued }) {
  const flags = [];
  if (Number.isFinite(sentAt) && Math.abs(sentAt - now) > CLOCK_TOLERANCE_MS) {
    flags.push(`Kiosk clock was ${minutesText(sentAt - now)} ${sentAt > now ? 'ahead of' : 'behind'} the server when this punch was sent`);
  }
  const instant = latestEventInstant(record);
  if (instant !== null) {
    if (instant - now > CLOCK_TOLERANCE_MS) flags.push(`Punch time is ${minutesText(instant - now)} later than the server's receive time`);
    // A kiosk older than this server sends no deviceSentAt, so it cannot say whether a punch was live or queued:
    // only the late-upload check applies to it.
    else if (!queued && Number.isFinite(sentAt) && now - instant > CLOCK_TOLERANCE_MS) flags.push(`Punch sent live but its time is ${minutesText(now - instant)} before the server's receive time`);
    else if ((queued || !Number.isFinite(sentAt)) && now - instant > LATE_UPLOAD_HOURS * 3_600_000) flags.push(`Punch reached the server ${Math.round((now - instant) / 3_600_000)} h after it was made (offline queue)`);
  }
  return flags;
}

async function permissionsOf(user) {
  if (user?.roleId === 'role-admin') return new Set(['use_kiosk']);
  const role = await pool.query(`SELECT data FROM roles WHERE id=$1`, [user?.roleId]);
  return new Set(role.rows[0]?.data?.permissions || []);
}

async function audit(req, action, documentId, data) {
  await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,$3,'kioskDevices',$4,$5::jsonb,$6,$7)`,
    [req.kiosk?.userId || 'kiosk', 'role-kiosk', action, documentId, JSON.stringify(data || {}), req.correlationId, req.ip]).catch(() => undefined);
}

/**
 * POST /api/kiosk/register → { deviceToken }
 *   {setupToken, terminalName}        one-time kiosk setup code (Provider Console or Kiosk devices screen), or
 *   {email, password, terminalName}   a Kiosk Terminal account.
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, terminalName, setupToken } = req.body || {};
    if (typeof setupToken === 'string' && setupToken) {
      const grant = await installation.consumeKioskSetupToken(pool, setupToken);
      if (!grant) return res.status(401).json({ error: 'This kiosk setup code is invalid, expired or already used. Ask your administrator for a new code.' });
      const token = crypto.randomBytes(32).toString('base64url');
      const id = crypto.randomUUID();
      const name = String(terminalName || grant.label || 'Kiosk terminal').slice(0, 120);
      await pool.query(`INSERT INTO kiosk_devices(id,user_id,name,token_hash,created_ip) VALUES($1,$2,$3,$4,$5)`, [id, grant.userId, name, sha256(token), req.ip]);
      req.kiosk = { userId: grant.userId };
      await audit(req, 'kiosk_device_registered', id, { name, via: 'setup-code' });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ deviceToken: token, deviceId: id, name });
    }
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

// A Multi-Face kiosk refused a punch because the face was shown on a phone, screen or print. The kiosk keeps the
// evidence photo; HR gets a high-priority notification addressed to the HR team (targetEmployeeId 'hr-team', so
// employees never see it). Idempotent per kiosk alert id, and limited to 30 alerts per kiosk per hour.
const ALERT_DEVICES = new Set(['cell phone', 'tv', 'laptop', 'book']);
const DEVICE_WORDS = { 'cell phone': 'mobile phone', tv: 'screen', laptop: 'laptop screen', book: 'printed photo or paper' };
const text = (value, max = 120) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
router.post('/security-alert', requireKiosk, async (req, res, next) => {
  try {
    const alert = req.body?.alert;
    if (!alert || typeof alert !== 'object' || Array.isArray(alert)) return res.status(400).json({ error: 'Invalid alert.' });
    if (typeof alert.id !== 'string' || !/^alert-[A-Za-z0-9-]{1,60}$/.test(alert.id)) return res.status(400).json({ error: 'Invalid alert id.' });
    if (alert.kind !== 'spoof-device' || !ALERT_DEVICES.has(alert.device)) return res.status(400).json({ error: 'Unknown alert kind.' });
    if (!safeId(alert.employeeId)) return res.status(400).json({ error: 'Alert is missing the employee.' });
    const at = Date.parse(typeof alert.at === 'string' ? alert.at : '');
    if (!Number.isFinite(at) || Math.abs(Date.now() - at) > 8 * 86_400_000) return res.status(400).json({ error: 'Alert time is outside the allowed window.' });
    const id = `kiosk-alert-${req.kiosk.deviceId}-${alert.id}`.slice(0, 240);
    const prefix = `kiosk-alert-${req.kiosk.deviceId}-`;
    const recent = await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE left(id, $2) = $1 AND created_at > now() - interval '1 hour'`, [prefix, prefix.length]);
    if (recent.rows[0].n >= 30) return res.status(429).json({ error: 'Too many alerts from this kiosk; the rest stay in its event log.' });
    const kioskName = (await pool.query(`SELECT name FROM kiosk_devices WHERE id=$1`, [req.kiosk.deviceId])).rows[0]?.name || 'Kiosk';
    const employee = (await pool.query(`SELECT data FROM employees WHERE id=$1`, [alert.employeeId])).rows[0]?.data || {};
    const who = text(employee.fullName || alert.employeeName || 'an employee');
    const code = text(employee.employeeCode || alert.employeeCode, 40);
    const when = new Date(at).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const data = {
      id,
      type: 'system',
      priority: 'high',
      title: 'Kiosk blocked a photo / screen attempt',
      message: `${text(kioskName)} (${text(alert.cameraName, 60) || 'camera'}) refused a punch for ${who}${code ? ` (${code})` : ''} at ${when}: the face was shown on a ${DEVICE_WORDS[alert.device]}. `
        + `Nothing was recorded. The evidence photo is kept on the kiosk${alert.evidenceId ? ` (${text(alert.evidenceId, 60)})` : ''}: check who was at the camera.`,
      targetEmployeeId: 'hr-team',
      createdAt: new Date().toISOString(),
      readBy: [],
      source: 'kiosk-security',
      kioskDeviceId: req.kiosk.deviceId,
      employeeId: alert.employeeId,
    };
    const inserted = await pool.query(
      `INSERT INTO notifications(id, target_employee_id, type, priority, data) VALUES($1,'hr-team','system','high',$2) ON CONFLICT (id) DO NOTHING`,
      [id, data]);
    if (inserted.rowCount) await audit(req, 'kiosk_spoof_alert', id, { employeeId: alert.employeeId, device: alert.device });
    res.status(inserted.rowCount ? 201 : 200).json({ ok: true, id });
  } catch (error) { next(error); }
});

router.post('/punch', requireKiosk, async (req, res, next) => {
  try {
    const { collection, documentId, data, deviceSentAt, queued } = req.body || {};
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
    const row = (await pool.query(`SELECT data, version FROM attendances WHERE id=$1`, [documentId])).rows[0];
    const existing = row?.data;
    if (existing && (existing.employeeId !== data.employeeId || existing.date !== data.date)) {
      return res.status(409).json({ error: 'This attendance record cannot be changed from a kiosk.' });
    }
    // A kiosk adds to a day (punch-out, exits, returns); it never moves the punch-in or rewrites completed exits.
    const breaksOf = record => (Array.isArray(record?.breaks) ? record.breaks : []);
    if (existing?.punchIn && data.punchIn !== existing.punchIn) {
      return res.status(409).json({ error: 'The punch-in of this attendance record cannot be changed from a kiosk.' });
    }
    if (existing && breaksOf(existing).some((item, index) => !sameRecord(item, breaksOf(data)[index]))) {
      return res.status(409).json({ error: 'Recorded exits on this attendance record cannot be changed from a kiosk.' });
    }
    // A record HR entered by hand (Manual, leave day, web punch) is never touched by a kiosk.
    if (existing && !PUNCH_METHODS.has(existing.method) && existing.method !== 'Mobile GPS') {
      return res.status(409).json({ error: 'This attendance record was entered by HR and cannot be changed from a kiosk.' });
    }
    // HR reviewed or edited the record (a decision, a reviewer, or any save since the kiosk's last write): the kiosk
    // may add only the day's progress; HR's status, times and decision stay as they are.
    // A day started on the phone (Mobile GPS) keeps its mobile evidence: the kiosk adds only the day's progress.
    const hrTouched = !!existing && (existing.method === 'Mobile GPS' || existing.regularizationApproved !== undefined || !!existing.reviewedById
      || (existing.kioskVersion !== undefined && Number(existing.kioskVersion) !== Number(row.version)));
    // A punch-out HR set or corrected is replaced only by a return from that exit (which records it as a break).
    if (hrTouched && existing.punchOut && data.punchOut !== existing.punchOut && breaksOf(data).length === breaksOf(existing).length) {
      return res.status(409).json({ error: 'HR has already reviewed this attendance record; contact HR to correct it.' });
    }
    const incoming = Object.fromEntries(Object.entries(data).filter(([key]) => !REVIEW_FIELDS.includes(key) && !SERVER_FIELDS.includes(key)));
    const record = hrTouched
      ? { ...existing, ...Object.fromEntries(PROGRESS_FIELDS.filter(field => incoming[field] !== undefined).map(field => [field, incoming[field]])) }
      : { ...incoming };
    const now = Date.now();
    Object.assign(record, { id: documentId, kioskDeviceId: req.kiosk.deviceId, serverReceivedAt: new Date(now).toISOString() });
    const sentAt = Date.parse(typeof deviceSentAt === 'string' ? deviceSentAt : '');
    if (Number.isFinite(sentAt)) {
      record.deviceClockSkewSeconds = Math.round((sentAt - now) / 1000);
      delete record.deviceClockUnverified;
    } else {
      // A kiosk older than this server: its clock cannot be compared, only the punch time against the receive time.
      record.deviceClockUnverified = true;
    }
    // The server cannot re-run the kiosk's shift rules (shift, branch timings, policy and night-shift matching live on
    // the kiosk), so it keeps the status to the values a kiosk can produce and overtime within the punch span.
    if (!hrTouched && !KIOSK_STATUSES.has(record.status)) record.status = 'Present';
    const overtime = Math.floor(Number(record.overtimeMinutes));
    record.overtimeMinutes = record.punchOut && Number.isFinite(overtime) ? Math.min(Math.max(overtime, 0), punchSpanMinutes(record)) : 0;
    // Kiosks may raise a review (low-confidence match, multi-face punch) but never decide one; HR's decision is kept.
    for (const field of REVIEW_FIELDS) {
      if (existing?.[field] !== undefined) record[field] = existing[field];
      else delete record[field];
    }
    const decided = existing?.regularizationApproved !== undefined;
    const reasons = [];
    // A review raised earlier (by a kiosk or by this server) stays raised until HR decides it.
    if (!decided && existing?.regularizationRequested === true) {
      record.regularizationRequested = true;
      if (existing.regularizationReason) reasons.push(existing.regularizationReason);
    }
    if (!decided && record.regularizationRequested === true && typeof incoming.regularizationReason === 'string') reasons.push(incoming.regularizationReason.slice(0, 500));
    const flags = decided ? [] : timeFlags(record, { now, sentAt, queued: queued === true });
    if (flags.length) {
      record.regularizationRequested = true;
      record.requestedAt = record.requestedAt || new Date(now).toISOString();
      reasons.push(...flags);
    }
    const allFlags = [...new Set([...(Array.isArray(existing?.kioskTimeFlags) ? existing.kioskTimeFlags : []), ...flags])].slice(-10);
    if (allFlags.length) record.kioskTimeFlags = allFlags;
    if (reasons.length) record.regularizationReason = [...new Set(reasons)].join('; ').slice(0, 1000);
    if (record.regularizationRequested !== true) delete record.regularizationRequested;
    record.requestedById = existing?.requestedById || (record.regularizationRequested ? req.kiosk.userId : undefined);
    if (record.requestedById === undefined) delete record.requestedById;
    const version = row ? Number(row.version) + 1 : 1;
    record.kioskVersion = version;
    // Optimistic lock: an HR save between the read above and this write must not be overwritten.
    const written = await pool.query(
      `INSERT INTO attendances (id, employee_id, date, status, data, version, updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,now())
       ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, status=EXCLUDED.status, version=EXCLUDED.version, updated_at=now()
       WHERE attendances.version = $7`,
      [documentId, data.employeeId, data.date, typeof record.status === 'string' ? record.status : null, JSON.stringify(record), version, row ? Number(row.version) : 0],
    );
    // 503 (not 409): the kiosk keeps the punch queued and sends it again against the new record.
    if (!written.rowCount) return res.status(503).json({ error: 'The attendance record changed while this punch was saved; it will be sent again.' });
    await audit(req, 'kiosk_punch', documentId, { employeeId: data.employeeId, date: data.date, method: data.method, ...(flags.length && { timeFlags: flags }), ...(hrTouched && { progressOnly: true }) });
    res.json({ ok: true, id: documentId, ...(record.regularizationRequested && { regularizationRequested: true }) });
  } catch (error) { next(error); }
});

// Administration (mounted behind authenticate): list and revoke registered terminals.
const adminRouter = express.Router();
const canManage = identity => identity.roleId === 'role-admin' || identity.permissions.has('manage_access') || identity.permissions.has('manage_settings');
adminRouter.get('/', async (req, res, next) => {
  try {
    if (!canManage(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    const result = await pool.query(`SELECT d.id, d.name, d.user_id, COALESCE(NULLIF(u.data->>'username',''), NULLIF(u.data->>'name',''), u.data->>'email') AS username, d.created_at, d.last_seen_at, d.revoked_at
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

// Kiosk setup codes: one-time codes that register a terminal without typing an account password at the branch.
adminRouter.get('/setup-codes', async (req, res, next) => {
  try {
    if (!canManage(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    res.json({ codes: await installation.listKioskSetupTokens(pool) });
  } catch (error) { next(error); }
});
adminRouter.post('/setup-codes', async (req, res, next) => {
  try {
    if (!canManage(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    const { label, expiresInHours, maxUses } = req.body || {};
    const company = (await pool.query(`SELECT data->>'name' AS name FROM companies ORDER BY id LIMIT 1`)).rows[0]?.name || '';
    const urls = await installation.deviceUrls(pool, process.env.APP_URL);
    // No address configured: use the one the administrator is using right now (the browser's Origin header),
    // so the code still tells the kiosk where the server is.
    if (!urls.length) {
      const here = installation.originOf(req.get('origin') || '');
      if (here) urls.push(here);
    }
    if (!urls.length) return res.status(400).json({ error: 'The server address is unknown. Set APP_URL in .env (or the domain in the installation settings), then try again.' });
    const created = await installation.createKioskSetupToken(pool, { label, expiresInHours, maxUses, createdBy: req.identity.uid, clientName: company, urls });
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,'kiosk_setup_code_created','kioskDevices',$3,$4::jsonb,$5,$6)`,
      [req.identity.uid, req.identity.roleId, created.id, JSON.stringify({ label, maxUses: created.maxUses, expiresAt: created.expiresAt }), req.correlationId, req.ip]);
    res.setHeader('Cache-Control', 'no-store');
    res.status(201).json({ ...created, urls });
  } catch (error) { next(error); }
});
adminRouter.post('/setup-codes/:id/revoke', async (req, res, next) => {
  try {
    if (!canManage(req.identity)) return res.status(403).json({ error: 'Access administrator permission required.' });
    await installation.revokeKioskSetupToken(pool, req.params.id);
    res.json({ revoked: true });
  } catch (error) { next(error); }
});

module.exports = { router, adminRouter, requireKiosk, SYNC, timeFlags, punchSpanMinutes, latestEventInstant };
