#!/usr/bin/env node
// Builds the Windows Server package: HRPayroll-Windows-Setup-<version>.zip
//
//   node deploy/windows/build-windows-bundle.mjs [--skip-frontend] [--pg-dir "C:\Program Files\PostgreSQL\16"]
//
// Run on Windows with internet access (the CLIENT server needs none). Contents:
//   Setup.cmd, setup\*.ps1                 setup, update, backup, restore, status, uninstall
//   payload\app\                           server, web app, scripts, migrations, runtime node_modules
//   payload\runtime\node\                  portable Node.js (checksum verified against nodejs.org)
//   payload\runtime\pgsql\                 PostgreSQL engine only (bin, lib, share) — no pgAdmin, docs or Stack Builder
//   payload\runtime\winsw\WinSW-x64.exe    runs Node.js as a Windows service
//   docs\HR-Payroll-Windows-Server-Guide.pdf (when built)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const NODE_VERSION = process.env.WIN_NODE_VERSION || '22.11.0';
const PG_VERSION = process.env.WIN_PG_VERSION || '16.4-1';
const WINSW_VERSION = '2.12.0';
const RUNTIME_DEPS = ['bcryptjs', 'compression', 'dotenv', 'express', 'express-rate-limit', 'helmet', 'nodemailer', 'pg'];

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
const version = value('--version') || `${stamp}-${(pkg.version || '0.0.0')}`;
const cache = path.join(here, '.cache');
const stage = path.join(here, '.stage', 'package');
const appStage = path.join(stage, 'payload', 'app');
const outDir = path.join(here, 'dist');
for (const dir of [cache, outDir]) fs.mkdirSync(dir, { recursive: true });

const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { stdio: 'inherit', cwd: root, ...opts });
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.cpSync(from, to, { recursive: true }); };

