; Custom steps for the kiosk installer (all-users install, runs as administrator).
;
; The fingerprint bridge (URU4500Bridge.exe, bundled under resources\uru4500-bridge) is started by the kiosk
; itself, inside the logged-in user's session. Earlier versions registered it as a Windows service; a service
; runs in session 0, where the DigitalPersona SDK cannot see U.are.U / HID readers at all (SecuGen readers
; still worked, which hid the problem). Setup therefore removes any existing service on install or upgrade.

!define BRIDGE_SERVICE "URU4500Bridge"
; Auto-start entry the kiosk writes for itself (Electron's setLoginItemSettings).
!define AUTOSTART_VALUE "electron.app.${PRODUCT_NAME}"

; Order on every install or upgrade: (1) customCheckAppRunning stops the kiosk, the legacy bridge service and any
; stray copies; (2) electron-builder silently runs the previous version's uninstaller (per-user and all-users
; installs alike), keeping queued punches, settings and the device key, which live in the user profile;
; (3) the new files are copied and customInstall removes the legacy service registration for good.

; Replaces electron-builder's "is the app running?" check, which showed "cannot be closed" because the kiosk
; auto-starts at Windows login and runs as several processes. This version stops the bridge service, closes
; every kiosk and bridge process by name, waits until they have really exited, and only asks the user when
; Windows refuses to end them. Queued punches are kept on disk, so closing is safe.
!macro customCheckAppRunning
  DetailPrint "Stopping ${PRODUCT_NAME} and the fingerprint bridge before removing the previous version..."
  ; Switch off the service's restart-on-failure first, or Windows restarts the bridge seconds after it is
  ; closed and it locks its files while the previous version is being removed. customInstall turns it back on.
  nsExec::Exec `"$SYSDIR\sc.exe" failure ${BRIDGE_SERVICE} reset= 0 actions= ""`
  Pop $0
  nsExec::Exec `"$SYSDIR\sc.exe" config ${BRIDGE_SERVICE} start= demand`
  Pop $0
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
  !ifndef BUILD_UNINSTALLER
    !insertmacro removePreviousVersion
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
; Uninstalls the previous all-users version by deleting its program folder (retrying while Windows releases
; files) and clearing its uninstall entry, so electron-builder does not run the old uninstaller. That old
; uninstaller moves every file aside and gives up on the first busy one, which setup then reported as
; "cannot be closed". Punches, settings and the device key live in the user profile and are not touched;
; shortcuts and the uninstall entry are written again by this setup.
!macro removePreviousVersion
  Var /GLOBAL previousDir
  ReadRegStr $previousDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $previousDir == ""
    StrCpy $previousDir "$INSTDIR"
  ${EndIf}
  ${If} ${FileExists} "$previousDir\${APP_EXECUTABLE_FILENAME}"
    DetailPrint "Uninstalling the previous version from $previousDir..."
    StrCpy $1 0
    ${Do}
      ClearErrors
      RMDir /r "$previousDir"
      ; Done only when the whole folder is gone: a file left behind would make copying the new version fail.
      ${IfNot} ${FileExists} "$previousDir\*.*"
        ${Break}
      ${EndIf}
      IntOp $1 $1 + 1
      ${If} $1 >= 15
        ${If} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Setup could not remove the previous version of ${PRODUCT_NAME} from:$\r$\n$previousDir$\r$\n$\r$\nA file there is in use. Restart the PC, then run setup again, or click Retry." /SD IDCANCEL IDCANCEL`
          Quit
        ${EndIf}
        StrCpy $1 0
      ${EndIf}
      Sleep 1000
    ${Loop}
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
      DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" QuietUninstallString
    !endif
    DetailPrint "Previous version removed."
  ${EndIf}
!macroend
!endif

!macro customInstall
  Var /GLOBAL bridgeExe
  StrCpy $bridgeExe "$INSTDIR\resources\uru4500-bridge\URU4500Bridge.exe"
  ; The bridge must run in the user's session; remove the legacy service and the old per-user startup task so
  ; neither grabs port 15896 from session 0 or starts a second copy.
  nsExec::Exec `"$SYSDIR\sc.exe" query ${BRIDGE_SERVICE}`
  Pop $0
  ${If} $0 == 0
    DetailPrint "Removing the legacy fingerprint bridge Windows service (readers are now served from the user session)..."
    nsExec::Exec `"$SYSDIR\sc.exe" stop ${BRIDGE_SERVICE}`
    Pop $0
    nsExec::Exec `"$SYSDIR\sc.exe" delete ${BRIDGE_SERVICE}`
    Pop $0
  ${EndIf}
  nsExec::Exec `"$SYSDIR\schtasks.exe" /Delete /TN ${BRIDGE_SERVICE} /F`
  Pop $0
  ${If} ${FileExists} "$bridgeExe"
    ; Auto-start for every user at logon, inside that user's session (the service-like behaviour the reader
    ; needs). The kiosk still starts and watches the bridge itself; a second copy exits quietly.
    DetailPrint "Registering the fingerprint bridge to start at every Windows login..."
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${BRIDGE_SERVICE}" '"$bridgeExe"'
    Exec '"$bridgeExe"'
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::Exec `"$SYSDIR\sc.exe" stop ${BRIDGE_SERVICE}`
  Pop $0
  nsExec::Exec `"$SYSDIR\sc.exe" delete ${BRIDGE_SERVICE}`
  Pop $0
  ${IfNot} ${isUpdated}
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "URU4500Bridge.exe"`
    Pop $0
    DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "${BRIDGE_SERVICE}"
    ; A full uninstall also stops the kiosk starting at Windows login.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${AUTOSTART_VALUE}"
  ${EndIf}
!macroend
