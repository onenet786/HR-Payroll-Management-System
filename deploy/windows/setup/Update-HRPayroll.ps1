<#
.SYNOPSIS
  Updates HR & Payroll to the version in this package. Run from the extracted NEW package (setup folder),
  as Administrator. Steps: safety backup -> copy the new version -> database changes -> switch -> restart -> check.
  If the new version does not answer, it switches back to the previous version automatically.
#>
param([string]$InstallDir = '', [switch]$SkipBackup)
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')
$packageRoot = Split-Path -Parent $PSScriptRoot
$payload = Join-Path $packageRoot 'payload'
if (-not (Test-Path (Join-Path $payload 'app\VERSION'))) { throw 'Run Update-HRPayroll.ps1 from the setup folder of the extracted NEW package.' }
$install = Get-HRInstall $InstallDir
$installRoot = Split-Path -Parent $install.configDir
$newVersion = (Get-Content (Join-Path $payload 'app\VERSION') | Select-Object -First 1).Trim()
Write-Host "HR & Payroll update: $($install.release) -> $newVersion" -ForegroundColor Green
if ($newVersion -eq $install.release) { Write-Host 'This version is already installed.'; exit 0 }

if (-not $SkipBackup) {
  Write-Host '==> Safety backup'
  & (Join-Path $PSScriptRoot 'hrpayroll-backup.ps1') -InstallDir $installRoot
  if ($LASTEXITCODE -ne 0) { throw 'The safety backup failed; nothing was changed.' }
}

Write-Host '==> Copying the new version'
$newApp = Join-Path $installRoot "app\$newVersion"
& robocopy (Join-Path $payload 'app') $newApp /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
$nodeNew = & (Join-Path $payload 'runtime\node\node.exe') -v
$nodeOld = & $install.nodeExe -v
foreach ($tool in Get-ChildItem $PSScriptRoot -Filter '*.ps1') { if ($tool.Name -ne 'Install-HRPayroll.ps1') { Copy-Item $tool.FullName (Join-Path $installRoot 'tools') -Force } }

Write-Host '==> Stopping the application'
Stop-HRApp $install
Write-Host '==> Database memory'
try {
  if ((Set-HRDatabaseMemory $install) -and -not $install.portable) { Restart-Service HRPayrollDB; Write-Host '    Database restarted for the new memory size.' }
} catch { Write-Host "    Memory tuning skipped: $($_.Exception.Message)" }
if ($nodeNew -ne $nodeOld) {
  Write-Host "    Node.js $nodeOld -> $nodeNew"
  & robocopy (Join-Path $payload 'runtime\node') (Join-Path $installRoot 'runtime\node') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
}

# Settings added by newer versions; existing values are never changed.
# TRUST_PROXY=false: this server is reached directly (no reverse proxy), so client-sent X-Forwarded-For is ignored.
$envFile = Join-Path $install.configDir '.env'
if (Test-Path $envFile) {
  $envText = [IO.File]::ReadAllText($envFile)
  if ($envText -notmatch '(?m)^\s*TRUST_PROXY\s*=') {
    if ($envText -and -not $envText.EndsWith("`n")) { $envText += [Environment]::NewLine }
    $envText += 'TRUST_PROXY=false' + [Environment]::NewLine
    [IO.File]::WriteAllText($envFile, $envText, (New-Object Text.UTF8Encoding($false)))
    Write-Host '    Settings: added TRUST_PROXY=false to config\.env.'
  }
  # The OneNet vendor console needs this server's own password (the old date-based one no longer works).
  $envText = [IO.File]::ReadAllText($envFile)
  if ($envText -notmatch '(?m)^\s*VENDOR_CONSOLE_PASSWORD\s*=\s*\S') {
    $vb = New-Object byte[] 15; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($vb)
    $vendorPassword = [Convert]::ToBase64String($vb).Replace('+', 'A').Replace('/', 'b').TrimEnd('=')
    $envText = [regex]::Replace($envText, '(?m)^\s*VENDOR_CONSOLE_PASSWORD\s*=.*\r?\n?', '')
    if ($envText -and -not $envText.EndsWith("`n")) { $envText += [Environment]::NewLine }
    $envText += "VENDOR_CONSOLE_PASSWORD=$vendorPassword" + [Environment]::NewLine
    [IO.File]::WriteAllText($envFile, $envText, (New-Object Text.UTF8Encoding($false)))
    Write-Host "    OneNet vendor console password for this server (login onenet): $vendorPassword" -ForegroundColor Yellow
    Write-Host '    Keep it in OneNet''s records. It is also in config\.env as VENDOR_CONSOLE_PASSWORD.'
  }
}

# Folder permissions (installs made before this was part of setup get them now; see Set-HRFolderPermissions).
if (-not $install.portable) {
  try { Set-HRFolderPermissions $installRoot $install.dataDir; Write-Host '    Folder permissions checked (program: Administrators only; data: Administrators, SYSTEM, NETWORK SERVICE).' }
  catch { Write-Host "    Folder permissions not changed: $($_.Exception.Message)" -ForegroundColor Yellow }
}

$previous = Get-Content (Join-Path $install.configDir 'release.json') -Raw
try {
  Write-Host '==> Database changes'
  $install.releasePath = $newApp
  Invoke-HRNode $install (Join-Path $newApp 'scripts\postgres-migrate.cjs') | Write-Host
  (@{ release = $newVersion; releasePath = $newApp; setAt = (Get-Date).ToString('o'); previous = ($previous | ConvertFrom-Json).release } | ConvertTo-Json) | Set-Content -Path (Join-Path $install.configDir 'release.json') -Encoding ASCII
  Write-Host '==> Starting'
  Start-HRApp $install
  if (-not (Test-HRHealth $install 60)) { throw "Version $newVersion does not answer." }
  $info = Get-Content (Join-Path $install.configDir 'install.json') -Raw | ConvertFrom-Json
  $info.version = $newVersion
  ($info | ConvertTo-Json -Depth 4) | Set-Content -Path (Join-Path $install.configDir 'install.json') -Encoding UTF8
  Write-Host "Updated to $newVersion." -ForegroundColor Green
} catch {
  Write-Host "UPDATE FAILED: $($_.Exception.Message) Switching back to $($install.release)." -ForegroundColor Red
  Stop-HRApp $install
  Set-Content -Path (Join-Path $install.configDir 'release.json') -Value $previous -Encoding ASCII
  Start-HRApp $install
  if (Test-HRHealth $install 60) { Write-Host "Running $($install.release) again. The safety backup is in $($install.dataDir)\backups." -ForegroundColor Yellow }
  else { Write-Host 'The previous version does not answer either: restore the safety backup with hrpayroll-restore.ps1.' -ForegroundColor Red }
  exit 1
}
