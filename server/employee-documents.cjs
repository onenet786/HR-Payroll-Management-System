const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const { pool, transaction } = require('./db.cjs');

const router = express.Router();
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(['cnic', 'contract', 'appointment-letter', 'certificate', 'resume', 'attendance-evidence', 'statutory-source', 'other']);
// Statutory notifications (FBR rate cards, EOBI / provincial circulars) are company documents, filed under a reserved owner.
const STATUTORY_OWNER = 'statutory-sources';
const MIME_EXTENSIONS = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
});

const storageRoot = path.resolve(process.env.DOCUMENT_STORAGE_PATH || path.join(process.cwd(), '..', 'hr-payroll-private-documents'));
const canManage = identity => identity.roleId === 'role-admin' || identity.permissions.has('manage_employees');
const safeEmployeeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,240}$/.test(value);
const safeOriginalName = value => path.basename(String(value || '')).replace(/[\x00-\x1f<>:"/\\|?*]+/g, '_').slice(0, 255) || 'document';

function canAccess(identity, employeeId, documentType) {
  if (employeeId === STATUTORY_OWNER) return identity.roleId === 'role-admin' || identity.permissions.has('manage_settings') || identity.permissions.has('manage_payroll');
  // Attendance reviewers need the evidence attached to a correction, but not the rest of the vault.
  if (documentType === 'attendance-evidence' && identity.permissions.has('manage_attendance')) return true;
  return canManage(identity) || identity.employeeId === employeeId;
}

async function audit(req, action, documentId, data) {
  await pool.query(
    `INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip)
     VALUES($1,$2,$3,'employeeDocuments',$4,$5::jsonb,$6,$7)`,
    [req.identity.uid, req.identity.roleId, action, documentId, JSON.stringify(data), req.correlationId, req.ip],
  );
}

router.get('/employee/:employeeId', async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    if (!safeEmployeeId(employeeId) || !canAccess(req.identity, employeeId)) return res.status(403).json({ error: 'Employee document access denied.' });
    const result = await pool.query(
      `SELECT id,employee_id,document_type,original_name,mime_type,byte_size,uploaded_by,created_at
       FROM employee_documents WHERE employee_id=$1 ORDER BY created_at DESC`, [employeeId],
    );
    res.json({ documents: result.rows });
  } catch (error) { next(error); }
});

router.post('/upload', express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png'], limit: MAX_BYTES }), async (req, res, next) => {
  let storedPath = null;
  try {
    const employeeId = String(req.get('x-employee-id') || '');
    const documentType = String(req.get('x-document-type') || '').toLowerCase();
    const mimeType = String(req.get('content-type') || '').split(';')[0].toLowerCase();
    if (!safeEmployeeId(employeeId) || !canAccess(req.identity, employeeId, documentType)) return res.status(403).json({ error: 'Employee document upload denied.' });
    if ((employeeId === STATUTORY_OWNER) !== (documentType === 'statutory-source')) return res.status(400).json({ error: 'Statutory source documents are filed only under the statutory owner.' });
    if (!TYPES.has(documentType) || !MIME_EXTENSIONS[mimeType] || !Buffer.isBuffer(req.body) || req.body.length < 1 || req.body.length > MAX_BYTES) {
      return res.status(400).json({ error: 'Upload a PDF, JPEG, or PNG document up to 10 MB with a valid document type.' });
    }
    const id = crypto.randomUUID();
    const storedName = `${id}${MIME_EXTENSIONS[mimeType]}`;
    const employeeDir = path.join(storageRoot, employeeId);
    storedPath = path.join(employeeDir, storedName);
    await fs.mkdir(employeeDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(storedPath, req.body, { mode: 0o600, flag: 'wx' });
    const originalName = safeOriginalName(req.get('x-file-name'));
    await transaction(async client => {
      await client.query(`INSERT INTO employee_documents(id,employee_id,document_type,original_name,stored_name,mime_type,byte_size,uploaded_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, employeeId, documentType, originalName, storedName, mimeType, req.body.length, req.identity.uid]);
      await client.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip)
        VALUES($1,$2,'employee_document_uploaded','employeeDocuments',$3,$4::jsonb,$5,$6)`, [req.identity.uid, req.identity.roleId, id, JSON.stringify({ employeeId, documentType, byteSize: req.body.length }), req.correlationId, req.ip]);
    });
    res.status(201).json({ id, employeeId, documentType, originalName, mimeType, byteSize: req.body.length });
  } catch (error) {
    if (storedPath) await fs.unlink(storedPath).catch(() => undefined);
    next(error);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const result = await pool.query(`SELECT * FROM employee_documents WHERE id=$1`, [req.params.id]);
    const document = result.rows[0];
    if (!document || !canAccess(req.identity, document.employee_id, document.document_type)) return res.status(404).json({ error: 'Document not found.' });
    const filePath = path.join(storageRoot, document.employee_id, document.stored_name);
    await fs.access(filePath);
    res.set({ 'Content-Type': document.mime_type, 'Content-Length': String(document.byte_size), 'Content-Disposition': `attachment; filename="${safeOriginalName(document.original_name)}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    await audit(req, 'employee_document_downloaded', document.id, { employeeId: document.employee_id });
    res.sendFile(filePath);
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!canManage(req.identity)) return res.status(403).json({ error: 'Employee document deletion requires HR permission.' });
    const result = await pool.query(`SELECT * FROM employee_documents WHERE id=$1`, [req.params.id]);
    const document = result.rows[0];
    if (!document) return res.status(204).end();
    await transaction(async client => {
      await client.query(`DELETE FROM employee_documents WHERE id=$1`, [document.id]);
      await client.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip)
        VALUES($1,$2,'employee_document_deleted','employeeDocuments',$3,$4::jsonb,$5,$6)`, [req.identity.uid, req.identity.roleId, document.id, JSON.stringify({ employeeId: document.employee_id, documentType: document.document_type }), req.correlationId, req.ip]);
    });
    await fs.unlink(path.join(storageRoot, document.employee_id, document.stored_name)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
