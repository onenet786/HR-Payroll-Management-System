<#
.SYNOPSIS
  Switches HR & Payroll to HTTPS on the local network (https://headoffice/) with a certificate from a local
  certificate authority (CA) created on this server. Run as Administrator on the server, from the setup folder of
  the package or from <install>\tools.

.DESCRIPTION
  Public authorities (Let's Encrypt) do not issue certificates for internal names such as "headoffice" or for
  192.168.x.x addresses, so this tool creates its own:
    1. a local CA "<company> HR Payroll Local CA" (10 years; its private key stays on this server, not exportable);
    2. a server certificate for this server's name, full name, IP addresses and localhost (5 years);
    3. trusts the CA on this server, switches the application to HTTPS on port 443, opens TCP 443 in the firewall;
       port 80 and the application port (8080) redirect to https;
    4. exports HRPayroll-CA.cer and Install-HRPayroll-CA.cmd to <install>\https-ca. Run that .cmd once, as
       Administrator, on every PC and kiosk that opens the system; otherwise browsers show "not private" and the
       kiosk refuses to connect.
  If the application does not answer over HTTPS, the previous settings are restored automatically.
  Running it again renews the server certificate (e.g. after a new IP address); the CA is kept, so PCs need nothing.

  Kiosks: kiosk version 1.0.44 or later trusts certificates installed in Windows. After switching, remove the device
  key in kiosk Settings and register again with https://<server name> (the old http://...:8080 address only redirects).

.EXAMPLE
  .\Enable-Https.ps1                                  # turn on HTTPS
  .\Enable-Https.ps1 -ExtraNames hr.aljannat.local     # also cover an extra name (DNS alias)
  .\Enable-Https.ps1 -Check                           # show the current state only
  .\Enable-Https.ps1 -Remove                          # back to http://<server>:8080 (the CA stays installed)
#>
param([string[]]$ExtraNames = @(), [switch]$Check, [switch]$Remove, [string]$InstallDir = '')
. (Join-Path $PSScriptRoot 'hrpayroll-common.ps1')

function Say([string]$text, [string]$color = 'Gray') { Write-Host $text -ForegroundColor $color }
function WriteUtf8([string]$file, [string]$text) { [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding($false))) }

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this tool as Administrator (right-click PowerShell -> Run as administrator).'
}

$install = Get-HRInstall $InstallDir
if ($install.portable) { throw 'This is a portable (test) installation; HTTPS with a local CA is only for the server installation.' }
$appPort = [int]$install.appPort
$installRoot = Split-Path -Parent $install.configDir
$envFile = Join-Path $install.configDir '.env'
$installJson = Join-Path $install.configDir 'install.json'
$pfxFile = Join-Path $install.configDir 'https-server.pfx'
$exportDir = Join-Path $installRoot 'https-ca'
$caFriendly = 'HR Payroll Local CA'
$serverFriendly = 'HR Payroll HTTPS'
$firewallRule = 'HR Payroll HTTPS'

# -- .env helpers ---------------------------------------------------------------
function Read-EnvLines { return ,@(([IO.File]::ReadAllText($envFile)) -split "`r?`n") }
function Get-EnvValue($lines, [string]$key) {
  foreach ($l in $lines) { if ($l -match "^\s*$key\s*=(.*)$") { return $Matches[1].Trim().Trim("'").Trim('"') } }
  return ''
}
function Set-EnvValue([System.Collections.ArrayList]$lines, [string]$key, [string]$value) {
  $line = "$key=$value"
  for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match "^\s*$key\s*=") { $lines[$i] = $line; return } }
  [void]$lines.Add($line)
}
function Remove-EnvValue([System.Collections.ArrayList]$lines, [string]$key) {
  for ($i = $lines.Count - 1; $i -ge 0; $i--) { if ($lines[$i] -match "^\s*$key\s*=") { $lines.RemoveAt($i) } }
}
function Save-EnvLines([System.Collections.ArrayList]$lines) {
  WriteUtf8 $envFile ((($lines | ForEach-Object { $_ }) -join [Environment]::NewLine).TrimEnd() + [Environment]::NewLine)
}

