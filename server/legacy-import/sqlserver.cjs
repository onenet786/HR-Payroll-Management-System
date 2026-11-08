// "Create the package from SQL Server": on a Windows Server installation the app can run the CyberAP exporter itself
// (tools/Export-CyberAP.ps1), so the client's IT does not have to run it by hand and upload the file.
// Read-only towards SQL Server. The SQL password travels in an environment variable of the child process only:
// never on a command line (visible in process lists), never saved, never logged.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const SERVER_PATTERN = /^[\w.\\\-,:() ]{1,200}$/; // ".\SQLEXPRESS", "HOST\INST", "10.0.0.5,1433", "(local)"
const USER_PATTERN = /^[\w.\\\-@ ]{1,128}$/;

function exporterPath() {
  const candidates = [path.join(ROOT, 'tools', 'Export-CyberAP.ps1'), path.join(ROOT, 'tools', 'cyberap-export', 'Export-CyberAP.ps1')];
  return candidates.find(file => fs.existsSync(file)) || null;
}

/** Only on Windows (PowerShell + SQL Server client ship with it) and only when the exporter is present. */
function available() {
  return process.platform === 'win32' && process.env.LEGACY_SQL_EXPORT !== 'false' && Boolean(exporterPath());
}

function validConnection(input) {
  const server = String(input?.server || '').trim();
  const user = input?.auth === 'sql' ? String(input?.user || '').trim() : '';
  if (!SERVER_PATTERN.test(server)) throw Object.assign(new Error('Enter the SQL Server instance, for example .\\SQLEXPRESS or SERVERNAME\\INSTANCE.'), { status: 400 });
  if (input?.auth === 'sql' && !USER_PATTERN.test(user)) throw Object.assign(new Error('Enter the SQL login name.'), { status: 400 });
  return { server, user, password: user ? String(input?.password || '') : '' };
}

/** First readable line of PowerShell's stderr: no CLIXML progress records, no "At line" noise, no "Exception calling" wrapper. */
function cleanError(text) {
  const line = String(text || '').split(/\r?\n/).map(value => value.trim())
    .find(value => value && !value.startsWith('#< CLIXML') && !value.startsWith('<Objs') && !/^(At |\+ |CategoryInfo|FullyQualifiedErrorId|~)/.test(value));
  if (!line) return '';
  return line.replace(/^Cannot connect to .+? : /, '').replace(/^Exception calling "\w+" with "\d+" argument\(s\): /, '').replace(/^"(.*)"$/, '$1');
}

