<#
.SYNOPSIS
  Restores an encrypted HR & Payroll backup. Replaces the whole database with the backup: everything entered after
  the backup is lost. The application is stopped during the restore and started again afterwards.
.EXAMPLE
  .\hrpayroll-restore.ps1 -BackupFile C:\HRPayrollData\backups\hr-payroll-2026-11-07T20-00-00-000Z.dump.enc
#>
param([Parameter(Mandatory = $true)][string]$BackupFile, [string]$InstallDir = '', [switch]$Yes)
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')
$install = Get-HRInstall $InstallDir
if (-not (Test-Path $BackupFile)) { throw "Backup file not found: $BackupFile" }
if (-not $Yes) {
  Write-Host "This replaces the HR & Payroll database with $([IO.Path]::GetFileName($BackupFile))." -ForegroundColor Yellow
  if ((Read-Host 'Type RESTORE to continue') -ne 'RESTORE') { Write-Host 'Cancelled.'; exit 1 }
}
Write-Host 'Taking a safety backup of the current database first...'
& (Join-Path $PSScriptRoot 'hrpayroll-backup.ps1') -InstallDir (Split-Path -Parent $install.configDir)
Write-Host 'Stopping the application...'
Stop-HRApp $install
try {
  Invoke-HRNode $install (Join-Path $install.releasePath 'scripts\postgres-restore.cjs') @($BackupFile) @{ CONFIRM_DATABASE_RESTORE = 'RESTORE_HR_PAYROLL_DATABASE' } | Out-Null
  # An older backup may predate database changes of the installed version: apply them before starting.
  Invoke-HRNode $install (Join-Path $install.releasePath 'scripts\postgres-migrate.cjs') | Out-Null
  Write-Host "Restore finished ($([IO.Path]::GetFileName($BackupFile)))." -ForegroundColor Green
} finally {
  Start-HRApp $install
  if (Test-HRHealth $install) { Write-Host 'HR & Payroll is running again.' -ForegroundColor Green } else { Write-Host 'The application did not answer; check the logs.' -ForegroundColor Red }
}
