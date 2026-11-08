#!/usr/bin/env node
// Imports a CyberAP export package (tools/cyberap-export/Export-CyberAP.ps1) straight into PostgreSQL.
// The vendor console does the same over the web; this is for the server shell or a local test database.
//
//   node scripts/cyberap-import.cjs --package D:\CyberAP.cyberap.gz --analyze
//   node scripts/cyberap-import.cjs --package D:\CyberAP.cyberap.gz
//   node scripts/cyberap-import.cjs --package D:\CyberAP.cyberap.gz --wipe --confirm "DELETE ALL DATA" --company-name "Bin Ishaq"
//
// DATABASE_URL (or --database-url) chooses the database; .env.local / .env are read like the server does.
const path = require('node:path');
const { Pool } = require('pg');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const { analyzePackage, importPackage } = require('../server/legacy-import/cyberap.cjs');

const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const value = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const packagePath = value('package');
const databaseUrl = (value('database-url') || process.env.DATABASE_URL || '').trim();
if (!packagePath) { console.error('Usage: node scripts/cyberap-import.cjs --package <file.cyberap.gz> [--analyze] [--wipe --confirm "DELETE ALL DATA"] [--company-name <name>]'); process.exit(2); }
if (!databaseUrl) { console.error('DATABASE_URL is required (or pass --database-url).'); process.exit(2); }
if (flag('wipe') && value('confirm') !== 'DELETE ALL DATA') { console.error('--wipe removes every employee, attendance and payroll record. Add --confirm "DELETE ALL DATA" to proceed.'); process.exit(2); }

const pool = new Pool({ connectionString: databaseUrl, ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : false });
const target = databaseUrl.replace(/\/\/[^@]*@/, '//***@');

let last = 0;
const onProgress = ({ phase, bytes, size, report }) => {
  const now = Date.now();
  if (now - last < 3000 && phase !== 'done' && phase !== 'analyzed') return;
  last = now;
  const percent = size ? Math.min(100, Math.round((bytes / size) * 100)) : 0;
  const days = report?.attendance ? report.attendance.imported : 0;
  console.log(`[${new Date().toLocaleTimeString()}] ${phase.padEnd(10)} ${String(percent).padStart(3)}%  employees ${report?.employees?.total || 0}  attendance days ${days.toLocaleString()}`);
};

(async () => {
  console.log(`Package : ${path.resolve(packagePath)}`);
  console.log(`Database: ${target}`);
  const started = Date.now();
  const report = flag('analyze')
    ? await analyzePackage(packagePath, { db: pool, onProgress })
    : await importPackage(pool, packagePath, { wipe: flag('wipe'), companyName: value('company-name') || '', actor: 'cli', onProgress });
  console.log(JSON.stringify(report, null, 2));
  console.log(`${flag('analyze') ? 'Analysis' : 'Import'} finished in ${Math.round((Date.now() - started) / 1000)} s.`);
})().catch(error => {
  console.error(error.message);
  if (error.report) console.error(JSON.stringify(error.report, null, 2));
  process.exitCode = 1;
}).finally(() => pool.end());
