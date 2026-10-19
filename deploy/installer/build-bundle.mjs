#!/usr/bin/env node
// Builds the one-file server setup bundle for new clients:
//
//   deploy/installer/dist/hrpayroll-setup-<version>.run   ← copy to the server, run with sudo bash
//   deploy/installer/dist/hrpayroll-app-<version>.tar.gz  ← app-only package for `hrpayrollctl update`
//   deploy/installer/dist/SHA256SUMS
//
// Usage (from the repository root, Windows or Linux):
//   node deploy/installer/build-bundle.mjs [--version 1.4.0] [--skip-frontend]
//
// The frontend is built with an empty VITE_API_BASE_URL so the browser calls
// the API on whatever domain serves it — one package fits every client. The
// existing ./dist folder is never touched; the build goes to a staging dir.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(' ')} failed (${r.error?.message || `exit ${r.status}`})`);
}
function git(...gitArgs) {
  const r = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

const today = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
const sha = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no') ? '-dirty' : '';
const version = (option('--version') || `${today}${sha ? `-${sha}` : ''}${dirty}`).replace(/[^A-Za-z0-9._-]/g, '-');

const outDir = path.join(here, 'dist');
const stage = path.join(here, '.stage');
const appStage = path.join(stage, 'app');
fs.mkdirSync(outDir, { recursive: true });

console.log(`\n▶ HR & Payroll server bundle ${version}\n`);

// ---- 1. frontend --------------------------------------------------------
const stagedDist = path.join(appStage, 'dist');
if (flag('--skip-frontend') && fs.existsSync(path.join(stagedDist, 'index.html'))) {
  console.log('• Reusing the previously staged frontend build');
  for (const entry of fs.readdirSync(appStage)) if (entry !== 'dist') fs.rmSync(path.join(appStage, entry), { recursive: true, force: true });
} else {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(appStage, { recursive: true });
  console.log('• Building the web app (same-origin API)…');
  run(process.execPath, ['scripts/sync-face-models.cjs']);
  run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', stagedDist, '--emptyOutDir'], {
    env: { ...process.env, NODE_ENV: 'production', VITE_API_BASE_URL: '' },
  });
}

// A domain baked into the bundle would send every client's browser to *your*
// server. Fail loudly if any configured VITE_API_BASE_URL leaked into the JS.
const bakedUrls = ['.env', '.env.local', '.env.production']
  .map(f => path.join(root, f)).filter(f => fs.existsSync(f))
  .flatMap(f => fs.readFileSync(f, 'utf8').split(/\r?\n/))
  .map(line => line.match(/^\s*VITE_API_BASE_URL\s*=\s*["']?([^"'\s#]+)/)?.[1])
  .filter(Boolean);
const jsFiles = walk(stagedDist).filter(f => f.endsWith('.js'));
for (const url of new Set(bakedUrls)) {
  const leaked = jsFiles.find(f => fs.readFileSync(f, 'utf8').includes(url));
  if (leaked) throw new Error(`The build still contains ${url} (in ${path.relative(stage, leaked)}). Unset VITE_API_BASE_URL and rebuild.`);
}

// ---- 2. server files -----------------------------------------------------
console.log('• Collecting server files');
const copy = (rel, dest = rel) => {
  const to = path.join(appStage, dest);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, rel), to);
};
for (const f of ['server.cjs', 'package.json', 'package-lock.json']) copy(f);
for (const f of fs.readdirSync(path.join(root, 'server'))) {
  if (f.endsWith('.cjs') && !/\.(test|integration)\.cjs$/.test(f)) copy(path.join('server', f));
}
for (const f of ['postgres-migrate.cjs', 'postgres-backup.cjs', 'postgres-backup-verify.cjs', 'postgres-restore.cjs', 'backup-crypto.cjs', 'seed-tax-slabs.cjs']) {
  if (fs.existsSync(path.join(root, 'scripts', f))) copy(path.join('scripts', f));
}
for (const f of fs.readdirSync(path.join(root, 'postgres', 'migrations')).filter(n => n.endsWith('.sql'))) {
  copy(path.join('postgres', 'migrations', f));
}
fs.writeFileSync(path.join(appStage, 'VERSION'), `${version}\n`);

// ---- 3. archives ---------------------------------------------------------
const appTar = tarGz(appStage, '.');
const appPkgPath = path.join(outDir, `hrpayroll-app-${version}.tar.gz`);
fs.writeFileSync(appPkgPath, appTar);

console.log('• Assembling the self-extracting installer');
const bundleStage = path.join(stage, 'bundle');
const inst = path.join(bundleStage, 'installer');
fs.rmSync(bundleStage, { recursive: true, force: true });
fs.mkdirSync(path.join(inst, 'lib'), { recursive: true });
const lf = rel => fs.readFileSync(path.join(here, rel), 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(path.join(inst, 'install.sh'), lf('install.sh'), { mode: 0o755 });
fs.writeFileSync(path.join(inst, 'hrpayrollctl'), lf('hrpayrollctl'), { mode: 0o755 });
fs.writeFileSync(path.join(inst, 'lib', 'common.sh'), lf('lib/common.sh'));
fs.writeFileSync(path.join(inst, 'branding.conf'), lf('branding.conf'));
fs.writeFileSync(path.join(inst, 'client.conf.example'), lf('client.conf.example'));
fs.writeFileSync(path.join(inst, 'VERSION'), `${version}\n`);
fs.writeFileSync(path.join(inst, 'app.tar.gz'), appTar);
const payload = tarGz(bundleStage, '.', new Set(['installer/install.sh', 'installer/hrpayrollctl']));
const payloadSha = createHash('sha256').update(payload).digest('hex');

const branding = Object.fromEntries(lf('branding.conf').split('\n')
  .map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const product = (branding.PRODUCT_NAME || 'HR & Payroll Suite').replace(/[^\w &.-]/g, '');

const stub = `#!/usr/bin/env bash
# ${product} — server setup bundle ${version}
# Self-extracting installer. Run on the client's Ubuntu server:
#     sudo bash ${`hrpayroll-setup-${version}.run`}
# Options: --help (installer help), --info, --extract-only DIR
set -euo pipefail
PAYLOAD_SHA256="${payloadSha}"
SELF="$(readlink -f "\${BASH_SOURCE[0]:-$0}")"
SKIP="$(awk '/^__HRP_PAYLOAD_BELOW__$/ { print NR + 1; exit }' "$SELF")"
payload() { tail -n +"$SKIP" "$SELF"; }
if [[ "\${1:-}" == --info ]]; then echo "${product} setup bundle ${version}"; echo "payload sha256 $PAYLOAD_SHA256"; exit 0; fi
if [[ "$(payload | sha256sum | cut -d' ' -f1)" != "$PAYLOAD_SHA256" ]]; then
  echo "This setup file is damaged or incomplete (checksum mismatch). Download/copy it again in binary mode." >&2; exit 1
fi
if [[ "\${1:-}" == --extract-only ]]; then
  [[ -n "\${2:-}" ]] || { echo "Usage: $0 --extract-only DIR" >&2; exit 1; }
  mkdir -p "$2"; payload | tar -xz -C "$2"; exit 0
fi
if [[ $EUID -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1; then exec sudo bash "$SELF" "$@"; fi
  echo "Run this as root." >&2; exit 1
fi
TMP="$(mktemp -d /tmp/hrpayroll-setup.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
payload | tar -xz -C "$TMP"
rc=0; bash "$TMP/installer/install.sh" "$@" || rc=$?
exit "$rc"
__HRP_PAYLOAD_BELOW__
`;
const runPath = path.join(outDir, `hrpayroll-setup-${version}.run`);
fs.writeFileSync(runPath, Buffer.concat([Buffer.from(stub, 'utf8'), payload]), { mode: 0o755 });

const sums = [runPath, appPkgPath].map(f => `${createHash('sha256').update(fs.readFileSync(f)).digest('hex')}  ${path.basename(f)}`);
fs.writeFileSync(path.join(outDir, 'SHA256SUMS'), `${sums.join('\n')}\n`);
fs.writeFileSync(path.join(outDir, 'LATEST'), `${version}\n`);

const mb = f => (fs.statSync(f).size / 1048576).toFixed(1);
console.log(`\n✔ Done\n  ${path.relative(root, runPath)}  (${mb(runPath)} MB)\n  ${path.relative(root, appPkgPath)}  (${mb(appPkgPath)} MB)\n`);
console.log('  Install on a new server:   sudo bash ' + path.basename(runPath));
console.log('  Update an installation:    sudo hrpayrollctl update <id> ' + path.basename(runPath) + '\n');

// ---- helpers ---------------------------------------------------------------
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.isFile() ? [p] : [];
  });
}

