<#
.SYNOPSIS
  Installs HR & Payroll on Windows Server 2019/2022 with its own embedded PostgreSQL database.

.DESCRIPTION
  Everything comes from this package; the server needs no internet access:
    - "HR Payroll Database"     PostgreSQL 16 engine as a Windows service, listening only on this server (localhost)
    - "HR Payroll Application"  Node.js application as a Windows service (WinSW), starts after the database,
                                restarts automatically if it stops
    - "HR Payroll Nightly Backup" scheduled task: encrypted backup, optional copy to a network share
    - Windows Firewall rule for the application port(s) (Domain and Private networks only)

  Run from an elevated PowerShell (or right-click Setup.cmd -> Run as administrator).
  Unattended: -ConfigFile setup.config.psd1 (see setup.config.example.psd1).
  -Portable is a test mode for a PC without administrator rights: no services, firewall rule or scheduled task;
  the database and app are started as normal processes.
#>
[CmdletBinding()]
param(
  [string]$ConfigFile = '',
  [string]$InstallDir = '',
  [string]$DataDir = '',
  [string]$CompanyName = '',
  [string]$AdminName = '',
  [string]$AdminEmail = '',
  [string]$AdminPassword = '',
  [ValidateSet('', 'full', 'lite')][string]$Edition = '',
  [string]$PublicUrl = '',
  [int]$AppPort = 0,
  [int]$DbPort = 0,
  [switch]$Portable
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$packageRoot = Split-Path -Parent $here
$payload = Join-Path $packageRoot 'payload'
$logFile = Join-Path $env:TEMP ("hrpayroll-setup-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
Start-Transcript -Path $logFile -Append | Out-Null

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Info($text) { Write-Host "    $text" }
function Fail($text) { Write-Host ''; Write-Host "SETUP FAILED: $text" -ForegroundColor Red; Write-Host "Log: $logFile"; Stop-Transcript | Out-Null; exit 1 }
function RandomBase64([int]$bytes = 32) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) }
function RandomPassword([int]$bytes = 24) { (RandomBase64 $bytes).Replace('+', 'A').Replace('/', 'b').TrimEnd('=') }
function PortFree([int]$port) {
  try { $l = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Any, $port); $l.Start(); $l.Stop(); return $true } catch { return $false }
}
function FirstFreePort([int]$start) { $p = $start; while (-not (PortFree $p)) { $p++ }; return $p }
function Run([string]$exe, [string[]]$arguments, [string]$workDir = $null, [hashtable]$envVars = @{}) {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $exe
  $psi.Arguments = ($arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8; $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
  if ($workDir) { $psi.WorkingDirectory = $workDir }
  foreach ($k in $envVars.Keys) { $psi.EnvironmentVariables[$k] = [string]$envVars[$k] }
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $text = ($out.Result + $err.Result).Trim()
  if ($text) { $text -split "`n" | ForEach-Object { Info $_.TrimEnd() } }
  if ($p.ExitCode -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed (exit $($p.ExitCode))." }
  return $text
}
# UTF-8 without BOM (Windows PowerShell 5.1's -Encoding UTF8 adds one, which Node and dotenv do not expect).
function WriteUtf8([string]$file, [string]$text) { [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding($false))) }
function Ask([string]$label, [string]$default = '') {
  $suffix = if ($default) { " [$default]" } else { '' }
  $answer = Read-Host "$label$suffix"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default } else { return $answer.Trim() }
}

# -- Configuration ------------------------------------------------------------
$cfg = @{}
if ($ConfigFile) {
  if (-not (Test-Path $ConfigFile)) { Fail "Config file not found: $ConfigFile" }
  $cfg = Import-PowerShellDataFile -Path $ConfigFile
}
function Pick($param, $key, $default) { if ($param) { return $param } elseif ($cfg.ContainsKey($key) -and $cfg[$key]) { return $cfg[$key] } else { return $default } }
$unattended = [bool]$ConfigFile

