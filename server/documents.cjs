const express = require('express');
const crypto = require('node:crypto');
const { transaction, pool } = require('./db.cjs');
const { policyFor, allowed, getTableName } = require('./collections.cjs');
const { publicUserData, prepareUserWrite } = require('./user-secrets.cjs');

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

function attendanceRegisterHash(rows) {
  const canonical = rows.slice().sort((left, right) => `${left.employeeId}|${left.date}`.localeCompare(`${right.employeeId}|${right.date}`))
    .map(row => [row.employeeId, row.date, row.status, row.attendanceId || '', row.source || ''].join('|')).join('\n');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

// JSONB stores object keys in its own order, so stored and submitted documents are compared canonically.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]))
  : value;
const sameJson = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const onlyChanged = (before, after, fields) => [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
  .every(key => fields.includes(key) || sameJson(before?.[key], after?.[key]));
const withoutKeys = (value, keys) => Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));
const payslipPaymentFields = ['paymentStatus', 'paymentFailureReason', 'paymentFailedAt', 'paymentFailedById', 'paymentRetryReference', 'paymentRetriedAt', 'paymentRetriedById', 'retryBankName', 'retryBankAccountNumber', 'retryIban'];
const payslipRedactionFields = ['employeeId', 'employeeName', 'employeeCode', 'cnic', 'bankName', 'bankAccountNumber', 'iban'];

function addWorkingDays(start, days) {
  const due = new Date(start);
  let remaining = days;
  while (remaining > 0) { due.setDate(due.getDate() + 1); if (due.getDay() !== 0) remaining -= 1; }
  return due;
}

function impossibleTravel(points) {
  const sorted = points.filter(point => point && Number.isFinite(Date.parse(point.capturedAt))).sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  for (let index = 1; index < sorted.length; index += 1) {
    const km = geoDistanceMeters(sorted[index - 1].latitude, sorted[index - 1].longitude, sorted[index].latitude, sorted[index].longitude) / 1000;
    const hours = (Date.parse(sorted[index].capturedAt) - Date.parse(sorted[index - 1].capturedAt)) / 3_600_000;
    if (km > 1 && (hours <= 0 || km / hours > 250)) return `Location moved ${km.toFixed(1)} km in ${Math.max(0, Math.round(hours * 60))} minute(s); possible mock or spoofed GPS.`;
  }
  return null;
}

// Mirrors src/data/masterCodes.ts companyInitialsPrefix: "OneNet Solutions (Pvt) Ltd" -> ONS.
function companyInitialsPrefix(name) {
  const cleaned = String(name || '').replace(/\(.*?\)/g, ' ').replace(/\b(?:pvt|private|ltd|limited|llc|inc|corp|corporation|co|company|pk|pakistan|smc|plc)\b\.?/gi, ' ');
  const parts = cleaned.replace(/([a-z0-9])([A-Z])/g, '$1 $2').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!parts.length) return 'EMP';
  let prefix = parts.map(part => part[0]).join('').slice(0, 3);
  const last = parts[parts.length - 1];
  for (let index = 1; prefix.length < 3 && index < last.length; index += 1) prefix += last[index];
  return prefix.toUpperCase().padEnd(3, 'X');
}

const payrollRunImmutableFields = ['title', 'periodMonth', 'periodYear', 'startDate', 'endDate', 'createdAt', 'createdById', 'totalGrossPay', 'totalDeductions', 'totalNetPay',
  'totalEobiEmployer', 'totalSocialSecurityEmployer', 'employeeCount', 'statutoryConfigId', 'approvedAt', 'approvedById', 'bankAdviceChecksum', 'disbursedAt', 'disbursedById', 'disbursementReference'];

