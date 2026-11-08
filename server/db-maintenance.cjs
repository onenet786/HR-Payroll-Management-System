// Database health and optimisation (Data Backup screen, nightly task, scripts/db-maintenance.cjs).
//
//   quick  VACUUM (ANALYZE) every table: refreshes the planner statistics and makes space from changed or deleted
//          rows reusable. Safe while people work (no table locks). Runs nightly after the backup.
//   deep   VACUUM (FULL, ANALYZE) table by table ("shrink"): rewrites each table and its indexes compactly and gives
//          the space back to the disk. Each table is locked while it is rewritten (seconds; the large attendance
//          table can take minutes), so it runs at night, first Sunday of the month, after a backup.
const express = require('express');
const path = require('node:path');
const { spawn } = require('node:child_process');
// Loaded on first use, so the Provider Console can call optimize() with a client pool without DATABASE_URL.
const getPool = () => require('./db.cjs').pool;
const installation = require('./installation.cjs');

const SETTING = 'dbMaintenance';
let job = null; // { mode, state, table, done, total, startedAt, finishedAt, sizeBefore, sizeAfter, error, actor }

async function databaseHealth(db = getPool()) {
  const size = (await db.query(`SELECT pg_database_size(current_database())::bigint AS bytes, current_database() AS name`)).rows[0];
  const tables = (await db.query(`
    SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes, pg_relation_size(c.oid)::bigint AS table_bytes,
           COALESCE(s.n_live_tup, 0)::bigint AS rows, COALESCE(s.n_dead_tup, 0)::bigint AS dead_rows,
           GREATEST(s.last_vacuum, s.last_autovacuum) AS last_vacuum, GREATEST(s.last_analyze, s.last_autoanalyze) AS last_analyze
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind = 'r' AND n.nspname = 'public' ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 15`)).rows
    .map(row => ({ ...row, bytes: Number(row.bytes), table_bytes: Number(row.table_bytes), rows: Number(row.rows), dead_rows: Number(row.dead_rows) }));
  const settings = Object.fromEntries((await db.query(`SELECT name, setting, unit FROM pg_settings WHERE name IN ('shared_buffers','effective_cache_size','work_mem','maintenance_work_mem','random_page_cost','server_version')`)).rows
    .map(row => [row.name, row.unit === '8kB' ? `${Math.round(Number(row.setting) * 8 / 1024)} MB` : row.unit === 'kB' ? `${Math.round(Number(row.setting) / 1024)} MB` : row.setting]));
  const deadRows = tables.reduce((sum, table) => sum + table.dead_rows, 0);
  const liveRows = tables.reduce((sum, table) => sum + table.rows, 0);
  const history = (await installation.readSetting(db, SETTING).catch(() => null))?.history || [];
  return { database: size.name, bytes: Number(size.bytes), tables, settings, deadRows, liveRows, deadShare: liveRows ? deadRows / (liveRows + deadRows) : 0, history: history.slice(0, 10) };
}

const quoteIdent = name => `"${String(name).replace(/"/g, '""')}"`;

/** Runs quick or deep optimisation. onTable(name, index, total) reports progress. */
async function optimize(mode, { db = getPool(), onTable } = {}) {
  const tables = (await db.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public' ORDER BY pg_total_relation_size(c.oid) ASC`)).rows.map(row => row.name);
  const before = Number((await db.query(`SELECT pg_database_size(current_database())::bigint AS b`)).rows[0].b);
  const client = await db.connect();
  try {
    // VACUUM cannot run inside a transaction block; one statement per table keeps locks short and gives progress.
    await client.query(`SET statement_timeout = 0`);
    for (const [index, name] of tables.entries()) {
      onTable?.(name, index, tables.length);
      await client.query(`VACUUM (${mode === 'deep' ? 'FULL, ' : ''}ANALYZE) ${quoteIdent(name)}`);
    }
  } finally { client.release(); }
  const after = Number((await db.query(`SELECT pg_database_size(current_database())::bigint AS b`)).rows[0].b);
  return { mode, tables: tables.length, sizeBefore: before, sizeAfter: after };
}

async function recordRun(entry, db = getPool()) {
  const current = (await installation.readSetting(db, SETTING).catch(() => null)) || {};
  const history = [entry, ...(current.history || [])].slice(0, 30);
  await installation.writeSetting(db, SETTING, { ...current, history, last: entry }).catch(() => undefined);
}

function runBackup() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'postgres-backup.cjs')], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`The backup before the deep optimisation failed, so nothing was changed. ${output.trim().split('\n').slice(-1)[0] || ''}`))));
  });
}

const router = express.Router();
const allowed = identity => identity.roleId === 'role-admin' || identity.permissions?.has('manage_access') || identity.permissions?.has('manage_settings');
router.use((req, res, next) => (allowed(req.identity) ? next() : res.status(403).json({ error: 'Database maintenance needs administrator rights.' })));

router.get('/', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json({ ...(await databaseHealth()), job }); } catch (error) { next(error); }
});

router.post('/optimize', async (req, res, next) => {
  try {
    if (job?.state === 'running') return res.status(409).json({ error: 'An optimisation is already running.', job });
    const mode = req.body?.mode === 'deep' ? 'deep' : 'quick';
    const backupConfigured = Boolean(process.env.BACKUP_ENCRYPTION_KEY);
    if (mode === 'deep' && !backupConfigured && req.body?.withoutBackup !== true) {
      return res.status(409).json({ error: 'Backups are not configured on this server (BACKUP_ENCRYPTION_KEY). Configure them first, or confirm a deep optimisation without a backup.' });
    }
    job = { mode, state: 'running', phase: mode === 'deep' && backupConfigured ? 'backup' : 'optimizing', table: '', done: 0, total: 0, startedAt: new Date().toISOString(), finishedAt: null, sizeBefore: null, sizeAfter: null, error: null, actor: req.identity.uid };
    await getPool().query(`INSERT INTO hr_audit_log(actor_uid, actor_role_id, action, collection_name, document_id, new_data, correlation_id, source_ip) VALUES($1,$2,'database_optimize_started','database',$3,$4::jsonb,$5,$6)`,
      [req.identity.uid, req.identity.roleId, mode, JSON.stringify({ mode }), req.correlationId, req.ip]).catch(() => undefined);
    res.status(202).json({ job });
    (async () => {
      if (mode === 'deep' && backupConfigured) await runBackup();
      job.phase = 'optimizing';
      const result = await optimize(mode, { onTable: (name, index, total) => { job.table = name; job.done = index; job.total = total; } });
      Object.assign(job, { state: 'done', phase: 'done', done: result.tables, total: result.tables, sizeBefore: result.sizeBefore, sizeAfter: result.sizeAfter });
    })().catch(error => { Object.assign(job, { state: 'failed', error: error.message }); console.error('Database optimisation failed:', error); })
      .finally(async () => {
        job.finishedAt = new Date().toISOString();
        await recordRun({ mode, state: job.state, startedAt: job.startedAt, finishedAt: job.finishedAt, sizeBefore: job.sizeBefore, sizeAfter: job.sizeAfter, error: job.error, by: req.identity.uid });
      });
  } catch (error) { next(error); }
});

module.exports = { router, databaseHealth, optimize, recordRun };
