<#
.SYNOPSIS
  Encrypted backup of the HR & Payroll database (run nightly by the "HR Payroll Nightly Backup" task, or by hand).
  Keeps the newest 14 in <DataDir>\backups and, when BackupCopyTo was set, copies them to that folder or share.
#>
param([string]$InstallDir = '')
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')
$install = Get-HRInstall $InstallDir
$log = Join-Path $install.dataDir 'logs\backup.log'
function Log($text) { $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $text"; Add-Content -Path $log -Value $line; Write-Host $line }
try {
  $output = Invoke-HRNode $install (Join-Path $install.releasePath 'scripts\postgres-backup.cjs')
  Log "Backup OK. $($output -split "`n" | Select-Object -Last 1)"
  if ($install.backupCopyTo) {
    New-Item -ItemType Directory -Force -Path $install.backupCopyTo | Out-Null
    & robocopy (Join-Path $install.dataDir 'backups') $install.backupCopyTo 'hr-payroll-*.enc*' /XO /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copy to $($install.backupCopyTo) failed (robocopy $LASTEXITCODE)." }
    Log "Copied to $($install.backupCopyTo)."
  }
  exit 0
} catch {
  Log "BACKUP FAILED: $($_.Exception.Message)"
  exit 1
}