async function validLockedRegister(client, id, next) {
    if (next.status !== 'Locked' || !Number.isInteger(next.periodMonth) || !Number.isInteger(next.periodYear)) return false;
    const prefix = `${next.periodYear}-${String(next.periodMonth).padStart(2, '0')}`;
    if (id !== `attendance-period-${prefix}`) return false;
    const result = await client.query(
      `SELECT data FROM attendances WHERE date >= $1 AND date < ($1::date + INTERVAL '1 month') ORDER BY id`,
      [`${prefix}-01`],
    );
    const records = result.rows.map(row => row.data);
    const rows = Array.isArray(next.registerRows) ? next.registerRows : [];
    const allowedStatuses = new Set(['Working Day', 'Present', 'Late', 'Half Day', 'Paid Leave', 'Unpaid Leave', 'Holiday', 'Weekly Off', 'Absent', 'Not Joined', 'Missing Punch', 'Pending Review']);
    const rowKeys = new Set(rows.map(row => `${row?.employeeId}|${row?.date}`));
    const lastDay = new Date(next.periodYear, next.periodMonth, 0).getDate();
    const lastDate = `${prefix}-${String(lastDay).padStart(2, '0')}`;
    // A month still in progress cannot be certified (Pakistan time, UTC+5).
    if (new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10) <= lastDate) return false;
    const employeeResult = await client.query(`SELECT id, data FROM employees`);
    const eligibleEmployees = employeeResult.rows.map(row => ({ id: row.id, ...row.data }))
      .filter(employee => ['Active', 'On Leave'].includes(employee.status) && typeof employee.dateOfJoining === 'string' && employee.dateOfJoining <= lastDate);
    const expectedKeys = new Set(eligibleEmployees.flatMap(employee => Array.from({ length: lastDay }, (_, offset) => `${employee.id}|${prefix}-${String(offset + 1).padStart(2, '0')}`)));
    if (!records.length || next.attendanceCount !== records.length || next.integrityHash !== attendanceIntegrityHash(records)
      || !Number.isInteger(next.registerVersion) || next.registerVersion < 1 || !rows.length
      || rows.some(row => !safeId(row?.employeeId) || !/^\d{4}-\d{2}-\d{2}$/.test(row?.date || '') || !allowedStatuses.has(row?.status))
      || rowKeys.size !== rows.length || rows.some(row => row.status === 'Missing Punch' || row.status === 'Pending Review')
      || rows.length !== expectedKeys.size || rowKeys.size !== expectedKeys.size || [...expectedKeys].some(key => !rowKeys.has(key))
      || next.registerHash !== attendanceRegisterHash(rows)) return false;
    return true;
}