// Minimal ustar writer (root-owned, 0644/0755, LF scripts) so the archive
// unpacks the same whether it was built on Windows or Linux.
function tarGz(baseDir, prefix, executables = new Set()) {
  const blocks = [];
  const entries = [];
  (function collect(dir, rel) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { entries.push({ rel: `${r}/`, dir: true }); collect(path.join(dir, e.name), r); }
      else if (e.isFile()) entries.push({ rel: r, file: path.join(dir, e.name) });
    }
  })(baseDir, '');
  for (const entry of entries) {
    const name = `${prefix}/${entry.rel}`;
    const data = entry.dir ? Buffer.alloc(0) : fs.readFileSync(entry.file);
    const mode = entry.dir || executables.has(entry.rel) ? 0o755 : 0o644;
    blocks.push(header(name, data.length, mode, entry.dir ? '5' : '0'));
    if (data.length) {
      blocks.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad) blocks.push(Buffer.alloc(pad));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
}

function header(name, size, mode, type) {
  const h = Buffer.alloc(512);
  let base = name, pre = '';
  if (Buffer.byteLength(name) > 100) {
    // ustar: split at a '/' so that prefix <= 155 bytes and name <= 100 bytes.
    let cut = -1;
    for (let i = 1; i < name.length - 1; i++) {
      if (name[i] === '/' && Buffer.byteLength(name.slice(0, i)) <= 155 && Buffer.byteLength(name.slice(i + 1)) <= 100) { cut = i; break; }
    }
    if (cut < 0) throw new Error(`Path too long for tar: ${name}`);
    pre = name.slice(0, cut); base = name.slice(cut + 1);
  }
  const put = (str, off, len) => h.write(str, off, len, 'utf8');
  const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
  put(base, 0, 100);
  put(oct(mode, 8), 100, 8);
  put(oct(0, 8), 108, 8);
  put(oct(0, 8), 116, 8);
  put(oct(size, 12), 124, 12);
  put(oct(Math.floor(Date.now() / 1000), 12), 136, 12);
  h.fill(' ', 148, 156);
  put(type, 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  put('root', 265, 32);
  put('root', 297, 32);
  put(pre, 345, 155);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}
