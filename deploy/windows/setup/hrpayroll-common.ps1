# Shared helpers for the HR & Payroll Windows tools (dot-sourced).
$ErrorActionPreference = 'Stop'

function Get-HRInstall([string]$InstallDir) {
  $candidates = @()
  if ($InstallDir) { $candidates += $InstallDir }
  $candidates += (Split-Path -Parent $PSScriptRoot)   # tools\ -> install folder
  # The registered service knows where the install lives: <install>\service\HRPayrollApp.exe
  try {
    $svc = Get-CimInstance Win32_Service -Filter "Name='HRPayrollApp'" -ErrorAction Stop
    if ($svc -and $svc.PathName) {
      $exe = $svc.PathName.Trim().Trim('"')
      if ($exe -match '^(.+?\.exe)') { $exe = $Matches[1].Trim('"') }
      $candidates += (Split-Path -Parent (Split-Path -Parent $exe))
    }
  } catch {}
  # Otherwise X:\HRPayroll on any fixed drive
  try {
    foreach ($d in (Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction Stop)) { $candidates += "$($d.DeviceID)\HRPayroll" }
  } catch { $candidates += 'C:\HRPayroll' }
  foreach ($dir in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
    $file = Join-Path $dir 'config\install.json'
    if (Test-Path $file) {
      $info = Get-Content $file -Raw | ConvertFrom-Json
      $release = Get-Content (Join-Path $dir 'config\release.json') -Raw | ConvertFrom-Json
      $info | Add-Member -NotePropertyName releasePath -NotePropertyValue $release.releasePath -Force
      $info | Add-Member -NotePropertyName release -NotePropertyValue $release.release -Force
      $info | Add-Member -NotePropertyName nodeExe -NotePropertyValue (Join-Path $dir 'runtime\node\node.exe') -Force
      $info | Add-Member -NotePropertyName pgBin -NotePropertyValue (Join-Path $dir 'runtime\pgsql\bin') -Force
      return $info
    }
  }
  throw 'HR & Payroll installation not found (config\install.json). Pass -InstallDir.'
}

function Invoke-HRNode($install, [string]$script, [string[]]$arguments = @(), [hashtable]$envVars = @{}) {
  $psi = New-Object Diagnostics.ProcessStartInfo
  $psi.FileName = $install.nodeExe
  $all = @($script) + $arguments
  $psi.Arguments = ($all | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $psi.WorkingDirectory = $install.configDir
  $psi.UseShellExecute = $false; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
  foreach ($k in $envVars.Keys) { $psi.EnvironmentVariables[$k] = [string]$envVars[$k] }
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync(); $err = $p.StandardError.ReadToEndAsync()
  $p.WaitForExit()
  $text = ($out.Result + $err.Result).Trim()
  if ($p.ExitCode -ne 0) { throw "$script failed (exit $($p.ExitCode)): $text" }
  return $text
}

function Test-HRHealth($install, [int]$tries = 30) {
  $url = if ($install.httpsPort) { "https://localhost:$($install.httpsPort)/api/health" } else { "http://127.0.0.1:$($install.appPort)/api/health" }
  for ($i = 0; $i -lt $tries; $i++) {
    $code = & curl.exe -k -s -o NUL -w '%{http_code}' $url 2>$null
    if ($code -eq '200') { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Stop-HRApp($install) {
  if ($install.portable) {
    $pidFile = Join-Path $install.configDir 'portable.pid'
    if (Test-Path $pidFile) { Stop-Process -Id ([int](Get-Content $pidFile)) -Force -ErrorAction SilentlyContinue; Remove-Item $pidFile -Force }
  } else { Stop-Service HRPayrollApp -ErrorAction SilentlyContinue }
}

function Start-HRApp($install) {
  if ($install.portable) {
    $log = Join-Path $install.dataDir 'logs\app'
    $proc = Start-Process -FilePath $install.nodeExe -ArgumentList 'start.cjs' -WorkingDirectory $install.configDir -WindowStyle Hidden -PassThru -RedirectStandardOutput "$log\app.out.log" -RedirectStandardError "$log\app.err.log"
    Set-Content -Path (Join-Path $install.configDir 'portable.pid') -Value $proc.Id
  } else { Start-Service HRPayrollApp }
}
