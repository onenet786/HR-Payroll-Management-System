<#
.SYNOPSIS
  Lets users open HR & Payroll without the port number: http://192.168.x.x instead of http://192.168.x.x:8080.
  Run as Administrator on the server, from the setup folder of the package or from <install>\tools.

.DESCRIPTION
  The application keeps running on its own port (8080), so kiosks and bookmarks that use :8080 keep working.
  This tool:
    1. checks that nothing else (IIS, SQL Server Reporting Services, another web server) already uses port 80;
    2. forwards port 80 to the application port with the built-in Windows port proxy (netsh portproxy);
    3. opens TCP 80 in the Windows firewall for Domain and Private networks;
    4. adds the addresses without the port to ALLOWED_ORIGINS in config\.env and restarts the application;
    5. checks that http://<server>/ answers.
  Nothing is changed when port 80 is already taken; the tool shows which program holds it.

.EXAMPLE
  .\Enable-Port80.ps1           # turn it on
  .\Enable-Port80.ps1 -Check    # only show who uses port 80 and the current forwarding
  .\Enable-Port80.ps1 -Remove   # turn it off again (addresses with :8080 keep working)
#>
param([switch]$Check, [switch]$Remove, [string]$InstallDir = '')
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')

function Say([string]$text, [string]$color = 'Gray') { Write-Host $text -ForegroundColor $color }
function WriteUtf8([string]$file, [string]$text) { [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding($false))) }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this tool as Administrator (right-click PowerShell -> Run as administrator).'
}

$install = Get-HRInstall $InstallDir
if ($install.portable) { throw 'This is a portable (test) installation; port 80 forwarding is only for the server installation.' }
if ($install.httpsPort) { throw 'This server runs HTTPS (port 443), which already needs no port number. Nothing to do.' }
$appPort = [int]$install.appPort
if ($appPort -eq 80) { Say 'The application already runs on port 80. Nothing to do.' 'Green'; return }

$envFile = Join-Path $install.configDir '.env'
$proxyRuleName = 'HR Payroll Port 80'

function Get-Port80Proxy {
  $lines = & netsh.exe interface portproxy show v4tov4 2>$null
  foreach ($line in $lines) {
    $parts = ($line.Trim() -split '\s+')
    if ($parts.Count -ge 4 -and $parts[1] -eq '80') { return [pscustomobject]@{ Address = $parts[0]; Port = $parts[1]; ToAddress = $parts[2]; ToPort = $parts[3] } }
  }
  return $null
}

# Who listens on port 80. PID 4 ("System") is the Windows HTTP service (HTTP.sys): IIS, SQL Server Reporting
# Services, WinRM or another program registered a web address on port 80.
function Get-Port80Owners {
  $owners = @()
  foreach ($c in @(Get-NetTCPConnection -LocalPort 80 -State Listen -ErrorAction SilentlyContinue)) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    $service = @(Get-CimInstance Win32_Service -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ', '
    $owners += [pscustomobject]@{ Address = $c.LocalAddress; PID = $c.OwningProcess; Process = $(if ($proc) { $proc.ProcessName } else { '?' }); Services = $service }
  }
  return $owners
}

function Test-Url([string]$url) {
  $code = & curl.exe -s -o NUL -m 10 -w '%{http_code}' $url 2>$null
  return $code
}