# Who listens on a port (PID 4 = the Windows HTTP service: IIS, SQL Server Reporting Services, WinRM...).
function Get-PortOwners([int]$port) {
  $owners = @()
  foreach ($c in @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    $service = @(Get-CimInstance Win32_Service -Filter "ProcessId=$($c.OwningProcess)" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ', '
    $owners += [pscustomobject]@{ Address = $c.LocalAddress; PID = $c.OwningProcess; Process = $(if ($proc) { $proc.ProcessName } else { '?' }); Services = $service }
  }
  return $owners
}
function Get-Port80Proxy {
  foreach ($line in (& netsh.exe interface portproxy show v4tov4 2>$null)) {
    $parts = ($line.Trim() -split '\s+')
    if ($parts.Count -ge 4 -and $parts[1] -eq '80') { return [pscustomobject]@{ Address = $parts[0]; ToPort = $parts[3] } }
  }
  return $null
}

$hostName = ([Net.Dns]::GetHostName()).ToLower()
$fqdn = try { ([Net.Dns]::GetHostEntry($hostName).HostName).ToLower() } catch { $hostName }
$ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { $_.IPAddress } | Select-Object -Unique)
$dnsNames = @(@($hostName, $fqdn) + @($ExtraNames | ForEach-Object { $_.Trim().ToLower() }) + @('localhost') | Where-Object { $_ } | Select-Object -Unique)
$httpsUrls = @(@($dnsNames | Where-Object { $_ -ne 'localhost' }) + $ips | ForEach-Object { "https://$_" } | Select-Object -Unique)

$lines = New-Object System.Collections.ArrayList
foreach ($l in (Read-EnvLines)) { [void]$lines.Add($l) }
$currentPfx = Get-EnvValue $lines 'HTTPS_PFX_PATH'
$serverCert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.FriendlyName -eq $serverFriendly } | Sort-Object NotAfter -Descending | Select-Object -First 1

Say ''
Say "HR & Payroll $($install.release)" 'Green'
Say ("HTTPS:               " + $(if ($currentPfx) { "on (port $($install.httpsPort))" } else { 'off' }))
Say ("Server certificate:  " + $(if ($serverCert) { "$($serverCert.Subject), valid until $($serverCert.NotAfter.ToString('yyyy-MM-dd'))" } else { 'none' }))
Say ("Addresses:           " + ($install.urls -join '  '))

if ($Check) {
  foreach ($o in @(Get-PortOwners 443)) { Say ("Port 443 listener:   {0} PID {1} {2} {3}" -f $o.Address, $o.PID, $o.Process, $o.Services) }
  return
}

function Restart-AndCheck {
  Say 'Restarting the HR Payroll Application service...'
  Restart-Service HRPayrollApp
  $fresh = Get-HRInstall $InstallDir
  return (Test-HRHealth $fresh 60)
}

if ($Remove) {
  if (-not $currentPfx) { Say 'HTTPS is not on. Nothing to do.' 'Green'; return }
  Copy-Item $envFile "$envFile.before-https-remove" -Force
  $httpUrls = @(@($hostName, $fqdn) + $ips | Select-Object -Unique | ForEach-Object { "http://$($_):$appPort" })
  foreach ($k in 'HTTPS_PFX_PATH', 'HTTPS_PFX_PASSPHRASE', 'HTTPS_PORT', 'HTTPS_CERT_PATH', 'HTTPS_KEY_PATH') { Remove-EnvValue $lines $k }
  foreach ($k in 'APP_URL', 'PORTAL_URL', 'ALLOWED_ORIGIN') { Set-EnvValue $lines $k $httpUrls[0] }
  Set-EnvValue $lines 'ALLOWED_ORIGINS' ($httpUrls -join ',')
  Save-EnvLines $lines
  $info = Get-Content $installJson -Raw | ConvertFrom-Json
  $info.httpsPort = $null; $info.urls = $httpUrls
  WriteUtf8 $installJson ($info | ConvertTo-Json -Depth 4)
  Get-NetFirewallRule -DisplayName $firewallRule -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  if (-not (Restart-AndCheck)) { throw "The application did not answer on http://127.0.0.1:$appPort after switching back. See $($install.dataDir)\logs." }
  Say "Done. The system is back on $($httpUrls[0]). Kiosks must be registered again with that address." 'Green'
  return
}

