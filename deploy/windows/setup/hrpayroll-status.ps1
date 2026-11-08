<#
.SYNOPSIS
  Shows the state of HR & Payroll on this server: services, health, version, database size, last backup, disk space.
#>
param([string]$InstallDir = '')
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')
$install = Get-HRInstall $InstallDir
Write-Host ''
Write-Host "HR & Payroll $($install.release) - $($install.company)" -ForegroundColor Green
if (-not $install.portable) {
  foreach ($name in @('HRPayrollDB', 'HRPayrollApp')) {
    $svc = Get-Service $name -ErrorAction SilentlyContinue
    $state = if ($svc) { "$($svc.Status) ($($svc.StartType))" } else { 'NOT INSTALLED' }
    Write-Host ("{0,-24} {1}" -f $svc.DisplayName, $state)
  }
}
Write-Host ("{0,-24} {1}" -f 'Health', $(if (Test-HRHealth $install 3) { 'OK' } else { 'NOT ANSWERING' }))
Write-Host ("{0,-24} {1}" -f 'Addresses', ($install.urls -join '  '))
$env:PGPASSWORD = ((Get-Content (Join-Path $install.configDir 'database-admin.txt')) | Where-Object { $_ -like 'password=*' }) -replace '^password=', ''
$size = & (Join-Path $install.pgBin 'psql.exe') -h localhost -p $install.dbPort -U postgres -d hr_payroll -t -A -c "SELECT pg_size_pretty(pg_database_size('hr_payroll'))" 2>$null
Remove-Item Env:PGPASSWORD
Write-Host ("{0,-24} {1}" -f 'Database size', $(if ($size) { $size } else { 'unknown' }))
$last = Get-ChildItem (Join-Path $install.dataDir 'backups') -Filter 'hr-payroll-*.dump.enc' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ("{0,-24} {1}" -f 'Last backup', $(if ($last) { "$($last.LastWriteTime) ($([math]::Round($last.Length / 1MB, 1)) MB)" } else { 'none yet' }))
$drive = (Split-Path -Qualifier $install.dataDir).TrimEnd(':')
Write-Host ("{0,-24} {1} GB free" -f "Disk $drive", [math]::Round((Get-PSDrive $drive).Free / 1GB, 1))
Write-Host ("{0,-24} {1}" -f 'Logs', (Join-Path $install.dataDir 'logs'))
