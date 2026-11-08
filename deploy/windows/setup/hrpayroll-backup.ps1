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
  # Database optimisation after a good backup: quick every night, deep (shrink) on the first Sunday of the month.
  # A failure here is logged but does not fail the backup.
  $maintenance = Join-Path $install.releasePath 'scripts\db-maintenance.cjs'
  if (Test-Path $maintenance) {
    $today = Get-Date
    $deep = ($today.DayOfWeek -eq 'Sunday' -and $today.Day -le 7) -or $env:HR_DEEP_OPTIMIZE -eq '1'
    try {
      $arguments = @(); if ($deep) { $arguments = @('--deep') }
      $result = Invoke-HRNode $install $maintenance $arguments
      Log ($result -split "`n" | Select-Object -Last 1)
    } catch {
      Log "Database optimisation skipped: $($_.Exception.Message)"
    }
  }
  exit 0
} catch {
  Log "BACKUP FAILED: $($_.Exception.Message)"
  exit 1
}
