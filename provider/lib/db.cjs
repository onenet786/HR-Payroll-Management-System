// Connections: the Provider Console's own database, the PostgreSQL administrator connection (create roles and
// databases), and small pools to each client database (settings and health only, never HR records).
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { config } = require('./config.cjs');

const pool = new Pool({ connectionString: config.databaseUrl, max: 5 });
pool.on('error', error => console.error('Provider DB pool error:', error.message));

function urlForDatabase(database) {
  const url = new URL(config.pgAdminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

/** One-off administrator connection to a database (default: the maintenance database of PG_ADMIN_URL). */
async function withAdmin(database, work) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: database ? urlForDatabase(database) : config.pgAdminUrl });
  await client.connect();
  try { return await work(client); } finally { await client.end().catch(() => undefined); }
}

const clientPools = new Map();
/** A small pool to one client database through the administrator account. */
function clientPool(dbName) {
  if (!/^[a-z0-9_]+$/.test(dbName)) throw new Error('Invalid client database name.');
  let entry = clientPools.get(dbName);
  if (!entry) {
    const p = new Pool({ connectionString: urlForDatabase(dbName), max: 2, idleTimeoutMillis: 20_000 });
    p.on('error', error => console.error(`Client DB ${dbName} pool error:`, error.message));
    entry = { pool: p };
    clientPools.set(dbName, entry);
  }
  return entry.pool;
}

async function closeClientPool(dbName) {
  const entry = clientPools.get(dbName);
  if (entry) { clientPools.delete(dbName); await entry.pool.end().catch(() => undefined); }
}

async function migrate() {
  const dir = path.join(config.root, 'migrations');
  await pool.query(`CREATE TABLE IF NOT EXISTS provider_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
    if ((await pool.query(`SELECT 1 FROM provider_migrations WHERE filename=$1`, [file])).rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query(`INSERT INTO provider_migrations(filename) VALUES($1)`, [file]);
      await client.query('COMMIT');
      console.log(`Provider migration applied: ${file}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}

module.exports = { pool, withAdmin, clientPool, closeClientPool, urlForDatabase, migrate };
