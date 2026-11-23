const { app, BrowserWindow, ipcMain, dialog, session, safeStorage, Menu, net: electronNet } = require('electron');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');
const https = require('https');
const http = require('http');
const { pathToFileURL } = require('url');
const dotenv = require('dotenv');
const {
  canReturnFromTemporaryExit,
  resumeFromTemporaryExit,
} = require('./attendance-state.cjs');
const { fetchIpCameraFrame, IpCameraStream } = require('./ip-camera.cjs');
const { isRtspUrl, grabRtspFrame, RtspCameraStream } = require('./rtsp-camera.cjs');
const { normalizeCameraSettings, activeIpCameras, resolveCamera, cameraSupportsFaces, publicCameras, mergeSubmittedCameras, directionRefusal, DIRECTION_LABELS, CAMERA_ZOOMS } = require('./camera-config.cjs');
const { createChallengeManager } = require('./liveness.cjs');
const { authorizeCameraAttempt, requireSecureEnrollment } = require('./camera-authorization.cjs');
const {
  LOW_CONFIDENCE_BIOMETRIC_PERCENT, KIOSK_OUT_REASONS, OFFICIAL_BREAK_REASONS,
  biometricMatchEvidence, evaluateAttendanceTimes, policyShift, halfTimeCutoffFor, personalOutAllowanceFor, personalOutMinutes,
  localDateString, findAttendanceLogForPunch,
} = require('./attendance-rules.cjs');
const { FACE_IDENTIFY_THRESHOLD, FACE_VERIFY_THRESHOLD, FACE_STRONG_DISTANCE, normalizeFaceDescriptor, identifyFace } = require('./face-match.cjs');
const { parseSetupCode, normalizeServerAddress, orderedPortalUrls, tryPortalUrls } = require('./setup-code.cjs');
const { evaluatePassiveLiveness } = require('./passive-liveness.cjs');
const { createAdminGuard } = require('./admin-pin.cjs');
const { newBridgeSecret, clientHandshake, verifyBridgeProof, parseHttpResponseHead } = require('./bridge-auth.cjs');

// Server requests use Node's https, which by default trusts only its built-in list of public authorities. Also trust
// the certificates installed in Windows, so a self-hosted server whose certificate comes from the client's own CA
// (deploy/windows/setup/Enable-Https.ps1 + Install-HRPayroll-CA.cmd, or a domain CA) is accepted.
try {
  const tls = require('node:tls');
  if (typeof tls.setDefaultCACertificates === 'function' && typeof tls.getCACertificates === 'function') {
    tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);
  }
} catch (error) {
  console.warn('[Kiosk] Could not load the Windows certificate store; only public certificates are trusted:', error.message);
}

// The data folder (%APPDATA%\<name>: store, device key, queued punches, evidence) keeps its original name so a
// renamed kiosk (productName) upgrades in place without losing data or pairing. Must run before any getPath('userData').
const LEGACY_PRODUCT_NAME = 'Bin Ishaq Attendance Kiosk';
if (app.isPackaged) app.setPath('userData', path.join(app.getPath('appData'), LEGACY_PRODUCT_NAME));

dotenv.config({ quiet: true });

// Load local or packaged environment
const kioskEnvironmentPath = app.isPackaged
  ? path.join(process.resourcesPath, 'kiosk.env')
  : path.join(__dirname, '..', '.env.local');
dotenv.config({ path: kioskEnvironmentPath, quiet: true, override: false });
if (!process.env.PORTAL_URL) process.env.PORTAL_URL = process.env.VITE_API_BASE_URL || process.env.APP_URL || 'https://attendance.binishaqsoft.com';


const bridgePort = 15896;
// Per-session secret for the fingerprint bridge this kiosk starts (see bridge-auth.cjs).
const bridgeSecret = newBridgeSecret();
// DevTools, reload and closing the window with Alt+F4 stay off unless the kiosk is started with KIOSK_DEVTOOLS=1.
const devToolsAllowed = process.env.KIOSK_DEVTOOLS === '1';
// Set only by the PIN-protected Exit, a Windows shutdown / log-off, or a second start of the app that has to quit.
let quitAuthorized = false;
let mainWindow;
let splashWindow;
let bridgeProcess = null;
const cameraChallenges = createChallengeManager();
const cameraReasonAuthorizations = new Map();
let autoSyncTimer = null;
let driverWatchTimer = null;

app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-features', 'FaceDetection');

function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.png');
  }
  return path.join(__dirname, '..', 'assets', 'icon.png');
}

