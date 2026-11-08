@echo off
rem HR & Payroll - Windows Server setup. Right-click -> Run as administrator.
rem Optional: Setup.cmd setup.config.psd1   (unattended, see setup\setup.config.example.psd1)
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Please right-click Setup.cmd and choose "Run as administrator".
  echo.
  pause
  exit /b 1
)
if "%~1"=="" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\Install-HRPayroll.ps1"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\Install-HRPayroll.ps1" -ConfigFile "%~f1"
)
echo.
pause
