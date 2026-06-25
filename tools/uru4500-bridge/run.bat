@echo off
setlocal

if not exist "%~dp0bin\URU4500Bridge.exe" (
  call "%~dp0build.bat" || exit /b 1
)

"%~dp0bin\URU4500Bridge.exe"