function splashHtml(title, subtitle) {
  let iconSrc = '';
  try {
    const iconData = fs.readFileSync(getAppIconPath());
    iconSrc = `data:image/png;base64,${iconData.toString('base64')}`;
  } catch { /* icon missing, skip */ }
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
      background: radial-gradient(circle at 20% 15%, #064e3b 0, #051525 44%, #020617 100%);
      color: #ecfdf5;
      overflow: hidden;
    }
    .card {
      width: 440px;
      min-height: 260px;
      padding: 34px 38px;
      border: 1px solid rgba(45, 212, 191, 0.24);
      border-radius: 22px;
      background: rgba(5, 21, 37, 0.86);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.46);
      text-align: center;
    }
    img {
      width: 82px;
      height: 82px;
      object-fit: contain;
      margin-bottom: 18px;
      filter: drop-shadow(0 14px 24px rgba(52, 211, 153, 0.22));
    }
    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.02em;
      font-weight: 800;
    }
    p {
      margin: 8px 0 28px;
      color: #9caec4;
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
      background: linear-gradient(90deg, #34d399, #22d3ee);
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
    ${iconSrc ? `<img src="${iconSrc}" alt="">` : ''}
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
    alwaysOnTop: true,
    show: false,
    icon: getAppIconPath(),
    backgroundColor: '#051525',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml('AlJannatMall Attendance Kiosk', 'Starting terminal, devices, and sync...'))}`);
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

// Default server address from kiosk.env. Only used until the kiosk is registered with a setup code, which carries the
// client's own server address(es); see portalUrls() below.
const kioskPortalUrl = (process.env.PORTAL_URL || process.env.VITE_API_BASE_URL || process.env.APP_URL || 'https://attendance.binishaqsoft.com').replace(/\/$/, '');

// Offline-first: every server call gives up after this long, so a dead, slow or captive network can never stall
// the terminal. Without it a sync of seven collections could sit on TCP connects for minutes while the splash
// screen said "Loading".
const KIOSK_HTTP_TIMEOUT_MS = 10000;
const STARTUP_SYNC_TIMEOUT_MS = 8000;
// Set whenever the attendance server answers at all (any HTTP status); a sync that never moves it ran offline.
let lastServerContact = 0;
const withTimeout = (promise, ms, label) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`${label} is taking too long; continuing with the local cache`)), ms);
  promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
});

// Standard checkout list (default). With the company option "three exit buttons" the kiosk offers only
// Duty Off / Personal Out / Office Work ("Office Work" has no effect on attendance when the matching option is on).
const standardCheckoutReasons = [
  'End of Shift', 'Lunch Break', 'Tea Break', 'Official Duty', 'Client Meeting', 'Site Visit',
  'Personal Work', 'Medical Appointment', 'Emergency Leave', 'Half-Day Leave', 'Sick Leave', 'Prayer',
];
const checkoutReasons = [...standardCheckoutReasons, ...KIOSK_OUT_REASONS];

function activeCheckoutReasons(store) {
  return store?.companyOptions?.kioskThreeExitButtons ? [...KIOSK_OUT_REASONS] : [...standardCheckoutReasons];
}

function normalizeCheckoutReason(value) {
  const text = String(value || '').trim().toLowerCase();
  return checkoutReasons.find(reason => reason.toLowerCase() === text) || '';
}

function timeToSeconds(value) {
  const [h, m, s] = String(value || '00:00:00').split(':').map(Number);
  return (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
}

function kioskStorePath() {
  return path.join(app.getPath('userData'), 'attendance-kiosk-store.json');
}

function defaultStore() {
  return {
    terminal: {
      id: 'KIOSK-WIN-01',
      location: 'Main Entrance Gate-1',
      branchId: '',
      cameraSource: 'webcam',
      allowCodeOnlyPunch: false,
      requireCodeWithFingerprint: false,
      requireCodeWithCamera: false,
      autoCaptureCamera: true,
      autoCaptureConfigVersion: 1,
      autoFullscreen: true,
      classicTheme: false,
      // Multi-Face walk-through has no liveness check (a photo can be recognised); off unless an administrator turns
      // it on, and every punch it makes is sent to HR for review.
      allowMultiFaceMode: false,
      // Use a fingerprint bridge that cannot prove it was started by this kiosk (an older URU4500Bridge.exe, or one
      // running as a Windows service). Off: such a bridge is refused.
      allowUnverifiedBridge: false,
    },
    employees: [],
    attendances: [],
    branches: [],
    departments: [],
    designations: [],
    biometricTemplates: [],
    evidence: [],
    pendingSync: [],
    events: [],
    lastSync: null,
    lastSyncReport: null,
  };
}

function readStore() {
  try {
    const file = kioskStorePath();
    if (fs.existsSync(file)) {
      const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
      const defaults = defaultStore();
      // Camera settings of earlier builds (one ipCameraUrl) migrate to camera slot 1.
      const store = { ...defaults, ...loaded, terminal: normalizeCameraSettings({ ...defaults.terminal, ...(loaded.terminal || {}) }) };
      // Earlier builds hardcoded auto-capture off and exposed no usable choice.
      // Migrate that legacy value once; subsequent user changes are preserved.
      if (!loaded.terminal?.autoCaptureConfigVersion) {
        store.terminal.autoCaptureCamera = true;
        store.terminal.autoCaptureConfigVersion = 1;
      }
      if (store.terminal?.branchId && Array.isArray(store.branches) && store.branches.length > 0) {
        if (!store.branches.some(b => b.id === store.terminal.branchId)) {
          store.terminal.branchId = '';
        }
      }
      store.employees = (store.employees || []).map(kioskStoredEmployee);
      // Legacy event details could contain names, identifiers, paths, or raw errors.
      store.events = [];
      return withInstallId(store);
    }
  } catch (error) {
    console.warn('Could not read kiosk store. Starting with an empty local store.');
  }
  return withInstallId(defaultStore());
}

// Identifies this installation on the punches it makes (see kioskInstallIds in savePunch). Created once; the startup
// writeStore(readStore()) saves it before anything else reads the store.
function withInstallId(store) {
  if (!store.terminal.installId) store.terminal.installId = require('crypto').randomUUID();
  return store;
}

// The admin PIN record is written only by the PIN guard. Every other write keeps the PIN record that is on disk now,
// so a long sync that read the store before a PIN was set (or a wrong PIN was counted) cannot write the old copy back.
function writeStore(store, { ownsAdminPin = false } = {}) {
  if (!ownsAdminPin) {
    try {
      const onDisk = JSON.parse(fs.readFileSync(kioskStorePath(), 'utf8'));
      if (onDisk && onDisk.adminPin !== undefined) store.adminPin = onDisk.adminPin;
      else delete store.adminPin;
    } catch { /* no store yet: nothing to keep */ }
  }
  fs.mkdirSync(path.dirname(kioskStorePath()), { recursive: true });
  fs.writeFileSync(kioskStorePath(), JSON.stringify(store, null, 2));
}

function addEvent(type, message, detail) {
  const store = readStore();
  store.events = [
    { id: `evt-${Date.now()}`, at: new Date().toISOString(), type, message, detail: detail || null },
    ...(store.events || []),
  ].slice(0, 500);
  writeStore(store);
}

function getBridgeExecutablePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'uru4500-bridge', 'URU4500Bridge.exe');
  }
  return path.join(__dirname, 'bridge-bin', 'URU4500Bridge.exe');
}

function isBridgePortOpen() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port: bridgePort });
    socket.setTimeout(700);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

// State of the URU4500Bridge Windows service registered by the installer ('RUNNING', 'STOPPED', ...), or
// 'MISSING' when it is not installed. The kiosk cannot start a service without admin rights.
function queryBridgeService() {
  return new Promise(resolve => {
    execFile('sc.exe', ['query', 'URU4500Bridge'], { windowsHide: true, timeout: 5000 }, (_error, stdout) => {
      const match = /STATE\s*:\s*\d+\s+(\w+)/.exec(String(stdout || ''));
      resolve(match ? match[1] : 'MISSING');
    });
  });
}

// A bridge left running by an earlier kiosk session (crash, or one started by the old autostart entries) does not know
// this session's secret. It is stopped once, so the kiosk can start its own; a bridge of another user or a service
// cannot be stopped this way and stays refused unless "allow unverified bridge" is on.
let staleBridgeCheckDone = false;
async function replaceUnverifiedBridge() {
  if (staleBridgeCheckDone || process.platform !== 'win32') return;
  staleBridgeCheckDone = true;
  if (readStore().terminal.allowUnverifiedBridge || !(await isBridgePortOpen())) return;
  const verified = await verifyBridge();
  if (verified.ok) return;
  addEvent('security', `Fingerprint bridge on port ${bridgePort} did not prove it was started by this kiosk (${verified.message}); restarting it`);
  await new Promise(resolve => execFile('taskkill.exe', ['/IM', 'URU4500Bridge.exe', '/F'], { windowsHide: true, timeout: 5000 }, () => resolve()));
  for (let i = 0; i < 10 && await isBridgePortOpen(); i += 1) await new Promise(resolve => setTimeout(resolve, 300));
}

async function startUru4500Bridge() {
  if (process.platform !== 'win32') return { ok: false, message: 'Windows biometric driver host starts only on Windows.' };
  await replaceUnverifiedBridge();
  if (await isBridgePortOpen()) return { ok: true, message: 'Windows biometric driver host already running.' };
  // A running service is still opening its port (or restarting after a crash); a second copy would fight it.
  const serviceState = await queryBridgeService();
  if (serviceState === 'RUNNING' || serviceState === 'START_PENDING') {
    return { ok: true, message: 'Waiting for the URU4500Bridge Windows service to come online.' };
  }

  const bridgePath = getBridgeExecutablePath();
  if (!fs.existsSync(bridgePath)) {
    return { ok: false, message: `Windows biometric driver host not found at: ${bridgePath}` };
  }

  const logPath = path.join(app.getPath('userData'), 'biometric-driver-host.log');
  const logFd = fs.openSync(logPath, 'a');
  // The secret goes in the environment (not the command line, which other programs can list).
  bridgeProcess = spawn(bridgePath, [], {
    cwd: path.dirname(bridgePath),
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    env: { ...process.env, URU4500_BRIDGE_SECRET: bridgeSecret },
  });
  bridgeProcess.once('exit', (code, signal) => {
    addEvent('device', 'Windows biometric driver host exited', { code, signal });
    try { fs.closeSync(logFd); } catch {}
    bridgeProcess = null;
  });
  bridgeProcess.unref();
  addEvent('device', 'Windows biometric driver host started');
  return { ok: true, message: 'Windows biometric driver host started.' };
}

async function ensureBiometricDriverHost() {
  if (!staleBridgeCheckDone) await replaceUnverifiedBridge();
  const running = await isBridgePortOpen();
  if (running) return { ok: true, running: true, message: 'Windows biometric driver host online.' };
  const started = await startUru4500Bridge();
  return { ...started, running: await isBridgePortOpen() };
}

// A bridge registered as a Windows service (older installers, tools\uru4500-bridge\install-service.bat) runs
// in session 0, where the DigitalPersona SDK enumerates no U.are.U / HID reader at all; SecuGen readers still
// work there, which hides the cause. The kiosk cannot remove a service itself, so it says so loudly.
let serviceWarningShown = false;
async function warnIfBridgeRunsAsService() {
  if (process.platform !== 'win32' || serviceWarningShown) return;
  const state = await queryBridgeService();
  if (state !== 'RUNNING' && state !== 'START_PENDING') return;
  serviceWarningShown = true;
  addEvent('error', 'The fingerprint bridge is running as a Windows service, where U.are.U / HID DigitalPersona readers cannot be detected. Install the latest kiosk setup (it removes the service) or run tools\\uru4500-bridge\\uninstall-service.bat as administrator, then restart the kiosk so it starts the bridge in this session.');
}

function startDriverWatchdog() {
  if (driverWatchTimer) clearInterval(driverWatchTimer);
  driverWatchTimer = setInterval(async () => {
    try {
      await ensureBiometricDriverHost();
      if (mainWindow && !mainWindow.isDestroyed()) {
        const running = await isBridgePortOpen();
        mainWindow.webContents.send('kiosk:driver-status', { running });
      }
    } catch (error) {
      addEvent('device', 'Windows biometric driver host watchdog failed');
    }
  }, 15000);
}

function createWindow() {
  const store = readStore();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    kiosk: !!store.terminal.autoFullscreen,
    fullscreen: !!store.terminal.autoFullscreen,
    autoHideMenuBar: true,
    title: 'AlJannatMall Attendance Kiosk',
    icon: getAppIconPath(),
    backgroundColor: '#020c17',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      devTools: devToolsAllowed,
      enableBlinkFeatures: 'FaceDetector',
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    closeSplashWindow();
  });
  lockDownKioskWindow(mainWindow);
  mainWindow.loadFile(rendererIndexPath);
}

const rendererIndexPath = path.join(__dirname, 'renderer', 'index.html');
// file:///C:/Program%20Files/... → "c:/program files/.../renderer/index.html" (spaces and case as Windows sees them).
function normalizedFilePath(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' ? decodeURIComponent(parsed.pathname).replace(/\\/g, '/').replace(/^\/([a-z]:)/i, '$1').toLowerCase() : '';
  } catch { return ''; }
}
const trustedRendererPath = normalizedFilePath(pathToFileURL(rendererIndexPath).toString());
function isAppIndexUrl(url) {
  return !!trustedRendererPath && normalizedFilePath(url) === trustedRendererPath;
}

// The kiosk window shows only renderer/index.html: no menu (Ctrl+R, Ctrl+Shift+I, Ctrl+W accelerators), no DevTools,
// no navigation or pop-up windows, and the window closes only through the PIN-protected Exit (or a Windows shutdown).
function lockDownKioskWindow(window) {
  const contents = window.webContents;
  contents.on('before-input-event', (event, input) => {
    if (devToolsAllowed || input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    const ctrl = input.control || input.meta;
    const blocked = key === 'f12' ||
      (ctrl && input.shift && ['i', 'j', 'c', 'r', 'delete'].includes(key)) ||
      (ctrl && ['r', 'w', 'p', 'o', 's', 'u', 'n', 't'].includes(key)) ||
      (input.alt && key === 'f4') ||
      (ctrl && key === 'f5');
    if (blocked) event.preventDefault();
  });
  contents.on('devtools-opened', () => { if (!devToolsAllowed) contents.closeDevTools(); });
  contents.on('will-navigate', (event, url) => {
    if (!isAppIndexUrl(url)) { event.preventDefault(); addEvent('security', 'Navigation away from the kiosk screen was blocked'); }
  });
  contents.on('will-redirect', (event, url) => { if (!isAppIndexUrl(url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.on('close', event => {
    if (quitAuthorized || devToolsAllowed) return;
    event.preventDefault();
    addEvent('security', 'Closing the kiosk window without the admin PIN was blocked');
  });
  // Windows shutdown / log-off must not be held up by the close guard.
  window.on('session-end', () => { quitAuthorized = true; });
}

// Only the kiosk's own window showing the bundled renderer/index.html. The path is compared decoded and
// case-insensitively, so an install under C:\Program Files\... (spaces) still matches.
function isTrustedRenderer(webContents) {
  if (!webContents || webContents.isDestroyed()) return false;
  if (!mainWindow || mainWindow.isDestroyed() || webContents.id !== mainWindow.webContents.id) return false;
  return isAppIndexUrl(webContents.getURL());
}

// IPC is answered only for the trusted kiosk window (a frame or window that somehow loaded other content gets nothing).
function trustedSender(event) {
  if (!isTrustedRenderer(event?.sender)) return false;
  const frame = event.senderFrame;
  return !frame || (frame.routingId === event.sender.mainFrame?.routingId && isAppIndexUrl(frame.url));
}
const rawHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, handler) => rawHandle(channel, (event, ...args) => {
  if (!trustedSender(event)) {
    addEvent('security', `IPC ${channel} refused: request did not come from the kiosk window`);
    throw new Error('Request refused.');
  }
  return handler(event, ...args);
});

function configureCameraPermission() {
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) =>
    permission === 'media' &&
    isTrustedRenderer(webContents) &&
    (!details?.mediaType || details.mediaType === 'video')
  );

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
    const requestsVideoOnly = mediaTypes.includes('video') && !mediaTypes.includes('audio');
    const allowed = permission === 'media' && isTrustedRenderer(webContents) && requestsVideoOnly;
    if (permission === 'media' && !allowed) {
      addEvent('security', `Camera request refused (${isTrustedRenderer(webContents) ? 'audio or unknown media requested' : 'request did not come from the kiosk window'})`);
    }
    callback(allowed);
  });
}

// ─── Kiosk PostgreSQL API Helpers ──────────────────────────────────────────

// Device key issued by /api/kiosk/register. Kept out of the main store and encrypted with the Windows user's
// DPAPI key when available, so copying the store file to another PC does not copy the kiosk's access.
function deviceKeyPath() {
  return path.join(app.getPath('userData'), 'kiosk-device-key.json');
}

function readDeviceRegistration() {
  try {
    const saved = JSON.parse(fs.readFileSync(deviceKeyPath(), 'utf8'));
    const key = saved.encrypted ? safeStorage.decryptString(Buffer.from(saved.key, 'base64')) : saved.key;
    if (!key) return null;
    // Files written before setup codes only have portalUrl; portalUrls / clientName are then empty.
    return {
      key,
      name: saved.name || '',
      registeredAt: saved.registeredAt || null,
      portalUrl: saved.portalUrl || '',
      portalUrls: Array.isArray(saved.portalUrls) ? saved.portalUrls.filter(url => typeof url === 'string' && url) : [],
      clientName: saved.clientName || '',
      deviceId: saved.deviceId || '',
    };
  } catch {
    return null;
  }
}

function writeDeviceRegistration(registration) {
  if (!registration) {
    try { fs.unlinkSync(deviceKeyPath()); } catch { /* already removed */ }
    return;
  }
  const encrypted = safeStorage.isEncryptionAvailable();
  const key = encrypted ? safeStorage.encryptString(registration.key).toString('base64') : registration.key;
  fs.writeFileSync(deviceKeyPath(), JSON.stringify({ ...registration, key, encrypted }), { mode: 0o600 });
}

// ─── Server address (multi-client) ──────────────────────────────────────────
// Each client runs its own server; a setup code gives the kiosk a primary and an optional fallback address. Every
// server request goes through portalRequest(), which starts at the address that last answered and moves to the next
// one only on a network-level failure (no HTTP status). HTTP 4xx/5xx come from a reachable server and are final.
let activePortalUrl = null;
// When every address failed at network level moments ago, the next requests try only the preferred one, so an
// offline sync costs one timeout per request as before instead of one per address.
let allPortalsFailedAt = 0;
const PORTAL_ALL_FAILED_HOLD_MS = 60 * 1000;

function portalUrls(registration = readDeviceRegistration()) {
  return orderedPortalUrls(registration, kioskPortalUrl, activePortalUrl);
}

function currentPortalUrl(registration = readDeviceRegistration()) {
  return portalUrls(registration)[0] || kioskPortalUrl;
}

function rememberPortalUrl(url, registration) {
  if (!url) return;
  const changed = activePortalUrl && activePortalUrl !== url;
  activePortalUrl = url;
  allPortalsFailedAt = 0;
  if (changed) addEvent('sync', `Server address switched to ${url}`);
  if (registration && registration.portalUrl !== url) {
    try { writeDeviceRegistration({ ...registration, portalUrl: url }); } catch (error) { console.warn('[Kiosk] Could not save the working server address:', error.message); }
  }
}

async function portalRequest(method, pathname, body) {
  const registration = readDeviceRegistration();
  const urls = portalUrls(registration);
  const candidates = urls.length > 1 && Date.now() - allPortalsFailedAt < PORTAL_ALL_FAILED_HOLD_MS ? urls.slice(0, 1) : urls;
  try {
    const { url, result } = await tryPortalUrls(candidates, base => requestJson(method, `${base}${pathname}`, body));
    rememberPortalUrl(url, registration);
    return result;
  } catch (error) {
    if (error?.statusCode) rememberPortalUrl(error.portalUrl, registration);
    else if (candidates.length === urls.length) allPortalsFailedAt = Date.now();
    throw error;
  }
}

function publicDeviceRegistration() {
  const registration = readDeviceRegistration();
  const urls = portalUrls(registration);
  const portalUrl = urls[0] || kioskPortalUrl;
  // Primary = first address of the setup code (or the only address of an older registration).
  const primaryUrl = registration?.portalUrls?.[0] || registration?.portalUrl || kioskPortalUrl;
  const server = {
    portalUrl,
    portalUrls: urls,
    primaryUrl,
    usingFallback: urls.length > 1 && portalUrl !== primaryUrl,
  };
  return registration
    ? { registered: true, name: registration.name, registeredAt: registration.registeredAt, clientName: registration.clientName || '', ...server }
    : { registered: false, clientName: '', ...server };
}

// IP camera credentials live only on the terminal: the password is encrypted with Windows DPAPI when available and is
// never sent to the renderer or the server. See windows-kiosk/ip-camera.cjs for the frame fetch.
function encryptSecret(text) {
  const encrypted = safeStorage.isEncryptionAvailable();
  return { encrypted, value: encrypted ? safeStorage.encryptString(text).toString('base64') : text };
}
function decryptSecret(secret) {
  if (!secret || typeof secret.value !== 'string') return '';
  try { return secret.encrypted ? safeStorage.decryptString(Buffer.from(secret.value, 'base64')) : secret.value; } catch { return ''; }
}
// Terminal as sent to the renderer: camera passwords are replaced by "passwordSet".
function publicTerminal(terminal) {
  const normalized = normalizeCameraSettings(terminal || {});
  return { ...normalized, ipCameras: publicCameras(normalized.ipCameras) };
}

function requestJson(method, url, body, { sendDeviceKey = true } = {}) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const transport = targetUrl.protocol === 'http:' ? http : https;
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = payload.length;
    const deviceKey = sendDeviceKey ? readDeviceRegistration()?.key : null;
    if (deviceKey) headers['X-Kiosk-Token'] = deviceKey;
    const req = transport.request(targetUrl, { method, headers }, res => {
      lastServerContact = Date.now();
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch (e) {
          parsed = null;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed || {});
        } else {
          const error = new Error(parsed?.error?.message || parsed?.error || `HTTP ${res.statusCode}`);
          error.statusCode = res.statusCode;
          error.url = url;
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(KIOSK_HTTP_TIMEOUT_MS, () => {
      req.destroy(Object.assign(new Error('The attendance server did not respond in time'), { code: 'ETIMEDOUT' }));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchFirestoreCollection(collectionName) {
  try {
    const result = await portalRequest('GET', `/api/kiosk/sync/${encodeURIComponent(collectionName)}`, null);
    return (result?.documents || []).map(doc => ({ id: doc.id || doc.document_id, ...doc }));
  } catch (error) {
    console.warn(`[Kiosk Sync] PostgreSQL fetch failed for ${collectionName}:`, error.message);
    throw error;
  }
}

async function fetchFirestoreCollectionByField(collectionName, fieldName, value) {
  const all = await fetchFirestoreCollection(collectionName);
  return all.filter(item => item[fieldName] === value);
}

async function fetchFirestoreCollectionByIds(collectionName, fieldName, values) {
  const set = new Set((values || []).map(String).filter(Boolean));
  const all = await fetchFirestoreCollection(collectionName);
  return all.filter(item => set.has(String(item[fieldName])));
}

async function putFirestoreDocument(collectionName, docId, data, { queued = false } = {}) {
  // documentId makes the punch idempotent on the server, so retrying it on the fallback address after a timeout is safe.
  // deviceSentAt / queued let the server flag a wrong kiosk clock or a punch that arrives long after it was made.
  return await portalRequest('POST', '/api/kiosk/punch', { collection: collectionName, documentId: docId, data, deviceSentAt: new Date().toISOString(), queued: !!queued });
}

async function findEmployeeForCrossBranchCamera(code, _currentBranchId) {
  const allEmployees = await fetchFirestoreCollection('employees');
  const employee = findEmployeeByCode(allEmployees.map(kioskStoredEmployee), code);
  if (!employee) return null;

  try {
    const templates = await fetchFirestoreCollection('biometricTemplates');
    const matchedTemplates = templates.filter(t => String(t.employeeId) === String(employee.id));
    return mergeEmployeeBiometricTemplates([employee], matchedTemplates)[0] || employee;
  } catch {
    return employee;
  }
}

async function loadCrossBranchAttendanceContext(store, employeeId) {
  try {
    const attendances = await fetchFirestoreCollection('attendances');
    const employeeLogs = attendances.filter(a => String(a.employeeId) === String(employeeId));
    const localById = new Map((store.attendances || []).map(item => [item.id, item]));
    for (const log of employeeLogs) {
      localById.set(log.id, { ...localById.get(log.id), ...log });
    }
    store.attendances = Array.from(localById.values());
  } catch (error) {
    console.warn('[Cross-Branch Context] Failed to fetch attendance context:', error.message);
  }
}


// ─── Core Sync Logic ────────────────────────────────────────────────────────

// One sync at a time: the startup sync, the renderer's first sync and the 5-minute timer can now overlap, and two
// syncs writing the store together could push the same queued punch twice or drop each other's changes.
let syncInFlight = null;
function performSync() {
  if (!syncInFlight) {
    syncInFlight = performSyncNow().finally(() => { syncInFlight = null; });
  }
  return syncInFlight;
}

async function performSyncNow() {
  const store = readStore();
  const report = { employees: 0, attendances: 0, branches: 0, departments: 0, designations: 0, biometricTemplates: 0, pushed: 0, changed: false, errors: [], reachable: true };
  const contactBefore = lastServerContact;
  // Without a device key the server refuses every download, so the kiosk keeps matching an old employee list.
  report.notRegistered = !readDeviceRegistration();

  try {
    const records = await fetchFirestoreCollection('branches');
    report.changed = report.changed || JSON.stringify(store.branches || []) !== JSON.stringify(records);
    store.branches = records;
    report.branches = records.length;
  } catch (error) {
    report.errors.push('branches: sync failed');
  }

  // Review cutoff for weak biometric matches comes from the approved statutory configuration.
  try {
    const configs = await fetchFirestoreCollection('statConfig');
    // The portal edits the most recently updated statutory row; mirror that choice instead of trusting row order.
    const config = configs.slice().sort((a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')))[configs.length - 1] || {};
    // A server older than 27 Oct 2026 strips everything but the biometric cutoff from this feed; say so instead of silently
    // keeping the standard exit buttons. The portal always stamps updatedAt, so its absence identifies the old server.
    if (configs.length && !('updatedAt' in config) && !('companyOptions' in config) && !('attendancePolicy' in config)) {
      report.errors.push('server does not send company options / attendance policy to kiosks: update the server folder (server/kiosk.cjs) and restart it');
    }
    const percent = Number(config.lowConfidenceBiometricPercent);
    store.biometricPolicy = { lowConfidencePercent: Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : LOW_CONFIDENCE_BIOMETRIC_PERCENT };
    // Company attendance policy (opening-time grace, half day, duty-off cutoff, personal-out allowance) is applied at the punch.
    const reasonsBefore = activeCheckoutReasons(store).join('|');
    const policy = config.attendancePolicy;
    store.attendancePolicy = policy && typeof policy === 'object' ? policy : {};
    const options = config.companyOptions;
    store.companyOptions = options && typeof options === 'object' ? options : {};
    report.exitButtons = store.companyOptions.kioskThreeExitButtons ? 'three' : 'standard';
    // Visible in the kiosk Activity panel, so a terminal that never receives the option can be spotted.
    if (activeCheckoutReasons(store).join('|') !== reasonsBefore) {
      addEvent('config', store.companyOptions.kioskThreeExitButtons ? 'Exit buttons: Duty Off / Personal Out / Office Work (company option on)' : 'Exit buttons: standard checkout list');
    }
  } catch (error) {
    report.errors.push('statConfig: sync failed (using last known biometric review cutoff)');
  }

  // Auto-heal invalid or stale branch assignment
  if (store.terminal.branchId && Array.isArray(store.branches) && store.branches.length > 0) {
    const branchExists = store.branches.some(b => b.id === store.terminal.branchId);
    if (!branchExists) {
      console.warn(`[Kiosk Sync] Assigned branchId '${store.terminal.branchId}' not found in database. Clearing to all branches.`);
      store.terminal.branchId = '';
    }
  }

  try {
    const departments = await fetchFirestoreCollection('departments');
    const designations = await fetchFirestoreCollection('designations');
    report.changed = report.changed || JSON.stringify(store.departments || []) !== JSON.stringify(departments);
    report.changed = report.changed || JSON.stringify(store.designations || []) !== JSON.stringify(designations);
    store.departments = departments;
    store.designations = designations;
    report.departments = departments.length;
    report.designations = designations.length;
  } catch (error) {
    report.errors.push('departments/designations: sync failed');
  }

  try {
    const employeeRecords = await fetchFirestoreCollection('employees');
    const employees = employeeRecords.map(kioskStoredEmployee);
    report.changed = report.changed || JSON.stringify(store.employees || []) !== JSON.stringify(employees);
    store.employees = employees;
    report.employees = employees.length;
  } catch (error) {
    report.errors.push('employees: sync failed');
  }

  try {
    const records = await fetchFirestoreCollection('biometricTemplates');
    report.changed = report.changed || JSON.stringify(store.biometricTemplates || []) !== JSON.stringify(records);
    store.biometricTemplates = records;
    report.biometricTemplates = (store.biometricTemplates || []).length;
  } catch (error) {
    report.errors.push('biometricTemplates: sync failed');
  }

  try {
    const attendances = store.terminal.branchId
      ? await fetchFirestoreCollectionByIds('attendances', 'employeeId', (store.employees || []).map(employee => employee.id))
      : await fetchFirestoreCollection('attendances');
    const localById = new Map((store.attendances || []).map(item => [item.id, item]));
    const reconciledById = new Map(attendances.map(log => [log.id, { ...localById.get(log.id), ...log }]));
    for (const item of store.pendingSync || []) {
      if (item.collection !== 'attendances') continue;
      const pendingLog = localById.get(item.id) || item.data;
      if (pendingLog) reconciledById.set(item.id, pendingLog);
    }
    const reconciled = Array.from(reconciledById.values());
    report.changed = report.changed || JSON.stringify(store.attendances || []) !== JSON.stringify(reconciled);
    store.attendances = reconciled;
    report.attendances = attendances.length;
  } catch (error) {
    report.errors.push('attendances: sync failed');
  }

  const remaining = [];
  for (const item of store.pendingSync || []) {
    try {
      await putFirestoreDocument(item.collection, item.id, item.data, { queued: true });
      report.pushed += 1;
    } catch (error) {
      // 400/403/404/409 mean the server will never accept this punch (too old, locked month, inactive
      // employee, conflicting record). Keep it for HR review instead of retrying it forever.
      const permanent = [400, 403, 404, 409].includes(Number(error?.statusCode));
      const who = item.data?.employeeName || item.data?.employeeCode || item.data?.employeeId || 'employee';
      if (permanent) {
        store.rejectedSync = [...(store.rejectedSync || []), { ...item, rejectedAt: new Date().toISOString(), reason: error.message }].slice(-200);
        addEvent('sync-error', `Punch for ${who} on ${item.data?.date || '?'} was not accepted by the server: ${error.message}`);
        report.errors.push(`punch rejected: ${error.message}`);
      } else {
        remaining.push(item);
        report.errors.push(`pending punch not sent: ${error.message || 'connection problem'}`);
      }
    }
  }
  store.pendingSync = remaining;
  store.employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  // Only a sync that reached the server counts; otherwise "last synced" would hide that nothing downloaded.
  report.reachable = lastServerContact > contactBefore;
  if (!report.reachable) report.errors.push('attendance server unreachable (offline); punches stay queued');
  if (report.reachable && !report.notRegistered) store.lastSync = new Date().toISOString();
  store.lastSyncReport = report;
  // Alerts are read from the file as written here, so this sync's save cannot drop or resend them.
  delete store.pendingAlerts;
  writeStore({ ...store, pendingAlerts: readStore().pendingAlerts || [] });
  addEvent('sync', 'Kiosk sync completed', report);
  sendPendingAlerts().catch(() => undefined);
  return { report, store };
}

// ─── Employee Helpers ────────────────────────────────────────────────────────

function findEmployeeByCode(employees, rawCode) {
  const code = String(rawCode || '').trim().toLowerCase();
  if (!code) return null;
  return employees.find(emp => String(emp.employeeCode || '').toLowerCase() === code) || null;
}

async function findEmployeeForCrossBranchCamera(rawCode, terminalBranchId) {
  const code = String(rawCode || '').trim();
  if (!code || !terminalBranchId) return null;
  const variants = [...new Set([code, code.toUpperCase()])];
  let matches = [];
  for (const variant of variants) {
    matches = await fetchFirestoreCollectionByField('employees', 'employeeCode', variant);
    if (matches.length) break;
  }
  if (matches.length !== 1) return null;
  const rawEmployee = matches[0];
  if (!rawEmployee.branchId || rawEmployee.branchId === terminalBranchId) return null;
  const storedEmployee = kioskStoredEmployee(rawEmployee);
  const templates = await fetchFirestoreCollectionByField('biometricTemplates', 'employeeId', storedEmployee.id);
  return mergeEmployeeBiometricTemplates([storedEmployee], templates)[0];
}

async function loadCrossBranchAttendanceContext(store, employeeId) {
  const records = await fetchFirestoreCollectionByField('attendances', 'employeeId', employeeId);
  const otherEmployeeLogs = (store.attendances || []).filter(log => log.employeeId !== employeeId);
  store.attendances = [...otherEmployeeLogs, ...records];
}

// Local calendar date: nowTime() is local, and a UTC date would file punches before 05:00 PKT under yesterday.
function todayDate() { return localDateString(); }
function nowTime() { return new Date().toTimeString().slice(0, 8); }

// Callers pass the store they already loaded. Reading it here instead (as earlier builds did) re-parsed the whole
// store file three times per employee: with ~770 employees and an 8.8 MB store the kiosk:get-state call at startup
// blocked the main process for about 90 seconds, and for several minutes on slower terminals.
function getDepartmentName(employee, store = readStore()) {
  const dept = (store.departments || []).find(item => item.id === employee.departmentId);
  return dept?.name || dept?.departmentName || employee.departmentId || '';
}

function getDesignationName(employee, store = readStore()) {
  const desig = (store.designations || []).find(item => item.id === employee.designationId);
  return desig?.name || desig?.designationName || employee.designationId || '';
}

function getBranchName(employee, store = readStore()) {
  const branch = (store.branches || []).find(item => item.id === employee.branchId);
  return branch?.name || branch?.branchName || employee.branchId || '';
}

function kioskEmployee(employee, store = readStore()) {
  if (!employee) return null;
  return {
    id: employee.id || employee.employeeCode || '',
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    status: employee.status,
    departmentName: getDepartmentName(employee, store),
    designationName: getDesignationName(employee, store),
    branchName: getBranchName(employee, store),
    branchId: employee.branchId || '',
    pictureUrl: employee.pictureUrl || employee.photoUrl || employee.profileImage || employee.imageUrl || '',
  };
}

function kioskStoredEmployee(employee) {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    status: employee.status,
    branchId: employee.branchId,
    departmentId: employee.departmentId,
    designationId: employee.designationId,
    shift: employee.shift && typeof employee.shift === 'object' ? employee.shift : undefined,
    pictureUrl: employee.pictureUrl || '',
    fingerprintTemplates: getFingerprintTemplates(employee),
    faceDescriptors: getFaceDescriptors(employee),
  };
}

function normalizeFingerprintTemplate(template) {
  if (!template) return '';
  if (typeof template === 'string') return template.trim();
  if (typeof template !== 'object') return '';
  return String(
    template.template ||
    template.sample ||
    template.data ||
    template.fmd ||
    template.value ||
    template.base64 ||
    ''
  ).trim();
}

function getFingerprintTemplates(employee) {
  const source =
    employee?.fingerprintTemplates ||
    employee?.fingerprints ||
    employee?.biometricTemplates ||
    employee?.biometrics?.fingerprintTemplates ||
    employee?.biometric?.fingerprintTemplates ||
    [];
  const list = Array.isArray(source) ? source : [source];
  return list.map(normalizeFingerprintTemplate).filter(Boolean);
}

function getFaceDescriptors(employee) {
  const source =
    employee?.faceDescriptors ||
    employee?.faces ||
    employee?.biometrics?.faceDescriptors ||
    employee?.biometric?.faceDescriptors ||
    [];
  const list = Array.isArray(source) ? source : [source];
  // Only identity embeddings (version 4) count; older pixel-based profiles must be re-enrolled.
  return list.map(normalizeFaceDescriptor).filter(Boolean);
}

function buildFingerprintGallery(employees) {
  return (employees || []).flatMap(employee =>
    getFingerprintTemplates(employee).map(template => ({ employeeId: employee.id, template }))
  );
}

function mergeEmployeeBiometricTemplates(employees, biometricRecords) {
  const byEmployeeId = new Map();
  const byEmployeeCode = new Map();
  for (const record of biometricRecords || []) {
    const templates = getFingerprintTemplates(record);
    if (!templates.length) continue;
    const normalized = { ...record, fingerprintTemplates: templates };
    if (record.employeeId || record.id) byEmployeeId.set(String(record.employeeId || record.id), normalized);
    if (record.employeeCode) byEmployeeCode.set(String(record.employeeCode).toLowerCase(), normalized);
  }

  return (employees || []).map(employee => {
    const existingTemplates = getFingerprintTemplates(employee);
    if (existingTemplates.length) return { ...employee, fingerprintTemplates: existingTemplates };
    const match = byEmployeeId.get(String(employee.id)) ||
      byEmployeeCode.get(String(employee.employeeCode || '').toLowerCase());
    if (!match) return employee;
    return { ...employee, fingerprintTemplates: getFingerprintTemplates(match) };
  });
}

function computePunch(existingLog, method, terminal, evidenceId, outReason, at, shift, branch, policy, options) {
  const effectiveShift = policyShift(shift, branch, policy || {});
  if (!existingLog) {
    const workDate = todayDate();
    const evaluated = evaluateAttendanceTimes(at, undefined, effectiveShift, [], { workDate });
    return {
      id: `att-kiosk-${Date.now()}`,
      date: workDate,
      punchIn: at,
      method,
      status: evaluated.status,
      overtimeMinutes: 0,
      terminalId: terminal.id,
      terminalLocation: terminal.location,
      evidenceId: evidenceId || '',
      lastPunchAt: at,
      createdAt: new Date().toISOString(),
    };
  }

  const updated = {
    ...existingLog,
    punchOut: at,
    outReason,
    method,
    terminalId: terminal.id,
    terminalLocation: terminal.location,
    evidenceId: evidenceId || existingLog.evidenceId || '',
    lastPunchAt: at,
  };
  const finalExit = String(outReason || '').toLowerCase() === 'duty off';
  // A night-shift punch-out after midnight closes yesterday's record, so that record's date sets the timings.
  const evaluated = evaluateAttendanceTimes(updated.punchIn, at, effectiveShift, updated.breaks, {
    workDate: existingLog.date,
    ...(options?.officialExitsNotDeducted && { excludedBreakReasons: OFFICIAL_BREAK_REASONS }),
    leaveIfOutBefore: finalExit ? halfTimeCutoffFor(branch, policy || {}) : undefined,
  });
  updated.status = evaluated.status;
  updated.overtimeMinutes = evaluated.overtimeMinutes;
  if (evaluated.policyLeave) {
    updated.policyLeave = true;
    updated.policyLeaveReason = 'Duty off before the branch half time';
  } else {
    delete updated.policyLeave;
    delete updated.policyLeaveReason;
  }
  const personalMinutes = personalOutMinutes(updated.breaks);
  const allowance = personalOutAllowanceFor(branch, policy || {});
  updated.personalOutMinutes = personalMinutes;
  updated.personalOutExceeded = !!(allowance && personalMinutes > allowance);
  return updated;
}

// The same employee cannot punch twice within a minute (a second scan of the same face would otherwise end the visit).
const PUNCH_MIN_GAP_SECONDS = 60;

function savePunch(store, employee, method, evidence, meta) {
  const date = todayDate();
  const at = nowTime();
  const employeeBranch = (store.branches || []).find(item => item.id === employee.branchId);
  // Today's record, or yesterday's still-open night-shift record when the shift crosses midnight.
  const existing = findAttendanceLogForPunch(store.attendances, employee.id, date, at,
    policyShift(employee.shift, employeeBranch, store.attendancePolicy || {}), canReturnFromTemporaryExit);
  const isReturningFromBreak = canReturnFromTemporaryExit(existing);
  if (existing?.punchIn && existing?.punchOut && !isReturningFromBreak) {
    return {
      ok: false,
      alreadyRecorded: true,
      message: `Attendance is already completed today (${existing.punchIn} to ${existing.punchOut}). Contact HR if it needs correction.`,
      employee: kioskEmployee(employee, store),
      attendance: {
        date: existing.date,
        punchIn: existing.punchIn,
        punchOut: existing.punchOut,
        method: existing.method,
        status: existing.status,
      },
      action: 'OUT',
    };
  }
  const lastPunchTime = existing?.lastPunchAt || existing?.punchOut || existing?.punchIn || '';
  if (lastPunchTime) {
    const secondsSinceLastPunch = timeToSeconds(at) - timeToSeconds(lastPunchTime);
    if (secondsSinceLastPunch >= 0 && secondsSinceLastPunch < PUNCH_MIN_GAP_SECONDS) {
      const remaining = PUNCH_MIN_GAP_SECONDS - secondsSinceLastPunch;
      return {
        ok: false,
        alreadyRecorded: true,
        message: `Please wait ${remaining} second${remaining === 1 ? '' : 's'} before punching again. Minimum delay is 1 minute between punches.`,
        cooldownSeconds: remaining,
        employee: kioskEmployee(employee, store),
      };
    }
  }
  // A camera bound to one direction (entrance / exit) only records that direction.
  const presence = isReturningFromBreak ? 'away' : existing?.punchIn && !existing?.punchOut ? 'in' : 'none';
  const refusal = directionRefusal(meta?.direction, presence);
  if (refusal) {
    return { ok: false, directionMismatch: true, message: refusal, employee: kioskEmployee(employee, store), action: meta?.direction === 'in' ? 'IN' : 'OUT' };
  }
  const isPunchOut = existing?.punchIn && !existing?.punchOut;
  // An Out camera records the reason chosen in Settings, or asks when none is set.
  const outReason = isPunchOut ? normalizeCheckoutReason(meta?.outReason || meta?.reason || (meta?.direction === 'out' ? store.terminal.outCameraReason : '')) : '';
  if (isPunchOut && !outReason) {
    return {
      ok: false,
      needsOutReason: true,
      message: 'Select checkout reason before punching out.',
      employee: kioskEmployee(employee, store),
      action: 'OUT',
      reasons: activeCheckoutReasons(store),
    };
  }
  const matchKind = method === 'Camera' ? 'face' : method === 'Biometric' ? 'fingerprint' : null;
  const biometricMatch = matchKind ? biometricMatchEvidence(matchKind, Number(meta?.score), Number(meta?.threshold), store.biometricPolicy?.lowConfidencePercent ?? LOW_CONFIDENCE_BIOMETRIC_PERCENT, matchKind === 'face' ? FACE_STRONG_DISTANCE : 0) : null;
  const resumed = isReturningFromBreak
    ? resumeFromTemporaryExit(existing, {
        at,
        method,
        terminal: store.terminal,
        evidenceId: evidence?.id,
      })
    : null;
  // Review reasons raised by this punch. meta is built in this process (rendererPunchMeta + the matcher's result).
  const reviewReasons = [
    biometricMatch?.lowConfidence && `Low-confidence ${biometricMatch.kind} match (${biometricMatch.strengthPercent}% strength); supervisor verification required.`,
    meta?.livenessMethod === 'multi-face-walkthrough' && 'Multi-Face walk-through punch without a liveness check; verify the evidence photo.',
  ].filter(Boolean);
  const log = {
    ...(resumed?.log || computePunch(existing, method, store.terminal, evidence?.id, outReason, at, employee.shift, employeeBranch, store.attendancePolicy, store.companyOptions)),
    ...(biometricMatch && { biometricMatch }),
    ...(meta?.livenessMethod && { livenessMethod: meta.livenessMethod }),
    ...(reviewReasons.length && existing?.regularizationApproved === undefined && {
      regularizationRequested: true,
      requestedAt: existing?.requestedAt || new Date().toISOString(),
      regularizationReason: [...new Set([...(existing?.regularizationRequested && existing?.regularizationReason ? [existing.regularizationReason] : []), ...reviewReasons])].join('; '),
    }),
    // The server compares the punch time with its own clock (server/kiosk.cjs) and needs the kiosk's UTC offset.
    deviceUtcOffsetMinutes: -new Date().getTimezoneOffset(),
    employeeId: employee.id,
    employeeName: employee.fullName || '',
    employeeCode: employee.employeeCode || '',
    employeeBranchId: employee.branchId || '',
    terminalBranchId: store.terminal.branchId || '',
    crossBranch: !!(store.terminal.branchId && employee.branchId && store.terminal.branchId !== employee.branchId),
    // Every kiosk that punched on this record (IN at one, OUT at another). Terminal ids are often left at the default
    // "KIOSK-WIN-01", so each installation's own random id decides what "attendance marked at this kiosk" means.
    kioskInstallIds: [...new Set([...(Array.isArray(existing?.kioskInstallIds) ? existing.kioskInstallIds : []), store.terminal.installId].filter(Boolean))],
  };
  const next = existing
    ? store.attendances.map(item => item.id === existing.id ? log : item)
    : [log, ...(store.attendances || [])];
  store.attendances = next;
  store.pendingSync = [
    ...(store.pendingSync || []).filter(item => item.id !== log.id),
    { id: log.id, collection: 'attendances', data: log, createdAt: new Date().toISOString() },
  ];
  store.events = [
    { id: `evt-${Date.now()}`, at: new Date().toISOString(), type: 'punch', message: `[REDACTED] ${log.punchOut ? 'OUT' : 'IN'} via ${method}`, detail: null },
    ...(store.events || []),
  ].slice(0, 500);
  writeStore(store);

  putFirestoreDocument('attendances', log.id, log).then(() => {
    const latest = readStore();
    latest.pendingSync = (latest.pendingSync || []).filter(item => item.id !== log.id);
    writeStore(latest);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('kiosk:punch-synced', { id: log.id });
    }
  }).catch(() => addEvent('sync-error', 'Firestore attendance sync pending'));

  return {
    ok: true,
    employee: kioskEmployee(employee, store),
    attendance: {
      date: log.date,
      punchIn: log.punchIn,
      punchOut: log.punchOut,
      method: log.method,
      status: log.status,
      terminalLocation: log.terminalLocation,
    },
    action: isReturningFromBreak ? 'IN' : (log.punchOut ? 'OUT' : 'IN'),
    eventTime: at,
    returnedFromBreak: isReturningFromBreak,
    breakReason: resumed?.breakReason || '',
    outReason: log.punchOut ? (log.outReason || outReason) : '',
    policyLeave: !!log.policyLeave,
    personalOutMinutes: log.personalOutMinutes || 0,
    personalOutExceeded: !!log.personalOutExceeded,
    personalOutAllowanceMinutes: personalOutAllowanceFor(employeeBranch, store.attendancePolicy || {}) || 0,
  };
}

// The kiosk downloads every employee and the company's recent attendance (so anyone can punch anywhere), but its
// screen and counters show only attendance marked at this kiosk: records carrying this installation's id, or the
// server's id for this registered device.
function markedAtThisKiosk(store, deviceId = readDeviceRegistration()?.deviceId || '') {
  const installId = store.terminal.installId;
  return log => (Array.isArray(log.kioskInstallIds) && log.kioskInstallIds.includes(installId)) ||
    (!!deviceId && log.kioskDeviceId === deviceId);
}

// ─── Admin PIN ──────────────────────────────────────────────────────────────
// Settings, Exit, clearing the local cache and removing the device key need the admin PIN (admin-pin.cjs). The hash
// lives in the kiosk store (adminPin), never in what is sent to the renderer.
const adminGuard = createAdminGuard({
  readRecord: () => readStore().adminPin || null,
  writeRecord: record => { const store = readStore(); store.adminPin = record; writeStore(store, { ownsAdminPin: true }); },
});
const ADMIN_REQUIRED = { ok: false, adminRequired: true, message: 'Enter the admin PIN in Settings first.' };
function requireAdmin(action) {
  if (adminGuard.isUnlocked()) return true;
  addEvent('security', `${action} refused: admin PIN not entered`);
  return false;
}
const pinText = value => (typeof value === 'string' ? value.slice(0, 64) : '');

ipcMain.handle('kiosk:admin-status', async () => adminGuard.status());
ipcMain.handle('kiosk:admin-set-pin', async (_event, pin) => {
  const result = adminGuard.setPin(pinText(pin));
  if (result.ok) addEvent('security', result.firstPin ? 'Admin PIN set on this kiosk' : 'Admin PIN changed');
  return result;
});
ipcMain.handle('kiosk:admin-unlock', async (_event, pin) => {
  const result = adminGuard.unlock(pinText(pin));
  if (!result.ok && !result.needsSetup) addEvent('security', result.lockedUntil ? 'Admin PIN locked after repeated wrong entries' : 'Wrong admin PIN entered');
  return result;
});
ipcMain.handle('kiosk:admin-lock', async () => adminGuard.lock());

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('kiosk:get-state', async () => {
  const store = readStore();
  const branches = (store.branches || []).map(branch => ({
    id: branch.id,
    name: branch.name || branch.branchName || branch.id,
    code: branch.code || '',
    city: branch.city || '',
  }));
  // Attendance rows name their employee by id (older rows by code); one lookup table instead of a scan per row.
  const employeeByKey = new Map();
  for (const e of store.employees || []) if (e.id && !employeeByKey.has(e.id)) employeeByKey.set(e.id, e);
  for (const e of store.employees || []) if (e.employeeCode && !employeeByKey.has(e.employeeCode)) employeeByKey.set(e.employeeCode, e);
  const atThisKiosk = markedAtThisKiosk(store);
  return {
    terminal: publicTerminal(store.terminal),
    appVersion: app.getVersion(),
    lastSync: store.lastSync || null,
    employees: (store.employees || []).map(employee => kioskEmployee(employee, store)),
    attendances: (store.attendances || []).map(log => {
      const emp = employeeByKey.get(log.employeeId);
      return {
        id: log.id,
        employeeId: log.employeeId,
        atThisKiosk: atThisKiosk(log),
        employeeName: log.employeeName || emp?.fullName || '',
        employeeCode: log.employeeCode || emp?.employeeCode || '',
        date: log.date,
        punchIn: log.punchIn || '',
        punchOut: log.punchOut || '',
        outReason: log.outReason || '',
        breaks: Array.isArray(log.breaks) ? log.breaks : [],
        lastPunchAt: log.lastPunchAt || '',
        method: log.method,
        status: log.status,
      };
    }),
    branches,
    assignedBranch: branches.find(branch => branch.id === store.terminal.branchId) || null,
    outReasons: activeCheckoutReasons(store),
    syncTarget: {
      portalUrl: currentPortalUrl(),
      portalUrls: portalUrls(),
      backend: 'PostgreSQL',
      collections: ['employees', 'attendances', 'branches', 'departments', 'designations', 'biometricTemplates'],
    },
    platform: process.platform,
    deviceRegistration: publicDeviceRegistration(),
    appVersion: app.getVersion(),
    bridgeRunning: await isBridgePortOpen(),
  };
});

ipcMain.handle('kiosk:get-stats', async () => {
  const store = readStore();
  // Punch counts cover attendance marked at this kiosk only (see markedAtThisKiosk). "Active employees" is every
  // active employee synced to this kiosk (all branches), i.e. everyone who can mark attendance here.
  const atThisKiosk = markedAtThisKiosk(store);
  const localLogs = (store.attendances || []).filter(atThisKiosk);
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const date = todayDate();
  const todayLogs = localLogs.filter(log => log.date === date);
  const punchedIn = todayLogs.filter(log => log.punchIn && !log.punchOut);
  const punchedOut = todayLogs.filter(log => log.punchIn && log.punchOut);
  const activeEmployees = employees.filter(e => e.status === 'Active');
  return {
    totalActive: activeEmployees.length,
    totalWithFingerprint: activeEmployees.filter(e => getFingerprintTemplates(e).length > 0).length,
    inCount: punchedIn.length,
    outCount: punchedOut.length,
    pendingSync: (store.pendingSync || []).length,
    lastSync: store.lastSync || null,
    lastSyncReport: store.lastSyncReport || null,
    bridgeRunning: await isBridgePortOpen(),
  };
});

ipcMain.handle('kiosk:get-events', async () => {
  const store = readStore();
  return store.events || [];
});

ipcMain.handle('kiosk:lookup-employee', async (_event, code) => {
  const store = readStore();
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const employee = findEmployeeByCode(employees, code);
  if (!employee) return { found: false };

  const today = todayDate();
  const lookupBranch = (store.branches || []).find(item => item.id === employee.branchId);
  const todayLog = findAttendanceLogForPunch(store.attendances, employee.id, today, nowTime(),
    policyShift(employee.shift, lookupBranch, store.attendancePolicy || {}), canReturnFromTemporaryExit);
  const isPunchedIn = todayLog?.punchIn && !todayLog?.punchOut;
  const canReturn = canReturnFromTemporaryExit(todayLog);

  return {
    found: true,
    employee: kioskEmployee(employee, store),
    action: isPunchedIn ? 'OUT' : 'IN',
    todayLog: todayLog ? {
      punchIn: todayLog.punchIn || '',
      punchOut: todayLog.punchOut || '',
      outReason: todayLog.outReason || '',
      canReturn,
    } : null,
    fingerprintCount: getFingerprintTemplates(employee).length,
    hasCameraProfile: getFaceDescriptors(employee).length > 0,
  };
});

ipcMain.handle('kiosk:clear-local-attendance-cache', async () => {
  if (!requireAdmin('Clearing the local attendance cache')) return ADMIN_REQUIRED;
  const store = readStore();
  const clearedCount = (store.attendances || []).length;
  const discardedPendingCount = (store.pendingSync || []).filter(item => item.collection === 'attendances').length;

  store.attendances = [];
  store.pendingSync = (store.pendingSync || []).filter(item => item.collection !== 'attendances');
  writeStore(store);
  addEvent('system', `Local attendance cache cleared: ${clearedCount} attendance records, ${discardedPendingCount} pending uploads`);

  return {
    ok: true,
    clearedCount,
    discardedPendingCount,
  };
});

ipcMain.handle('kiosk:save-settings', async (_event, submitted) => {
  if (!requireAdmin('Saving kiosk settings')) return ADMIN_REQUIRED;
  const settings = submitted && typeof submitted === 'object' && !Array.isArray(submitted) ? submitted : {};
  const store = readStore();
  const before = normalizeCameraSettings(store.terminal);
  const prevBranchId = store.terminal.branchId;
  const ipCameras = mergeSubmittedCameras(before.ipCameras, Array.isArray(settings.ipCameras) ? settings.ipCameras : [], encryptSecret);

  store.terminal = normalizeCameraSettings({
    ...store.terminal,
    id: settings.id || store.terminal.id,
    location: settings.location || store.terminal.location,
    branchId: settings.branchId ?? store.terminal.branchId,
    cameraSource: settings.cameraSource === 'ip' ? 'ip' : 'webcam',
    ipCameras,
    outCameraReason: typeof settings.outCameraReason === 'string' ? settings.outCameraReason : '',
    allowCodeOnlyPunch: !!settings.allowCodeOnlyPunch,
    requireCodeWithFingerprint: !!settings.requireCodeWithFingerprint,
    requireCodeWithCamera: false,
    autoCaptureCamera: settings.autoCaptureCamera !== false,
    autoFullscreen: !!settings.autoFullscreen,
    classicTheme: !!settings.classicTheme,
    allowMultiFaceMode: !!settings.allowMultiFaceMode,
    allowUnverifiedBridge: !!settings.allowUnverifiedBridge,
  });
  writeStore(store);
  for (const [field, label] of [['allowCodeOnlyPunch', 'Code-only attendance'], ['allowMultiFaceMode', 'Multi-Face walk-through (passive live check: blink, no phone or screen, head and shoulders)'], ['allowUnverifiedBridge', 'Unverified fingerprint bridge']]) {
    if (!!before[field] !== !!store.terminal[field]) addEvent('security', `${label} ${store.terminal[field] ? 'enabled' : 'disabled'}`);
  }

  if (settings.branchId !== prevBranchId) {
    addEvent('config', `Terminal branch changed to ${settings.branchId || 'unassigned'}`);
  }
  if (before.cameraSource !== store.terminal.cameraSource) {
    addEvent('config', `Camera source: ${store.terminal.cameraSource === 'ip' ? 'IP camera' : 'webcam'}`);
  }
  store.terminal.ipCameras.forEach((camera, index) => {
    const old = before.ipCameras[index];
    if (camera.url !== old.url || camera.direction !== old.direction || camera.name !== old.name || camera.zoom !== old.zoom) {
      addEvent('config', camera.url ? `${camera.name} (${DIRECTION_LABELS[camera.direction]}, zoom ${camera.zoom}x) configured: ${camera.url}` : `${old.name} removed`);
    }
    const typed = settings.ipCameras?.[index]?.password;
    if (camera.url && typeof typed === 'string' && typed) addEvent('config', `${camera.name} credentials updated for user ${camera.user || '(none)'}`);
  });
  // The renderer reopens the live streams with the new URLs / credentials when it is in camera mode.
  stopIpCameraStream();

  return publicTerminal(store.terminal);
});

// Live IP camera picture: the main process holds the connection (it can answer the camera's Digest/Basic login) and
// pushes frames to the renderer. After a refused login the stream waits a minute before trying again: Hikvision and
// similar cameras lock the account (or the kiosk's address) after a handful of failed attempts.
// One stream per camera id; the renderer asks for the cameras it shows (both in Multi-Face mode, the selected one in
// the 1-on-1 challenge) and frames carry the camera id.
const ipCameraStreams = new Map();
function stopIpCameraStream(keepIds = []) {
  for (const [id, stream] of ipCameraStreams) {
    if (keepIds.includes(id)) continue;
    stream.stop();
    ipCameraStreams.delete(id);
  }
}
function sendToKiosk(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
}
function startCameraStream(camera) {
  let refusalLogged = false;
  // rtsp:// URLs are decoded by FFmpeg (H.264/H.265 cameras); http(s) URLs are MJPEG streams or snapshots.
  const Stream = isRtspUrl(camera.url) ? RtspCameraStream : IpCameraStream;
  const stream = new Stream({
    url: camera.url,
    zoom: camera.zoom || 1,
    user: camera.user || '',
    password: decryptSecret(camera.password),
    request: options => electronNet.request(options),
    spawn,
    onFrame: dataUrl => { if (ipCameraStreams.get(camera.id) === stream) sendToKiosk('kiosk:ip-camera-frame', { cameraId: camera.id, ok: true, dataUrl }); },
    onStatus: (message, outcome) => {
      if (ipCameraStreams.get(camera.id) !== stream) return;
      sendToKiosk('kiosk:ip-camera-frame', { cameraId: camera.id, ok: false, message: outcome?.rejected ? `${message} Not retried for a minute to avoid locking the camera account; correct it in Settings (Test camera) and save.` : message });
      if (outcome?.rejected && !refusalLogged) {
        refusalLogged = true;
        addEvent('config', `${camera.name} login refused for user ${camera.user || '(none)'}: ${message}`);
      }
    },
  });
  ipCameraStreams.set(camera.id, stream);
  stream.start();
}
ipcMain.handle('kiosk:start-ip-camera-stream', async (_event, cameraIds) => {
  const { terminal } = readStore();
  const cameras = activeIpCameras(terminal);
  if (!cameras.length) { stopIpCameraStream(); return { ok: false, message: 'No IP camera is configured.' }; }
  const wanted = Array.isArray(cameraIds) && cameraIds.length ? cameras.filter(camera => cameraIds.includes(camera.id)) : cameras;
  stopIpCameraStream(wanted.map(camera => camera.id));
  for (const camera of wanted) if (!ipCameraStreams.has(camera.id)) startCameraStream(camera);
  return { ok: true, cameraIds: wanted.map(camera => camera.id) };
});
ipcMain.handle('kiosk:stop-ip-camera-stream', async () => { stopIpCameraStream(); return { ok: true }; });
app.on('before-quit', () => stopIpCameraStream());

// Settings → "Test camera": tries the values as typed (an unsaved password included) once, so a wrong user or
// password is caught before the preview loop starts.
ipcMain.handle('kiosk:test-ip-camera', async (_event, payload) => {
  // The saved camera password is used for the typed URL, so this is a Settings action.
  if (!requireAdmin('Camera test')) return { ok: false, message: ADMIN_REQUIRED.message, bytes: 0 };
  const { terminal } = readStore();
  const url = String(payload?.url || '').trim();
  const user = String(payload?.user || '').trim();
  const typed = String(payload?.password || '');
  const saved = (terminal.ipCameras || []).find(camera => camera.id === payload?.cameraId);
  const password = typed || (user && saved && user === saved.user ? decryptSecret(saved.password) : '');
  const result = isRtspUrl(url)
    ? await grabRtspFrame({ url, user, password, spawn, zoom: CAMERA_ZOOMS.includes(Number(payload?.zoom)) ? Number(payload.zoom) : 1 })
    : await fetchIpCameraFrame({ url, user, password, request: options => electronNet.request(options) });
  const bytes = result.ok ? Math.round((result.dataUrl.length - result.dataUrl.indexOf(',') - 1) * 3 / 4) : 0;
  return { ok: result.ok, message: result.message || '', bytes };
});

ipcMain.handle('kiosk:device-status', async () => publicDeviceRegistration());

// Preview for the Settings dialog: who the code belongs to and which server it points at, before registering.
ipcMain.handle('kiosk:parse-setup-code', async (_event, text) => {
  try {
    const { clientName, urls } = parseSetupCode(String(text || '').slice(0, 8192));
    return { ok: true, clientName, urls };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

// Two ways to register: a setup code from the client's server (recommended; it also tells the kiosk which server
// address(es) to use), or a Kiosk Terminal account's email and password against the server address typed in
// Settings (e.g. http://192.168.86.83:8080 for a self-hosted server), else the current server address.
ipcMain.handle('kiosk:register-device', async (_event, payload) => {
  // Registering points the kiosk at a server (and its employee list): a Settings action.
  if (!requireAdmin('Kiosk registration')) return { ok: false, error: ADMIN_REQUIRED.message };
  const setupCodeText = String(payload?.setupCode || '').trim();
  let setup = null;
  let body;
  let typedUrl = null;
  if (setupCodeText) {
    try {
      setup = parseSetupCode(setupCodeText);
    } catch (error) {
      return { ok: false, error: error.message };
    }
  } else {
    const email = String(payload?.email || '').trim();
    const password = String(payload?.password || '');
    if (!email || !password) return { ok: false, error: 'Enter the kiosk account email and password.' };
    body = { email, password };
    if (String(payload?.serverUrl || '').trim()) {
      try {
        typedUrl = normalizeServerAddress(payload.serverUrl);
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }
  }
  const store = readStore();
  const terminalName = [store.terminal.id, store.terminal.location].filter(Boolean).join(' — ');
  const previous = readDeviceRegistration();
  const urls = setup ? setup.urls : typedUrl ? [typedUrl] : portalUrls(previous);
  try {
    // A setup code may point at a different client's server: never send it this PC's old device key.
    const { url, result } = await tryPortalUrls(urls, base => (setup
      ? requestJson('POST', `${base}/api/kiosk/register`, { setupToken: setup.token, terminalName }, { sendDeviceKey: false })
      : requestJson('POST', `${base}/api/kiosk/register`, { ...body, terminalName })));
    if (!result?.deviceToken) return { ok: false, error: 'The server did not issue a device key.' };
    writeDeviceRegistration({
      key: result.deviceToken,
      name: result.name || terminalName,
      registeredAt: new Date().toISOString(),
      portalUrl: url,
      portalUrls: urls,
      clientName: setup ? setup.clientName : (previous?.clientName || ''),
      // The server stamps this on every punch it accepts from this kiosk (kioskDeviceId).
      deviceId: result.deviceId || '',
    });
    activePortalUrl = url;
    allPortalsFailedAt = 0;
    const via = setup ? `setup code${setup.clientName ? ` for ${setup.clientName}` : ''}` : 'kiosk account';
    addEvent('config', `Kiosk registered with ${url} as ${result.name || terminalName} (${via})`);
    return { ok: true, ...publicDeviceRegistration() };
  } catch (error) {
    addEvent('config', `Kiosk registration failed: ${error.statusCode ? `HTTP ${error.statusCode} ` : ''}${error.message || ''}`);
    if (error.statusCode === 429) return { ok: false, error: 'Too many sign-in attempts. Wait one minute, then try again.' };
    if (!error.statusCode) {
      const tried = (error.triedUrls || urls).join(' or ');
      return { ok: false, error: `Cannot reach the server at ${tried} (${error.code || error.message}). Check the server address and the network connection.` };
    }
    return { ok: false, error: error.message || 'Registration failed.' };
  }
});

ipcMain.handle('kiosk:unregister-device', async () => {
  if (!requireAdmin('Removing the device key')) return { ...publicDeviceRegistration(), ...ADMIN_REQUIRED };
  writeDeviceRegistration(null);
  activePortalUrl = null;
  allPortalsFailedAt = 0;
  addEvent('config', 'Kiosk device key removed from this PC');
  return publicDeviceRegistration();
});

ipcMain.handle('kiosk:sync', async () => {
  try {
    const result = await performSync();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('kiosk:sync-complete', {
        report: result.report,
        timestamp: result.store.lastSync,
      });
    }
    return { report: result.report, lastSync: result.store.lastSync };
  } catch (error) {
    return {
      report: {
        errors: ['Kiosk sync failed: ' + (error?.message || error)],
        employees: 0,
        attendances: 0,
        branches: 0,
        departments: 0,
        designations: 0,
        pushed: 0,
        changed: false,
      },
      lastSync: null,
    };
  }
});

ipcMain.handle('kiosk:punch-by-code', async (_event, payload) => {
  const store = readStore();
  const allowCodeOnlyPunch = !!store.terminal.allowCodeOnlyPunch;
  if (!allowCodeOnlyPunch) {
    return { ok: false, message: 'Code-only attendance is disabled on this terminal for security. Scan fingerprint or face to punch.' };
  }
  const code = String(payload?.code || '').trim().slice(0, 64);
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const employee = findEmployeeByCode(employees, code);
  if (!employee) return { ok: false, message: `No active employee found with code "${code}".` };
  if (employee.status === 'Terminated') return { ok: false, message: 'This employee account is terminated.' };
  if (employee.status === 'Suspended') return { ok: false, message: 'This employee account is suspended.' };
  // Always recorded as a code punch ('RFID' is the server's method for it): the renderer cannot claim 'Biometric'
  // or supply match scores, evidence or a camera direction.
  return savePunch(store, employee, 'RFID', null, rendererPunchMeta(payload));
});

// The only punch details taken from the renderer: the checkout reason the employee picked. Everything else
// (method, match score and threshold, camera id and direction, evidence) is decided in this process.
function rendererPunchMeta(payload) {
  const outReason = normalizeCheckoutReason(payload?.meta?.outReason);
  return outReason ? { outReason } : {};
}

// Security alerts for HR (a photo or screen held up to a Multi-Face camera). Sent straight away when the server is
// reachable, otherwise kept (max 50) and sent with the next sync. The evidence photo stays on this kiosk.
function queueSecurityAlert(alert) {
  const store = readStore();
  const item = { id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), ...alert };
  store.pendingAlerts = [...(store.pendingAlerts || []), item].slice(-50);
  writeStore(store);
  sendPendingAlerts().catch(() => undefined);
}

let sendingAlerts = false;
async function sendPendingAlerts() {
  if (sendingAlerts || !readDeviceRegistration()) return 0;
  sendingAlerts = true;
  let sent = 0;
  try {
    for (const item of [...(readStore().pendingAlerts || [])]) {
      try {
        await portalRequest('POST', '/api/kiosk/security-alert', { alert: item });
      } catch (error) {
        // No HTTP answer (offline) or a server error: keep it for the next sync. A refusal (4xx) is final.
        const status = Number(error?.statusCode);
        if (!(status >= 400 && status < 500)) break;
      }
      const store = readStore();
      store.pendingAlerts = (store.pendingAlerts || []).filter(other => other.id !== item.id);
      writeStore(store);
      sent += 1;
    }
  } finally {
    sendingAlerts = false;
  }
  return sent;
}

// Evidence ids the renderer passes must be photos this process saved (kiosk:save-evidence) in the last 2 minutes.
function savedEvidence(store, evidence) {
  const id = typeof evidence?.id === 'string' ? evidence.id : '';
  const found = id ? (store.evidence || []).find(item => item.id === id) : null;
  return found && Date.now() - Date.parse(found.at) < 120_000 ? { id: found.id } : null;
}

ipcMain.handle('kiosk:begin-camera-liveness', async (_event, cameraId) => {
  const store = readStore();
  if (!cameraSupportsFaces(resolveCamera(store.terminal, typeof cameraId === 'string' ? cameraId : undefined))) {
    return { ok: false, message: 'This camera cannot prove liveness (snapshot / MJPEG URL, or not configured). Use an rtsp:// camera URL, the local webcam or fingerprint.' };
  }
  return cameraChallenges.begin(store.terminal.id || 'kiosk');
});

ipcMain.handle('kiosk:cancel-camera-liveness', async (_event, challengeId) => {
  const store = readStore();
  return cameraChallenges.cancel(store.terminal.id || 'kiosk', String(challengeId || ''));
});

ipcMain.handle('kiosk:punch-camera', async (_event, payload) => {
  const store = readStore();
  const terminalId = store.terminal.id || 'kiosk';
  const authorization = authorizeCameraAttempt({ payload, terminal: store.terminal, terminalId, challengeManager: cameraChallenges, reasonAuthorizations: cameraReasonAuthorizations });
  if (!authorization.ok) {
    if (!authorization.liveness?.ok) addEvent('security', `Camera liveness rejected: ${authorization.liveness?.message || authorization.message}`);
    const lockMessage = authorization.lockedUntil ? ` Camera is locked until ${new Date(authorization.lockedUntil).toLocaleTimeString()}; use fingerprint.` : '';
    return { ok: false, message: `${authorization.message}${lockMessage}` };
  }
  const liveness = authorization.liveness;
  // Decided by authorizeCameraAttempt from the terminal settings, never by the renderer's mode alone.
  const multiFace = liveness.summary?.method === 'multi-face-walkthrough';
  // Multi-Face passive live check (windows-kiosk/passive-liveness.cjs): blink, no phone/screen/print around the face,
  // and a head with shoulders that belongs to the face. No blink yet is not an attack: the person is asked to blink.
  const passive = multiFace ? evaluatePassiveLiveness(payload.passiveProof) : null;
  if (passive && !passive.ok && !['device', 'no-body'].includes(passive.code)) {
    return { ok: false, needBlink: passive.code === 'blink', message: passive.message };
  }
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  let typedEmployee = payload.code ? findEmployeeByCode(employees, payload.code) : null;
  let crossBranch = false;
  if (payload.code && !typedEmployee && store.terminal.branchId) {
    try {
      typedEmployee = await findEmployeeForCrossBranchCamera(payload.code, store.terminal.branchId);
      if (typedEmployee) {
        crossBranch = true;
        await loadCrossBranchAttendanceContext(store, typedEmployee.id);
      }
    } catch {
      return { ok: false, message: 'Cross-branch verification could not securely retrieve this employee. Check the full employee ID and network connection.' };
    }
  }
  if (payload.code && !typedEmployee) {
    if (!multiFace) cameraChallenges.recordFailure(terminalId);
    return { ok: false, message: 'Employee ID was not found. Cross-branch attendance requires the complete employee ID and face verification.' };
  }

  const candidates = typedEmployee ? [typedEmployee] : employees;
  if (!candidates || candidates.length === 0) {
    if (!multiFace) cameraChallenges.recordFailure(terminalId);
    return { ok: false, message: 'No employees found in the local kiosk directory. Please sync the kiosk in Settings.' };
  }
  const secureDescriptorCount = candidates.reduce((count, employee) => count + getFaceDescriptors(employee).length, 0);
  if (secureDescriptorCount === 0) {
    if (!multiFace) cameraChallenges.recordFailure(terminalId);
    if (!readDeviceRegistration()) {
      return { ok: false, message: 'This kiosk is not registered with the server, so enrolled faces cannot download. Open Settings → Server Registration and sign in with the kiosk account.' };
    }
    return { ok: false, message: 'No face profile enrolled with the current recognition model. Re-enroll this face in the HR portal (Biometric Devices).' };
  }
  // A typed code narrows the gallery; without one the same descriptor matcher
  // searches every securely enrolled employee and enforces uniqueness margin.
  const matchThreshold = typedEmployee ? FACE_VERIFY_THRESHOLD : FACE_IDENTIFY_THRESHOLD;
  const match = identifyFace(candidates, payload.descriptor, {
    threshold: matchThreshold,
    excludeEmployeeIds: Array.isArray(payload.excludeEmployeeIds) ? payload.excludeEmployeeIds.slice(0, 20) : [],
    getDescriptors: getFaceDescriptors,
  });
  if (!match.ok && (match.ambiguous || match.duplicate)) addEvent('security', `Camera match refused: ${match.message} (distance ${Number(match.score).toFixed(3)})`);
  if (!match.ok) {
    if (!multiFace) {
      const failure = cameraChallenges.recordFailure(terminalId);
      return { ...match, lockedUntil: failure.lockedUntil || undefined };
    }
    return match;
  }

  const employee = match.employee;
  if (employee.status === 'Terminated') return { ok: false, message: 'This employee account is terminated.' };
  if (employee.status === 'Suspended') return { ok: false, message: 'This employee account is suspended.' };
  if (passive && !passive.ok) {
    const evidence = savedEvidence(store, payload.evidence);
    const camera = authorization.camera;
    const what = passive.code === 'device' ? `a ${passive.device.label} (photo or screen) around the face` : 'no head and shoulders belonging to the face';
    addEvent('security', `Multi-Face punch refused for ${employee.fullName || employee.employeeCode}: ${what}.`, { employeeId: employee.id, evidenceId: evidence?.id || null, cameraId: camera?.id || '' });
    if (passive.spoof) {
      queueSecurityAlert({
        kind: 'spoof-device', employeeId: employee.id, employeeName: employee.fullName || '', employeeCode: employee.employeeCode || '',
        device: passive.device.label, cameraName: camera?.name || (camera ? 'IP camera' : 'Webcam'), evidenceId: evidence?.id || '',
      });
    }
    return { ok: false, refused: true, spoofSuspected: !!passive.spoof, message: passive.message };
  }

  // Direction and camera identity come from the terminal's settings (resolved by authorizeCameraAttempt), not the payload.
  const camera = authorization.camera;
  const result = await savePunch(store, employee, 'Camera', savedEvidence(store, payload.evidence), {
    ...rendererPunchMeta(payload),
    camera: camera ? 'ip-camera' : 'webcam',
    cameraId: camera?.id || '',
    cameraName: camera?.name || '',
    direction: camera?.direction || 'both',
    score: match.score,
    threshold: matchThreshold,
    recognizedBy: crossBranch ? 'cross-branch-code-face-liveness' : typedEmployee ? 'camera-code-face-liveness' : 'camera-face-liveness',
    crossBranch,
    livenessMethod: multiFace ? 'multi-face-passive-v1' : 'active-turn-v1',
  });
  if (result?.needsOutReason) {
    const token = require('crypto').randomBytes(24).toString('hex');
    cameraReasonAuthorizations.set(token, { terminalId, code: String(payload.code).trim(), expiresAt: Date.now() + 60_000, summary: liveness.summary });
    return { ...result, cameraAuthorization: token };
  }
  if (result?.ok) cameraChallenges.reset(terminalId);
  return result;
});

ipcMain.handle('kiosk:punch-fingerprint', async (_event, payload) => {
  const store = readStore();
  let employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const typedEmployee = payload.code ? findEmployeeByCode(employees, payload.code) : null;

  if (payload.code && !typedEmployee && store.terminal.branchId) {
    return { ok: false, message: 'Cross-branch attendance is allowed only through Camera with the full employee ID and face verification.' };
  }

  if (store.terminal.requireCodeWithFingerprint && !typedEmployee) {
    return { ok: false, message: 'Please enter your employee code before fingerprint scan.' };
  }

  let gallery = buildFingerprintGallery(typedEmployee ? [typedEmployee] : employees);

  if (!gallery.length) {
    try {
      const synced = await performSync();
      const syncedEmployees = mergeEmployeeBiometricTemplates(synced.store.employees || [], synced.store.biometricTemplates || []);
      const syncedTypedEmployee = payload.code ? findEmployeeByCode(syncedEmployees, payload.code) : null;
      employees = syncedEmployees;
      gallery = buildFingerprintGallery(syncedTypedEmployee ? [syncedTypedEmployee] : syncedEmployees);
    } catch (error) {
      addEvent('sync-error', 'Fingerprint scan could not refresh employee templates');
    }
  }

  if (!gallery.length) {
    const checkedCount = typedEmployee ? 1 : employees.length;
    const latestStore = readStore();
    const syncErrors = latestStore.lastSyncReport?.errors || [];
    const syncDetail = syncErrors.length
      ? ` Kiosk sync is currently failing: ${syncErrors.join('; ')}.`
      : '';
    return {
      ok: false,
      message: `No fingerprint templates were found in the kiosk cache for ${checkedCount} employee record${checkedCount === 1 ? '' : 's'}.${syncDetail} Use Test Fingerprint Scanner to confirm the reader captures. Attendance still needs Firestore read permission for employees and biometricTemplates.`,
    };
  }

  const match = await identifyFingerprint(gallery);
  if (!match.ok) return match;
  const employee = employees.find(emp => emp.id === match.employeeId);
  if (!employee) return { ok: false, message: 'Fingerprint matched a missing employee record. Please re-enroll.' };
  return savePunch(store, employee, 'Biometric', null, {
    ...rendererPunchMeta(payload),
    quality: match.quality,
    score: match.score,
    threshold: FINGERPRINT_MATCH_THRESHOLD,
    device: match.device,
  });
});

ipcMain.handle('kiosk:test-fingerprint-scanner', async () => {
  const result = await testFingerprintScanner();
  addEvent(result.ok ? 'device' : 'error', result.ok ? 'Fingerprint scanner test passed' : 'Fingerprint scanner test failed');
  return result;
});

ipcMain.handle('kiosk:save-evidence', async (_event, payload) => {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid evidence payload.');
  const store = readStore();
  const evidenceDir = path.join(app.getPath('userData'), 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const id = `ev-${Date.now()}`;
  const dataUrl = String(payload.dataUrl || '');
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error('Evidence must be a JPEG image.');
  const base64 = match[1];
  if (base64.length > 2_800_000) throw new Error('Evidence image exceeds the 2 MB limit.');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    throw new Error('Evidence image is invalid.');
  }
  const file = path.join(evidenceDir, `${id}.jpg`);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  const evidence = { id, file, type: 'camera', at: new Date().toISOString(), source: payload.source === 'ip-camera' ? 'ip-camera' : 'webcam' };
  const staleEvidence = (store.evidence || []).slice(99);
  for (const stale of staleEvidence) {
    try {
      const stalePath = path.resolve(String(stale.file || ''));
      if (stalePath.startsWith(path.resolve(evidenceDir) + path.sep)) fs.unlinkSync(stalePath);
    } catch {}
  }
  store.evidence = [evidence, ...(store.evidence || [])].slice(0, 100);
  writeStore(store);
  return { id: evidence.id, type: evidence.type, at: evidence.at, source: evidence.source };
});

ipcMain.handle('kiosk:start-bridge', ensureBiometricDriverHost);

ipcMain.handle('kiosk:check-bridge', async () => {
  const status = await ensureBiometricDriverHost();
  return { running: !!status.running, message: status.running ? 'Windows biometric driver host is online.' : status.message };
});

ipcMain.handle('kiosk:exit', async () => {
  if (!requireAdmin('Exit')) return ADMIN_REQUIRED;
  quitAuthorized = true;
  addEvent('system', 'Kiosk closed from Exit button');
  if (mainWindow) {
    mainWindow.setKiosk(false);
    mainWindow.setFullScreen(false);
  }
  app.quit();
  return true;
});

// ─── Fingerprint Identification ─────────────────────────────────────────────

// DigitalPersona dissimilarity threshold for a false-accept rate of 1 in 1,000,000 (0x7FFFFFFF / 1,000,000).
const FINGERPRINT_MATCH_THRESHOLD = 2147;

// Connects, checks the bridge's proof and disconnects; { ok } or { ok: false, message }.
function verifyBridge() {
  return new Promise(resolve => {
    let settled = false;
    const done = result => { if (!settled) { settled = true; clearTimeout(timer); try { socket.close(); } catch {} resolve(result); } };
    const socket = new WebSocketClient(`ws://127.0.0.1:${bridgePort}`, { allowUnverified: false });
    const timer = setTimeout(() => done({ ok: false, message: 'no answer' }), 3000);
    socket.on('open', () => done({ ok: true }));
    socket.on('error', error => done({ ok: false, message: error?.message || 'connection failed' }));
  });
}

