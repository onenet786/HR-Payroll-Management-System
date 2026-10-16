const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const { decryptFile, sha256File } = require('./backup-crypto.cjs');

if (process.env.CONFIRM_DATABASE_RESTORE !== 'RESTORE_HR_PAYROLL_DATABASE') throw new Error('Restore refused. Set CONFIRM_DATABASE_RESTORE=RESTORE_HR_PAYROLL_DATABASE for this command only.');
const source = path.resolve(process.argv[2] || '');
if (!fs.existsSync(source) || !source.endsWith('.dump.enc')) throw new Error('Provide an encrypted backup file path.');
const manifest = JSON.parse(fs.readFileSync(`${source}.manifest.json`, 'utf8'));
if (manifest.sha256 !== sha256File(source)) throw new Error('Backup checksum mismatch. Restore refused.');
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const parsed = new URL(databaseUrl);
const temporary = path.join(os.tmpdir(), `hr-payroll-restore-${process.pid}-${Date.now()}.dump`);
const env = { ...process.env, PGHOST: parsed.hostname, PGPORT: parsed.port || '5432', PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password), PGDATABASE: parsed.pathname.slice(1), PGSSLMODE: process.env.PG_SSL === 'true' ? 'require' : 'disable' };
try {
  decryptFile(source, temporary);
  const restore = spawnSync(process.env.PG_RESTORE_PATH || 'pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname', parsed.pathname.slice(1), temporary], { env, stdio: 'inherit' });
  if (restore.status !== 0) throw new Error(`pg_restore failed with exit code ${restore.status}.`);
  console.log(`Database restored from ${source}. Run npm run postgres:migrate before starting the application.`);
} finally {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}
