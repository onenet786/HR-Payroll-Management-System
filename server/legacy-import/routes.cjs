// Data import from a legacy CyberAP database, run by the client's own administrator (mounted at /api/data-import
// behind authenticate + the licence gate). The provider (Provider Console) or the vendor console switches the feature
// on for an installation; the client's IT then needs the "Data import" permission (or Super Admin).
//
// The package made by tools/cyberap-export/Export-CyberAP.ps1 is uploaded in chunks (nginx and the JSON parser both
// cap request bodies), analysed (dry run) and imported by a background job in this process. Safety rails for the
// destructive "remove current data first" option:
//   - the administrator re-enters their password and types the confirmation text;
//   - a full database backup is taken first (scripts/postgres-backup.cjs); no backup, no wipe;
//   - once the installation is live (a payroll run disbursed or an attendance month locked) the wipe is refused and
//     only the safe "keep current data" import is allowed.
const crypto = require('node:crypto');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pool } = require('../db.cjs');
const { analyzePackage, importPackage, currentDataCounts, readPackage, WIPE_TABLES } = require('./cyberap.cjs');
const { resetDataLimitsCache } = require('../data-limits.cjs');
const installation = require('../installation.cjs');
const { verifyUserPassword } = require('../user-secrets.cjs');
const sqlserver = require('./sqlserver.cjs');

const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_PACKAGE_BYTES = Number(process.env.LEGACY_IMPORT_MAX_BYTES || 4 * 1024 * 1024 * 1024);
const WIPE_CONFIRMATION = 'DELETE ALL DATA';
const PERMISSION = 'manage_data_import';
const uploadDir = () => process.env.LEGACY_IMPORT_DIR || path.join(os.tmpdir(), 'hr-legacy-import');

let job = null; // { id, kind, state, phase, bytes, size, startedAt, finishedAt, report, error, options, actor, backup }
let controller = null;

const idPattern = /^[a-f0-9]{32}$/;
const partPath = id => path.join(uploadDir(), `${id}.part`);
const packagePath = id => path.join(uploadDir(), `${id}.cyberap.gz`);
const metaPath = id => path.join(uploadDir(), `${id}.json`);

function readMeta(id) {
  try { return JSON.parse(fs.readFileSync(metaPath(id), 'utf8')); } catch { return null; }
}

/** The package that was uploaded last and completed (one package is kept at a time). */
function currentPackage() {
  if (!fs.existsSync(uploadDir())) return null;
  const metas = fs.readdirSync(uploadDir()).filter(name => name.endsWith('.json')).map(name => readMeta(name.slice(0, -5))).filter(meta => meta?.completedAt);
  metas.sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const meta = metas[0];
  return meta && fs.existsSync(packagePath(meta.id)) ? meta : null;
}

function removeOtherUploads(keepId) {
  if (!fs.existsSync(uploadDir())) return;
  for (const name of fs.readdirSync(uploadDir())) {
    if (!name.startsWith(keepId)) fs.rmSync(path.join(uploadDir(), name), { force: true });
  }
}

/** Checks a received/created .part file, makes it the current package and returns its metadata. */
async function finishPackage(id, meta) {
  const head = Buffer.alloc(2);
  const fd = fs.openSync(partPath(id), 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd);
  if (head[0] !== 0x1f || head[1] !== 0x8b) { fs.rmSync(partPath(id), { force: true }); throw Object.assign(new Error('This is not a CyberAP export package (.cyberap.gz).'), { status: 400 }); }
  fs.renameSync(partPath(id), packagePath(id));
  let header;
  try { for await (const item of readPackage(packagePath(id))) { header = item; break; } }
  catch (error) { fs.rmSync(packagePath(id), { force: true }); throw Object.assign(new Error(error.message), { status: 400 }); }
  const completed = { ...meta, size: fs.statSync(packagePath(id)).size, completedAt: new Date().toISOString(), header: { ...header, dayColumns: undefined } };
  fs.writeFileSync(metaPath(id), JSON.stringify(completed));
  return completed;
}

const publicJob = () => (job ? { ...job, report: job.report || null } : null);

async function saveJobState() {
  if (!job) return;
  const report = job.report ? { ...job.report, employees: { ...job.report.employees, activeWithoutRecentAttendanceList: undefined } } : null;
  await installation.writeSetting(pool, 'legacyImportJob', { ...job, report }).catch(() => undefined);
}

async function lastSavedJob() {
  return installation.readSetting(pool, 'legacyImportJob').catch(() => null);
}

