const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false });

async function main() {
  const migrationsDir = path.join(__dirname, '..', 'postgres', 'migrations');
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  for (const filename of fs.readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort()) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (existing.rowCount) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Applied ${filename}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

main().finally(() => pool.end());
