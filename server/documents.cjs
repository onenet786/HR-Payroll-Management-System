const express = require('express');
const crypto = require('node:crypto');
const { transaction, pool } = require('./db.cjs');
const { policyFor, allowed, getTableName } = require('./collections.cjs');

const router = express.Router();
const safeName = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(value);
const safeId = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\/\0]/.test(value);
const employeeIdOf = data => typeof data?.employeeId === 'string' ? data.employeeId : null;
const adjustmentTypes = new Set(['Bonus', 'Commission', 'Arrears', 'Reimbursement', 'Deduction', 'Tax Adjustment']);
const adjustmentCoreUnchanged = (before, after) => ['employeeId', 'periodMonth', 'periodYear', 'type', 'amount', 'taxable', 'reason', 'createdAt', 'createdById', 'createdBy']
  .every(field => before[field] === after[field]);
const bankAdviceHash = payslips => crypto.createHash('sha256').update(JSON.stringify(payslips.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).map(item => ({
  id: item.id, employeeId: item.employeeId, employeeCode: item.employeeCode,
  bankName: item.bankName, iban: String(item.iban || '').replace(/\s/g, '').toUpperCase(),
  bankAccountNumber: item.bankAccountNumber, netSalary: item.netSalary,
})))).digest('hex');

function geoDistanceMeters(latA, lonA, latB, lonB) {
  const radians = degrees => degrees * Math.PI / 180;
  const deltaLat = radians(latB - latA);
  const deltaLon = radians(lonB - lonA);
  const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(deltaLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function validGpsEvidence(location) {
  if (!location || location.source !== 'device-gps') return false;
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90) return false;
  if (!Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) return false;
  if (!Number.isFinite(location.accuracyMeters) || location.accuracyMeters <= 0 || location.accuracyMeters > 100) return false;
  const capturedAt = Date.parse(location.capturedAt);
  return Number.isFinite(capturedAt) && capturedAt <= Date.now() + 60_000 && Date.now() - capturedAt <= 5 * 60_000;
}

function attendanceIntegrityHash(records) {
  const canonical = records
    .slice()
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(item => [item.id, item.employeeId, item.date, item.punchIn || '', item.punchOut || '', item.status, item.method, item.overtimeMinutes, item.regularizationApproved ?? ''].join('|'))
    .join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

async function authorizeWrite(client, name, table, id, identity, existing, next) {
  const policy = policyFor(name);
  const employeeId = employeeIdOf(next) || (name === 'employees' || name === 'biometricTemplates' || table === 'employees' || table === 'biometric_templates' ? id : null);
  if (!policy || !allowed(policy.write, identity, id, employeeId)) return false;
  if ((name === 'attendancePeriods' || table === 'attendance_periods') && !existing) {
    if (next.status !== 'Locked' || !Number.isInteger(next.periodMonth) || !Number.isInteger(next.periodYear)) return false;
    const prefix = `${next.periodYear}-${String(next.periodMonth).padStart(2, '0')}`;
    if (id !== `attendance-period-${prefix}`) return false;
    const result = await client.query(
      `SELECT data FROM attendances WHERE date >= $1 AND date < ($1::date + INTERVAL '1 month') ORDER BY id`,
      [`${prefix}-01`],
    );
    const records = result.rows.map(row => row.data);
    if (!records.length || next.attendanceCount !== records.length || next.integrityHash !== attendanceIntegrityHash(records)) return false;
  }
  if ((name === 'payrollRuns' || table === 'payroll_runs') && !existing) {
    if (next.status !== 'Draft' || next.createdById !== identity.uid || next.approvedAt || next.disbursedAt) return false;
    if (!Number.isInteger(next.periodMonth) || !Number.isInteger(next.periodYear) || next.preflightCriticalCount !== 0) return false;
    const duplicate = await client.query(
      `SELECT 1 FROM payroll_runs WHERE data->>'periodYear'=$1 AND data->>'periodMonth'=$2 AND id<>$3 LIMIT 1`,
      [String(next.periodYear), String(next.periodMonth), id],
    );
    if (duplicate.rowCount) return false;
    if (typeof next.attendancePeriodId !== 'string' || typeof next.attendanceIntegrityHash !== 'string') return false;
    const locked = await client.query(
      `SELECT data FROM attendance_periods WHERE id=$1 AND status='Locked' FOR SHARE`,
      [next.attendancePeriodId],
    );
    if (!locked.rows[0] || locked.rows[0].data.integrityHash !== next.attendanceIntegrityHash) return false;
  }
  if ((name === 'payrollRuns' || table === 'payroll_runs') && existing) {
    const previous = existing.data;
    if (next.createdById !== previous.createdById || next.attendancePeriodId !== previous.attendancePeriodId
      || next.attendanceIntegrityHash !== previous.attendanceIntegrityHash) return false;
    if (previous.status === 'Draft') {
      if (next.status !== 'Approved' || identity.uid === previous.createdById || next.approvedById !== identity.uid || !next.approvedAt) return false;
      const payslipResult = await client.query(`SELECT data FROM payroll_payslips WHERE payroll_run_id=$1 OR data->>'payrollRunId'=$1`, [id]);
      if (!payslipResult.rowCount || payslipResult.rowCount !== previous.employeeCount) return false;
      const sheets = payslipResult.rows.map(row => row.data);
      const employeeIds = sheets.map(sheet => sheet.employeeId);
      const employeeResult = await client.query(`SELECT id, data FROM employees WHERE id=ANY($1::varchar[])`, [employeeIds]);
      if (employeeResult.rowCount !== employeeIds.length) return false;
      for (const row of employeeResult.rows) {
        const employee = row.data;
        const iban = String(employee.iban || '').replace(/\s/g, '');
        if (!/^\d{5}-\d{7}-\d$/.test(employee.cnic || '') || !String(employee.bankName || '').trim()
          || !String(employee.bankAccountNumber || '').trim() || (iban && !/^PK\d{2}[A-Z0-9]{20}$/i.test(iban))) return false;
      }
      const totals = sheets.reduce((sum, sheet) => ({
        gross: sum.gross + Number(sheet.grossSalary || 0), deductions: sum.deductions + Number(sheet.totalDeductions || 0), net: sum.net + Number(sheet.netSalary || 0),
      }), { gross: 0, deductions: 0, net: 0 });
      if (sheets.some(sheet => !Number.isFinite(sheet.netSalary) || sheet.netSalary <= 0)
        || Math.abs(totals.gross - previous.totalGrossPay) > 0.01
        || Math.abs(totals.deductions - previous.totalDeductions) > 0.01
        || Math.abs(totals.net - previous.totalNetPay) > 0.01) return false;
    } else if (previous.status === 'Approved') {
      const payslipResult = await client.query(`SELECT data FROM payroll_payslips WHERE payroll_run_id=$1 OR data->>'payrollRunId'=$1`, [id]);
      const sheets = payslipResult.rows.map(row => row.data);
      const currentHash = bankAdviceHash(sheets);
      const currentTotal = sheets.reduce((sum, sheet) => sum + Number(sheet.netSalary || 0), 0);
      if (next.status === 'Approved') {
        if (next.approvedById !== previous.approvedById || next.approvedAt !== previous.approvedAt
          || next.bankAdviceGeneratedById !== identity.uid || !next.bankAdviceGeneratedAt
          || next.bankAdviceChecksum !== currentHash || next.bankAdviceEmployeeCount !== sheets.length
          || Math.abs(next.bankAdviceTotal - currentTotal) > 0.01 || next.disbursementReference) return false;
      } else if (next.status === 'Disbursed') {
        if (identity.uid === previous.approvedById || next.disbursedById !== identity.uid || !next.disbursedAt
          || !previous.bankAdviceChecksum || previous.bankAdviceChecksum !== currentHash
          || next.bankAdviceChecksum !== previous.bankAdviceChecksum
          || typeof next.disbursementReference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9\/_ .-]{2,99}$/.test(next.disbursementReference)) return false;
      } else return false;
    } else return false;
  }
  if (name === 'payrollAdjustments' || table === 'payroll_adjustments') {
    if (!existing) {
      const nonTaxableType = next.type === 'Reimbursement' || next.type === 'Deduction' || next.type === 'Tax Adjustment';
      if (!safeId(next.employeeId) || !Number.isInteger(next.periodMonth) || next.periodMonth < 1 || next.periodMonth > 12
        || !Number.isInteger(next.periodYear) || next.periodYear < 2020 || next.periodYear > 2100
        || !adjustmentTypes.has(next.type) || !Number.isFinite(next.amount) || next.amount <= 0
        || typeof next.reason !== 'string' || !next.reason.trim() || next.reason.length > 500
        || next.status !== 'Pending' || next.createdById !== identity.uid || typeof next.createdAt !== 'string'
        || !Number.isFinite(Date.parse(next.createdAt)) || next.reviewedAt || next.reviewedById || next.payrollRunId
        || typeof next.taxable !== 'boolean' || (nonTaxableType && next.taxable)) return false;
    } else {
      const previous = existing.data;
      if (!adjustmentCoreUnchanged(previous, next)) return false;
      if (previous.status === 'Pending') {
        if (!['Approved', 'Rejected'].includes(next.status) || identity.uid === previous.createdById
          || next.reviewedById !== identity.uid || !next.reviewedAt || !Number.isFinite(Date.parse(next.reviewedAt))
          || next.payrollRunId) return false;
      } else if (previous.status === 'Approved' && !previous.payrollRunId) {
        if (next.status !== 'Approved' || next.reviewedById !== previous.reviewedById || next.reviewedAt !== previous.reviewedAt
          || !safeId(next.payrollRunId)) return false;
        const run = await client.query(`SELECT data FROM payroll_runs WHERE id=$1 FOR SHARE`, [next.payrollRunId]);
        const runData = run.rows[0]?.data;
        if (!runData || runData.status !== 'Draft' || runData.periodMonth !== previous.periodMonth || runData.periodYear !== previous.periodYear) return false;
      } else return false;
    }
  }
  if ((name === 'attendances' || table === 'attendances') && existing) {
    const recordDate = next.date || existing.data.date;
    if (typeof recordDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
      const periodId = `attendance-period-${recordDate.slice(0, 7)}`;
      const locked = await client.query(`SELECT 1 FROM attendance_periods WHERE id=$1 AND status='Locked'`, [periodId]);
      if (locked.rowCount) return false;
    }
  }
  if ((name === 'attendances' || table === 'attendances') && next.method === 'Mobile GPS') {
    const location = next.punchOutLocation || next.punchInLocation;
    if (!validGpsEvidence(location)) return false;
    const employeeResult = await client.query(`SELECT data FROM employees WHERE id=$1`, [employeeId]);
    const employee = employeeResult.rows[0]?.data;
    if (!employee || typeof employee.branchId !== 'string') return false;
    const branchResult = await client.query(`SELECT data FROM branches WHERE id=$1`, [employee.branchId]);
    const branch = branchResult.rows[0]?.data;
    const configured = Number.isFinite(branch?.geofenceLatitude) && Number.isFinite(branch?.geofenceLongitude)
      && Number.isFinite(branch?.geofenceRadiusMeters) && branch.geofenceRadiusMeters >= 25;
    if (!configured) {
      next.geofenceStatus = 'needs-review';
      next.regularizationRequested = true;
      next.regularizationReason = next.regularizationReason || 'Branch geofence is not configured; verify mobile attendance location.';
    } else {
      const distance = geoDistanceMeters(location.latitude, location.longitude, branch.geofenceLatitude, branch.geofenceLongitude);
      next.geofenceDistanceMeters = distance;
      if (distance <= branch.geofenceRadiusMeters) next.geofenceStatus = 'inside';
      else {
        next.geofenceStatus = 'authorized-offsite';
        next.regularizationRequested = true;
        next.regularizationReason = next.regularizationReason || `Authorized off-site mobile punch (${distance} metres from branch); manager review required.`;
      }
    }
  }
  if ((name === 'attendances' || table === 'attendances')) {
    if (!existing && (next.method === 'Manual' || next.regularizationRequested === true)) {
      next.regularizationRequested = true;
      next.requestedById = identity.uid;
      delete next.regularizationApproved;
      delete next.reviewedAt;
      delete next.reviewedBy;
      delete next.reviewedById;
    }
    if (existing?.data?.requestedById) next.requestedById = existing.data.requestedById;
    if (existing && existing.data.regularizationApproved === undefined && typeof next.regularizationApproved === 'boolean') {
      if (existing.data.requestedById === identity.uid || next.reviewedById !== identity.uid || !next.reviewedAt) return false;
    }
    if (existing && existing.data.regularizationApproved !== undefined
      && next.regularizationApproved !== existing.data.regularizationApproved) return false;
  }
  if (identity.roleId === 'role-admin' || allowed(policy.write, identity, id, '__not_self__')) return true;
  if (!identity.employeeId || identity.employeeId !== employeeId) return false;
  if (name === 'leaves' || table === 'leaves') return !existing && next.status === 'Pending';
  if (name === 'loanAdvances' || table === 'loan_advances') return !existing && next.status === 'Pending';
  if (name !== 'attendances' && table !== 'attendances') return false;
  if (existing && existing.data.employeeId !== next.employeeId) return false;
  if (!existing && next.regularizationRequested === true) return true;
  if (next.method !== 'Mobile GPS' || typeof next.mobileDutyAuthorizationId !== 'string') return false;
  const authorization = await client.query(
    `SELECT data FROM mobile_duty_authorizations WHERE id=$1`,
    [next.mobileDutyAuthorizationId],
  );
  const duty = authorization.rows[0]?.data;
  return Boolean(duty && duty.employeeId === employeeId && duty.status === 'Approved' && duty.validFrom <= next.date && duty.validTo >= next.date);
}

router.get('/:collection', async (req, res, next) => {
  try {
    const name = req.params.collection;
    const table = getTableName(name);
    const policy = policyFor(name);
    if (!table || !policy) return res.status(404).json({ error: 'Unknown collection.' });
    const requestedEmployee = typeof req.query.employeeId === 'string' ? req.query.employeeId : null;
    const canReadAll = policy.read.startsWith('selfUserOr:')
      ? allowed(policy.read, req.identity, '__not_self__', null)
      : allowed(policy.read, req.identity, '', null) && !policy.read.startsWith('selfEmployeeOr:') && policy.read !== 'selfUser';
    const managedRead = policy.read.startsWith('selfEmployeeOr:') && allowed(policy.read, req.identity, '', '__not_self__');
    let employeeFilter = requestedEmployee;
    if (!canReadAll && !managedRead) employeeFilter = req.identity.employeeId;
    if ((policy.read === 'selfUser' || policy.read.startsWith('selfUserOr:')) && !canReadAll) {
      const result = await pool.query(`SELECT id AS document_id, data, version, updated_at FROM ${table} WHERE id=$1`, [req.identity.uid]);
      return res.json({ documents: result.rows });
    }
    if (!allowed(policy.read, req.identity, '', employeeFilter)) return res.status(403).json({ error: 'Insufficient permission.' });
    const params = [];
    let sql = `SELECT id AS document_id, data, version, updated_at FROM ${table}`;
    if (employeeFilter) {
      params.push(employeeFilter);
      sql += ` WHERE (employee_id=$1 OR data->>'employeeId'=$1)`;
    }
    sql += ` ORDER BY id LIMIT 10000`;
    const result = await pool.query(sql, params);
    res.json({ documents: result.rows });
  } catch (error) { next(error); }
});

router.get('/:collection/:id', async (req, res, next) => {
  try {
    const { collection: name, id } = req.params;
    const table = getTableName(name);
    const policy = policyFor(name);
    if (!table || !policy || !safeId(id)) return res.status(404).json({ error: 'Unknown resource.' });
    const result = await pool.query(`SELECT id AS document_id, employee_id, data, version, updated_at FROM ${table} WHERE id=$1`, [id]);
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
    const table = getTableName(name);
    const policy = policyFor(name);
    if (!table || !policy || !safeId(id) || !req.body || Array.isArray(req.body)) return res.status(400).json({ error: 'Invalid document.' });
    const result = await transaction(async client => {
      const current = await client.query(`SELECT data, version FROM ${table} WHERE id=$1 FOR UPDATE`, [id]);
      const existing = current.rows[0];
      const employeeId = employeeIdOf(req.body) || (table === 'employees' || table === 'biometric_templates' ? id : null);
      if (!await authorizeWrite(client, name, table, id, req.identity, existing, req.body)) {
        const forbidden = new Error('Insufficient permission.'); forbidden.status = 403; throw forbidden;
      }
      const expected = req.get('if-match')?.replaceAll('"', '');
      if (expected && existing && Number(expected) !== Number(existing.version)) {
        const conflict = new Error('Document changed since it was read.'); conflict.status = 409; throw conflict;
      }
      const version = existing ? Number(existing.version) + 1 : 1;
      const status = typeof req.body.status === 'string' ? req.body.status : (table === 'users' || table === 'companies' ? 'Active' : null);
      if (table === 'attendances') {
        const recordDate = req.body.date || (typeof req.body.punchIn === 'string' && req.body.punchIn.length >= 10 ? req.body.punchIn.slice(0, 10) : null);
        await client.query(
          `INSERT INTO attendances(id, employee_id, date, status, data, version, updated_at)
           VALUES($1, $2, $3, $4, $5::jsonb, $6, now())
           ON CONFLICT(id) DO UPDATE SET
             employee_id = EXCLUDED.employee_id,
             date = COALESCE(EXCLUDED.date, attendances.date),
             status = COALESCE(EXCLUDED.status, attendances.status),
             data = EXCLUDED.data,
             version = EXCLUDED.version,
             updated_at = now()`,
          [id, employeeId, recordDate, status, JSON.stringify({ ...req.body, id }), version],
        );
      } else if (table === 'payroll_payslips') {
        await client.query(
          `INSERT INTO payroll_payslips(id, payroll_run_id, employee_id, status, net_salary, data, version, updated_at)
           VALUES($1, $2, $3, $4, $5, $6::jsonb, $7, now())
           ON CONFLICT(id) DO UPDATE SET payroll_run_id=EXCLUDED.payroll_run_id, employee_id=EXCLUDED.employee_id,
             status=COALESCE(EXCLUDED.status, payroll_payslips.status), net_salary=EXCLUDED.net_salary,
             data=EXCLUDED.data, version=EXCLUDED.version, updated_at=now()`,
          [id, req.body.payrollRunId || null, employeeId, status, Number(req.body.netSalary || 0), JSON.stringify({ ...req.body, id }), version],
        );
      } else if (table === 'payroll_runs') {
        await client.query(
          `INSERT INTO payroll_runs(id, month, employee_id, status, data, version, updated_at)
           VALUES($1, $2, $3, $4, $5::jsonb, $6, now())
           ON CONFLICT(id) DO UPDATE SET month=EXCLUDED.month, employee_id=EXCLUDED.employee_id,
             status=COALESCE(EXCLUDED.status, payroll_runs.status), data=EXCLUDED.data, version=EXCLUDED.version, updated_at=now()`,
          [id, `${req.body.periodYear}-${String(req.body.periodMonth).padStart(2, '0')}`, employeeId, status, JSON.stringify({ ...req.body, id }), version],
        );
      } else {
        await client.query(
          `INSERT INTO ${table}(id, employee_id, status, data, version, updated_at)
           VALUES($1, $2, $3, $4::jsonb, $5, now())
           ON CONFLICT(id) DO UPDATE SET
             employee_id = EXCLUDED.employee_id,
             status = COALESCE(EXCLUDED.status, ${table}.status),
             data = EXCLUDED.data,
             version = EXCLUDED.version,
             updated_at = now()`,
          [id, employeeId, status, JSON.stringify({ ...req.body, id }), version],
        );
      }
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
    const { collection: name, id } = req.params;
    const table = getTableName(name);
    if (!table) return res.status(404).json({ error: 'Unknown collection.' });
    const current = await pool.query(`SELECT data FROM ${table} WHERE id=$1`, [id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Resource not found.' });
    req.body = { ...current.rows[0].data, ...req.body };
    router.handle({ ...req, method: 'PUT', url: `/${req.params.collection}/${req.params.id}` }, res, next);
  } catch (error) { next(error); }
});

router.delete('/:collection/:id', async (req, res, next) => {
  try {
    const { collection: name, id } = req.params;
    const table = getTableName(name);
    const policy = policyFor(name);
    if (!table || !policy || !safeId(id)) return res.status(404).json({ error: 'Unknown resource.' });
    const current = await pool.query(`SELECT data, employee_id, version FROM ${table} WHERE id=$1`, [id]);
    const row = current.rows[0];
    if (!row) return res.status(204).end();
    const canDelete = policy && (req.identity.roleId === 'role-admin' || allowed(policy.write, req.identity, id, '__not_self__'));
    if (!canDelete || (table === 'attendances' && !req.identity.permissions.has('manage_attendance'))) return res.status(403).json({ error: 'Insufficient permission.' });
    await transaction(async client => {
      await client.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      await client.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,previous_version,previous_data,correlation_id,source_ip) VALUES($1,$2,'delete',$3,$4,$5,$6::jsonb,$7,$8)`, [req.identity.uid, req.identity.roleId, name, id, row.version, JSON.stringify(row.data), req.correlationId, req.ip]);
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