async function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  console.log(`  downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  fs.writeFileSync(`${file}.part`, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(`${file}.part`, file);
  return file;
}

// Windows' own tar.exe (bsdtar) reads and writes zip files; a GNU tar earlier on the PATH (Git Bash) cannot.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const extract = (zip, to) => { fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true }); run(TAR, ['-xf', zip, '-C', to]); };

console.log(`\n▶ HR & Payroll Windows Server package ${version}\n`);
const keepFrontend = flag('--skip-frontend') && fs.existsSync(path.join(appStage, 'dist', 'index.html'));
if (!keepFrontend) fs.rmSync(path.join(here, '.stage'), { recursive: true, force: true });
else for (const entry of fs.readdirSync(stage)) if (entry !== 'payload') fs.rmSync(path.join(stage, entry), { recursive: true, force: true });
fs.mkdirSync(appStage, { recursive: true });

// ── 1. web app (same-origin API so one build serves any server address) ───────
if (keepFrontend) console.log('• Reusing the previously built web app');
else {
  console.log('• Building the web app');
  run(process.execPath, ['scripts/sync-face-models.cjs']);
  run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', path.join(appStage, 'dist'), '--emptyOutDir'], { env: { ...process.env, NODE_ENV: 'production', VITE_API_BASE_URL: '' } });
}

// ── 2. server files ──────────────────────────────────────────────────────────
console.log('• Server files');
for (const entry of fs.readdirSync(appStage)) if (entry !== 'dist') fs.rmSync(path.join(appStage, entry), { recursive: true, force: true });
copy(path.join(root, 'server.cjs'), path.join(appStage, 'server.cjs'));
for (const dir of ['server', path.join('server', 'legacy-import')]) {
  for (const file of fs.readdirSync(path.join(root, dir))) if (file.endsWith('.cjs') && !/\.(test|integration)\.cjs$/.test(file)) copy(path.join(root, dir, file), path.join(appStage, dir, file));
}
for (const script of ['postgres-migrate.cjs', 'postgres-backup.cjs', 'postgres-backup-verify.cjs', 'postgres-restore.cjs', 'backup-crypto.cjs', 'seed-tax-slabs.cjs', 'cyberap-import.cjs', 'setup-installation.cjs', 'reset-admin-password.cjs', 'db-maintenance.cjs']) {
  copy(path.join(root, 'scripts', script), path.join(appStage, 'scripts', script));
}
copy(path.join(root, 'postgres', 'migrations'), path.join(appStage, 'postgres', 'migrations'));
copy(path.join(root, 'tools', 'cyberap-export', 'Export-CyberAP.ps1'), path.join(appStage, 'tools', 'Export-CyberAP.ps1'));
const deps = Object.fromEntries(RUNTIME_DEPS.map(name => [name, pkg.dependencies[name]]));
fs.writeFileSync(path.join(appStage, 'package.json'), `${JSON.stringify({ name: 'hr-payroll-server', version: pkg.version || '0.0.0', private: true, description: 'HR & Payroll server (Windows package)', dependencies: deps }, null, 2)}\n`);
fs.writeFileSync(path.join(appStage, 'VERSION'), `${version}\n`);
console.log('• Runtime packages (npm install --omit=dev)');
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: appStage, shell: process.platform === 'win32' });

// ── 3. Node.js ───────────────────────────────────────────────────────────────
console.log(`• Node.js ${NODE_VERSION}`);
const nodeZipName = `node-v${NODE_VERSION}-win-x64.zip`;
const nodeZip = await download(`https://nodejs.org/dist/v${NODE_VERSION}/${nodeZipName}`, path.join(cache, nodeZipName));
const sums = await (await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`)).text();
const expectedNode = sums.split('\n').find(line => line.endsWith(nodeZipName))?.split(/\s+/)[0];
if (!expectedNode || expectedNode !== sha256(nodeZip)) { fs.rmSync(nodeZip, { force: true }); throw new Error('Node.js download does not match the published SHA-256. Run again.'); }
const nodeTmp = path.join(cache, 'node-extract');
extract(nodeZip, nodeTmp);
const nodeDir = path.join(stage, 'payload', 'runtime', 'node');
fs.rmSync(nodeDir, { recursive: true, force: true });
copy(path.join(nodeTmp, `node-v${NODE_VERSION}-win-x64`), nodeDir);
for (const extra of ['node_modules', 'npm', 'npm.cmd', 'npx', 'npx.cmd', 'corepack', 'corepack.cmd', 'install_tools.bat', 'nodevars.bat']) fs.rmSync(path.join(nodeDir, extra), { recursive: true, force: true });

// ── 4. PostgreSQL engine ─────────────────────────────────────────────────────
let pgSource = value('--pg-dir');
let pgOrigin;
if (pgSource) {
  console.log(`• PostgreSQL from ${pgSource}`);
  pgOrigin = `local ${pgSource}`;
} else {
  console.log(`• PostgreSQL ${PG_VERSION} (EDB binaries)`);
  const pgZipName = `postgresql-${PG_VERSION}-windows-x64-binaries.zip`;
  const pgZip = await download(`https://get.enterprisedb.com/postgresql/${pgZipName}`, path.join(cache, pgZipName));
  const pgTmp = path.join(cache, 'pg-extract');
  extract(pgZip, pgTmp);
  pgSource = path.join(pgTmp, 'pgsql');
  pgOrigin = `${pgZipName} sha256 ${sha256(pgZip)}`;
}
const pgDir = path.join(stage, 'payload', 'runtime', 'pgsql');
fs.rmSync(pgDir, { recursive: true, force: true });
for (const part of ['bin', 'lib', 'share']) {
  fs.cpSync(path.join(pgSource, part), path.join(pgDir, part), {
    recursive: true,
    filter: source => !/(pgAdmin|stackbuilder|\\doc\\|\/doc\/|\.pdb$|\\include\\|wxbase|wxmsw)/i.test(source),
  });
}
if (!fs.existsSync(path.join(pgDir, 'bin', 'postgres.exe'))) throw new Error('postgres.exe missing from the PostgreSQL files.');

// ── 5. WinSW ─────────────────────────────────────────────────────────────────
console.log(`• WinSW ${WINSW_VERSION}`);
const winsw = await download(`https://github.com/winsw/winsw/releases/download/v${WINSW_VERSION}/WinSW-x64.exe`, path.join(cache, `WinSW-${WINSW_VERSION}-x64.exe`));
copy(winsw, path.join(stage, 'payload', 'runtime', 'winsw', 'WinSW-x64.exe'));

// ── 6. setup scripts, guide, manifest ────────────────────────────────────────
console.log('• Setup scripts');
const setupSrc = path.join(here, 'setup');
// Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI: a non-ASCII dash or arrow can turn into a quote and break
// the script. Keep the setup scripts pure ASCII.
for (const file of fs.readdirSync(setupSrc)) {
  const body = fs.readFileSync(path.join(setupSrc, file), 'utf8').replace(/^﻿/, '');
  const bad = body.split('\n').findIndex(line => /[^\x00-\x7F]/.test(line));
  if (bad >= 0) throw new Error(`deploy/windows/setup/${file} line ${bad + 1} has a non-ASCII character; Windows PowerShell 5.1 would misread it.`);
}
for (const file of fs.readdirSync(setupSrc)) {
  const target = file === 'Setup.cmd' ? path.join(stage, 'Setup.cmd') : path.join(stage, 'setup', file);
  copy(path.join(setupSrc, file), target);
}
const guide = path.join(root, 'docs', 'HR-Payroll-Windows-Server-Guide.pdf');
if (fs.existsSync(guide)) copy(guide, path.join(stage, 'docs', path.basename(guide)));
const migrationGuide = path.join(root, 'docs', 'CyberAP-Data-Migration-Guide.pdf');
if (fs.existsSync(migrationGuide)) copy(migrationGuide, path.join(stage, 'docs', path.basename(migrationGuide)));
for (const name of ['HR-Payroll-Database-Commands.pdf', 'HR-Payroll-Database-Queries.sql']) {
  const file = path.join(root, 'docs', name);
  if (fs.existsSync(file)) copy(file, path.join(stage, 'docs', name));
}
fs.writeFileSync(path.join(stage, 'README.txt'), [
  `HR & Payroll ${version} — Windows Server package`,
  '',
  '1. Extract this whole zip on the server (e.g. C:\\Setup\\HRPayroll).',
  '2. Right-click Setup.cmd → Run as administrator, and answer the questions.',
  '   Unattended: copy setup\\setup.config.example.psd1 to setup.config.psd1, fill it in, run: Setup.cmd setup.config.psd1',
  '3. Open the address shown at the end and sign in.',
  '',
  'Guide: docs\\HR-Payroll-Windows-Server-Guide.pdf',
  'Update: extract the new package, run setup\\Update-HRPayroll.ps1 as administrator.',
  '',
].join('\r\n'));
const manifest = { version, builtAt: new Date().toISOString(), node: NODE_VERSION, nodeSha256: expectedNode, postgresql: pgOrigin, winsw: `${WINSW_VERSION} sha256 ${sha256(winsw)}`, runtimeDependencies: deps };
fs.writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// ── 7. zip ───────────────────────────────────────────────────────────────────
const zipPath = path.join(outDir, `HRPayroll-Windows-Setup-${version}.zip`);
console.log('• Zipping');
fs.rmSync(zipPath, { force: true });
// Name the top-level items instead of ".": entries must not start with "./", or Windows Explorer calls the zip invalid.
run(TAR, ['-a', '-c', '-f', zipPath, '-C', stage, ...fs.readdirSync(stage).sort()]);
// Check the zip the way Windows reads it: no "./" or absolute entry names, and Setup.cmd at the top.
{
  const listing = execFileSync(TAR, ['-t', '-f', zipPath], { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
  const bad = listing.filter(name => name.startsWith('./') || name.startsWith('/') || name.includes('..'));
  if (bad.length) throw new Error(`Zip has entry names Windows Explorer rejects: ${bad.slice(0, 3).join(', ')}`);
  if (!listing.includes('Setup.cmd')) throw new Error('Setup.cmd is not at the top of the zip.');
}
const mb = bytes => `${(bytes / 1024 / 1024).toFixed(0)} MB`;
const dirSize = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? dirSize(path.join(dir, entry.name)) : fs.statSync(path.join(dir, entry.name)).size), 0);
console.log(`\n✔ ${path.relative(root, zipPath)} (${mb(fs.statSync(zipPath).size)}; app ${mb(dirSize(appStage))}, Node ${mb(dirSize(nodeDir))}, PostgreSQL ${mb(dirSize(pgDir))})`);
console.log(`  SHA-256 ${sha256(zipPath)}`);
