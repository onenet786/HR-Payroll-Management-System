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

## IP Camera (Hikvision and others)

The kiosk's main process holds the camera connection and pushes the frames to the screen. Three kinds of URL work:

- **`rtsp://` (recommended for live video):** FFmpeg on the kiosk PC decodes the camera's H.264/H.265 stream and turns it into 640-pixel frames at 12 a second. This works with cameras that cannot send MJPEG, such as the Hikvision DS-2CD1023G0E-I. FFmpeg must be on the PC (see below).
- **MJPEG `http://` stream:** live without FFmpeg, if the camera offers MJPEG.
- **JPEG snapshot `http://` URL:** re-requested back to back; one to two frames a second, because every request is a fresh login and a full JPEG.

FFmpeg for RTSP: the kiosk uses `windows-kiosk\ffmpeg-bin\ffmpeg.exe` if it was included when the installer was built, otherwise `%ProgramData%\BinIshaqKiosk\ffmpeg.exe`, otherwise `ffmpeg` on the PATH. On a kiosk PC the simplest is, from an administrator prompt, `winget install Gyan.FFmpeg`, then restart the kiosk. The camera user and password are given to FFmpeg inside the RTSP address of the local process only; they are not logged or sent anywhere else. The current frame is the camera preview and the photo evidence attached to code and fingerprint punches. Face punches from an IP camera stay blocked, because a still image cannot prove the person is live; use the local webcam or the fingerprint reader for face or finger identification.

Settings → **Camera**:

- **Camera source**: *Webcam* (USB or built-in camera on the kiosk PC) or *IP camera(s)*. Switching back to the webcam keeps the IP camera settings for later.
- **IP camera 1 and 2**: name, **Use for** (*In & Out*, *In only*, *Out only*), URL, username and password, and a **Test camera** button that tries the values as typed before saving. Passwords are stored encrypted (Windows DPAPI) on the terminal and never leave it; a blank password keeps the saved one while the username is unchanged.
- **Zoom** (rtsp:// cameras): 1.5× to 3× crops the centre of the camera picture before it is scaled, so faces several metres away keep the camera's own detail. Best with the 1080p main stream (…/Channels/101): 2× still gives 960×540 real pixels. Point the centre of the camera at where people stand.
- **Out camera checkout reason**: the reason recorded when someone is recognised on an *Out only* camera (for example *End of Shift* or *Duty Off*), so nobody has to touch the screen at the exit. *Ask on screen* shows the reason list instead.

Recommended for an entrance and a separate exit: camera 1 at the entrance set to *In only*, camera 2 at the exit set to *Out only*, both on rtsp:// URLs. In **Multi-Face Stream** both cameras are shown and recognise faces at the same time, each with its own IN / OUT tag. An In camera ignores people who are already inside (shown as *Already In* on the face) and brings people back from a temporary exit; an Out camera ignores people who have not punched in. The rule is enforced in the kiosk process from the terminal settings, not by the screen. The **1-on-1 Challenge** uses one camera at a time; with two cameras a selector above the picture chooses which. With a single camera choose *In & Out*: the kiosk then decides in or out from the day's record, as before.

The same employee is not recognised again for 60 seconds after a punch (the kiosk refuses a second punch within a minute); the face shows *Already Recorded* with the seconds remaining.

Each camera preview badge shows its name and the reason when no frame arrives (wrong password, HTTP error, unreachable). The kiosk version is shown next to the terminal name at the top of the screen.

If the badge says the camera **rejected the username or password**, the camera answered and refused the login; the kiosk then waits one minute before trying again, because Hikvision cameras lock the account or the kiosk's address after a few failed attempts. Check, in this order: open the snapshot URL in a browser on the kiosk PC and sign in with the same user and password (a 401 there means the credentials or the user's **Remote: Live View** permission are wrong, not the kiosk); on the camera, Configuration → System → Security → Security Service, see whether **Illegal Login Lock** has locked the user and wait it out or disable it; then re-enter the password in kiosk Settings, press **Test camera**, and save.

Hikvision (for example DS-2CD1023G0E-I):

1. Give the camera a fixed LAN address or a DHCP reservation; the kiosk PC must reach it directly.
2. Camera web page → Configuration → Network → Advanced Settings → Integration Protocol: enable **Hikvision-CGI**, authentication **digest/basic**. Save. (The ONVIF user list on the same page is for NVRs; the kiosk does not use it.)
3. Configuration → System → User Management: add an **Operator** device user for the kiosk with **Remote: Live View** ticked. The camera asks for the admin password to save the user, and the new password must be 8 to 16 characters with two character types. Do not store the admin password on a terminal.
4. For live video: `rtsp://CAMERA-IP:554/Streaming/Channels/102` (sub stream; keep it H.264 at 640×480 or 704×576, 12–15 fps — H.265 also works but costs more CPU). RTSP must be enabled (Configuration → Network → Basic Settings → Port, RTSP port 554). Models whose sub stream offers MJPEG can use `http://CAMERA-IP/ISAPI/Streaming/channels/102/httpPreview` without FFmpeg instead; the DS-2CD1023G0E-I does not (it resets that request).
   For face recognition the picture quality matters more than for a preview: if faces are often not recognised on the sub stream, use the main stream instead, `rtsp://CAMERA-IP:554/Streaming/Channels/101`, set to H.264 (not H.265) at 1920×1080 or 1280×720 and 12–15 fps with bitrate 2048 Kbps or more; the kiosk scales it to 960 pixels. Mount the camera at about head height (1.6–2 m) facing the door, so people walk towards it with their face level rather than looking down at it.
   For a snapshot refresh instead (no FFmpeg, slower): `http://CAMERA-IP/ISAPI/Streaming/channels/102/picture`, or `.../101/picture` for the full-resolution main stream.

Other cameras and NVRs: any URL that returns a JPEG, or an MJPEG (`multipart/x-mixed-replace`) stream; the kiosk takes the first frame of a stream. RTSP URLs are not supported. The web portal has no direct camera access (a browser cannot log in to a LAN camera from an HTTPS page); it shows the photos the kiosk attaches to each punch.


