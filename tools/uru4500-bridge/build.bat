@echo off
setlocal

set "SDK=C:\Program Files\DigitalPersona\U.are.U SDK\Windows"
set "SECUGEN_SDK=C:\Program Files\SecuGen\FDx SDK Pro for Windows\bin"
if defined SECUGEN_FDX_SDK set "SECUGEN_SDK=%SECUGEN_FDX_SDK%"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set "OUT=%~dp0bin"

if not exist "%CSC%" (
  echo C# compiler not found: %CSC%
  exit /b 1
)

if not exist "%SDK%\Lib\.NET\DPUruNet.dll" (
  echo DPUruNet.dll not found. Install the DigitalPersona U.are.U SDK.
  exit /b 1
)

if not exist "%OUT%" mkdir "%OUT%"

"%CSC%" /nologo /platform:x64 /target:exe /out:"%OUT%\URU4500Bridge.exe" /reference:System.ServiceProcess.dll /reference:"%SDK%\Lib\.NET\DPUruNet.dll" "%~dp0Program.cs"
if errorlevel 1 exit /b 1

copy /Y "%SDK%\Lib\.NET\DPUruNet.dll" "%OUT%\" >nul
copy /Y "%SDK%\Lib\x64\dpfj.dll" "%OUT%\" >nul
copy /Y "%SDK%\Lib\x64\dpfpdd.dll" "%OUT%\" >nul
copy /Y "%SDK%\Lib\x64\dpfpdd_4k.dll" "%OUT%\" >nul

if exist "%SECUGEN_SDK%\SecuGen.FDxSDKPro.Windows.dll" copy /Y "%SECUGEN_SDK%\SecuGen.FDxSDKPro.Windows.dll" "%OUT%\" >nul
if exist "%SECUGEN_SDK%\sgfplib.dll" copy /Y "%SECUGEN_SDK%\sgfplib.dll" "%OUT%\" >nul
if exist "%SECUGEN_SDK%\x64\sgfplib.dll" copy /Y "%SECUGEN_SDK%\x64\sgfplib.dll" "%OUT%\" >nul
if not exist "%OUT%\SecuGen.FDxSDKPro.Windows.dll" if exist "%ProgramFiles%\SecuGen" for /r "%ProgramFiles%\SecuGen" %%F in (SecuGen.FDxSDKPro.Windows.dll) do if not exist "%OUT%\SecuGen.FDxSDKPro.Windows.dll" copy /Y "%%F" "%OUT%\" >nul
if not exist "%OUT%\sgfplib.dll" if exist "%ProgramFiles%\SecuGen" for /r "%ProgramFiles%\SecuGen" %%F in (sgfplib.dll) do if not exist "%OUT%\sgfplib.dll" copy /Y "%%F" "%OUT%\" >nul
if not exist "%OUT%\SecuGen.FDxSDKPro.Windows.dll" if exist "%ProgramFiles(x86)%\SecuGen" for /r "%ProgramFiles(x86)%\SecuGen" %%F in (SecuGen.FDxSDKPro.Windows.dll) do if not exist "%OUT%\SecuGen.FDxSDKPro.Windows.dll" copy /Y "%%F" "%OUT%\" >nul
if not exist "%OUT%\sgfplib.dll" if exist "%ProgramFiles(x86)%\SecuGen" for /r "%ProgramFiles(x86)%\SecuGen" %%F in (sgfplib.dll) do if not exist "%OUT%\sgfplib.dll" copy /Y "%%F" "%OUT%\" >nul

if not exist "%OUT%\sgfplib.dll" echo Warning: sgfplib.dll not found. Install the SecuGen driver/runtime or set SECUGEN_FDX_SDK before building.
if not exist "%OUT%\SecuGen.FDxSDKPro.Windows.dll" if exist "%OUT%\sgfplib.dll" echo SecuGen native runtime found. Managed FDx wrapper not found; native sgfplib fallback will be used.

echo Built %OUT%\URU4500Bridge.exe
