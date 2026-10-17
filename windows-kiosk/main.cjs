const { app, BrowserWindow, ipcMain, dialog, session, safeStorage } = require('electron');
const { execFile, spawn } = require('child_process');
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
const { createChallengeManager } = require('./liveness.cjs');
const { authorizeCameraAttempt, requireSecureEnrollment } = require('./camera-authorization.cjs');
const { LOW_CONFIDENCE_BIOMETRIC_PERCENT, biometricMatchEvidence, evaluateAttendanceTimes } = require('./attendance-rules.cjs');
const { FACE_IDENTIFY_THRESHOLD, FACE_VERIFY_THRESHOLD, FACE_STRONG_DISTANCE, normalizeFaceDescriptor, identifyFace } = require('./face-match.cjs');

dotenv.config({ quiet: true });

// Load local or packaged environment
const kioskEnvironmentPath = app.isPackaged
  ? path.join(process.resourcesPath, 'kiosk.env')
  : path.join(__dirname, '..', '.env.local');
dotenv.config({ path: kioskEnvironmentPath, quiet: true, override: false });
if (!process.env.PORTAL_URL) process.env.PORTAL_URL = process.env.VITE_API_BASE_URL || process.env.APP_URL || 'https://attendance.binishaqsoft.com';


const bridgePort = 15896;
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
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml('Attendance Kiosk', 'Starting terminal, devices, and sync...'))}`);
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

const kioskPortalUrl = (process.env.PORTAL_URL || process.env.VITE_API_BASE_URL || process.env.APP_URL || 'https://attendance.binishaqsoft.com').replace(/\/$/, '');

const checkoutReasons = [
  'End of Shift',
  'Lunch Break',
  'Tea Break',
  'Official Duty',
  'Client Meeting',
  'Site Visit',
  'Personal Work',
  'Medical Appointment',
  'Emergency Leave',
  'Half-Day Leave',
  'Sick Leave',
  'Prayer',
];

function normalizeCheckoutReason(value) {
  const text = String(value || '').trim();
  return checkoutReasons.find(reason => reason.toLowerCase() === text.toLowerCase()) || '';
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
      ipCameraUrl: '',
      allowCodeOnlyPunch: false,
      requireCodeWithFingerprint: false,
      requireCodeWithCamera: false,
      autoCaptureCamera: true,
      autoCaptureConfigVersion: 1,
      autoFullscreen: true,
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
      const store = { ...defaults, ...loaded, terminal: { ...defaults.terminal, ...(loaded.terminal || {}) } };
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
      return store;
    }
  } catch (error) {
    console.warn('Could not read kiosk store. Starting with an empty local store.');
  }
  return defaultStore();
}

function writeStore(store) {
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

async function startUru4500Bridge() {
  if (process.platform !== 'win32') return { ok: false, message: 'Windows biometric driver host starts only on Windows.' };
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
  bridgeProcess = spawn(bridgePath, [], {
    cwd: path.dirname(bridgePath),
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
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
  const running = await isBridgePortOpen();
  if (running) return { ok: true, running: true, message: 'Windows biometric driver host online.' };
  const started = await startUru4500Bridge();
  return { ...started, running: await isBridgePortOpen() };
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
    title: 'HR Attendance Kiosk',
    icon: getAppIconPath(),
    backgroundColor: '#020c17',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      enableBlinkFeatures: 'FaceDetector',
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    closeSplashWindow();
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function configureCameraPermission() {
  const rendererUrl = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).toString();
  // Trust only the kiosk's own window showing the bundled renderer. Comparing the exact URL text failed when the
  // app was installed under a path with spaces (e.g. C:\Program Files\...), which blocked the camera.
  const normalizeFileUrl = url => {
    try { return decodeURIComponent(new URL(url).pathname).replace(/\\/g, '/').toLowerCase(); } catch { return ''; }
  };
  const trustedPath = normalizeFileUrl(rendererUrl);
  const isTrustedRenderer = webContents => {
    if (!webContents || webContents.isDestroyed()) return false;
    const url = webContents.getURL();
    const trusted = url.startsWith('file:') && normalizeFileUrl(url) === trustedPath;
    return trusted || (!!mainWindow && !mainWindow.isDestroyed() && webContents.id === mainWindow.webContents.id && url.startsWith('file:'));
  };

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
    return key ? { key, name: saved.name || '', registeredAt: saved.registeredAt || null, portalUrl: saved.portalUrl || '' } : null;
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

function publicDeviceRegistration() {
  const registration = readDeviceRegistration();
  return registration
    ? { registered: true, name: registration.name, registeredAt: registration.registeredAt, portalUrl: registration.portalUrl || kioskPortalUrl }
    : { registered: false, portalUrl: kioskPortalUrl };
}

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(url);
    const transport = targetUrl.protocol === 'http:' ? http : https;
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = payload.length;
    const deviceKey = readDeviceRegistration()?.key;
    if (deviceKey) headers['X-Kiosk-Token'] = deviceKey;
    const req = transport.request(targetUrl, { method, headers }, res => {
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
    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchFirestoreCollection(collectionName) {
  const url = `${kioskPortalUrl}/api/kiosk/sync/${encodeURIComponent(collectionName)}`;
  try {
    const result = await requestJson('GET', url, null);
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

async function putFirestoreDocument(collectionName, docId, data) {
  const url = `${kioskPortalUrl}/api/kiosk/punch`;
  return await requestJson('POST', url, { collection: collectionName, documentId: docId, data });
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

async function performSync() {
  const store = readStore();
  const report = { employees: 0, attendances: 0, branches: 0, departments: 0, designations: 0, biometricTemplates: 0, pushed: 0, changed: false, errors: [] };
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
    const percent = Number(configs[0]?.lowConfidenceBiometricPercent);
    store.biometricPolicy = { lowConfidencePercent: Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : LOW_CONFIDENCE_BIOMETRIC_PERCENT };
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
      await putFirestoreDocument(item.collection, item.id, item.data);
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
  if (!report.notRegistered) store.lastSync = new Date().toISOString();
  store.lastSyncReport = report;
  writeStore(store);
  addEvent('sync', 'Kiosk sync completed', report);
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

function todayDate() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toTimeString().slice(0, 8); }

function getDepartmentName(employee) {
  const store = readStore();
  const dept = (store.departments || []).find(item => item.id === employee.departmentId);
  return dept?.name || dept?.departmentName || employee.departmentId || '';
}

function getDesignationName(employee) {
  const store = readStore();
  const desig = (store.designations || []).find(item => item.id === employee.designationId);
  return desig?.name || desig?.designationName || employee.designationId || '';
}

function getBranchName(employee) {
  const store = readStore();
  const branch = (store.branches || []).find(item => item.id === employee.branchId);
  return branch?.name || branch?.branchName || employee.branchId || '';
}

function kioskEmployee(employee) {
  if (!employee) return null;
  return {
    id: employee.id || employee.employeeCode || '',
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    status: employee.status,
    departmentName: getDepartmentName(employee),
    designationName: getDesignationName(employee),
    branchName: getBranchName(employee),
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

function computePunch(existingLog, method, terminal, evidenceId, outReason, at, shift) {
  if (!existingLog) {
    const evaluated = evaluateAttendanceTimes(at, undefined, shift);
    return {
      id: `att-kiosk-${Date.now()}`,
      date: todayDate(),
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
  const evaluated = evaluateAttendanceTimes(updated.punchIn, at, shift, updated.breaks);
  updated.status = evaluated.status;
  updated.overtimeMinutes = evaluated.overtimeMinutes;
  return updated;
}

function savePunch(store, employee, method, evidence, meta) {
  const date = todayDate();
  const existing = (store.attendances || []).find(log => log.employeeId === employee.id && log.date === date);
  const at = nowTime();
  const isReturningFromBreak = canReturnFromTemporaryExit(existing);
  if (existing?.punchIn && existing?.punchOut && !isReturningFromBreak) {
    return {
      ok: false,
      alreadyRecorded: true,
      message: `Attendance is already completed today (${existing.punchIn} to ${existing.punchOut}). Contact HR if it needs correction.`,
      employee: kioskEmployee(employee),
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
    if (secondsSinceLastPunch >= 0 && secondsSinceLastPunch < 120) {
      const remaining = 120 - secondsSinceLastPunch;
      return {
        ok: false,
        alreadyRecorded: true,
        message: `Please wait ${remaining} second${remaining === 1 ? '' : 's'} before punching again. Minimum delay is 2 minutes between punches.`,
        cooldownSeconds: remaining,
        employee: kioskEmployee(employee),
      };
    }
  }
  const isPunchOut = existing?.punchIn && !existing?.punchOut;
  const outReason = isPunchOut ? normalizeCheckoutReason(meta?.outReason || meta?.reason) : '';
  if (isPunchOut && !outReason) {
    return {
      ok: false,
      needsOutReason: true,
      message: 'Select checkout reason before punching out.',
      employee: kioskEmployee(employee),
      action: 'OUT',
      reasons: checkoutReasons,
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
  const log = {
    ...(resumed?.log || computePunch(existing, method, store.terminal, evidence?.id, outReason, at, employee.shift)),
    ...(biometricMatch && { biometricMatch }),
    ...(biometricMatch?.lowConfidence && existing?.regularizationApproved === undefined && {
      regularizationRequested: true,
      requestedAt: new Date().toISOString(),
      regularizationReason: `Low-confidence ${biometricMatch.kind} match (${biometricMatch.strengthPercent}% strength); supervisor verification required.`,
    }),
    employeeId: employee.id,
    employeeName: employee.fullName || '',
    employeeCode: employee.employeeCode || '',
    employeeBranchId: employee.branchId || '',
    terminalBranchId: store.terminal.branchId || '',
    crossBranch: !!(store.terminal.branchId && employee.branchId && store.terminal.branchId !== employee.branchId),
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
    employee: kioskEmployee(employee),
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
  };
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('kiosk:get-state', async () => {
  const store = readStore();
  const branches = (store.branches || []).map(branch => ({
    id: branch.id,
    name: branch.name || branch.branchName || branch.id,
    code: branch.code || '',
    city: branch.city || '',
  }));
  return {
    terminal: store.terminal,
    lastSync: store.lastSync || null,
    employees: (store.employees || []).map(kioskEmployee),
    attendances: (store.attendances || []).map(log => {
      const emp = (store.employees || []).find(e => (e.id && e.id === log.employeeId) || (e.employeeCode && e.employeeCode === log.employeeId));
      return {
        id: log.id,
        employeeId: log.employeeId,
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
    syncTarget: {
      portalUrl: kioskPortalUrl,
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
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const date = todayDate();
  const todayLogs = (store.attendances || []).filter(log => log.date === date);
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
  const todayLog = (store.attendances || []).find(l => l.employeeId === employee.id && l.date === today);
  const isPunchedIn = todayLog?.punchIn && !todayLog?.punchOut;
  const canReturn = canReturnFromTemporaryExit(todayLog);

  return {
    found: true,
    employee: kioskEmployee(employee),
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

ipcMain.handle('kiosk:save-settings', async (_event, settings) => {
  const store = readStore();
  const prevUrl = store.terminal.ipCameraUrl;
  const prevBranchId = store.terminal.branchId;

  store.terminal = {
    ...store.terminal,
    id: settings.id || store.terminal.id,
    location: settings.location || store.terminal.location,
    branchId: settings.branchId ?? store.terminal.branchId,
    ipCameraUrl: settings.ipCameraUrl || '',
    allowCodeOnlyPunch: !!settings.allowCodeOnlyPunch,
    requireCodeWithFingerprint: !!settings.requireCodeWithFingerprint,
    requireCodeWithCamera: false,
    autoCaptureCamera: settings.autoCaptureCamera !== false,
    autoFullscreen: !!settings.autoFullscreen,
  };
  writeStore(store);

  if (settings.branchId !== prevBranchId) {
    addEvent('config', `Terminal branch changed to ${settings.branchId || 'unassigned'}`);
  }
  if (settings.ipCameraUrl !== prevUrl) {
    addEvent('config', settings.ipCameraUrl ? `IP camera configured: ${settings.ipCameraUrl}` : 'IP camera removed');
  }

  return store.terminal;
});

ipcMain.handle('kiosk:device-status', async () => publicDeviceRegistration());

ipcMain.handle('kiosk:register-device', async (_event, payload) => {
  const email = String(payload?.email || '').trim();
  const password = String(payload?.password || '');
  if (!email || !password) return { ok: false, error: 'Enter the kiosk account email and password.' };
  const store = readStore();
  const terminalName = [store.terminal.id, store.terminal.location].filter(Boolean).join(' — ');
  try {
    const result = await requestJson('POST', `${kioskPortalUrl}/api/kiosk/register`, { email, password, terminalName });
    if (!result?.deviceToken) return { ok: false, error: 'The server did not issue a device key.' };
    writeDeviceRegistration({ key: result.deviceToken, name: result.name || terminalName, registeredAt: new Date().toISOString(), portalUrl: kioskPortalUrl });
    addEvent('config', `Kiosk registered with the server as ${result.name || terminalName}`);
    return { ok: true, ...publicDeviceRegistration() };
  } catch (error) {
    return { ok: false, error: error.message || 'Registration failed.' };
  }
});

ipcMain.handle('kiosk:unregister-device', async () => {
  writeDeviceRegistration(null);
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
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const employee = findEmployeeByCode(employees, payload.code);
  if (!employee) return { ok: false, message: `No active employee found with code "${payload.code}".` };
  if (employee.status === 'Terminated') return { ok: false, message: 'This employee account is terminated.' };
  if (employee.status === 'Suspended') return { ok: false, message: 'This employee account is suspended.' };
  return savePunch(store, employee, payload.method || 'RFID', payload.evidence || null, payload.meta || {});
});

ipcMain.handle('kiosk:begin-camera-liveness', async () => {
  const store = readStore();
  if (store.terminal.ipCameraUrl) return { ok: false, message: 'IP camera attendance is blocked because still-image streams cannot prove liveness. Use the local webcam or fingerprint.' };
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
    if (payload.mode !== 'multi-face') cameraChallenges.recordFailure(terminalId);
    return { ok: false, message: 'Employee ID was not found. Cross-branch attendance requires the complete employee ID and face verification.' };
  }

  const candidates = typedEmployee ? [typedEmployee] : employees;
  if (!candidates || candidates.length === 0) {
    if (payload.mode !== 'multi-face') cameraChallenges.recordFailure(terminalId);
    return { ok: false, message: 'No employees found in the local kiosk directory. Please sync the kiosk in Settings.' };
  }
  const secureDescriptorCount = candidates.reduce((count, employee) => count + getFaceDescriptors(employee).length, 0);
  if (secureDescriptorCount === 0) {
    if (payload.mode !== 'multi-face') cameraChallenges.recordFailure(terminalId);
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
    if (payload.mode !== 'multi-face') {
      const failure = cameraChallenges.recordFailure(terminalId);
      return { ...match, lockedUntil: failure.lockedUntil || undefined };
    }
    return match;
  }

  const employee = match.employee;
  if (employee.status === 'Terminated') return { ok: false, message: 'This employee account is terminated.' };
  if (employee.status === 'Suspended') return { ok: false, message: 'This employee account is suspended.' };

  const result = await savePunch(store, employee, 'Camera', payload.evidence || null, {
    ...(payload.meta || {}),
    camera: payload.meta?.camera || 'webcam',
    score: match.score,
    threshold: matchThreshold,
    recognizedBy: crossBranch ? 'cross-branch-code-face-liveness' : typedEmployee ? 'camera-code-face-liveness' : 'camera-face-liveness',
    crossBranch,
    livenessMethod: payload.mode === 'multi-face' ? 'multi-face-walkthrough' : 'active-turn-v1',
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
    ...(payload.meta || {}),
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
      resolve({ ok: false, message: 'Fingerprint reader is unavailable.', correlationId: require('crypto').randomUUID() });
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
      resolve({ ok: false, message: 'Scanner test could not connect to the driver host.', correlationId: require('crypto').randomUUID() });
    });
  });
}

// ─── WebSocket Client (pure Node, no ws dependency) ─────────────────────────

class WebSocketClient {
  constructor(url) {
    this.url = new URL(url);
    this.handlers = {};
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.handshakeDone = false;
    this.connect();
  }
  on(event, fn) { this.handlers[event] = fn; }
  emit(event, payload) { if (this.handlers[event]) this.handlers[event](payload); }
  connect() {
    this.socket = net.createConnection({ host: this.url.hostname, port: Number(this.url.port) }, () => {
      const key = Buffer.from(String(Date.now()) + Math.random()).toString('base64').slice(0, 24);
      this.socket.write([
        `GET / HTTP/1.1`,
        `Host: ${this.url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n'));
    });
    this.socket.on('data', chunk => this.handleData(chunk));
    this.socket.on('error', error => this.emit('error', error));
    this.socket.on('close', () => this.emit('close'));
  }
  send(text) {
    const payload = Buffer.from(text);
    let header;
    if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
    else {
      header = Buffer.alloc(4);
      header[0] = 0x81; header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    }
    const mask = Buffer.from([1, 2, 3, 4]);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }
  close() { try { this.socket.end(); } catch {} }
  handleData(chunk) {
    if (!this.handshakeDone && chunk.toString('utf8').startsWith('HTTP/1.1 101')) {
      this.handshakeDone = true;
      const split = chunk.indexOf('\r\n\r\n');
      this.emit('open');
      if (split >= 0 && split + 4 < chunk.length) this.readFrames(chunk.slice(split + 4));
      return;
    }
    this.readFrames(chunk);
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

  app.whenReady().then(async () => {
    configureCameraPermission();
    createSplashWindow();
    writeStore(readStore());
    if (process.platform === 'win32') {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: app.isPackaged ? [] : [path.join(__dirname, 'main.cjs')],
      });
    }

    await ensureBiometricDriverHost();
    startDriverWatchdog();

    try {
      const result = await performSync();
      addEvent('sync', result.report.changed ? 'Startup sync updated local kiosk data' : 'Startup sync checked local kiosk data', result.report);
    } catch (err) {
      addEvent('sync', 'Startup sync failed; kiosk will use local cache');
    }

    createWindow();

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
