@echo off
setlocal

net session >nul 2>&1
if errorlevel 1 (
  echo Please run this file as Administrator.
  echo Right-click uninstall-service.bat and choose "Run as administrator".
  exit /b 1
)

sc stop URU4500Bridge
sc delete URU4500Bridge

echo.
echo URU4500Bridge service removed.