/** The installation is live once salaries were paid or an attendance month was locked: no more wiping. */
async function liveSince() {
  const paid = (await pool.query(`SELECT min(updated_at) AS at FROM payroll_runs WHERE status='Disbursed'`).catch(() => ({ rows: [] }))).rows[0]?.at;
  const locked = (await pool.query(`SELECT min(updated_at) AS at FROM attendance_periods WHERE status='Locked'`).catch(() => ({ rows: [] }))).rows[0]?.at;
  const dates = [paid, locked].filter(Boolean).map(value => new Date(value));
  return dates.length ? new Date(Math.min(...dates)).toISOString() : null;
}

/** Full database backup with the installation's own backup script (encrypted, kept in BACKUP_DIR). */
function runBackup() {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'postgres-backup.cjs');
    const child = spawn(process.execPath, [script], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) return resolve({ at: new Date().toISOString(), log: output.trim().split('\n').slice(-3).join('\n') });
      reject(new Error(`The safety backup failed, so no data was removed. ${output.trim().split('\n').slice(-2).join(' ')} Check BACKUP_DIR, BACKUP_ENCRYPTION_KEY and PG_DUMP_PATH in the server settings.`));
    });
  });
}

function startJob(kind, meta, options, actor, work) {
  controller = new AbortController();
  job = { id: crypto.randomBytes(8).toString('hex'), kind, state: 'running', phase: 'starting', bytes: 0, size: meta.size, startedAt: new Date().toISOString(), finishedAt: null, report: null, error: null, packageId: meta.id, fileName: meta.fileName, options, actor, backup: null };
  const onProgress = ({ phase, bytes, report, detail }) => { job.phase = phase; job.bytes = bytes; job.report = report ?? job.report; if (detail !== undefined) job.detail = detail; };
  void saveJobState();
  work({ onProgress, signal: controller.signal })
    .then(report => { job.state = 'done'; job.phase = 'done'; if (job.kind === 'export') { job.size = report?.package?.size || job.bytes; job.packageId = report?.package?.id; job.report = null; } else job.report = report; job.bytes = job.size; })
    .catch(error => { job.state = 'failed'; job.error = error.message; if (error.report) job.report = error.report; console.error(`Legacy ${kind} failed:`, error); })
    .finally(() => { job.finishedAt = new Date().toISOString(); controller = null; resetDataLimitsCache(); void saveJobState(); });
  return job;
}

const fail = (res, req, status, error) => res.status(status).json({ error, correlationId: req.correlationId });
const busy = () => job?.state === 'running';

const clientRouter = express.Router();

// Every route: the feature must be switched on for this installation and the user must hold the permission.
clientRouter.use(async (req, res, next) => {
  try {
    if (!(await installation.clientDataImportEnabled(pool))) return fail(res, req, 403, 'Data import is switched off for this installation. Ask your service provider to enable it.');
    if (req.identity.roleId !== 'role-admin' && !req.identity.permissions.has(PERMISSION)) return fail(res, req, 403, 'You need the "Data import" permission.');
    next();
  } catch (error) { next(error); }
});

clientRouter.get('/status', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const live = await liveSince();
    const body = {
      package: currentPackage(), job: publicJob() || await lastSavedJob(), wipeTables: WIPE_TABLES, chunkSize: CHUNK_SIZE, confirmation: WIPE_CONFIRMATION,
      wipeAllowed: !live, liveSince: live,
      backupConfigured: Boolean(process.env.BACKUP_ENCRYPTION_KEY) || process.env.LEGACY_IMPORT_SKIP_BACKUP === 'true',
      sqlExport: sqlserver.available(),
    };
    if (req.query.counts === '1' && !busy()) body.currentData = await currentDataCounts(pool);
    res.json(body);
  } catch (error) { next(error); }
});

clientRouter.post('/uploads', (req, res) => {
  if (busy()) return fail(res, req, 409, 'An analysis or import is running. Wait for it to finish.');
  const size = Number(req.body?.size);
  const fileName = String(req.body?.fileName || 'package.cyberap.gz').replace(/[^\w.\- ]/g, '_').slice(0, 200);
  if (!Number.isFinite(size) || size <= 0) return fail(res, req, 400, 'The file size is missing.');
  if (size > MAX_PACKAGE_BYTES) return fail(res, req, 413, `The package is larger than ${Math.round(MAX_PACKAGE_BYTES / 1024 ** 3)} GB. Ask your service provider to import it from the server.`);
  fs.mkdirSync(uploadDir(), { recursive: true });
  const id = crypto.randomBytes(16).toString('hex');
  removeOtherUploads(id);
  fs.writeFileSync(partPath(id), Buffer.alloc(0));
  fs.writeFileSync(metaPath(id), JSON.stringify({ id, fileName, size, createdAt: new Date().toISOString(), uploadedBy: req.identity.uid }));
  res.json({ uploadId: id, chunkSize: CHUNK_SIZE, received: 0 });
});