function identifyFingerprint(gallery) {
  return new Promise(resolve => {
    const socket = new WebSocketClient(`ws://127.0.0.1:${bridgePort}`);
    const timeout = setTimeout(() => {
      socket.close();
      resolve({ ok: false, message: 'Fingerprint identification timed out after 45 seconds.' });
    }, 45000);

    socket.on('open', () => {
      socket.send(JSON.stringify({ action: 'Identify', threshold: FINGERPRINT_MATCH_THRESHOLD, gallery }));
    });
    socket.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.status === 'IdentifyComplete') {
        clearTimeout(timeout);
        socket.close();
        resolve({
          ok: !!msg.matched,
          employeeId: msg.employeeId,
          quality: msg.quality,
          score: msg.score,
          device: msg.device,
          provider: msg.provider || msg.device?.provider || '',
          message: msg.matched ? 'Fingerprint matched.' : 'Fingerprint not recognized. Please try again.',
          templateLength: String(msg.template || '').length,
          templateSeed: String(msg.template || '').slice(0, 2048),
          imageBase64: msg.imageBase64 || '',
          imageWidth: Number(msg.imageWidth || 0),
          imageHeight: Number(msg.imageHeight || 0),
        });
      }
      if (msg.status === 'Error' || msg.error) {
        clearTimeout(timeout);
        socket.close();
        resolve({ ok: false, message: String(msg.error || msg.message || 'Fingerprint identification failed.') });
      }
    });
    socket.on('error', error => {
      clearTimeout(timeout);
      resolve({ ok: false, message: error?.code === 'BRIDGE_UNVERIFIED' || /refused this kiosk/.test(error?.message || '') ? `${error.message} Restart the kiosk, or ask the administrator.` : 'Fingerprint reader is unavailable.', correlationId: require('crypto').randomUUID() });
    });
  });
}

