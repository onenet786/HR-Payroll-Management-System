@echo off
setlocal

net session >nul 2>&1
if errorlevel 1 (
  echo Please run this file as Administrator.
  echo Right-click install-service.bat and choose "Run as administrator".
  exit /b 1
)

echo.
echo WARNING: a Windows service runs in session 0, where the DigitalPersona SDK cannot see
echo U.are.U / HID 4500 readers at all (SecuGen readers still work, which hides the problem).
echo Use install-startup-task.bat instead, or let the Attendance Kiosk start the bridge itself.
echo Only continue if every reader on this PC is a SecuGen reader.
set "CONFIRM="
set /p CONFIRM=Type YES to install the service anyway:
if /i not "%CONFIRM%"=="YES" (
  echo Cancelled. Nothing was changed.
  exit /b 1
)

call "%~dp0build.bat" || exit /b 1

set "EXE=%~dp0bin\URU4500Bridge.exe"

sc query URU4500Bridge >nul 2>&1
if not errorlevel 1 (
  sc stop URU4500Bridge >nul 2>&1
  sc delete URU4500Bridge >nul 2>&1
  timeout /t 2 /nobreak >nul
)

sc create URU4500Bridge binPath= "\"%EXE%\" --service" start= auto DisplayName= "URU 4500 Bridge"
if errorlevel 1 exit /b 1

sc description URU4500Bridge "Local WebSocket bridge for DigitalPersona U.are.U 4500 fingerprint reader."
sc start URU4500Bridge

echo.
echo URU4500Bridge service installed and started.
echo Endpoint: ws://127.0.0.1:15896
