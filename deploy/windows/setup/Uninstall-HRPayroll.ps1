<#
.SYNOPSIS
  Removes HR & Payroll from this server: services, scheduled task, firewall rule and program files.
  The data folder (database, documents, backups) is KEPT unless -RemoveData is given and confirmed.
#>
param([string]$InstallDir = '', [switch]$RemoveData, [switch]$Yes)
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')
$install = Get-HRInstall $InstallDir
$installRoot = Split-Path -Parent $install.configDir
if (-not $Yes) {
  Write-Host "This removes HR & Payroll from $installRoot." -ForegroundColor Yellow
  if ($RemoveData) { Write-Host "It also DELETES ALL DATA in $($install.dataDir) (database, documents, backups)." -ForegroundColor Red }
  $expected = if ($RemoveData) { 'DELETE ALL DATA' } else { 'UNINSTALL' }
  if ((Read-Host "Type $expected to continue") -ne $expected) { Write-Host 'Cancelled.'; exit 1 }
}
$pgCtl = Join-Path $install.pgBin 'pg_ctl.exe'
$pgData = Join-Path $install.dataDir 'pgdata'
if ($install.portable) {
  Stop-HRApp $install
  & $pgCtl stop -D $pgData -m fast -w 2>$null | Out-Null
} else {
  Stop-Service HRPayrollApp -ErrorAction SilentlyContinue
  $winsw = Join-Path $installRoot 'service\HRPayrollApp.exe'
  if (Test-Path $winsw) { & $winsw uninstall | Out-Null }
  Stop-Service HRPayrollDB -ErrorAction SilentlyContinue
  & $pgCtl unregister -N HRPayrollDB 2>$null | Out-Null
  Unregister-ScheduledTask -TaskName 'HR Payroll Nightly Backup' -Confirm:$false -ErrorAction SilentlyContinue
  Get-NetFirewallRule -Group 'HR Payroll' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
Start-Sleep -Seconds 2
Set-Location $env:TEMP
Remove-Item $installRoot -Recurse -Force
Write-Host "Program files removed from $installRoot." -ForegroundColor Green
if ($RemoveData) { Remove-Item $install.dataDir -Recurse -Force; Write-Host "Data removed from $($install.dataDir)." -ForegroundColor Green }
else { Write-Host "Data kept in $($install.dataDir). Keep the copy of the old .env: its BACKUP_ENCRYPTION_KEY is needed for those backups." -ForegroundColor Yellow }