clientRouter.get('/uploads/:id', (req, res) => {
  const { id } = req.params;
  const meta = idPattern.test(id) ? readMeta(id) : null;
  if (!meta) return fail(res, req, 404, 'Upload not found. Start the upload again.');
  const received = fs.existsSync(partPath(id)) ? fs.statSync(partPath(id)).size : meta.size;
  res.json({ uploadId: id, received, size: meta.size, completed: Boolean(meta.completedAt) });
});

clientRouter.put('/uploads/:id', express.raw({ type: 'application/octet-stream', limit: CHUNK_SIZE + 1024 }), (req, res) => {
  const { id } = req.params;
  const meta = idPattern.test(id) ? readMeta(id) : null;
  if (!meta || !fs.existsSync(partPath(id))) return fail(res, req, 404, 'Upload not found. Start the upload again.');
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) return fail(res, req, 400, 'The chunk is empty (send it as application/octet-stream).');
  const offset = Number(req.query.offset);
  const received = fs.statSync(partPath(id)).size;
  if (offset !== received) return res.status(409).json({ error: 'Chunk out of order.', received, correlationId: req.correlationId });
  if (received + req.body.length > meta.size) return fail(res, req, 400, 'The chunk goes past the declared file size.');
  fs.appendFileSync(partPath(id), req.body);
  res.json({ received: received + req.body.length });
});

clientRouter.post('/uploads/:id/complete', async (req, res, next) => {
  try {
    const { id } = req.params;
    const meta = idPattern.test(id) ? readMeta(id) : null;
    if (!meta || !fs.existsSync(partPath(id))) return fail(res, req, 404, 'Upload not found. Start the upload again.');
    const received = fs.statSync(partPath(id)).size;
    if (received !== meta.size) return fail(res, req, 400, `The upload is incomplete (${received} of ${meta.size} bytes).`);
    let completed;
    try { completed = await finishPackage(id, meta); } catch (error) { if (error.status) return fail(res, req, error.status, error.message); throw error; }
    res.json({ package: completed });
  } catch (error) { next(error); }
});

clientRouter.delete('/package', (req, res) => {
  if (busy()) return fail(res, req, 409, 'An analysis or import is running.');
  if (fs.existsSync(uploadDir())) for (const name of fs.readdirSync(uploadDir())) fs.rmSync(path.join(uploadDir(), name), { force: true });
  res.status(204).end();
});

clientRouter.post('/analyze', (req, res) => {
  if (busy()) return fail(res, req, 409, 'An analysis or import is already running.');
  const meta = currentPackage();
  if (!meta || meta.id !== req.body?.packageId) return fail(res, req, 404, 'Upload the package first.');
  res.status(202).json({ job: startJob('analyze', meta, {}, req.identity.uid, ({ onProgress, signal }) => analyzePackage(packagePath(meta.id), { db: pool, onProgress, signal })) });
});