$installDirGiven = [bool]($InstallDir -or $cfg['InstallDir'])
$dataDirGiven = [bool]($DataDir -or $cfg['DataDir'])
$InstallDir = Pick $InstallDir 'InstallDir' 'C:\HRPayroll'
$DataDir = Pick $DataDir 'DataDir' 'C:\HRPayrollData'
$Edition = Pick $Edition 'Edition' ''
$CompanyName = Pick $CompanyName 'CompanyName' ''
$AdminName = Pick $AdminName 'AdminName' 'Administrator'
$AdminEmail = Pick $AdminEmail 'AdminEmail' ''
$AdminPassword = Pick $AdminPassword 'AdminPassword' ''
$PublicUrl = Pick $PublicUrl 'PublicUrl' ''
$AppPort = [int](Pick $AppPort 'AppPort' 8080)
$DbPort = [int](Pick $DbPort 'DbPort' 5433)
$httpsPfx = Pick '' 'HttpsPfxPath' ''
$httpsPfxPass = Pick '' 'HttpsPfxPassphrase' ''
$httpsCert = Pick '' 'HttpsCertPath' ''
$httpsKey = Pick '' 'HttpsKeyPath' ''
$httpsPort = [int](Pick 0 'HttpsPort' 443)
$backupTime = Pick '' 'BackupTime' '01:30'
$backupCopyTo = Pick '' 'BackupCopyTo' ''
$clientDataImport = if ($cfg.ContainsKey('EnableDataImport')) { [bool]$cfg['EnableDataImport'] } else { $true }
$smtp = @{ Host = (Pick '' 'SmtpHost' ''); Port = (Pick '' 'SmtpPort' '587'); User = (Pick '' 'SmtpUser' ''); Pass = (Pick '' 'SmtpPass' ''); From = (Pick '' 'SmtpFrom' '') }

$version = [string](Get-Content (Join-Path $payload 'app\VERSION') -ErrorAction SilentlyContinue | Select-Object -First 1)  # plain text, not a PS object (it is written to JSON)
if ($version) { $version = $version.Trim() }
if (-not $version) { Fail 'The package is incomplete (payload\app\VERSION missing). Extract the whole zip and run Setup.cmd from it.' }

Write-Host ''
Write-Host "HR & Payroll - Windows Server setup  (version $version)" -ForegroundColor Green
if ($Portable) { Write-Host '(portable test mode: no services, firewall rule or scheduled task)' -ForegroundColor Yellow }

