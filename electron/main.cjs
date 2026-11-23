const { app, BrowserWindow, dialog, session, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow;
let splashWindow;
let bridgeProcess;

const bridgePort = 15896;

function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(__dirname, '..', 'assets', 'icon.png');
}

function splashHtml(title, subtitle) {
  const iconUrl = pathToFileURL(getAppIconPath()).toString();
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      height: 100vh;
      display: grid;
      place-items: center;
      font-family: "Segoe UI", Arial, sans-serif;
      background: radial-gradient(circle at 20% 15%, #17365f 0, #08111f 42%, #030712 100%);
      color: #e5f0ff;
      overflow: hidden;
    }
    .card {
      width: 440px;
      min-height: 260px;
      padding: 34px 38px;
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 22px;
      background: rgba(8, 17, 31, 0.82);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45);
      text-align: center;
    }
    img {
      width: 82px;
      height: 82px;
      object-fit: contain;
      margin-bottom: 18px;
      filter: drop-shadow(0 14px 24px rgba(16, 185, 129, 0.2));
    }
    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.02em;
      font-weight: 800;
    }
    p {
      margin: 8px 0 28px;
      color: #93a4bd;
      font-size: 13px;
      font-weight: 600;
    }
    .bar {
      width: 100%;
      height: 5px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.18);
      overflow: hidden;
    }
    .bar span {
      display: block;
      width: 42%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #10b981, #38bdf8);
      animation: load 1.35s ease-in-out infinite;
    }
    .foot {
      margin-top: 16px;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }
    @keyframes load {
      0% { transform: translateX(-110%); }
      100% { transform: translateX(250%); }
    }
  </style>
</head>
<body>
  <div class="card">
    <img src="${iconUrl}" alt="">
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <div class="bar"><span></span></div>
    <div class="foot">Please wait</div>
  </div>
</body>
</html>`;
}

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) return;
  splashWindow = new BrowserWindow({
    width: 500,
    height: 340,
    resizable: false,
    movable: true,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    show: false,
    icon: getAppIconPath(),
    backgroundColor: '#08111f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml('HR & Payroll Suite', 'Starting payroll and attendance services...'))}`);
  splashWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
}

function closeSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function getBridgeExecutablePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'uru4500-bridge', 'URU4500Bridge.exe');
  }

  return path.join(__dirname, '..', 'tools', 'uru4500-bridge', 'bin', 'URU4500Bridge.exe');
}

function isBridgePortOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: bridgePort });
    socket.setTimeout(700);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

async function startUru4500Bridge() {
  if (process.platform !== 'win32') {
    return;
  }

  if (await isBridgePortOpen()) {
    return;
  }

  const bridgePath = getBridgeExecutablePath();
  if (!fs.existsSync(bridgePath)) {
    dialog.showErrorBox(
      'URU 4500 Bridge Missing',
      'Fingerprint bridge is unavailable. Reinstall the application or contact support.'
    );
    return;
  }

  bridgeProcess = spawn(bridgePath, [], {
    cwd: path.dirname(bridgePath),
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
  });

  bridgeProcess.unref();
}

// The app window shows only the bundled dist/index.html (file://). Paths are compared decoded and case-insensitively,
// so an install under C:\Program Files\... (spaces) matches.
const appIndexPath = path.join(__dirname, '..', 'dist', 'index.html');
function normalizedFilePath(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' ? decodeURIComponent(parsed.pathname).replace(/\\/g, '/').replace(/^\/([a-z]:)/i, '$1').toLowerCase() : '';
  } catch { return ''; }
}
const trustedAppPath = normalizedFilePath(pathToFileURL(appIndexPath).toString());
const isAppUrl = url => !!trustedAppPath && normalizedFilePath(url) === trustedAppPath;
const isTrustedContents = contents => !!contents && !contents.isDestroyed() && isAppUrl(contents.getURL());

// Camera (face enrollment, video only), location (mobile punch), sanitized clipboard writes (copy buttons) and
// fullscreen, for the app's own page only. Microphone, notifications, HID/serial/USB, MIDI, screen capture and every
// other permission are refused.
function mediaVideoOnly(details) {
  const types = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
  return types.includes('video') && !types.includes('audio');
}
function configurePermissions() {
  const allowedRequest = (contents, permission, details) => {
    if (!isTrustedContents(contents)) return false;
    if (permission === 'media') return mediaVideoOnly(details);
    return ['geolocation', 'clipboard-sanitized-write', 'fullscreen'].includes(permission);
  };
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(allowedRequest(contents, permission, details)));
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    if (!isTrustedContents(contents)) return false;
    if (permission === 'media') return !details?.mediaType || details.mediaType === 'video';
    return ['geolocation', 'clipboard-sanitized-write', 'fullscreen'].includes(permission);
  });
  session.defaultSession.setDevicePermissionHandler(() => false);
}

// Links to web pages (maps, help) open in the default browser; the printable-document window
// (window.open('', '_blank') in src/data/lifecycle.ts) opens as a sandboxed about:blank child; nothing else opens.
function lockDownContents(contents) {
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => { if (!isAppUrl(url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '') {
      return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false } } };
    }
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' || target.protocol === 'http:') shell.openExternal(target.toString());
    } catch { /* not a URL */ }
    return { action: 'deny' };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'HR & Payroll Suite',
    icon: getAppIconPath(),
    backgroundColor: '#08111f',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      enableBlinkFeatures: 'FaceDetector',
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    closeSplashWindow();
  });

  mainWindow.loadFile(appIndexPath);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Every window, child window and frame: no navigation off the app, no webviews, no pop-ups (see lockDownContents).
  app.on('web-contents-created', (_event, contents) => {
    lockDownContents(contents);
    contents.on('did-create-window', child => {
      // The printable document is static HTML written by the app; it may not navigate anywhere.
      child.webContents.on('will-navigate', event => event.preventDefault());
    });
  });

  app.whenReady().then(async () => {
    configurePermissions();
    createSplashWindow();
    await startUru4500Bridge();
    createWindow();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (bridgeProcess && !bridgeProcess.killed) {
    bridgeProcess.kill();
  }
});