function testFingerprintScanner() {
  return new Promise(async resolve => {
    const host = await ensureBiometricDriverHost();
    if (!host.running) {
      resolve({ ok: false, message: host.message || 'Windows biometric driver host is not running.' });
      return;
    }

    const socket = new WebSocketClient(`ws://127.0.0.1:${bridgePort}`);
    const timeout = setTimeout(() => {
      socket.close();
      resolve({ ok: false, message: 'Scanner test timed out. Place a finger flat on the fingerprint reader within 30 seconds.' });
    }, 30000);

    socket.on('open', () => {
      socket.send(JSON.stringify({ action: 'StartCapture', format: 'DP_FMD_V20' }));
    });
    socket.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (msg.status === 'CaptureStarted') return;
      if (msg.status === 'CaptureComplete') {
        clearTimeout(timeout);
        socket.close();
        resolve({
          ok: true,
          message: 'Fingerprint scanner captured successfully.',
          quality: msg.quality,
          provider: msg.provider,
          device: msg.device,
          templateLength: String(msg.template || '').length,
          templateSeed: String(msg.template || '').slice(0, 2048),
          imageBase64: msg.imageBase64 || '',
          imageWidth: Number(msg.imageWidth || 0),
          imageHeight: Number(msg.imageHeight || 0),
        });
      }
      if (msg.status === 'Error' || msg.error) {
        clearTimeout(timeout);
        socket.close();
        resolve({ ok: false, message: String(msg.error || msg.message || 'Scanner test failed.') });
      }
    });
    socket.on('error', error => {
      clearTimeout(timeout);
      resolve({ ok: false, message: error?.code === 'BRIDGE_UNVERIFIED' || /refused this kiosk/.test(error?.message || '') ? error.message : 'Scanner test could not connect to the driver host.', correlationId: require('crypto').randomUUID() });
    });
  });
}

