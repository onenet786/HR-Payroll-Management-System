@echo off
rem HR & Payroll - update an installed server to the version in THIS package.
rem Every update is the same: extract the new package, right-click Update.cmd -> Run as administrator.
rem It takes a safety backup, installs the new version beside the old one, updates the database, restarts
rem and checks. If the new version does not answer it switches back to the previous one automatically.
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Please right-click Update.cmd and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\Update-HRPayroll.ps1" %*
echo.
pause
