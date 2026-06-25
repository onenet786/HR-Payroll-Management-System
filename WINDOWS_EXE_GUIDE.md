# Windows EXE Guide

## Output

The Windows desktop build is generated here:

```text
dist-windows\Bin Ishaq HR Suite 0.0.0.exe
```

There is also an unpacked runnable folder here:

```text
dist-windows\win-unpacked\Bin Ishaq HR Suite.exe
```

Use the portable `.exe` for simple client delivery. Use the `win-unpacked` folder if the portable app has antivirus or permission issues on a client machine.

## How It Works

The Windows app is an Electron desktop wrapper around the HR Payroll React app.

When opened on Windows, it:

1. starts the bundled `URU4500Bridge.exe` silently,
2. opens the HR app in a desktop window,
3. defaults to the Windows Client attendance view after login,
4. lets the Windows Client view capture fingerprints through `ws://127.0.0.1:15896`.

The bundled biometric bridge is still required internally because the DigitalPersona U.are.U and SecuGen FDx SDKs are native Windows software. The client does not need to run a separate batch file; the desktop app starts the bridge automatically.

## Build Commands

Install dependencies once:

```powershell
npm install
```

Run the desktop app locally:

```powershell
npm run windows:run
```

Build Windows package:

```powershell
npm run windows:build
```

If Electron Builder cannot rename `win-unpacked.tmp`, the already extracted runtime can be manually assembled from `dist-windows\win-unpacked.tmp` into `dist-windows\win-unpacked`, then packaged with:

```powershell
npx electron-builder --prepackaged dist-windows\win-unpacked --win portable
```

## Client Machine Requirements

- Windows 10/11 64-bit
- DigitalPersona U.are.U SDK/driver or SecuGen FDx SDK Pro for Windows installed
  - SecuGen Hamster Pro (HUPx) requires `SecuGen.FDxSDKPro.Windows.dll` and `sgfplib.dll` beside `URU4500Bridge.exe`, available through the SecuGen FDx SDK/driver install. You can also point the bridge at the SDK `bin` folder with `SECUGEN_FDX_SDK`.
- URU 4500 / SecuGen Hamster Pro reader connected by USB
- Firewall must allow local loopback access to `127.0.0.1:15896`