// ─── WebSocket Client (pure Node, no ws dependency) ─────────────────────────

// Talks to the fingerprint bridge only after it proved it was started by this kiosk (bridge-auth.cjs). With
// "allow unverified bridge" on, an older bridge without the proof is still used (and an event is logged once).
let unverifiedBridgeLogged = false;
class WebSocketClient {
  constructor(url, { secret = bridgeSecret, allowUnverified = !!readStore().terminal.allowUnverifiedBridge } = {}) {
    this.url = new URL(url);
    this.handlers = {};
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.head = Buffer.alloc(0);
    this.handshakeDone = false;
    this.secret = secret;
    this.allowUnverified = allowUnverified;
    this.verified = false;
    this.connect();
  }
  on(event, fn) { this.handlers[event] = fn; }
  emit(event, payload) { if (this.handlers[event]) this.handlers[event](payload); }
  connect() {
    this.socket = net.createConnection({ host: this.url.hostname, port: Number(this.url.port) }, () => {
      const key = crypto.randomBytes(16).toString('base64');
      const auth = clientHandshake(this.secret);
      this.nonce = auth.nonce;
      this.socket.write([
        `GET / HTTP/1.1`,
        `Host: ${this.url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        ...Object.entries(auth.headers).map(([name, value]) => `${name}: ${value}`),
        '',
        '',
      ].join('\r\n'));
    });
    this.socket.setTimeout(60_000, () => this.fail(new Error('Fingerprint bridge did not answer.')));
    this.socket.on('data', chunk => this.handleData(chunk));
    this.socket.on('error', error => this.emit('error', error));
    this.socket.on('close', () => this.emit('close'));
  }
  fail(error) {
    try { this.socket.destroy(); } catch {}
    const handler = this.handlers.error;
    this.handlers = {};
    if (handler) handler(error);
  }
  send(text) {
    if (!this.handshakeDone) throw new Error('Fingerprint bridge connection is not open.');
    const payload = Buffer.from(text);
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81; header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81; header[1] = 0x80 | 127;
      header.writeUInt32BE(Math.floor(payload.length / 0x100000000), 2);
      header.writeUInt32BE(payload.length % 0x100000000, 6);
    }
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }
  close() { try { this.socket.end(); } catch {} }
  handleData(chunk) {
    if (this.handshakeDone) { this.readFrames(chunk); return; }
    this.head = Buffer.concat([this.head, chunk]);
    const split = this.head.indexOf('\r\n\r\n');
    if (split < 0) {
      if (this.head.length > 16384) this.fail(new Error('Fingerprint bridge sent an invalid handshake.'));
      return;
    }
    const { status, headers } = parseHttpResponseHead(this.head.slice(0, split).toString('latin1'));
    const rest = this.head.slice(split + 4);
    this.head = Buffer.alloc(0);
    if (status !== 101) {
      this.fail(new Error(status === 403 ? 'Fingerprint bridge refused this kiosk (it was started by another program or session).' : `Fingerprint bridge handshake failed (HTTP ${status || '?'}).`));
      return;
    }
    this.verified = verifyBridgeProof(this.secret, this.nonce, headers['x-bridge-proof']);
    if (!this.verified) {
      if (!this.allowUnverified) {
        if (!unverifiedBridgeLogged) addEvent('security', 'Fingerprint bridge could not prove it was started by this kiosk; refused. Update URU4500Bridge.exe or, for an old bridge, enable "Allow unverified fingerprint bridge" in Settings.');
        unverifiedBridgeLogged = true;
        this.fail(Object.assign(new Error('Fingerprint bridge is not verified.'), { code: 'BRIDGE_UNVERIFIED' }));
        return;
      }
      if (!unverifiedBridgeLogged) addEvent('security', 'Using an unverified fingerprint bridge (allowed in Settings)');
      unverifiedBridgeLogged = true;
    }
    this.handshakeDone = true;
    this.emit('open');
    if (rest.length) this.readFrames(rest);
  }
  readFrames(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const lengthByte = this.buffer[1] & 0x7f;
      let offset = 2;
      let length = lengthByte;
      if (lengthByte === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (lengthByte === 127) {
        if (this.buffer.length < 10) return;
        const high = this.buffer.readUInt32BE(2);
        const low = this.buffer.readUInt32BE(6);
        length = high * 0x100000000 + low;
        offset = 10;
      }
      if (this.buffer.length < offset + length) return;
      const payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);
      this.emit('message', payload.toString('utf8'));
    }
  }
}

// ─── Application Lifecycle ───────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // No window, frame or webview created by any page may open further windows or navigate off the kiosk screen.
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', event => event.preventDefault());
  });

  app.whenReady().then(async () => {
    // The default menu carries Reload, Force Reload, Toggle DevTools and Close accelerators.
    Menu.setApplicationMenu(null);
    configureCameraPermission();
    createSplashWindow();
    writeStore(readStore());
    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: app.isPackaged ? [] : [path.join(__dirname, 'main.cjs')],
      });
      // Drop the auto-start entry written under the old product name (it points at the removed program).
      if (app.isPackaged && app.getName() !== LEGACY_PRODUCT_NAME) {
        try { app.setLoginItemSettings({ openAtLogin: false, name: `electron.app.${LEGACY_PRODUCT_NAME}` }); } catch { /* not present */ }
      }
    }

    await ensureBiometricDriverHost();
    startDriverWatchdog();
    warnIfBridgeRunsAsService();

    // The kiosk opens from its local cache straight away; the startup sync runs in the background and is bounded,
    // so with no internet the terminal still comes up and punches queue for the next successful sync.
    createWindow();
    withTimeout(performSync(), STARTUP_SYNC_TIMEOUT_MS, 'Startup sync')
      .then(result => {
        addEvent('sync', result.report.changed ? 'Startup sync updated local kiosk data' : 'Startup sync checked local kiosk data', result.report);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('kiosk:sync-complete', { report: result.report, timestamp: result.store.lastSync });
        }
      })
      .catch(err => addEvent('sync', `Startup sync skipped; kiosk is using the local cache (${err?.message || err})`));

    // Auto-sync every 5 minutes after window is ready
    mainWindow.once('ready-to-show', () => {
      autoSyncTimer = setInterval(async () => {
        try {
          const result = await performSync();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('kiosk:sync-complete', {
              report: result.report,
              timestamp: result.store.lastSync,
            });
          }
        } catch (err) {
          console.warn('Auto-sync failed. Check local diagnostics and connectivity.');
        }
      }, 5 * 60 * 1000);
    });
  });
}

app.on('before-quit', () => {
  // A quit the app itself starts (an installer or updater closing it, Windows shutdown) is allowed to close the
  // locked window; staff can still only exit through Settings with the admin PIN.
  quitAuthorized = true;
  if (autoSyncTimer) clearInterval(autoSyncTimer);
  if (driverWatchTimer) clearInterval(driverWatchTimer);
  if (bridgeProcess && !bridgeProcess.killed) bridgeProcess.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', error => {
  const correlationId = require('crypto').randomUUID();
  console.error(`[${correlationId}] Kiosk process failure`, error);
  try {
    const logPath = path.join(app.getPath('userData'), 'kiosk-error.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}][${correlationId}] ${error?.stack || error}\n`);
  } catch {}
  dialog.showErrorBox('Attendance Kiosk Error', `An unexpected error occurred.\n\nError: ${error?.message || error}\nReference: ${correlationId}`);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Kiosk Unhandled Rejection]', reason);
});
