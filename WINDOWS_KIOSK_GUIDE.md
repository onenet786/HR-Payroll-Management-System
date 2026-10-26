# Windows Attendance Kiosk

This project now includes a standalone Windows kiosk terminal built with plain Electron, HTML, CSS, and JavaScript.

## Run

```powershell
npm run kiosk:run
```

## Build EXE

```powershell
npm run kiosk:build
```

Output is generated in:

```text
dist-kiosk
```

## Supported Punch Methods

- Employee code / ID / card suffix
- Webcam proof punch
- IP camera proof punch by snapshot or MJPEG URL
- DigitalPersona U.are.U / URU4500 or SecuGen Hamster Pro fingerprint identification through `URU4500Bridge.exe`

## Optional: Three Exit Buttons, Attendance Policy, Classic Theme

By default the kiosk uses the standard checkout list (End of Shift, Lunch Break, …), the shift rules, and the readable navy theme with a red close button on every dialog. Two things are optional:

**Company option "Kiosk: three exit buttons only"** (portal Settings → Company Options & Attendance Policy). When on, the checkout prompt offers exactly three choices (hotkeys 1–3):

1. **Duty Off** — finished for the day. With the policy rule "Duty Off before the branch half time counts as a leave", a duty off before the branch half time (Master Data → Branch → *Half time*, or the policy default) records the day as a leave.
2. **Personal Out** — a temporary exit; scanning again brings the employee back. The minutes are deducted from worked time and counted against the branch's personal-out allowance; the record is flagged when the allowance is exceeded.
3. **Office Work** — out on company work; scanning again brings them back. With the option "Office work exits do not affect attendance" the time is neither deducted nor counted.

When the attendance policy is filled in, late and half-day decisions use the branch opening time plus the policy minutes. The kiosk downloads the options, the policy and the branch timings on every sync and applies them offline.

**Classic dark theme** (kiosk Settings → Punch Options): restores the original deep-navy palette and the small neutral close button. Off (the default) keeps the readable theme: lighter panels, stronger borders and a clearly visible red close button on every dialog.

## Fingerprint Requirements

1. Install the DigitalPersona U.are.U SDK/driver or SecuGen FDx SDK Pro for Windows on the kiosk machine.
   - For SecuGen Hamster Pro (HUPx), the bridge must be able to load `SecuGen.FDxSDKPro.Windows.dll` and `sgfplib.dll`.
   - Install the SecuGen FDx SDK/driver, copy both DLLs beside `URU4500Bridge.exe`, or set `SECUGEN_FDX_SDK` to the SDK `bin` folder before building/running the bridge.
2. Enroll employee fingerprints from the HR biometric module so `fingerprintTemplates` are saved on employee records.
   - Enroll with **Connect Bridge** and the reader attached. The **HID Diagnostic** and **Simulate** buttons only test the browser and the UI; their captures are not real templates and are refused for enrollment.
   - Enroll on the **same reader family the kiosk uses**. A template made on a U.are.U / HID DigitalPersona reader never matches a finger captured on a SecuGen reader, and vice versa. The kiosk reports this mismatch by name.
3. The bridge starts by itself at every Windows login (the kiosk setup registers `URU4500Bridge.exe` under the all-users Run key), and the kiosk also starts and watches it. Do **not** install the bridge as a Windows service: a service runs in session 0, where the DigitalPersona SDK cannot see U.are.U / HID readers (SecuGen still works there, which hides the problem). The kiosk setup removes a legacy service automatically.
   - HR PCs that use only the web biometric module (no kiosk): run `tools\uru4500-bridge\install-autostart.bat` once as administrator. It removes any old service and registers the same login auto-start; `uninstall-autostart.bat` reverses it.
   - A second copy started while one is already listening on port 15896 exits quietly, so the Run entry and the kiosk never fight.
4. Use Fingerprint mode. The kiosk sends enrolled templates to the bridge, captures a live finger, and the native SDK returns the matched employee. The bridge tries the U.are.U reader first and falls back to SecuGen; **Test Fingerprint Scanner** in kiosk settings shows which reader captured and the exact reason when a capture fails.

## Working Without Internet

The kiosk opens from its local cache immediately; it never waits for the server. The startup sync runs in the background for at most 8 seconds and every server request gives up after 10 seconds. Punches made offline are queued and uploaded on the next successful sync (automatic every 5 minutes, or the Sync button).

The bridge now supports:

```json
{
  "action": "Identify",
  "threshold": 2147,
  "gallery": [
    { "employeeId": "emp1", "template": "base64-fmd-template" }
  ]
}
```

## Storage And Sync

The kiosk writes attendance locally first, then syncs to the same Firestore backend used by:

```text
https://attendance.binishaqsoft.com
```

Sync target:

```text
Backend: PostgreSQL Server API
Endpoint: /api/kiosk/sync and /api/kiosk/punch
Collections: employees, attendances
```

When a punch is marked, the kiosk synchronizes with the server PostgreSQL database. The live portal at `attendance.binishaqsoft.com` reads the same data, so synced kiosk punches appear there. If internet is down, records remain in the local pending queue and sync automatically when connection restores.

Local kiosk data is stored under Electron's app data folder. Use Settings > Open Local Store from the kiosk UI to inspect it.

## Exit Kiosk

Use the red `Exit` button in the top-right corner of the kiosk. It leaves Windows kiosk fullscreen mode and closes the app cleanly.

## IP Camera

Open Settings and enter a camera URL such as:

```text
http://192.168.1.50/snapshot.jpg
```

For browser security, use a camera endpoint that allows local Electron rendering. If the camera blocks canvas capture, use webcam mode or enable cross-origin access on the camera/NVR endpoint.


