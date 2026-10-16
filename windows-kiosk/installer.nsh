; Replaces electron-builder's "is the app running?" check. The stock check treats any process whose path
; starts with $INSTDIR as the app, which gave "cannot be closed" when nothing was running (for example when an
; all-users install has no InstallLocation recorded). This version only acts on a folder that really holds the
; kiosk, closes the kiosk and its fingerprint bridge without asking (it is an unattended terminal; queued
; punches are kept on disk), and never blocks the install.
!macro customCheckAppRunning
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    DetailPrint "Closing ${PRODUCT_NAME} if it is running..."
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$d = '$INSTDIR'.TrimEnd('\') + '\'; Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
    Pop $0
    ; Fallback when PowerShell is blocked by policy.
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $0
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "URU4500Bridge.exe"`
    Pop $0
    Sleep 800
  ${EndIf}
!macroend
