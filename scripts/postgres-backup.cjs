const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const { encryptFile, sha256File } = require('./backup-crypto.cjs');

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const parsed = new URL(databaseUrl);
const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'));
const root = path.parse(backupDir).root;
if (backupDir === root) throw new Error('BACKUP_DIR cannot be a filesystem root.');
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = `hr-payroll-${timestamp}`;
const temporary = path.join(os.tmpdir(), `${base}-${process.pid}.dump`);
const encrypted = path.join(backupDir, `${base}.dump.enc`);
const manifestPath = `${encrypted}.manifest.json`;
const pgEnvironment = { ...process.env, PGHOST: parsed.hostname, PGPORT: parsed.port || '5432', PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password), PGDATABASE: parsed.pathname.slice(1), PGSSLMODE: process.env.PG_SSL === 'true' ? 'require' : 'disable' };

try {
  const dump = spawnSync(process.env.PG_DUMP_PATH || 'pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', temporary], { env: pgEnvironment, stdio: 'inherit' });
  if (dump.status !== 0) throw new Error(`pg_dump failed with exit code ${dump.status}.`);
  encryptFile(temporary, encrypted);
  const stats = fs.statSync(encrypted);
  const manifest = { format: 'HRPBK001', createdAt: new Date().toISOString(), database: parsed.pathname.slice(1), host: parsed.hostname, encryptedFile: path.basename(encrypted), bytes: stats.size, sha256: sha256File(encrypted) };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  const keep = Math.max(2, Number(process.env.BACKUP_RETENTION_COUNT || 14));
  const old = fs.readdirSync(backupDir).filter(name => /^hr-payroll-.*\.dump\.enc$/.test(name)).sort().reverse().slice(keep);
  for (const name of old) {
    fs.rmSync(path.join(backupDir, name));
    const manifest = path.join(backupDir, `${name}.manifest.json`);
    if (fs.existsSync(manifest)) fs.rmSync(manifest);
  }
  console.log(`Encrypted backup created: ${encrypted}`);
  console.log(`SHA-256: ${manifest.sha256}`);
} finally {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}
