<#
.SYNOPSIS
  Sets a new password for an HR & Payroll administrator (for a forgotten or never-shown setup password).
  Run as Administrator on the server, from the setup folder of the package or from <install>\tools.
.EXAMPLE
  .\Reset-AdminPassword.ps1                         # built-in administrator, you type the new password
  .\Reset-AdminPassword.ps1 -Email it@company.com   # a specific administrator
  .\Reset-AdminPassword.ps1 -Generate               # generate a strong password and show it once
#>
param([string]$Email = '', [switch]$Generate, [string]$InstallDir = '')
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')
$install = Get-HRInstall $InstallDir
$envVars = @{}
if ($Email) { $envVars['RESET_EMAIL'] = $Email }
if (-not $Generate) {
  $first = Read-Host 'New password (at least 12 characters; leave empty to generate one)' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($first))
  if ($plain) {
    $second = Read-Host 'Type it again' -AsSecureString
    $again = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($second))
    if ($plain -ne $again) { throw 'The two passwords do not match. Nothing was changed.' }
    if ($plain.Length -lt 12) { throw 'The password must have at least 12 characters. Nothing was changed.' }
    $envVars['RESET_PASSWORD'] = $plain
  }
}
$output = Invoke-HRNode $install (Join-Path $install.releasePath 'scripts\reset-admin-password.cjs') @() $envVars
$result = ($output -split "`n" | Select-Object -Last 1) | ConvertFrom-Json
Write-Host ''
Write-Host 'Password changed.' -ForegroundColor Green
Write-Host "  Sign in:   $($result.email)"
if ($result.password) { Write-Host "  Password:  $($result.password)   (shown once - write it down, then change it after signing in)" -ForegroundColor Yellow }
Write-Host "  Address:   $(@($install.urls)[0])"