clientRouter.post('/import', async (req, res, next) => {
  try {
    if (busy()) return fail(res, req, 409, 'An analysis or import is already running.');
    const meta = currentPackage();
    if (!meta || meta.id !== req.body?.packageId) return fail(res, req, 404, 'Upload the package first.');
    const wipe = req.body?.wipe === true;
    if (wipe) {
      const live = await liveSince();
      if (live) return fail(res, req, 409, `This installation is live (since ${live.slice(0, 10)}): current data can no longer be removed. Import with "keep current data" instead.`);
      if (req.body?.confirm !== WIPE_CONFIRMATION) return fail(res, req, 400, `Type ${WIPE_CONFIRMATION} to confirm that every current employee, attendance and payroll record is removed.`);
      const user = (await pool.query(`SELECT data FROM users WHERE id=$1`, [req.identity.uid])).rows[0]?.data;
      if (!user || !(await verifyUserPassword(pool, user, String(req.body?.password || '')))) return fail(res, req, 401, 'Your password is not correct.');
      if (!process.env.BACKUP_ENCRYPTION_KEY && process.env.LEGACY_IMPORT_SKIP_BACKUP !== 'true') {
        return fail(res, req, 409, 'Backups are not configured on this server (BACKUP_ENCRYPTION_KEY), so data cannot be removed safely. Ask your service provider.');
      }
    }
    const companyName = String(req.body?.companyName || '').trim().slice(0, 200);
    const options = { wipe, companyName };
    const actor = `user:${req.identity.uid}`;
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,'legacy_import_started','legacyImport',$3,$4::jsonb,$5,$6)`,
      [req.identity.uid, req.identity.roleId, meta.id, JSON.stringify({ wipe, fileName: meta.fileName, size: meta.size }), req.correlationId, req.ip]).catch(() => undefined);
    res.status(202).json({ job: startJob('import', meta, options, req.identity.uid, async ({ onProgress, signal }) => {
      if (wipe && process.env.LEGACY_IMPORT_SKIP_BACKUP !== 'true') {
        job.phase = 'backup';
        job.backup = await runBackup();
      }
      return importPackage(pool, packagePath(meta.id), { ...options, actor, onProgress, signal });
    }) });
  } catch (error) { next(error); }
});

// ── Create the package straight from SQL Server (Windows installations) ──
const sqlOnly = (req, res, next) => (sqlserver.available() ? next() : fail(res, req, 404, 'Creating the package from SQL Server is only available when HR & Payroll runs on Windows Server.'));

clientRouter.get('/sql/instances', sqlOnly, async (req, res, next) => {
  try { res.json({ instances: await sqlserver.listInstances() }); } catch (error) { next(error); }
});

clientRouter.post('/sql/databases', sqlOnly, async (req, res, next) => {
  try { res.json(await sqlserver.listDatabases(req.body || {})); }
  catch (error) { if (error.status) return fail(res, req, error.status, `Cannot connect: ${error.message}`); next(error); }
});

clientRouter.post('/sql/export', sqlOnly, async (req, res, next) => {
  try {
    if (busy()) return fail(res, req, 409, 'An analysis, import or package creation is running. Wait for it to finish.');
    const body = req.body || {};
    const database = String(body.database || '').trim();
    if (!database) return fail(res, req, 400, 'Choose the CyberAP database.');
    fs.mkdirSync(uploadDir(), { recursive: true });
    const id = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`; // server's local time
    const meta = { id, fileName: `${database.replace(/[^\w.\- ]/g, '_')}-${stamp}.cyberap.gz`, size: 0, createdAt: new Date().toISOString(), uploadedBy: req.identity.uid, source: 'sqlserver' };
    // Validate before anything is removed or started.
    try { sqlserver.validateExport(body); } catch (error) { return fail(res, req, error.status || 400, error.message); }
    removeOtherUploads(id);
    fs.writeFileSync(metaPath(id), JSON.stringify(meta));
    const audit = { server: String(body.server).trim(), database, auth: body.auth === 'sql' ? `sql:${String(body.user || '').trim()}` : 'windows', fromDate: body.fromDate || null, noPhotos: body.noPhotos === true };
    await pool.query(`INSERT INTO hr_audit_log(actor_uid,actor_role_id,action,collection_name,document_id,new_data,correlation_id,source_ip) VALUES($1,$2,'legacy_export_started','legacyImport',$3,$4::jsonb,$5,$6)`,
      [req.identity.uid, req.identity.roleId, id, JSON.stringify(audit), req.correlationId, req.ip]).catch(() => undefined);
    res.status(202).json({ job: startJob('export', meta, { source: audit }, req.identity.uid, async ({ onProgress, signal }) => {
      onProgress({ phase: 'exporting', bytes: 0, detail: `Connecting to ${audit.server} / ${database}` });
      const timer = setInterval(() => { try { onProgress({ phase: 'exporting', bytes: fs.statSync(partPath(id)).size }); } catch { /* not created yet */ } }, 2000);
      try {
        await sqlserver.runExport(body, partPath(id), { signal, onLine: line => onProgress({ phase: 'exporting', bytes: job.bytes, detail: line }) });
      } catch (error) {
        fs.rmSync(partPath(id), { force: true }); fs.rmSync(metaPath(id), { force: true });
        throw error;
      } finally { clearInterval(timer); }
      onProgress({ phase: 'finishing', bytes: job.bytes, detail: 'Checking the package' });
      const completed = await finishPackage(id, meta);
      return { package: completed };
    }) });
  } catch (error) { next(error); }
});

clientRouter.post('/cancel', (req, res) => {
  if (!busy() || !controller) return fail(res, req, 409, 'Nothing is running.');
  controller.abort();
  res.json({ job: publicJob() });
});

module.exports = { clientRouter, WIPE_CONFIRMATION, PERMISSION };
