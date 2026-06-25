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

## Fingerprint Requirements

1. Install the DigitalPersona U.are.U SDK/driver or SecuGen FDx SDK Pro for Windows on the kiosk machine.
   - For SecuGen Hamster Pro (HUPx), the bridge must be able to load `SecuGen.FDxSDKPro.Windows.dll` and `sgfplib.dll`.
   - Install the SecuGen FDx SDK/driver, copy both DLLs beside `URU4500Bridge.exe`, or set `SECUGEN_FDX_SDK` to the SDK `bin` folder before building/running the bridge.
2. Enroll employee fingerprints from the HR biometric module so `fingerprintTemplates` are saved on employee records.
3. Start the kiosk. It automatically starts `URU4500Bridge.exe`.
4. Use Fingerprint mode. The kiosk sends enrolled templates to the bridge, captures a live finger, and the native SDK returns the matched employee.

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
Firebase project: gen-lang-client-0314098400
Firestore database: ai-studio-0ab7c3a1-e4ca-49b5-86f4-6883897b9163
Collections: employees, attendances
```

When a punch is marked, the kiosk writes to the `attendances` collection. The live portal at `attendance.binishaqsoft.com` reads the same collection, so synced kiosk punches appear there. If internet is down, records remain in the local pending queue and sync later.

Local kiosk data is stored under Electron's app data folder. Use Settings > Open Local Store from the kiosk UI to inspect it.

## Exit Kiosk

Use the red `Exit` button in the top-right corner of the kiosk. It leaves Windows kiosk fullscreen mode and closes the app cleanly.

## IP Camera

Open Settings and enter a camera URL such as:

```text
http://192.168.1.50/snapshot.jpg
```

For browser security, use a camera endpoint that allows local Electron rendering. If the camera blocks canvas capture, use webcam mode or enable cross-origin access on the camera/NVR endpoint.