# -- Drives and folders -------------------------------------------------------
# Local fixed disks only (DriveType 3): network drives and USB sticks are not suitable for a database.
function Get-FixedDrives { @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Sort-Object DeviceID) }
function Show-Drives {
  Write-Host ''
  Write-Host '    Disks on this server:'
  foreach ($d in Get-FixedDrives) {
    $label = if ($d.VolumeName) { $d.VolumeName } else { '' }
    Write-Host ("      {0}   {1,8:N1} GB free of {2,8:N1} GB   {3}" -f $d.DeviceID, ($d.FreeSpace / 1GB), ($d.Size / 1GB), $label)
  }
  Write-Host ''
}
# Suggested data disk: the non-system fixed disk with the most free space (at least 10 GB), else the system disk.
function Get-SuggestedDataDrive {
  $system = $env:SystemDrive.ToUpper()
  $best = Get-FixedDrives | Where-Object { $_.DeviceID.ToUpper() -ne $system -and $_.FreeSpace -ge 10GB } | Sort-Object FreeSpace -Descending | Select-Object -First 1
  if ($best) { return $best.DeviceID } else { return $system }
}
# Returns $null when the folder is acceptable, otherwise the reason.
function Test-FolderChoice([string]$folder) {
  if ($folder -match '^[A-Za-z]:\\?$') { return 'Choose a folder, not the root of a drive (e.g. D:\HRPayrollData).' }
  if ($folder -notmatch '^[A-Za-z]:\\[^<>:"/|?*]+$') { return 'Use a full local path such as D:\HRPayrollData (no network paths).' }
  $drive = $folder.Substring(0, 2).ToUpper()
  if (-not (Get-FixedDrives | Where-Object { $_.DeviceID.ToUpper() -eq $drive })) { return "$drive is not a local fixed disk on this server." }
  return $null
}
function Ask-Folder([string]$label, [string]$default) {
  while ($true) {
    $answer = Ask $label $default
    # A bare drive letter ("D" or "D:") means the default folder name on that drive.
    if ($answer -match '^[A-Za-z]:?\\?$') { $answer = $answer.Substring(0, 1).ToUpper() + ':' + $default.Substring(2) }
    $reason = Test-FolderChoice $answer
    if (-not $reason) { return $answer.TrimEnd('\') }
    Write-Host "    $reason" -ForegroundColor Yellow
  }
}

if (-not $unattended) {
  if (-not $CompanyName) { $CompanyName = Ask 'Company name' }
  if (-not $AdminEmail) { $AdminEmail = Ask 'Administrator email (sign-in)' }
  if (-not $AdminName -or $AdminName -eq 'Administrator') { $AdminName = Ask 'Administrator name' 'Administrator' }
  if (-not $Edition) { $Edition = Ask 'Edition: full (FBR, EOBI, PF...) or lite (small business)' 'full' }
  if (-not $PublicUrl) { $PublicUrl = Ask 'Address users will open (e.g. https://hr.company.com), empty = http://<this server>' '' }
  if (-not $installDirGiven -or -not $dataDirGiven) {
    Show-Drives
    Write-Host '    Type a folder, or just a drive letter (e.g. D) to use the suggested folder name on that drive.'
  }
  if (-not $installDirGiven) { $InstallDir = Ask-Folder 'Program folder (application, database engine, settings, about 250 MB)' 'C:\HRPayroll' }
  if (-not $dataDirGiven) {
    $suggested = (Get-SuggestedDataDrive) + '\HRPayrollData'
    $DataDir = Ask-Folder 'Data folder (database, documents, backups, logs; grows over time)' $suggested
  }
  Write-Host ''
  Write-Host '    Ready to install:' -ForegroundColor Cyan
  Write-Host "      Company        $CompanyName ($Edition edition)"
  Write-Host "      Administrator  $AdminEmail"
  Write-Host "      Program        $InstallDir"
  Write-Host "      Data           $DataDir"
  if ((Ask 'Install now? (Y/N)' 'Y') -notmatch '^[Yy]') { Write-Host 'Cancelled. Nothing was changed.'; Stop-Transcript | Out-Null; exit 1 }
} else {
  foreach ($pair in @(@('InstallDir', $InstallDir), @('DataDir', $DataDir))) {
    $reason = Test-FolderChoice $pair[1]
    if ($reason) { Fail "$($pair[0]) '$($pair[1])': $reason" }
  }
  $InstallDir = $InstallDir.TrimEnd('\'); $DataDir = $DataDir.TrimEnd('\')
}
if (-not $Edition) { $Edition = 'full' }
if (-not $CompanyName) { Fail 'Company name is required.' }
if ($AdminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { Fail 'A valid administrator email is required.' }
$generatedPassword = $false
if (-not $AdminPassword) { $AdminPassword = (RandomPassword 12) + '-7'; $generatedPassword = $true }
if ($AdminPassword.Length -lt 12) { Fail 'The administrator password must have at least 12 characters.' }
$useHttps = [bool]($httpsPfx -or ($httpsCert -and $httpsKey))

# -- Checks -------------------------------------------------------------------
Step 'Checking this server'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $Portable -and -not $isAdmin) { Fail 'Run setup as Administrator (right-click Setup.cmd -> Run as administrator).' }
$os = (Get-CimInstance Win32_OperatingSystem).Caption
Info "Windows: $os"
foreach ($required in @('app\server.cjs', 'runtime\node\node.exe', 'runtime\pgsql\bin\postgres.exe', 'runtime\winsw\WinSW-x64.exe')) {
  if (-not (Test-Path (Join-Path $payload $required))) { Fail "The package is incomplete: payload\$required is missing." }
}
if (Test-Path (Join-Path $InstallDir 'config\install.json')) { Fail "HR & Payroll is already installed in $InstallDir. Use Update-HRPayroll.ps1 to update it." }
if (Test-Path (Join-Path $DataDir 'pgdata\PG_VERSION')) { Fail "$DataDir\pgdata already holds a database. Choose another DataDir or remove it first." }
if (-not (PortFree $DbPort)) { $DbPort = FirstFreePort ($DbPort + 1); Info "Database port in use; using $DbPort." }
$listenPort = if ($useHttps) { $httpsPort } else { $AppPort }
if (-not (PortFree $listenPort)) { Fail "Port $listenPort is already in use on this server. Set AppPort/HttpsPort to a free port." }
if ($useHttps -and -not (PortFree $AppPort)) { Fail "Port $AppPort (HTTP -> HTTPS redirect) is in use. Set AppPort to a free port." }
$drive = (Split-Path -Qualifier $DataDir).TrimEnd(':')
$freeGb = [math]::Round((Get-PSDrive $drive).Free / 1GB, 1)
Info "Free space on ${drive}: $freeGb GB"
if ($freeGb -lt 5) { Fail "At least 5 GB free on $drive is needed for the database, documents and backups." }

# -- Files --------------------------------------------------------------------
Step "Copying files to $InstallDir"
$appDir = Join-Path $InstallDir "app\$version"
$configDir = Join-Path $InstallDir 'config'
$toolsDir = Join-Path $InstallDir 'tools'
$serviceDir = Join-Path $InstallDir 'service'
$nodeExe = Join-Path $InstallDir 'runtime\node\node.exe'
$pgBin = Join-Path $InstallDir 'runtime\pgsql\bin'
foreach ($d in @($appDir, $configDir, $toolsDir, $serviceDir, (Join-Path $InstallDir 'runtime'), $DataDir, "$DataDir\documents", "$DataDir\imports", "$DataDir\backups", "$DataDir\logs\app", "$DataDir\logs\postgresql")) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
& robocopy (Join-Path $payload 'app') $appDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
& robocopy (Join-Path $payload 'runtime') (Join-Path $InstallDir 'runtime') /E /NFL /NDL /NJH /NJS /NP | Out-Null
Copy-Item (Join-Path $payload 'runtime\winsw\WinSW-x64.exe') (Join-Path $serviceDir 'HRPayrollApp.exe') -Force
foreach ($tool in @('hrpayroll-common.ps1', 'Update-HRPayroll.ps1', 'Uninstall-HRPayroll.ps1', 'hrpayroll-backup.ps1', 'hrpayroll-restore.ps1', 'hrpayroll-status.ps1')) { Copy-Item (Join-Path $here $tool) $toolsDir -Force }
Info "Application $version, Node.js $(& $nodeExe -v), PostgreSQL $((& (Join-Path $pgBin 'postgres.exe') --version) -replace 'postgres \(PostgreSQL\) ','')"

# -- Embedded database --------------------------------------------------------
Step 'Creating the embedded database'
$pgData = Join-Path $DataDir 'pgdata'
$superPassword = RandomPassword
$appDbPassword = RandomPassword
$pwFile = Join-Path $env:TEMP ("hrp-{0}.tmp" -f [guid]::NewGuid())
Set-Content -Path $pwFile -Value $superPassword -NoNewline -Encoding ASCII
try {
  Run (Join-Path $pgBin 'initdb.exe') @('-D', $pgData, '-U', 'postgres', '-A', 'scram-sha-256', "--pwfile=$pwFile", '-E', 'UTF8', '--locale=C') | Out-Null
} finally { Remove-Item $pwFile -Force -ErrorAction SilentlyContinue }
$pgLog = ("$DataDir\logs\postgresql").Replace('\', '/')
Add-Content -Path (Join-Path $pgData 'postgresql.conf') -Encoding ASCII -Value @"

# --- HR & Payroll embedded database (set by setup) ---
listen_addresses = 'localhost'
port = $DbPort
max_connections = 50
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 8MB
maintenance_work_mem = 128MB
wal_buffers = 16MB
password_encryption = scram-sha-256
timezone = 'Asia/Karachi'
logging_collector = on
log_directory = '$pgLog'
log_filename = 'postgresql-%a.log'
log_truncate_on_rotation = on
log_rotation_age = 1d
log_rotation_size = 0
"@
Set-Content -Path (Join-Path $pgData 'pg_hba.conf') -Encoding ASCII -Value @"
# Only this server may connect (set by HR & Payroll setup).
host    all    all    127.0.0.1/32    scram-sha-256
host    all    all    ::1/128         scram-sha-256
"@

if ($Portable) {
  # Not captured: the database server inherits pg_ctl's output handles, so reading them would never finish.
  $psiPg = New-Object Diagnostics.ProcessStartInfo
  $psiPg.FileName = Join-Path $pgBin 'pg_ctl.exe'
  $psiPg.Arguments = "start -D `"$pgData`" -l `"$DataDir\logs\postgresql\startup.log`" -w -t 60"
  $psiPg.UseShellExecute = $false; $psiPg.CreateNoWindow = $true
  $pgStart = [Diagnostics.Process]::Start($psiPg); $pgStart.WaitForExit()
  if ($pgStart.ExitCode -ne 0) { Fail "The database did not start. See $DataDir\logs\postgresql\startup.log." }
} else {
  foreach ($path in @($pgData, "$DataDir\logs\postgresql")) { & icacls $path /grant '*S-1-5-20:(OI)(CI)M' /T /Q | Out-Null }  # NETWORK SERVICE
  Run (Join-Path $pgBin 'pg_ctl.exe') @('register', '-N', 'HRPayrollDB', '-U', 'NT AUTHORITY\NetworkService', '-D', $pgData, '-S', 'auto', '-w') | Out-Null
  & sc.exe config HRPayrollDB DisplayName= "HR Payroll Database" | Out-Null
  & sc.exe description HRPayrollDB "Embedded PostgreSQL database of HR & Payroll (localhost only)." | Out-Null
  & sc.exe failure HRPayrollDB reset= 86400 actions= restart/10000/restart/10000/restart/60000 | Out-Null
  Start-Service HRPayrollDB
}
$ready = $false
for ($i = 0; $i -lt 30 -and -not $ready; $i++) { & (Join-Path $pgBin 'pg_isready.exe') -h localhost -p $DbPort -q; if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep -Seconds 1 } }
if (-not $ready) { Fail "The database did not start. See $DataDir\logs\postgresql." }
$psql = Join-Path $pgBin 'psql.exe'
$su = @{ PGPASSWORD = $superPassword }
Run $psql @('-h', 'localhost', '-p', "$DbPort", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-c', "CREATE ROLE hr_app LOGIN PASSWORD '$appDbPassword';") $null $su | Out-Null
Run $psql @('-h', 'localhost', '-p', "$DbPort", '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-c', "CREATE DATABASE hr_payroll OWNER hr_app ENCODING 'UTF8' TEMPLATE template0;") $null $su | Out-Null
Info "Database hr_payroll on localhost:$DbPort (service: HR Payroll Database)"

# -- Application settings -----------------------------------------------------
Step 'Writing the application settings'
$hostName = [Net.Dns]::GetHostName()
$fqdn = try { [Net.Dns]::GetHostEntry($hostName).HostName } catch { $hostName }
$scheme = if ($useHttps) { 'https' } else { 'http' }
$portSuffix = if ($useHttps) { if ($httpsPort -eq 443) { '' } else { ":$httpsPort" } } else { if ($AppPort -eq 80) { '' } else { ":$AppPort" } }
$urls = New-Object Collections.Generic.List[string]
if ($PublicUrl) { $urls.Add($PublicUrl.TrimEnd('/')) }
foreach ($name in @($hostName, $fqdn) + @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress })) {
  if ($name) { $u = "${scheme}://$($name.ToLower())$portSuffix"; if (-not $urls.Contains($u)) { $urls.Add($u) } }
}
$appUrl = $urls[0]
$envValues = [ordered]@{
  DATA_BACKEND = 'postgres'
  DATABASE_URL = "postgresql://hr_app:$appDbPassword@127.0.0.1:$DbPort/hr_payroll"
  PG_POOL_MAX = '10'; PG_SSL = 'false'
  PG_DUMP_PATH = (Join-Path $pgBin 'pg_dump.exe'); PG_RESTORE_PATH = (Join-Path $pgBin 'pg_restore.exe')
  PORT = "$AppPort"; HOST = '0.0.0.0'; NODE_ENV = 'production'; DEBUG = 'false'; RATE_LIMIT_MAX = '10000'
  APP_URL = $appUrl; PORTAL_URL = $appUrl; ALLOWED_ORIGIN = $appUrl; ALLOWED_ORIGINS = ($urls -join ',')
  MANAGED_INSTALLATION = 'true'
  DOCUMENT_STORAGE_PATH = "$DataDir\documents"; LEGACY_IMPORT_DIR = "$DataDir\imports"
  BACKUP_DIR = "$DataDir\backups"; BACKUP_RETENTION_COUNT = '14'; BACKUP_ENCRYPTION_KEY = (RandomBase64)
  MFA_ENCRYPTION_KEY = (RandomBase64); MFA_ISSUER = "$($CompanyName -replace '"','') HR"; MFA_ENFORCE_PRIVILEGED = 'false'
  SESSION_IDLE_MINUTES = '30'
  SMTP_HOST = $smtp.Host; SMTP_PORT = $smtp.Port; SMTP_SECURE = $(if ($smtp.Port -eq '465') { 'true' } else { 'false' }); SMTP_REQUIRE_TLS = 'true'; SMTP_USER = $smtp.User; SMTP_PASS = $smtp.Pass; SMTP_FROM = $smtp.From
}
if ($useHttps) {
  $envValues['HTTPS_PORT'] = "$httpsPort"
  if ($httpsPfx) { $envValues['HTTPS_PFX_PATH'] = $httpsPfx; if ($httpsPfxPass) { $envValues['HTTPS_PFX_PASSPHRASE'] = $httpsPfxPass } }
  else { $envValues['HTTPS_CERT_PATH'] = $httpsCert; $envValues['HTTPS_KEY_PATH'] = $httpsKey }
}
# dotenv keeps backslashes literally; values with spaces or symbols are single-quoted (double quotes if they hold a ').
$quote = { param($v) $s = [string]$v; if ($s -match '^[\w@%+=:,./\\-]*$') { $s } elseif ($s -notmatch "'") { "'" + $s + "'" } else { '"' + ($s -replace '"', '\"') + '"' } }
$lines = @("# HR & Payroll - $CompanyName. Written by setup on $(Get-Date -Format 'yyyy-MM-dd HH:mm').", '# KEEP A COPY OF THIS FILE OFF THIS SERVER: BACKUP_ENCRYPTION_KEY is needed to restore backups.', '# Restart the "HR Payroll Application" service after editing.', '')
foreach ($k in $envValues.Keys) { $lines += "$k=$(& $quote $envValues[$k])" }
WriteUtf8 (Join-Path $configDir '.env') (($lines -join [Environment]::NewLine) + [Environment]::NewLine)
Set-Content -Path (Join-Path $configDir 'database-admin.txt') -Encoding ASCII -Value @("PostgreSQL superuser for the embedded database (only for restores and support).", "host=localhost port=$DbPort user=postgres", "password=$superPassword")
Set-Content -Path (Join-Path $configDir 'start.cjs') -Encoding ASCII -Value @"
// Generated by HR & Payroll setup. Runs the application version named in release.json with this folder's .env.
const fs = require('node:fs');
const path = require('node:path');
process.chdir(__dirname);
const { releasePath } = JSON.parse(fs.readFileSync(path.join(__dirname, 'release.json'), 'utf8'));
require(path.join(releasePath, 'server.cjs'));
"@
(@{ release = $version; releasePath = $appDir; setAt = (Get-Date).ToString('o') } | ConvertTo-Json) | Set-Content -Path (Join-Path $configDir 'release.json') -Encoding ASCII

# -- Database structure and first administrator -------------------------------
Step 'Creating the tables and the first administrator'
Run $nodeExe @((Join-Path $appDir 'scripts\postgres-migrate.cjs')) $configDir | Out-Null
try { Run $nodeExe @((Join-Path $appDir 'scripts\seed-tax-slabs.cjs')) $configDir | Out-Null } catch { Info "Tax slabs not seeded: $($_.Exception.Message)" }
$inputFile = Join-Path $env:TEMP ("hrp-setup-{0}.json" -f [guid]::NewGuid())
(@{ companyName = $CompanyName; adminName = $AdminName; adminEmail = $AdminEmail; adminPassword = $AdminPassword; edition = $Edition; urls = $urls; publicUrl = $appUrl; clientDataImport = $clientDataImport } | ConvertTo-Json) | ForEach-Object { WriteUtf8 $inputFile $_ }
try { Run $nodeExe @((Join-Path $appDir 'scripts\setup-installation.cjs')) $configDir @{ SETUP_INPUT_FILE = $inputFile } | Out-Null } finally { Remove-Item $inputFile -Force -ErrorAction SilentlyContinue }

# -- Application service ------------------------------------------------------
Step 'Starting the application'
if ($Portable) {
  $proc = Start-Process -FilePath $nodeExe -ArgumentList 'start.cjs' -WorkingDirectory $configDir -WindowStyle Hidden -PassThru -RedirectStandardOutput "$DataDir\logs\app\app.out.log" -RedirectStandardError "$DataDir\logs\app\app.err.log"
  Set-Content -Path (Join-Path $configDir 'portable.pid') -Value $proc.Id
} else {
  # The service account may read the program and settings and write only to the data folders.
  & icacls $InstallDir /grant '*S-1-5-20:(OI)(CI)RX' /T /Q | Out-Null
  foreach ($path in @("$DataDir\documents", "$DataDir\imports", "$DataDir\backups", "$DataDir\logs")) { & icacls $path /grant '*S-1-5-20:(OI)(CI)M' /T /Q | Out-Null }
  # Settings folder: Administrators, SYSTEM and NETWORK SERVICE only. Set on the folder (no /T: folder inheritance
  # flags do not apply to files, and /inheritance:r with /T would leave the files with no permissions at all),
  # then make the files inside inherit it.
  & icacls $configDir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-20:(OI)(CI)RX' /Q | Out-Null
  & icacls "$configDir\*" /reset /T /Q | Out-Null
  $appLog = "$DataDir\logs\app"
  Set-Content -Path (Join-Path $serviceDir 'HRPayrollApp.xml') -Encoding UTF8 -Value @"
<service>
  <id>HRPayrollApp</id>
  <name>HR Payroll Application</name>
  <description>HR &amp; Payroll web application (Node.js). Depends on HR Payroll Database.</description>
  <executable>$nodeExe</executable>
  <arguments>start.cjs</arguments>
  <workingdirectory>$configDir</workingdirectory>
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <depend>HRPayrollDB</depend>
  <onfailure action="restart" delay="10 sec"/>
  <onfailure action="restart" delay="30 sec"/>
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>20 sec</stoptimeout>
  <env name="NODE_ENV" value="production"/>
  <logpath>$appLog</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>8</keepFiles></log>
</service>
"@
  Run (Join-Path $serviceDir 'HRPayrollApp.exe') @('install') $serviceDir | Out-Null
  # Through cmd.exe: Windows PowerShell 5.1 drops the empty password= "" argument when calling sc.exe directly.
  & cmd.exe /c 'sc.exe config HRPayrollApp obj= "NT AUTHORITY\NetworkService" password= ""' | Out-Null
  if ($LASTEXITCODE -ne 0) { Info 'Could not switch the application service to NETWORK SERVICE; it runs as Local System.' }
  Start-Service HRPayrollApp

  Step 'Firewall and nightly backup'
  $ports = @($AppPort); if ($useHttps) { $ports += $httpsPort }
  New-NetFirewallRule -DisplayName 'HR Payroll Application' -Group 'HR Payroll' -Direction Inbound -Protocol TCP -LocalPort $ports -Action Allow -Profile Domain, Private | Out-Null
  Info "Firewall: TCP $($ports -join ', ') allowed on Domain and Private networks."
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$toolsDir\hrpayroll-backup.ps1`""
  $trigger = New-ScheduledTaskTrigger -Daily -At $backupTime
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
  Register-ScheduledTask -TaskName 'HR Payroll Nightly Backup' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Encrypted backup of the HR & Payroll database (keeps 14).' | Out-Null
  Info "Backup: every day at $backupTime to $DataDir\backups$(if ($backupCopyTo) { " and a copy to $backupCopyTo" })."
}

# -- Record the installation --------------------------------------------------
$install = [ordered]@{
  version = $version; installedAt = (Get-Date).ToString('o'); installDir = $InstallDir; dataDir = $DataDir; configDir = $configDir
  appPort = $AppPort; httpsPort = $(if ($useHttps) { $httpsPort } else { $null }); dbPort = $DbPort; urls = $urls; backupCopyTo = $backupCopyTo; backupTime = $backupTime
  services = @{ database = 'HRPayrollDB'; app = 'HRPayrollApp' }; portable = [bool]$Portable; company = $CompanyName; edition = $Edition
}
($install | ConvertTo-Json -Depth 4) | Set-Content -Path (Join-Path $configDir 'install.json') -Encoding UTF8

# -- Check --------------------------------------------------------------------
Step 'Checking that HR & Payroll answers'
$healthUrl = if ($useHttps) { "https://localhost:$httpsPort/api/health" } else { "http://127.0.0.1:$AppPort/api/health" }
$ok = $false
# The first start can take a while on a new server (antivirus scans every program file once): wait up to 3 minutes.
$deadline = (Get-Date).AddMinutes(3)
while (-not $ok -and (Get-Date) -lt $deadline) {
  $code = & curl.exe -k -s -o NUL -w '%{http_code}' $healthUrl 2>$null
  if ($code -eq '200') { $ok = $true; break }
  if (-not $Portable) {
    $svc = Get-Service HRPayrollApp -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Stopped') { Info 'The application service stopped; starting it again...'; Start-Service HRPayrollApp -ErrorAction SilentlyContinue }
  }
  Start-Sleep -Seconds 2
}
if (-not $ok) {
  Write-Host ''
  if (-not $Portable) { Info "Service states: $((Get-Service HRPayrollDB, HRPayrollApp | ForEach-Object { "$($_.Name)=$($_.Status)" }) -join ', ')" }
  foreach ($logFileApp in (Get-ChildItem "$DataDir\logs\app" -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3)) {
    Write-Host "    --- last lines of $($logFileApp.Name) ---" -ForegroundColor Yellow
    Get-Content $logFileApp.FullName -Tail 25 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "    $_" }
  }
  Write-Host ''
  Write-Host '    Everything else is installed. After fixing the cause, start the "HR Payroll Application" service;' -ForegroundColor Yellow
  Write-Host "    check with: powershell -ExecutionPolicy Bypass -File `"$toolsDir\hrpayroll-status.ps1`"" -ForegroundColor Yellow
  Fail "The application did not answer on $healthUrl within 3 minutes. See $DataDir\logs\app."
}
Info 'Health check OK.'

$summary = @(
  "HR & Payroll $version is installed.",
  '',
  "Open:            $appUrl",
  "Also reachable:  $(($urls | Select-Object -Skip 1) -join '  ')",
  "Sign in:         $AdminEmail",
  $(if ($generatedPassword) { "Password:        $AdminPassword   (generated; change it at first sign-in)" } else { 'Password:        the one you entered' }),
  '',
  "Program:         $InstallDir",
  "Data:            $DataDir  (database, documents, backups, logs)",
  "Settings:        $configDir\.env   <-- keep a copy OFF this server (backup key)",
  "Services:        HR Payroll Database (localhost:$DbPort), HR Payroll Application",
  "Tools:           $toolsDir  (status, backup, restore, update, uninstall)",
  "Setup log:       $logFile"
)
Write-Host ''
$summary | ForEach-Object { Write-Host $_ -ForegroundColor Green }
($summary | Where-Object { $_ -notmatch '^Password:' }) | Set-Content -Path (Join-Path $configDir 'install-summary.txt') -Encoding UTF8
Stop-Transcript | Out-Null