async function authorizeWrite(client, name, table, id, identity, existing, next) {
  const policy = policyFor(name);
  const employeeId = employeeIdOf(next) || (name === 'employees' || name === 'biometricTemplates' || table === 'employees' || table === 'biometric_templates' ? id : null);
  if (!policy || !allowed(policy.write, identity, id, employeeId)) return false;
  if ((name === 'attendancePeriods' || table === 'attendance_periods') && !existing) {
    if (!await validLockedRegister(client, id, next)) return false;
  }
  if ((name === 'attendancePeriods' || table === 'attendance_periods') && existing) {
    const previous = existing.data;
    if (next.periodMonth !== previous.periodMonth || next.periodYear !== previous.periodYear) return false;
    const historyGrows = Array.isArray(next.history) && next.history.length === (Array.isArray(previous.history) ? previous.history.length : 0) + 1;
    if (previous.status === 'Locked') {
      // Reopening is allowed only before any live payroll consumes the register.
      if (next.status !== 'Reopened' || next.reopenedById !== identity.uid || !next.reopenedAt
        || typeof next.reopenReason !== 'string' || next.reopenReason.trim().length < 10 || !historyGrows
        || next.registerHash !== previous.registerHash || next.integrityHash !== previous.integrityHash) return false;
      const consumers = await client.query(`SELECT 1 FROM payroll_runs WHERE data->>'attendancePeriodId'=$1 AND COALESCE(status, data->>'status')<>'Cancelled' LIMIT 1`, [id]);
      if (consumers.rowCount) return false;
    } else if (previous.status === 'Reopened') {
      if (!await validLockedRegister(client, id, next) || next.registerVersion !== (previous.registerVersion || 1) + 1 || !historyGrows) return false;
    } else return false;
  }
  if ((name === 'payrollRuns' || table === 'payroll_runs') && !existing) {
    if (next.status !== 'Draft' || next.createdById !== identity.uid || next.approvedAt || next.disbursedAt) return false;
    if (!Number.isInteger(next.periodMonth) || !Number.isInteger(next.periodYear) || next.preflightCriticalCount !== 0) return false;
    const runType = next.runType || 'Regular';
    if (!['Regular', 'Supplementary', 'Final Settlement'].includes(runType)) return false;
    if (runType === 'Regular') {
      const duplicate = await client.query(
        `SELECT 1 FROM payroll_runs WHERE data->>'periodYear'=$1 AND data->>'periodMonth'=$2 AND id<>$3 AND COALESCE(status, data->>'status')<>'Cancelled' AND COALESCE(data->>'runType','Regular')='Regular' LIMIT 1`,
        [String(next.periodYear), String(next.periodMonth), id],
      );
      if (duplicate.rowCount) return false;
    }
    if (runType === 'Final Settlement') {
      // Separation payroll is driven by an independently processed settlement, not the attendance register.
      const settlement = await client.query(`SELECT data FROM gratuity_settlements WHERE id=$1 FOR SHARE`, [next.settlementId]);
      if (settlement.rows[0]?.data?.status !== 'Processed' || next.employeeCount !== 1) return false;
      const existingRun = await client.query(`SELECT 1 FROM payroll_runs WHERE data->>'settlementId'=$1 AND id<>$2 AND COALESCE(status, data->>'status')<>'Cancelled' LIMIT 1`, [next.settlementId, id]);
      if (existingRun.rowCount) return false;
    } else {
      // Regular and supplementary runs bind to the certified attendance register of their period.
      if (typeof next.attendancePeriodId !== 'string' || typeof next.attendanceIntegrityHash !== 'string' || typeof next.attendanceRegisterHash !== 'string') return false;
      const locked = await client.query(
        `SELECT data FROM attendance_periods WHERE id=$1 AND status='Locked' FOR SHARE`,
        [next.attendancePeriodId],
      );
      if (!locked.rows[0] || locked.rows[0].data.integrityHash !== next.attendanceIntegrityHash || locked.rows[0].data.registerHash !== next.attendanceRegisterHash) return false;
    }
  }
  if ((name === 'payrollRuns' || table === 'payroll_runs') && existing) {
    const previous = existing.data;
    if (next.createdById !== previous.createdById || next.attendancePeriodId !== previous.attendancePeriodId
      || next.attendanceIntegrityHash !== previous.attendanceIntegrityHash || next.attendanceRegisterHash !== previous.attendanceRegisterHash) return false;
    if (next.runType !== previous.runType || next.settlementId !== previous.settlementId) return false;
    const postingFields = ['taxDeposit', 'parallelRun'];
    if (['Approved', 'Disbursed'].includes(previous.status) && next.status === previous.status && onlyChanged(previous, next, postingFields)
      && postingFields.some(field => !sameJson(previous[field], next[field]))) {
      // After approval a run accepts only its FBR deposit record and the parallel-run reconciliation result.
      if (!sameJson(previous.taxDeposit, next.taxDeposit)) {
        const deposit = next.taxDeposit;
        if (!deposit || deposit.recordedById !== identity.uid || !/^[A-Z0-9-]{6,40}$/.test(String(deposit.cprNumber || '')) || !Number.isFinite(deposit.amount) || deposit.amount < 0
          || !/^\d{4}-\d{2}-\d{2}$/.test(deposit.depositedOn || '') || !Number.isFinite(Date.parse(deposit.recordedAt))) return false;
      }
      if (!sameJson(previous.parallelRun, next.parallelRun)) {
        const result = next.parallelRun;
        const counts = ['matched', 'differing', 'onlyLegacy', 'onlySystem'];
        if (!result || result.comparedById !== identity.uid || !Number.isFinite(Date.parse(result.comparedAt)) || typeof result.legacyFileName !== 'string'
          || counts.some(field => !Number.isInteger(result[field]) || result[field] < 0) || !Number.isFinite(result.netDelta)
          || (result.explanation !== undefined && (typeof result.explanation !== 'string' || result.explanation.length > 1000))) return false;
      }
    } else if (next.status === 'Cancelled') {
      if (!['Draft', 'Approved'].includes(previous.status) || next.statusBeforeCancellation !== previous.status
        || next.cancelledById !== identity.uid || !Number.isFinite(Date.parse(next.cancelledAt))
        || typeof next.cancellationReason !== 'string' || next.cancellationReason.trim().length < 10 || next.cancellationReason.length > 500
        || payrollRunImmutableFields.some(field => !sameJson(next[field], previous[field]))) return false;
    } else if (previous.status === 'Draft') {
      if (next.status !== 'Approved' || identity.uid === previous.createdById || next.approvedById !== identity.uid || !next.approvedAt) return false;
      if (previous.runType === 'Final Settlement') {
        const settlement = await client.query(`SELECT data FROM gratuity_settlements WHERE id=$1 FOR SHARE`, [previous.settlementId]);
        if (settlement.rows[0]?.data?.status !== 'Processed') return false;
      } else {
        const lockedPeriod = await client.query(`SELECT data FROM attendance_periods WHERE id=$1 AND status='Locked' FOR SHARE`, [previous.attendancePeriodId]);
        if (!lockedPeriod.rows[0] || lockedPeriod.rows[0].data.integrityHash !== previous.attendanceIntegrityHash
          || lockedPeriod.rows[0].data.registerHash !== previous.attendanceRegisterHash) return false;
      }
      const payslipResult = await client.query(`SELECT data FROM payroll_payslips WHERE payroll_run_id=$1 OR data->>'payrollRunId'=$1`, [id]);
      if (!payslipResult.rowCount || payslipResult.rowCount !== previous.employeeCount) return false;
      const sheets = payslipResult.rows.map(row => row.data);
      const employeeIds = sheets.map(sheet => sheet.employeeId);
      const employeeResult = await client.query(`SELECT id, data FROM employees WHERE id=ANY($1::varchar[])`, [employeeIds]);
      if (employeeResult.rowCount !== employeeIds.length) return false;
      const activeCnicOwners = await client.query(`SELECT id, data FROM employees`);
      const cnicOwnerMap = new Map();
      for (const row of activeCnicOwners.rows) {
        const employee = row.data;
        if (employee?.status === 'Terminated') continue;
        const cnic = String(employee?.cnic || '').replace(/\D/g, '');
        if (cnic) cnicOwnerMap.set(cnic, [...(cnicOwnerMap.get(cnic) || []), row.id]);
      }
      for (const row of employeeResult.rows) {
        const employee = row.data;
        const iban = String(employee.iban || '').replace(/\s/g, '');
        if (!/^\d{5}-\d{7}-\d$/.test(employee.cnic || '') || !String(employee.bankName || '').trim()
          || !String(employee.bankAccountNumber || '').trim() || (iban && !/^PK\d{2}[A-Z0-9]{20}$/i.test(iban))
          || (cnicOwnerMap.get(String(employee.cnic || '').replace(/\D/g, '')) || []).length > 1
          || ((cnicOwnerMap.get(String(employee.cnic || '').replace(/\D/g, '')) || []).length === 0 && previous.runType !== 'Final Settlement')) return false;
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
      } else if (previous.status === 'Approved' && previous.payrollRunId) {
        if (next.status !== 'Approved' || next.payrollRunId || next.reviewedById !== previous.reviewedById || next.reviewedAt !== previous.reviewedAt) return false;
        const run = await client.query(`SELECT data FROM payroll_runs WHERE id=$1 FOR SHARE`, [previous.payrollRunId]);
        if (run.rows[0]?.data?.status !== 'Cancelled') return false;
      } else return false;
    }
  }
  if ((name === 'employees' || table === 'employees') && typeof next.employeeCode === 'string') {
    // New or changed employee codes must carry the company prefix; existing codes are left untouched.
    const codeChanged = !existing || String(existing.data?.employeeCode || '').toUpperCase() !== next.employeeCode.trim().toUpperCase();
    if (codeChanged) {
      const company = (await client.query(`SELECT data FROM companies WHERE id=$1`, [next.companyId])).rows[0]?.data;
      if (company && !next.employeeCode.trim().toUpperCase().startsWith(`${companyInitialsPrefix(company.name || company.legalName)}-`)) return false;
      const duplicate = await client.query(`SELECT 1 FROM employees WHERE id<>$1 AND UPPER(COALESCE(employee_code, data->>'employeeCode'))=$2 LIMIT 1`, [id, next.employeeCode.trim().toUpperCase()]);
      if (duplicate.rowCount) return false;
    }
  }
  if (name === 'payrollPayslips' || table === 'payroll_payslips') {
    const runId = next.payrollRunId || existing?.data?.payrollRunId;
    const runResult = await client.query(`SELECT data FROM payroll_runs WHERE id=$1 FOR SHARE`, [runId]);
    const run = runResult.rows[0]?.data;
    if (!run) return false;
    if (!existing) {
      if (run.status !== 'Draft') return false;
    } else if (run.status !== 'Draft') {
      // Issued payslips are financial records: only payment outcome and privacy redaction may change.
      const previous = existing.data;
      if (!onlyChanged(previous, next, [...payslipPaymentFields, ...payslipRedactionFields])) return false;
      const redacted = payslipRedactionFields.some(field => !sameJson(previous[field], next[field]));
      if (redacted && (next.employeeName !== '[REDACTED]' || !String(next.employeeId || '').startsWith('deleted-'))) return false;
      if (next.paymentStatus !== previous.paymentStatus) {
        if (run.status !== 'Disbursed') return false;
        if (next.paymentStatus === 'Failed') {
          if (previous.paymentStatus && previous.paymentStatus !== 'Paid') return false;
          if (next.paymentFailedById !== identity.uid || typeof next.paymentFailureReason !== 'string' || next.paymentFailureReason.trim().length < 5) return false;
        } else if (next.paymentStatus === 'Retried') {
          // The retry pays the employee's current bank details: whoever recorded the return cannot release it.
          if (previous.paymentStatus !== 'Failed' || next.paymentRetriedById !== identity.uid || previous.paymentFailedById === identity.uid
            || !/^[A-Za-z0-9][A-Za-z0-9\/_ .-]{2,99}$/.test(String(next.paymentRetryReference || ''))) return false;
        } else return false;
      }
    }
  }
  if (name === 'statutoryChangeRequests' || table === 'statutory_change_requests') {
    if (!existing) {
      if (next.status !== 'Pending' || next.createdById !== identity.uid || next.reviewedById || !next.proposedConfig || !Array.isArray(next.proposedTaxSlabs)) return false;
    } else {
      const previous = existing.data;
      if (previous.status !== 'Pending' || previous.createdById !== next.createdById) return false;
      if (next.status === 'Pending') {
        if (identity.uid !== previous.createdById || next.reviewedById) return false;
      } else if (next.status === 'Approved') {
        if (identity.uid === previous.createdById || next.reviewedById !== identity.uid || !next.reviewedAt
          || !sameJson(next.proposedConfig, previous.proposedConfig) || !sameJson(next.proposedTaxSlabs, previous.proposedTaxSlabs)) return false;
      } else if (next.status === 'Rejected') {
        if (next.reviewedById !== identity.uid || !next.reviewedAt) return false;
      } else return false;
    }
  }
  if (name === 'statConfig' || table === 'stat_config' || name === 'taxSlabs' || table === 'tax_slabs') {
    const any = await client.query(`SELECT 1 FROM ${name === 'statConfig' || table === 'stat_config' ? 'stat_config' : 'tax_slabs'} LIMIT 1`);
    if (any.rowCount) {
      // Live rates change only by applying an approved proposal, and only as approved.
      const request = await client.query(`SELECT data FROM statutory_change_requests WHERE id=$1 AND status='Approved'`, [next.changeRequestId]);
      const approved = request.rows[0]?.data;
      if (!approved || approved.reviewedById !== identity.uid) return false;
      if (name === 'statConfig' || table === 'stat_config') {
        if (!sameJson(withoutKeys(next, ['changeRequestId', 'updatedAt', 'id']), withoutKeys(approved.proposedConfig, ['changeRequestId', 'updatedAt', 'id']))) return false;
      } else {
        const slab = (approved.proposedTaxSlabs || []).find(item => item.id === id);
        if (!slab || !sameJson(withoutKeys(next, ['changeRequestId', 'id']), withoutKeys(slab, ['changeRequestId', 'id']))) return false;
      }
    }
  }
  if (name === 'lifecycleRequests' || table === 'lifecycle_requests') {
    const types = ['Probation Confirmation', 'Probation Extension', 'Transfer', 'Promotion', 'Resignation', 'Termination'];
    if (!existing) {
      if (next.status !== 'Pending' || next.createdById !== identity.uid || !safeId(next.employeeId) || !types.includes(next.type)
        || !/^\d{4}-\d{2}-\d{2}$/.test(next.effectiveDate || '') || typeof next.reason !== 'string' || next.reason.trim().length < 10 || next.reviewedById) return false;
    } else {
      const previous = existing.data;
      const immutable = ['employeeId', 'type', 'effectiveDate', 'reason', 'createdAt', 'createdById', 'newBranchId', 'newDepartmentId', 'newDesignationId', 'newBasicSalary', 'newProbationEndDate', 'noticeDays', 'leaveEncashDays'];
      if (previous.status !== 'Pending' || immutable.some(field => !sameJson(previous[field], next[field]))
        || !['Approved', 'Rejected'].includes(next.status) || identity.uid === previous.createdById
        || next.reviewedById !== identity.uid || !next.reviewedAt) return false;
    }
  }
  if (name === 'salaryRevisions' || table === 'salary_revisions') {
    if (!existing) {
      if (next.status !== 'Draft' || (next.createdById && next.createdById !== identity.uid)) return false;
    } else {
      const previous = existing.data;
      if (['employeeId', 'previousSalary', 'newSalary', 'effectiveDate', 'createdById'].some(field => previous[field] !== next[field])) return false;
      if (previous.status === 'Approved' && next.status !== 'Approved') return false;
      if (previous.status !== 'Approved' && next.status === 'Approved'
        && ((previous.createdById && previous.createdById === identity.uid) || next.approvedById !== identity.uid)) return false;
    }
  }
  if (name === 'gratuitySettlements' || table === 'gratuity_settlements') {
    const numericFields = ['yearsOfService', 'basicSalaryAtSeparation', 'gratuityAmount', 'encashableLeaveDays', 'leaveEncashmentAmount', 'noticePayDays', 'noticePayAmount', 'pendingSalaryDays', 'pendingSalaryAmount', 'totalSettlementAmount'];
    if (!existing) {
      if (next.status !== 'Pending' || next.createdById !== identity.uid || !safeId(next.employeeId)
        || !['Resignation', 'Termination', 'Retirement', 'Death', 'Redundancy'].includes(next.separationType)
        || !/^\d{4}-\d{2}-\d{2}$/.test(next.lastWorkingDate || '') || !/^\d{4}-\d{2}-\d{2}$/.test(next.separationDate || '')
        || numericFields.some(field => !Number.isFinite(next[field])) || next.processedById || next.paidById || next.paidDate) return false;
    } else {
      const previous = existing.data;
      const immutable = ['employeeId', 'separationType', 'lastWorkingDate', 'separationDate', 'createdById', 'createdAt', 'notes', ...numericFields];
      if (immutable.some(field => previous[field] !== next[field])) return false;
      if (previous.status === 'Pending') {
        if (next.status !== 'Processed' || identity.uid === previous.createdById || next.processedById !== identity.uid || !next.processedAt || next.paidById || next.paidDate) return false;
      } else if (previous.status === 'Processed') {
        if (next.status !== 'Paid' || identity.uid === previous.createdById || identity.uid === previous.processedById || next.paidById !== identity.uid || !/^\d{4}-\d{2}-\d{2}$/.test(next.paidDate || '')) return false;
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
    const travel = impossibleTravel([next.punchInLocation, ...(next.fieldVisits || []).flatMap(visit => [visit.checkInLocation, visit.checkOutLocation]), next.punchOutLocation]);
    if (travel && existing?.data?.regularizationApproved === undefined) {
      next.locationRisk = travel;
      next.regularizationRequested = true;
      next.regularizationReason = next.regularizationReason || travel;
    }
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
    // The "On Leave" entry for a day of an approved leave is not a manual punch: it is accepted as already
    // reviewed, but only when an approved leave of that employee really covers that date.
    let leaveDay = false;
    if (!existing && next.method === 'Manual' && next.status === 'On Leave' && safeId(next.leaveRequestId) && !next.punchIn && !next.punchOut) {
      const leave = (await client.query(`SELECT data FROM leaves WHERE id=$1`, [next.leaveRequestId])).rows[0]?.data;
      leaveDay = leave?.status === 'Approved' && leave.employeeId === next.employeeId && leave.startDate <= next.date && leave.endDate >= next.date;
      if (leaveDay) {
        delete next.regularizationRequested;
        next.requestedById = identity.uid;
        next.regularizationApproved = true;
        next.reviewedById = identity.uid;
        next.reviewedAt = new Date().toISOString();
        next.reviewComment = `Approved ${leave.leaveType} leave ${next.leaveRequestId}`;
      }
    }
    if (!leaveDay && !existing && (next.method === 'Manual' || next.regularizationRequested === true)) {
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
      if (identity.employeeId && identity.employeeId === existing.data.employeeId) return false;
      if (typeof next.reviewComment !== 'string' || next.reviewComment.trim().length < 5) return false;
      // The line manager decides first; HR may decide only after the three-working-day review deadline.
      const subject = (await client.query(`SELECT data FROM employees WHERE id=$1`, [existing.data.employeeId])).rows[0]?.data;
      const managerId = subject?.reportingManagerId;
      if (managerId && managerId !== existing.data.employeeId && identity.employeeId !== managerId) {
        const managers = await client.query(`SELECT u.data AS user, r.data AS role FROM users u LEFT JOIN roles r ON r.id = u.data->>'roleId' WHERE u.data->>'employeeId'=$1 AND COALESCE(u.data->>'status','Active')='Active'`, [managerId]);
        const managerCanReview = managers.rows.some(row => row.user?.roleId === 'role-admin' || (row.role?.permissions || []).includes('manage_attendance'));
        const requested = Date.parse(existing.data.requestedAt || `${existing.data.date}T00:00:00`);
        if (managerCanReview && Number.isFinite(requested) && addWorkingDays(requested, 3).getTime() > Date.now()) return false;
      }
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
      return res.json({ documents: table === 'users' ? result.rows.map(row => ({ ...row, data: publicUserData(row.data) })) : result.rows });
    }
    if (!allowed(policy.read, req.identity, '', employeeFilter)) return res.status(403).json({ error: 'Insufficient permission.' });
    const params = [];
    let sql = `SELECT id AS document_id, data, version, updated_at FROM ${table}`;
    if (employeeFilter) {
      params.push(employeeFilter);
      sql += ` WHERE (employee_id=$1 OR data->>'employeeId'=$1)`;
      // Employees cannot read payroll runs, so the server releases their payslips only once salary is paid.
      if (table === 'payroll_payslips' && !canReadAll && !managedRead) sql += ` AND payroll_run_id IN (SELECT id FROM payroll_runs WHERE status='Disbursed')`;
    }
    sql += ` ORDER BY id LIMIT 10000`;
    const result = await pool.query(sql, params);
    res.json({ documents: table === 'users' ? result.rows.map(row => ({ ...row, data: publicUserData(row.data) })) : result.rows });
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
    if (table === 'payroll_payslips' && !allowed(policy.read, req.identity, '', '__not_self__')) {
      const run = await pool.query(`SELECT status FROM payroll_runs WHERE id=$1`, [row.data?.payrollRunId || null]);
      if (run.rows[0]?.status !== 'Disbursed') return res.status(404).json({ error: 'Resource not found.' });
    }
    res.setHeader('ETag', `"${row.version}"`);
    res.json(table === 'users' ? { ...row, data: publicUserData(row.data) } : row);
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
      if (table === 'users') {
        // Passwords are hashed here; stored hashes and MFA state are never taken from the browser.
        const { record, passwordChanged } = await prepareUserWrite(req.body, existing?.data);
        req.body = record;
        if (passwordChanged) await client.query(`UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [id]);
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
        [req.identity.uid, req.identity.roleId, existing ? 'update' : 'create', name, id, existing?.version || null, version,
          existing ? JSON.stringify(table === 'users' ? publicUserData(existing.data) : existing.data) : null,
          JSON.stringify(table === 'users' ? publicUserData(req.body) : req.body), req.correlationId, req.ip],
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
    // Certified registers and payroll history are corrected by reopening or cancellation, never deletion.
    if (['attendance_periods', 'payroll_runs', 'payroll_payslips', 'statutory_change_requests', 'lifecycle_requests', 'stat_config'].includes(table)) return res.status(403).json({ error: 'Payroll, statutory and approval records are immutable; cancel, reopen or reject them instead.' });
    if (table === 'tax_slabs') {
      const latest = await pool.query(`SELECT data FROM statutory_change_requests WHERE status='Approved' AND data->>'reviewedById'=$1 ORDER BY updated_at DESC LIMIT 1`, [req.identity.uid]);
      const approved = latest.rows[0]?.data;
      if (!approved || (approved.proposedTaxSlabs || []).some(slab => slab.id === id)) return res.status(403).json({ error: 'Tax slabs can be removed only by applying an approved statutory change.' });
    }
    await transaction(async client => {
      await client.query(`DELETE FROM ${table} WHERE id=$1`, [id]);
      await client.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,previous_version,previous_data,correlation_id,source_ip) VALUES($1,$2,'delete',$3,$4,$5,$6::jsonb,$7,$8)`, [req.identity.uid, req.identity.roleId, name, id, row.version, JSON.stringify(row.data), req.correlationId, req.ip]);
    });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
