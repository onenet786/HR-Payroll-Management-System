; Custom steps for the kiosk installer (all-users install, runs as administrator).
;
; The fingerprint bridge (URU4500Bridge.exe, bundled under resources\uru4500-bridge) is registered as an
; auto-start Windows service, so the reader works from boot, before anyone logs in, and restarts on its own
; if it crashes. The kiosk only starts its own copy when that service is missing or stopped.

!define BRIDGE_SERVICE "URU4500Bridge"
; Auto-start entry the kiosk writes for itself (Electron's setLoginItemSettings).
!define AUTOSTART_VALUE "electron.app.${PRODUCT_NAME}"

; Order on every install or upgrade: (1) customCheckAppRunning stops the kiosk, the bridge service and any
; stray copies; (2) electron-builder silently runs the previous version's uninstaller (per-user and all-users
; installs alike), keeping queued punches, settings and the device key, which live in the user profile;
; (3) the new files are copied and customInstall re-registers the bridge service.

; Replaces electron-builder's "is the app running?" check, which showed "cannot be closed" because the kiosk
; auto-starts at Windows login and runs as several processes. This version stops the bridge service, closes
; every kiosk and bridge process by name, waits until they have really exited, and only asks the user when
; Windows refuses to end them. Queued punches are kept on disk, so closing is safe.
!macro customCheckAppRunning
  DetailPrint "Stopping ${PRODUCT_NAME} and the fingerprint bridge before removing the previous version..."
  ${Do}
    ; PowerShell exits 0 once no kiosk or bridge process is left, 1 if some survive.
    nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Stop-Service -Name '${BRIDGE_SERVICE}' -Force -ErrorAction SilentlyContinue; $$n = @('${PRODUCT_FILENAME}', 'URU4500Bridge'); for ($$i = 0; $$i -lt 10; $$i++) { $$p = Get-Process -Name $$n -ErrorAction SilentlyContinue; if (-not $$p) { exit 0 }; $$p | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 700 }; if (Get-Process -Name $$n -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"`
    Pop $0
    ${If} $0 == 0
      ${Break}
    ${EndIf}
    ; PowerShell missing, blocked by policy, or a process survived: fall back to sc/taskkill and check again.
    nsExec::Exec `"$SYSDIR\sc.exe" stop ${BRIDGE_SERVICE}`
    Pop $0
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

!macro customInstall
  Var /GLOBAL bridgeExe
  StrCpy $bridgeExe "$INSTDIR\resources\uru4500-bridge\URU4500Bridge.exe"
  ${If} ${FileExists} "$bridgeExe"
    DetailPrint "Installing the fingerprint bridge Windows service..."
    ; An older per-user startup task would launch a second copy that fights the service for the port.
    nsExec::Exec `"$SYSDIR\schtasks.exe" /Delete /TN ${BRIDGE_SERVICE} /F`
    Pop $0
    nsExec::Exec `"$SYSDIR\sc.exe" query ${BRIDGE_SERVICE}`
    Pop $0
    ${If} $0 == 0
      ; Already registered (earlier kiosk or tools\uru4500-bridge\install-service.bat): point it at this copy.
      nsExec::Exec `"$SYSDIR\sc.exe" config ${BRIDGE_SERVICE} binPath= "\"$bridgeExe\" --service" start= auto DisplayName= "URU 4500 Fingerprint Bridge"`
    ${Else}
      nsExec::Exec `"$SYSDIR\sc.exe" create ${BRIDGE_SERVICE} binPath= "\"$bridgeExe\" --service" start= auto DisplayName= "URU 4500 Fingerprint Bridge"`
    ${EndIf}
    Pop $0
    ${If} $0 != 0
      DetailPrint "Could not register the fingerprint bridge service (error $0); the kiosk will start the bridge itself."
    ${Else}
      nsExec::Exec `"$SYSDIR\sc.exe" description ${BRIDGE_SERVICE} "Local fingerprint reader bridge (ws://127.0.0.1:15896) for ${PRODUCT_NAME}."`
      Pop $0
      nsExec::Exec `"$SYSDIR\sc.exe" failure ${BRIDGE_SERVICE} reset= 86400 actions= restart/5000/restart/10000/restart/30000`
      Pop $0
      nsExec::Exec `"$SYSDIR\sc.exe" start ${BRIDGE_SERVICE}`
      Pop $0
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::Exec `"$SYSDIR\sc.exe" stop ${BRIDGE_SERVICE}`
  Pop $0
  ; On an upgrade the new version re-points the service at its own copy, so keep the registration.
  ${IfNot} ${isUpdated}
    nsExec::Exec `"$SYSDIR\sc.exe" delete ${BRIDGE_SERVICE}`
    Pop $0
    ; A full uninstall also stops the kiosk starting at Windows login.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${AUTOSTART_VALUE}"
  ${EndIf}
!macroend