# -- Port 443 must be free (or already ours) ------------------------------------------
$appPid = (Get-CimInstance Win32_Service -Filter "Name='HRPayrollApp'" -ErrorAction SilentlyContinue).ProcessId
$appChildren = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$appPid" -ErrorAction SilentlyContinue | ForEach-Object { $_.ProcessId })
$others = @(Get-PortOwners 443 | Where-Object { $_.PID -ne $appPid -and $appChildren -notcontains $_.PID })
if ($others.Count) {
  Say ''
  Say 'Port 443 is already used by another program, so nothing was changed:' 'Red'
  foreach ($o in $others) { Say ("  {0} PID {1} {2} {3}" -f $o.Address, $o.PID, $o.Process, $o.Services) 'Red' }
  if ($others | Where-Object { $_.PID -eq 4 }) {
    Say 'PID 4 (System) is the Windows web service. Find who registered port 443 with:' 'Yellow'
    Say '  netsh http show servicestate view=requestq' 'Yellow'
    Say 'Usually IIS (W3SVC) or SQL Server Reporting Services. Move it to another port, then run this tool again.' 'Yellow'
  }
  exit 1
}

# -- 1. Local CA (created once, kept for renewals) -----------------------------------
$company = if ($install.company) { ($install.company -replace '[^\w .&-]', '').Trim() } else { '' }
$ca = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.FriendlyName -eq $caFriendly -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddYears(1) } | Sort-Object NotAfter -Descending | Select-Object -First 1
if ($ca) {
  Say "Using the existing local CA: $($ca.Subject) (valid until $($ca.NotAfter.ToString('yyyy-MM-dd')))."
} else {
  Say 'Creating the local certificate authority...'
  $caName = if ($company) { "$company HR Payroll Local CA" } else { 'HR Payroll Local CA' }
  $ca = New-SelfSignedCertificate -Type Custom -Subject "CN=$caName" -FriendlyName $caFriendly `
    -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable `
    -KeyUsage CertSign, CRLSign, DigitalSignature -KeyUsageProperty Sign `
    -TextExtension @('2.5.29.19={critical}{text}ca=1&pathlength=0') `
    -NotAfter (Get-Date).AddYears(10) -CertStoreLocation Cert:\LocalMachine\My
}
# Trust it on this server (local browser, health check).
New-Item -ItemType Directory -Force -Path $exportDir | Out-Null
$caFile = Join-Path $exportDir 'HRPayroll-CA.cer'
Export-Certificate -Cert $ca -FilePath $caFile -Type CERT | Out-Null
if (-not (Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $ca.Thumbprint })) {
  Import-Certificate -FilePath $caFile -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
}

# -- 2. Server certificate --------------------------------------------------------
Say "Issuing the server certificate for: $(($dnsNames + $ips + '127.0.0.1') -join ', ')"
$san = @($dnsNames | ForEach-Object { "DNS=$_" }) + @(@($ips) + '127.0.0.1' | ForEach-Object { "IPAddress=$_" })
$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=$hostName" -FriendlyName $serverFriendly -Signer $ca `
  -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable `
  -KeyUsage DigitalSignature, KeyEncipherment `
  -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.1', "2.5.29.17={text}$($san -join '&')", '2.5.29.19={text}ca=0') `
  -NotAfter (Get-Date).AddYears(5) -CertStoreLocation Cert:\LocalMachine\My
$passphrase = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$secure = ConvertTo-SecureString $passphrase -AsPlainText -Force
if (Test-Path $pfxFile) { Copy-Item $pfxFile "$pfxFile.previous" -Force }
Export-PfxCertificate -Cert $cert -FilePath $pfxFile -Password $secure | Out-Null
# Older server certificates from earlier runs are no longer needed.
Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.FriendlyName -eq $serverFriendly -and $_.Thumbprint -ne $cert.Thumbprint } | Remove-Item -ErrorAction SilentlyContinue

# -- 3. Switch the application to HTTPS (with automatic rollback) -------------------
$envBackup = "$envFile.before-https"; $jsonBackup = "$installJson.before-https"
Copy-Item $envFile $envBackup -Force; Copy-Item $installJson $jsonBackup -Force
$existingOrigins = @((Get-EnvValue $lines 'ALLOWED_ORIGINS') -split '[,;\s]+' | Where-Object { $_ -and $_ -notlike 'https://*' })
Set-EnvValue $lines 'HTTPS_PFX_PATH' $pfxFile
Set-EnvValue $lines 'HTTPS_PFX_PASSPHRASE' $passphrase
Set-EnvValue $lines 'HTTPS_PORT' '443'
foreach ($k in 'APP_URL', 'PORTAL_URL', 'ALLOWED_ORIGIN') { Set-EnvValue $lines $k $httpsUrls[0] }
Set-EnvValue $lines 'ALLOWED_ORIGINS' (@($httpsUrls + $existingOrigins | Select-Object -Unique) -join ',')
Save-EnvLines $lines
$info = Get-Content $installJson -Raw | ConvertFrom-Json
$info | Add-Member -NotePropertyName httpsPort -NotePropertyValue 443 -Force
$info.urls = $httpsUrls
WriteUtf8 $installJson ($info | ConvertTo-Json -Depth 4)

