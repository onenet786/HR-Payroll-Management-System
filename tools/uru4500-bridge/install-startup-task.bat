@echo off
setlocal

call "%~dp0build.bat" || exit /b 1

set "EXE=%~dp0bin\URU4500Bridge.exe"
set "TASK=URU4500Bridge"

schtasks /Delete /TN "%TASK%" /F >nul 2>&1
schtasks /Create /TN "%TASK%" /SC ONLOGON /TR """%EXE%""" /F
if errorlevel 1 exit /b 1

schtasks /Run /TN "%TASK%"
if errorlevel 1 exit /b 1

echo.
echo URU4500Bridge startup task installed and started.
echo It will run automatically when this Windows user logs in.
echo Endpoint: ws://127.0.0.1:15896
