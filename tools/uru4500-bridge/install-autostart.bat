@echo off
setlocal
rem Starts URU4500Bridge.exe automatically at every Windows login, inside the user's session, which is where
rem the DigitalPersona SDK can see U.are.U / HID readers (a Windows service in session 0 cannot).
rem Run as Administrator to register it for every user of this PC; otherwise it is registered for you only.

set "EXE=%~dp0bin\URU4500Bridge.exe"
if not exist "%EXE%" (
  echo URU4500Bridge.exe not found next to this script. Build it first with build.bat.
  exit /b 1
)

sc query URU4500Bridge >nul 2>&1
if not errorlevel 1 (
  echo Removing the old URU4500Bridge Windows service...
  sc stop URU4500Bridge >nul 2>&1
  sc delete URU4500Bridge >nul 2>&1
)
schtasks /Delete /TN URU4500Bridge /F >nul 2>&1

net session >nul 2>&1
if errorlevel 1 (
  reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v URU4500Bridge /t REG_SZ /d "\"%EXE%\"" /f >nul
  if errorlevel 1 exit /b 1
  set "SCOPE=this Windows user"
) else (
  reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v URU4500Bridge /f >nul 2>&1
  reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Run" /v URU4500Bridge /t REG_SZ /d "\"%EXE%\"" /f >nul
  if errorlevel 1 exit /b 1
  set "SCOPE=every user of this PC"
)

taskkill /IM URU4500Bridge.exe /F >nul 2>&1
cd /d "%~dp0bin"
start "" "%EXE%"

echo.
echo URU4500Bridge auto-start registered for %SCOPE% and started now.
echo Endpoint: ws://127.0.0.1:15896