if (-not (Get-NetFirewallRule -DisplayName $firewallRule -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $firewallRule -Group 'HR Payroll' -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Domain, Private | Out-Null
}

if (-not (Restart-AndCheck)) {
  Say 'The application did not answer over HTTPS; restoring the previous settings...' 'Red'
  Copy-Item $envBackup $envFile -Force; Copy-Item $jsonBackup $installJson -Force
  Restart-Service HRPayrollApp
  throw "HTTPS could not be started. Nothing else changed. See $($install.dataDir)\logs\app for the reason."
}

# http://<server>/ (port 80) -> application port, which now redirects to https.
$proxy = Get-Port80Proxy
if (-not $proxy -and -not @(Get-PortOwners 80).Count -and (Get-Service iphlpsvc -ErrorAction SilentlyContinue)) {
  Set-Service iphlpsvc -StartupType Automatic; Start-Service iphlpsvc -ErrorAction SilentlyContinue
  & netsh.exe interface portproxy add v4tov4 listenport=80 listenaddress=0.0.0.0 connectport=$appPort connectaddress=127.0.0.1 | Out-Null
  if (-not (Get-NetFirewallRule -DisplayName 'HR Payroll Port 80' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'HR Payroll Port 80' -Group 'HR Payroll' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Domain, Private | Out-Null
  }
}

# -- 4. Files for the other PCs ----------------------------------------------------
$cmd = @(
  '@echo off',
  'rem Trusts the HR & Payroll local certificate authority on this PC (browsers and the attendance kiosk).',
  'rem Right-click -> Run as administrator. Run once per PC; keep HRPayroll-CA.cer next to this file.',
  'cd /d "%~dp0"',
  'net session >nul 2>&1',
  'if errorlevel 1 (',
  '  echo Please right-click Install-HRPayroll-CA.cmd and choose "Run as administrator".',
  '  pause',
  '  exit /b 1',
  ')',
  'certutil -addstore -f Root "%~dp0HRPayroll-CA.cer"',
  'if errorlevel 1 ( echo Could not install the certificate. & pause & exit /b 1 )',
  'echo.',
  "echo Done. Close and reopen the browser, then open $($httpsUrls[0])",
  'pause'
)
WriteUtf8 (Join-Path $exportDir 'Install-HRPayroll-CA.cmd') (($cmd -join "`r`n") + "`r`n")

$healthCode = & curl.exe -s --ssl-no-revoke -o NUL -m 10 -w '%{http_code}' "https://localhost/api/health" 2>$null
Say ''
Say 'HTTPS is on.' 'Green'
foreach ($u in $httpsUrls) { Say "  $u" 'Green' }
Say "Health over https://localhost: $healthCode"
# The firewall rules cover Domain and Private networks only; a network marked Public blocks other PCs.
$publicNets = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' })
if ($publicNets.Count) {
  Say ''
  Say ("This server's network '" + (($publicNets | ForEach-Object { $_.InterfaceAlias }) -join "', '") + "' is set to Public, so other PCs are blocked.") 'Red'
  Say '  Fix (office network, not a domain):  Set-NetConnectionProfile -InterfaceAlias "<name above>" -NetworkCategory Private' 'Yellow'
  Say "  Or allow the HR Payroll ports on every network:  Set-NetFirewallRule -Group 'HR Payroll' -Profile Any" 'Yellow'
}
Say ''
Say 'On every PC and kiosk that opens the system (once):' 'Yellow'
Say "  1. Copy the folder $exportDir to the PC (USB or a shared folder)." 'Yellow'
Say '  2. Right-click Install-HRPayroll-CA.cmd -> Run as administrator.' 'Yellow'
Say '  3. Reopen the browser and open the https address above.' 'Yellow'
Say '  (Domain networks: deploy HRPayroll-CA.cer by Group Policy -> Trusted Root Certification Authorities.)' 'Yellow'
Say "Kiosks: Settings -> Remove device key, then register again with $($httpsUrls[0]) (kiosk 1.0.44 or later)." 'Yellow'
Say "Old http://...:$appPort and http://<server>/ addresses now redirect to https." 'Yellow'
