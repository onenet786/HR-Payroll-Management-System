@echo off
setlocal

schtasks /End /TN "URU4500Bridge" >nul 2>&1
schtasks /Delete /TN "URU4500Bridge" /F

echo.
echo URU4500Bridge startup task removed.