function Update-AllowedOrigins([bool]$add) {
  $text = [IO.File]::ReadAllText($envFile)
  $lines = $text -split "`r?`n"
  $index = -1
  for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^\s*ALLOWED_ORIGINS\s*=') { $index = $i; break } }
  $current = @()
  if ($index -ge 0) {
    $value = ($lines[$index] -replace '^\s*ALLOWED_ORIGINS\s*=\s*', '').Trim().Trim("'").Trim('"')
    $current = @($value -split '[,;\s]+' | Where-Object { $_ })
  }
  $suffix = ":$appPort"
  $withoutPort = @($install.urls + $current | Where-Object { $_ -like "http://*$suffix" } | ForEach-Object { $_.Substring(0, $_.Length - $suffix.Length) } | Select-Object -Unique)
  if ($add) {
    $next = @($current + $withoutPort | Select-Object -Unique)
  } else {
    $next = @($current | Where-Object { $withoutPort -notcontains $_ })
  }
  if ((@($next) -join ',') -eq (@($current) -join ',')) { return $false }
  $line = 'ALLOWED_ORIGINS=' + (@($next) -join ',')
  if ($index -ge 0) { $lines[$index] = $line } else { $lines += $line }
  Copy-Item $envFile "$envFile.before-port80" -Force
  WriteUtf8 $envFile (($lines -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine)
  return $true
}

function Restart-App {
  Say 'Restarting the HR Payroll Application service...'
  Restart-Service HRPayrollApp
  if (-not (Test-HRHealth $install 60)) { throw "The application did not answer after the restart. See $($install.dataDir)\logs. The previous settings are in $envFile.before-port80." }
}

$owners = @(Get-Port80Owners)
$proxy = Get-Port80Proxy

Say ''
Say "HR & Payroll $($install.release) - application port $appPort" 'Green'
Say ("Port 80 forwarding:  " + $(if ($proxy) { "$($proxy.Address):80 -> $($proxy.ToAddress):$($proxy.ToPort)" } else { 'off' }))
if ($owners.Count) {
  foreach ($o in $owners) { Say ("Port 80 listener:    {0}  PID {1} {2} {3}" -f $o.Address, $o.PID, $o.Process, $(if ($o.Services) { "($($o.Services))" } else { '' })) }
} else { Say 'Port 80 listener:    none' }

if ($Check) { return }

if ($Remove) {
  if ($proxy) { & netsh.exe interface portproxy delete v4tov4 listenport=80 listenaddress=$($proxy.Address) | Out-Null; Say 'Port 80 forwarding removed.' }
  Get-NetFirewallRule -DisplayName $proxyRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  if (Update-AllowedOrigins $false) { Restart-App }
  Say "Done. Open the system with :$appPort again, e.g. $($install.urls[0])" 'Green'
  return
}

# Port 80 must be free, apart from our own forwarding (which shows up as the IP Helper service, svchost).
$ourProxyPid = $null
if ($proxy) { $ourProxyPid = (Get-CimInstance Win32_Service -Filter "Name='iphlpsvc'" -ErrorAction SilentlyContinue).ProcessId }
$others = @($owners | Where-Object { $_.PID -ne $ourProxyPid })
if ($others.Count) {
  Say ''
  Say 'Port 80 is already used by another program, so nothing was changed.' 'Red'
  if ($others | Where-Object { $_.PID -eq 4 }) {
    Say 'PID 4 (System) means a Windows web service holds port 80. Find it with:' 'Yellow'
    Say '  netsh http show servicestate view=requestq' 'Yellow'
    Say 'Common ones: IIS (World Wide Web Publishing Service, W3SVC) and SQL Server Reporting Services.' 'Yellow'
    Say 'Move that service to another port (or stop it if it is not used), then run this tool again.' 'Yellow'
  } else {
    Say 'Stop that program or move it to another port, then run this tool again.' 'Yellow'
  }
  exit 1
}

# The port proxy needs the IP Helper service.
$iphlp = Get-Service iphlpsvc -ErrorAction SilentlyContinue
if (-not $iphlp) { throw 'The Windows "IP Helper" service (iphlpsvc) is missing; port forwarding is not available on this server.' }
Set-Service iphlpsvc -StartupType Automatic
if ($iphlp.Status -ne 'Running') { Start-Service iphlpsvc }

if (-not $proxy -or $proxy.ToPort -ne "$appPort") {
  if ($proxy) { & netsh.exe interface portproxy delete v4tov4 listenport=80 listenaddress=$($proxy.Address) | Out-Null }
  & netsh.exe interface portproxy add v4tov4 listenport=80 listenaddress=0.0.0.0 connectport=$appPort connectaddress=127.0.0.1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'netsh could not create the port 80 forwarding.' }
  Say "Port 80 now forwards to the application on port $appPort."
}

if (-not (Get-NetFirewallRule -DisplayName $proxyRuleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $proxyRuleName -Group 'HR Payroll' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Domain, Private | Out-Null
  Say 'Firewall: TCP 80 allowed on Domain and Private networks.'
}

if (Update-AllowedOrigins $true) { Restart-App } else { Say 'Addresses without the port were already allowed.' }

$code = Test-Url 'http://127.0.0.1/api/health'
Say ''
if ($code -eq '200') {
  Say 'Done. The system now opens without the port number:' 'Green'
  foreach ($u in $install.urls) { if ($u -like "http://*:$appPort") { Say ('  ' + $u.Substring(0, $u.Length - ":$appPort".Length)) 'Green' } }
  Say "Addresses with :$appPort keep working (kiosks need no change)."
  Say 'If another PC still cannot open it, check that its network is set to Private or Domain (not Public) on this server.'
} else {
  Say "Port 80 forwarding is set, but http://127.0.0.1/ answered '$code'. Run .\Enable-Port80.ps1 -Check and send the output." 'Red'
  exit 1
}
