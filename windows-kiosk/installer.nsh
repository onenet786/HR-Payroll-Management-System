; Replaces electron-builder's "is the app running?" check, which showed "cannot be closed" because the kiosk
; auto-starts at Windows login and runs as several processes (plus the fingerprint bridge). This version
; closes every kiosk and bridge process by name, wherever it was installed, waits until they have really
; exited, and only asks the user when Windows refuses to end them (for example a kiosk started "as
; administrator" while this setup is not). Queued punches are kept on disk, so closing is safe.
!macro customCheckAppRunning
  DetailPrint "Closing ${PRODUCT_NAME} if it is running..."
  ${Do}
    ; PowerShell exits 0 once no kiosk or bridge process is left, 1 if some survive.
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$n = @('${PRODUCT_FILENAME}', 'URU4500Bridge'); for ($$i = 0; $$i -lt 10; $$i++) { $$p = Get-Process -Name $$n -ErrorAction SilentlyContinue; if (-not $$p) { exit 0 }; $$p | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 700 }; if (Get-Process -Name $$n -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"`
    Pop $0
    ${If} $0 == 0
      ${Break}
    ${EndIf}
    ; PowerShell missing, blocked by policy, or a process survived: fall back to taskkill and check again.
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $0
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "URU4500Bridge.exe"`
    Pop $0
    Sleep 1500
    nsExec::ExecToStack `"$SYSDIR\cmd.exe" /C "$SYSDIR\tasklist.exe /NH /FI $\"IMAGENAME eq ${APP_EXECUTABLE_FILENAME}$\" | $SYSDIR\find.exe /I $\"${APP_EXECUTABLE_FILENAME}$\""`
    Pop $0
    Pop $1
    ${If} $0 != 0
      ${Break}
    ${EndIf}
    ${If} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "${PRODUCT_NAME} is still running and Windows did not let setup close it.$\r$\n$\r$\nOpen Task Manager, end every '${PRODUCT_NAME}' and 'URU4500Bridge' task (or restart the PC), then click Retry." /SD IDCANCEL IDCANCEL`
      Quit
    ${EndIf}
  ${Loop}
  ; Give Windows a moment to release file locks held by the closed processes.
  Sleep 1000
!macroend