/** Runs a PowerShell script (passed encoded, so quoting is never an issue) and returns its stdout. */
function powershell(script, env = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(`[Console]::OutputEncoding = [Text.Encoding]::UTF8\n$ErrorActionPreference = 'Stop'\ntry {\n${script}\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', chunk => { out += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { err += chunk.toString('utf8'); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('SQL Server did not answer in time.')); }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) return resolve(out.trim());
      const message = cleanError(err) || `PowerShell exited with code ${code}.`;
      reject(Object.assign(new Error(message), { status: 400 }));
    });
  });
}

const CONNECT = `
$b = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$b['Data Source'] = $env:CY_SERVER
$b['Initial Catalog'] = 'master'
$b['Connect Timeout'] = 15
$b['Application Name'] = 'HR-Payroll-Import'
if ($env:CY_USER) { $b['User ID'] = $env:CY_USER; $b['Password'] = $env:CY_PASSWORD } else { $b['Integrated Security'] = $true }
$c = New-Object System.Data.SqlClient.SqlConnection $b.ConnectionString
$c.Open()`;

/** SQL Server instances installed on this machine (from the registry). */
async function listInstances() {
  const output = await powershell(`
$key = 'HKLM:\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\Instance Names\\SQL'
$names = @()
if (Test-Path $key) { $names = @((Get-Item $key).GetValueNames()) }
ConvertTo-Json -InputObject $names -Compress`, {}, 20000).catch(() => '[]');
  let names = [];
  try { names = JSON.parse(output || '[]'); } catch { names = []; }
  return (Array.isArray(names) ? names : [names]).filter(Boolean).map(name => (name.toUpperCase() === 'MSSQLSERVER' ? '.' : `.\\${name}`));
}

/** Databases on the instance, with the ones that look like CyberAP marked (employee + processed_attendance tables). */
async function listDatabases(input) {
  const { server, user, password } = validConnection(input);
  const output = await powershell(`${CONNECT}
try {
  $cmd = $c.CreateCommand()
  $cmd.CommandText = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(64)) + ' ' + CAST(SERVERPROPERTY('Edition') AS nvarchar(128))"
  $version = [string]$cmd.ExecuteScalar()
  $cmd.CommandText = "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 AND HAS_DBACCESS(name) = 1 ORDER BY name"
  $r = $cmd.ExecuteReader(); $names = @(); while ($r.Read()) { $names += $r.GetString(0) }; $r.Close()
  $list = @()
  foreach ($n in $names) {
    $q = $n.Replace(']', ']]'); $lit = $q.Replace("'", "''")
    $employees = $null; $cyberap = $false
    try {
      $cmd.CommandText = "SELECT CASE WHEN OBJECT_ID(N'[$lit].dbo.employee') IS NOT NULL AND OBJECT_ID(N'[$lit].dbo.processed_attendance') IS NOT NULL THEN 1 ELSE 0 END"
      if ([int]$cmd.ExecuteScalar() -eq 1) { $cyberap = $true; $cmd.CommandText = "SELECT COUNT(*) FROM [$q].dbo.employee"; $employees = [int]$cmd.ExecuteScalar() }
    } catch { }
    $list += [pscustomobject]@{ name = $n; cyberap = $cyberap; employees = $employees }
  }
  ConvertTo-Json -InputObject @{ version = $version; databases = @($list) } -Compress -Depth 4
} finally { $c.Close() }`, { CY_SERVER: server, CY_USER: user, CY_PASSWORD: password }, 60000);
  const result = JSON.parse(output || '{}');
  const databases = Array.isArray(result.databases) ? result.databases : result.databases ? [result.databases] : [];
  return { server, version: result.version || '', databases };
}

/**
 * Runs Export-CyberAP.ps1 into outFile. Calls onLine with every progress line. Resolves when the package is written.
 * Aborting the signal stops the exporter.
 */
/** Checks the export request (throws a 400 error with a readable message). */
function validateExport(input) {
  const connection = validConnection(input);
  const database = String(input?.database || '').trim();
  if (!database || database.length > 128 || /[\u0000-\u001f]/.test(database)) throw Object.assign(new Error('Choose the CyberAP database.'), { status: 400 });
  const fromDate = String(input?.fromDate || '').trim();
  if (fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) throw Object.assign(new Error('The "from" date must be YYYY-MM-DD.'), { status: 400 });
  return { ...connection, database, fromDate };
}

function runExport(input, outFile, { onLine, signal } = {}) {
  const { server, user, password, database, fromDate } = validateExport(input);
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', exporterPath(), '-Server', server, '-Database', database, '-OutFile', outFile];
  if (user) args.push('-SqlUser', user);
  if (fromDate) args.push('-FromDate', fromDate);
  if (input?.noPhotos === true) args.push('-NoPhotos');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', args, { env: { ...process.env, CYBERAP_SQL_PASSWORD: password }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = ''; let err = ''; let buffer = '';
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/); buffer = lines.pop();
      for (const line of lines.map(value => value.trim()).filter(Boolean)) { tail = line; onLine?.(line); }
    });
    child.stderr.on('data', chunk => { err += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new Error('Package creation was cancelled.'));
      if (code === 0 && fs.existsSync(outFile)) return resolve({ server, database, fromDate: fromDate || null, lastLine: tail });
      const message = cleanError(err);
      reject(new Error(message || tail || `The exporter stopped (exit ${code}).`));
    });
  });
}

module.exports = { available, listInstances, listDatabases, runExport, validateExport, exporterPath };
