const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const { decryptFile, sha256File } = require('./backup-crypto.cjs');

const source = path.resolve(process.argv[2] || '');
if (!source || !fs.existsSync(source) || !source.endsWith('.dump.enc')) throw new Error('Usage: npm run postgres:backup:verify -- /absolute/path/to/backup.dump.enc');
const manifestPath = `${source}.manifest.json`;
if (!fs.existsSync(manifestPath)) throw new Error('Backup manifest is missing.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.sha256 !== sha256File(source)) throw new Error('Backup checksum mismatch. File may be damaged or replaced.');
const temporary = path.join(os.tmpdir(), `hr-payroll-verify-${process.pid}-${Date.now()}.dump`);
try {
  decryptFile(source, temporary);
  const verify = spawnSync(process.env.PG_RESTORE_PATH || 'pg_restore', ['--list', temporary], { encoding: 'utf8' });
  if (verify.status !== 0 || !verify.stdout?.includes('TABLE')) throw new Error(`pg_restore validation failed: ${verify.stderr || 'invalid archive'}`);
  console.log(`Backup verified: ${source}`);
  console.log(`Created: ${manifest.createdAt}; encrypted bytes: ${manifest.bytes}; archive entries validated.`);
} finally {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}
