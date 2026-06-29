const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const https = require('https');
const { pathToFileURL } = require('url');

const bridgePort = 15896;
let mainWindow;
let splashWindow;
let bridgeProcess = null;
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

const firebaseConfig = {
  apiKey: 'AIzaSyAA7uvWdIsP9CqFGJEk5SB0FvLFF97DNk4',
  authDomain: 'gen-lang-client-0314098400.firebaseapp.com',
  projectId: 'gen-lang-client-0314098400',
  databaseId: 'ai-studio-0ab7c3a1-e4ca-49b5-86f4-6883897b9163',
  storageBucket: 'gen-lang-client-0314098400.firebasestorage.app',
  messagingSenderId: '279125201448',
  appId: '1:279125201448:web:60c148c137e9fd60a2db1d',
  portalUrl: 'https://attendance.binishaqsoft.com',
};

let firebaseSdkPromise = null;

const seedEmployees = [
  { id: 'emp1', employeeCode: 'IND-KHI-001', fullName: 'Ali Raza Khan', departmentId: 'd1', designationId: 'ds1', branchId: 'b1', status: 'Active', fingerprintTemplates: [] },
  { id: 'emp2', employeeCode: 'IND-KHI-002', fullName: 'Sara Ahmed', departmentId: 'd2', designationId: 'ds2', branchId: 'b1', status: 'Active', fingerprintTemplates: [] },
  { id: 'emp3', employeeCode: 'IND-LHR-003', fullName: 'Muhammad Usman', departmentId: 'd4', designationId: 'ds3', branchId: 'b2', status: 'Active', fingerprintTemplates: [] },
  { id: 'emp4', employeeCode: 'IND-LHR-004', fullName: 'Tariq Mahmood', departmentId: 'd3', designationId: 'ds4', branchId: 'b2', status: 'Active', fingerprintTemplates: [] },
  { id: 'emp5', employeeCode: 'IND-LHR-WS01', fullName: 'Kamran Bashir', departmentId: 'd3', designationId: 'ds5', branchId: 'b2', status: 'Active', fingerprintTemplates: [] },
  { id: 'emp6', employeeCode: 'BINISHAQ-IT-00002', fullName: 'Aqeel Ur Rehman', departmentId: 'd1', designationId: 'ds1', branchId: 'b1', status: 'Active', fingerprintTemplates: [] },
];

const seedBranches = { b1: 'Karachi HQ Office', b2: 'Lahore Distribution Hub' };
const seedDepartments = { d1: 'Information Technology', d2: 'Human Resources', d3: 'Warehouse & Logistics', d4: 'Finance & Accounts' };
const seedDesignations = { ds1: 'Senior Developer', ds2: 'HR Manager', ds3: 'Logistics Coordinator', ds4: 'Warehouse Supervisor', ds5: 'Warehouse Staff' };
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
      ipCameraUrl: '',
      requireCodeWithFingerprint: false,
      requireCodeWithCamera: true,
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

function isDefaultSeedEmployeeList(employees) {
  if (!Array.isArray(employees) || employees.length === 0) return false;
  return employees.every(employee =>
    seedEmployees.some(seed =>
      seed.id === employee.id &&
      seed.employeeCode === employee.employeeCode &&
      seed.fullName === employee.fullName
    )
  );
}

function readStore() {
  try {
    const file = kioskStorePath();
    if (fs.existsSync(file)) {
      const loaded = JSON.parse(fs.readFileSync(file, 'utf8'));
      const defaults = defaultStore();
      const store = { ...defaults, ...loaded, terminal: { ...defaults.terminal, ...(loaded.terminal || {}) } };
      if (isDefaultSeedEmployeeList(store.employees)) store.employees = [];
      return store;
    }
  } catch (error) {
    console.warn('Could not read kiosk store:', error);
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

async function startUru4500Bridge() {
  if (process.platform !== 'win32') return { ok: false, message: 'Windows biometric driver host starts only on Windows.' };
  if (await isBridgePortOpen()) return { ok: true, message: 'Windows biometric driver host already running.' };

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
  addEvent('device', 'Windows biometric driver host started', { bridgePath, logPath });
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
      addEvent('device', 'Windows biometric driver host watchdog failed', error.message);
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
    title: 'Bin Ishaq Attendance Kiosk',
    icon: getAppIconPath(),
    backgroundColor: '#020c17',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      enableBlinkFeatures: 'FaceDetector',
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    closeSplashWindow();
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ─── Firestore REST Helpers ─────────────────────────────────────────────────

function firestoreUrl(collectionName, docId) {
  const base = `/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.databaseId}/documents/${collectionName}`;
  const suffix = docId ? `/${encodeURIComponent(docId)}` : '';
  return `https://firestore.googleapis.com${base}${suffix}?key=${firebaseConfig.apiKey}`;
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  if ('nullValue' in value) return null;
  return undefined;
}

function fromFirestoreFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields || {})) out[key] = fromFirestoreValue(value);
  return out;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, child] of Object.entries(value)) fields[key] = toFirestoreValue(child);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function toFirestoreDocument(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) fields[key] = toFirestoreValue(value);
  return { fields };
}

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = https.request(url, {
      method,
      headers: payload
        ? { 'Content-Type': 'application/json', 'Content-Length': payload.length }
        : { 'Content-Type': 'application/json' },
    }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const parsed = data ? JSON.parse(data) : null;
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else {
          const error = new Error(parsed?.error?.message || `HTTP ${res.statusCode}`);
          error.statusCode = res.statusCode;
          error.url = url.replace(/([?&]key=)[^&]+/, '$1***');
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getFirebaseSdkDb() {
  if (!firebaseSdkPromise) {
    firebaseSdkPromise = Promise.all([
      import('firebase/app'),
      import('firebase/firestore'),
    ]).then(([appMod, firestoreMod]) => {
      const appConfig = {
        apiKey: firebaseConfig.apiKey,
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId,
      };
      const firebaseApp = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(appConfig);
      return {
        db: firestoreMod.getFirestore(firebaseApp, firebaseConfig.databaseId),
        firestoreMod,
      };
    });
  }
  return firebaseSdkPromise;
}

async function fetchFirestoreCollectionViaSdk(collectionName) {
  const { db, firestoreMod } = await getFirebaseSdkDb();
  const snapshot = await firestoreMod.getDocs(firestoreMod.collection(db, collectionName));
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

async function putFirestoreDocumentViaSdk(collectionName, docId, data) {
  const { db, firestoreMod } = await getFirebaseSdkDb();
  await firestoreMod.setDoc(firestoreMod.doc(db, collectionName, docId), data, { merge: true });
}

async function fetchFirestoreCollection(collectionName) {
  try {
    const result = await requestJson('GET', firestoreUrl(collectionName), null);
    return (result.documents || []).map(doc => {
      const id = String(doc.name || '').split('/').pop();
      return { id, ...fromFirestoreFields(doc.fields || {}) };
    });
  } catch (restError) {
    try {
      const records = await fetchFirestoreCollectionViaSdk(collectionName);
      addEvent('sync', `Firestore REST failed for ${collectionName}; Firebase SDK fallback succeeded`, {
        restError: restError.message,
        statusCode: restError.statusCode || null,
        url: restError.url || null,
        count: records.length,
      });
      return records;
    } catch (sdkError) {
      const error = new Error(`${restError.message}; SDK fallback: ${sdkError.message}`);
      error.statusCode = restError.statusCode || null;
      error.url = restError.url || null;
      throw error;
    }
  }
}

async function putFirestoreDocument(collectionName, docId, data) {
  try {
    return await requestJson('PATCH', firestoreUrl(collectionName, docId), toFirestoreDocument(data));
  } catch (restError) {
    try {
      await putFirestoreDocumentViaSdk(collectionName, docId, data);
      addEvent('sync', `Firestore REST write failed for ${collectionName}/${docId}; Firebase SDK fallback succeeded`, {
        restError: restError.message,
        statusCode: restError.statusCode || null,
        url: restError.url || null,
      });
    } catch (sdkError) {
      const error = new Error(`${restError.message}; SDK fallback: ${sdkError.message}`);
      error.statusCode = restError.statusCode || null;
      error.url = restError.url || null;
      throw error;
    }
  }
}

// ─── Core Sync Logic ────────────────────────────────────────────────────────

async function performSync() {
  const store = readStore();
  const report = { employees: 0, attendances: 0, branches: 0, departments: 0, designations: 0, biometricTemplates: 0, pushed: 0, changed: false, errors: [] };

  try {
    const employees = await fetchFirestoreCollection('employees');
    report.changed = report.changed || JSON.stringify(store.employees || []) !== JSON.stringify(employees);
    store.employees = employees;
    report.employees = employees.length;
  } catch (error) {
    report.errors.push(`employees: ${error.message}`);
  }

  for (const collectionName of ['branches', 'departments', 'designations']) {
    try {
      const records = await fetchFirestoreCollection(collectionName);
      report.changed = report.changed || JSON.stringify(store[collectionName] || []) !== JSON.stringify(records);
      store[collectionName] = records;
      report[collectionName] = records.length;
    } catch (error) {
      report.errors.push(`${collectionName}: ${error.message}`);
    }
  }

  try {
    const records = await fetchFirestoreCollection('biometricTemplates');
    report.changed = report.changed || JSON.stringify(store.biometricTemplates || []) !== JSON.stringify(records);
    store.biometricTemplates = records;
    report.biometricTemplates = (store.biometricTemplates || []).length;
  } catch (error) {
    report.errors.push(`biometricTemplates: ${error.message}`);
  }

  try {
    const attendances = await fetchFirestoreCollection('attendances');
    if (attendances.length) {
      const localById = new Map((store.attendances || []).map(item => [item.id, item]));
      for (const log of attendances) localById.set(log.id, { ...localById.get(log.id), ...log });
      store.attendances = Array.from(localById.values());
      report.attendances = attendances.length;
    }
  } catch (error) {
    report.errors.push(`attendances: ${error.message}`);
  }

  const remaining = [];
  for (const item of store.pendingSync || []) {
    try {
      await putFirestoreDocument(item.collection, item.id, item.data);
      report.pushed += 1;
    } catch (error) {
      remaining.push(item);
      report.errors.push(`${item.id}: ${error.message}`);
    }
  }
  store.pendingSync = remaining;
  store.employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  store.lastSync = new Date().toISOString();
  store.lastSyncReport = report;
  writeStore(store);
  addEvent('sync', 'Kiosk sync completed', report);
  return { report, store };
}

// ─── Employee Helpers ────────────────────────────────────────────────────────

function findEmployeeByCode(employees, rawCode) {
  const code = String(rawCode || '').trim().toLowerCase();
  if (!code) return null;
  return employees.find(emp => {
    const employeeCode = String(emp.employeeCode || '').toLowerCase();
    const id = String(emp.id || '').toLowerCase();
    return employeeCode === code || id === code || employeeCode.endsWith(code);
  }) || null;
}

function todayDate() { return new Date().toISOString().slice(0, 10); }
function nowTime() { return new Date().toTimeString().slice(0, 8); }

function getDepartmentName(employee) {
  const store = readStore();
  const dept = (store.departments || []).find(item => item.id === employee.departmentId);
  return dept?.name || dept?.departmentName || seedDepartments[employee.departmentId] || employee.departmentId || '';
}

function getDesignationName(employee) {
  const store = readStore();
  const desig = (store.designations || []).find(item => item.id === employee.designationId);
  return desig?.name || desig?.designationName || seedDesignations[employee.designationId] || employee.designationId || '';
}

function getBranchName(employee) {
  const store = readStore();
  const branch = (store.branches || []).find(item => item.id === employee.branchId);
  return branch?.name || branch?.branchName || seedBranches[employee.branchId] || employee.branchId || '';
}

function kioskEmployee(employee) {
  if (!employee) return null;
  return {
    ...employee,
    fingerprintTemplates: getFingerprintTemplates(employee),
    departmentName: getDepartmentName(employee),
    designationName: getDesignationName(employee),
    branchName: getBranchName(employee),
    pictureUrl: employee.pictureUrl || employee.photoUrl || employee.profileImage || employee.imageUrl || '',
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

function normalizeFaceDescriptor(value) {
  if (!value || typeof value !== 'object') return null;
  const vector = Array.isArray(value.vector) ? value.vector.map(Number).filter(Number.isFinite) : [];
  if (value.version !== 2 || vector.length !== 1280) return null;
  return {
    version: 2,
    vector,
    capturedAt: value.capturedAt || '',
    source: value.source || '',
  };
}

function getFaceDescriptors(employee) {
  const source =
    employee?.faceDescriptors ||
    employee?.faces ||
    employee?.biometrics?.faceDescriptors ||
    employee?.biometric?.faceDescriptors ||
    [];
  const list = Array.isArray(source) ? source : [source];
  return list.map(normalizeFaceDescriptor).filter(Boolean);
}

function compareFaceDescriptors(a, b) {
  const length = a?.vector?.length || 0;
  if (!length || length !== (b?.vector?.length || 0)) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const delta = Number(a.vector[i]) - Number(b.vector[i]);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function identifyFaceDescriptor(employees, probe, threshold = 0.50) {
  const normalizedProbe = normalizeFaceDescriptor(probe);
  if (!normalizedProbe) return { ok: false, message: 'Camera face descriptor was invalid. Try another capture.' };

  let best = null;
  let secondScore = Number.POSITIVE_INFINITY;
  let secondEmployeeId = '';
  for (const employee of employees || []) {
    for (const descriptor of getFaceDescriptors(employee)) {
      const score = compareFaceDescriptors(normalizedProbe, descriptor);
      if (!Number.isFinite(score)) continue;
      if (!best || score < best.score) {
        if (best && best.employee.id !== employee.id) {
          secondScore = best.score;
          secondEmployeeId = best.employee.id;
        }
        best = { employee, score };
      } else if (employee.id !== best.employee.id && score < secondScore) {
        secondScore = score;
        secondEmployeeId = employee.id;
      }
    }
  }

  if (!best) return { ok: false, message: 'No v2 camera face profiles found. Re-enroll employee faces from HR biometric setup.' };
  if (best.score > threshold) {
    return { ok: false, message: 'Face not recognized. Improve lighting or re-enroll the employee camera profile.', score: best.score };
  }
  const margin = secondScore - best.score;
  if (secondEmployeeId && Number.isFinite(secondScore) && secondScore < threshold && margin < 0.10) {
    return { ok: false, message: 'Face match is not unique enough. Use full face, better light, or enter employee code with camera.', score: best.score, margin };
  }
  return { ok: true, employee: best.employee, score: best.score, margin };
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

function computePunch(existingLog, method, terminal, evidenceId, outReason, at) {
  if (!existingLog) {
    return {
      id: `att-kiosk-${Date.now()}`,
      date: todayDate(),
      punchIn: at,
      method,
      status: at > '09:15:00' ? 'Late' : 'Present',
      overtimeMinutes: 0,
      terminalId: terminal.id,
      terminalLocation: terminal.location,
      evidenceId: evidenceId || '',
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
  };
  if (updated.punchIn && at > '18:00:00') {
    const [h, m] = at.split(':').map(Number);
    updated.overtimeMinutes = Math.max(0, (h * 60 + m) - 18 * 60);
  }
  return updated;
}

function savePunch(store, employee, method, evidence, meta) {
  const date = todayDate();
  const existing = (store.attendances || []).find(log => log.employeeId === employee.id && log.date === date);
  const at = nowTime();
  const lastPunchTime = existing?.punchOut || existing?.punchIn || '';
  if (lastPunchTime) {
    const secondsSinceLastPunch = timeToSeconds(at) - timeToSeconds(lastPunchTime);
    if (secondsSinceLastPunch >= 0 && secondsSinceLastPunch < 60) {
      const remaining = 60 - secondsSinceLastPunch;
      return {
        ok: false,
        message: `Please wait ${remaining} second${remaining === 1 ? '' : 's'} before punching again. Minimum delay is 1 minute between punches.`,
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
  const log = { ...computePunch(existing, method, store.terminal, evidence?.id, outReason, at), employeeId: employee.id };
  const next = existing
    ? store.attendances.map(item => item.id === existing.id ? log : item)
    : [log, ...(store.attendances || [])];
  store.attendances = next;
  store.pendingSync = [
    ...(store.pendingSync || []).filter(item => item.id !== log.id),
    { id: log.id, collection: 'attendances', data: log, createdAt: new Date().toISOString() },
  ];
  store.events = [
    { id: `evt-${Date.now()}`, at: new Date().toISOString(), type: 'punch', message: `${employee.fullName} ${log.punchOut ? 'OUT' : 'IN'} via ${method}`, detail: { employeeId: employee.id, ...meta } },
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
  }).catch(error => addEvent('sync-error', `Firestore sync pending for ${log.id}`, error.message));

  return {
    ok: true,
    employee: kioskEmployee(employee),
    log,
    action: log.punchOut ? 'OUT' : 'IN',
    outReason: log.punchOut ? (log.outReason || outReason) : '',
  };
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('kiosk:get-state', async () => {
  const store = readStore();
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  return {
    ...store,
    employees,
    syncTarget: {
      portalUrl: firebaseConfig.portalUrl,
      projectId: firebaseConfig.projectId,
      databaseId: firebaseConfig.databaseId,
      collections: ['employees', 'biometricTemplates', 'branches', 'departments', 'designations', 'attendances'],
    },
    platform: process.platform,
    bridgeRunning: await isBridgePortOpen(),
    storePath: kioskStorePath(),
  };
});

ipcMain.handle('kiosk:lookup-employee', async (_event, code) => {
  const store = readStore();
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const employee = findEmployeeByCode(employees, code);
  if (!employee) return { found: false };
  const date = todayDate();
  const todayLog = (store.attendances || []).find(log => log.employeeId === employee.id && log.date === date) || null;
  const action = todayLog?.punchIn && !todayLog?.punchOut ? 'OUT' : 'IN';
  return {
    found: true,
    employee: kioskEmployee(employee),
    todayLog,
    action,
    fingerprintCount: getFingerprintTemplates(employee).length,
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
  return (store.events || []).slice(0, 100);
});

ipcMain.handle('kiosk:save-settings', async (_event, settings) => {
  const store = readStore();
  store.terminal = { ...store.terminal, ...settings };
  writeStore(store);
  if (mainWindow) {
    mainWindow.setKiosk(!!store.terminal.autoFullscreen);
    mainWindow.setFullScreen(!!store.terminal.autoFullscreen);
  }
  addEvent('settings', 'Settings saved', settings);
  return store.terminal;
});

ipcMain.handle('kiosk:sync', async () => {
  try {
    const result = await performSync();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('kiosk:sync-complete', { report: result.report, timestamp: result.store.lastSync });
    }
    return result;
  } catch (error) {
    return {
      report: {
        errors: [error.message],
        employees: 0,
        attendances: 0,
        branches: 0,
        departments: 0,
        designations: 0,
        pushed: 0,
        changed: false,
      },
      store: readStore(),
    };
  }
});

ipcMain.handle('kiosk:punch-by-code', async (_event, payload) => {
  const store = readStore();
  const employee = findEmployeeByCode(store.employees || [], payload.code);
  if (!employee) return { ok: false, message: 'Employee code not found in terminal database.' };
  if (employee.status === 'Terminated') return { ok: false, message: 'This employee account is terminated.' };
  if (employee.status === 'Suspended') return { ok: false, message: 'This employee account is suspended.' };
  return savePunch(store, employee, payload.method || 'RFID', payload.evidence || null, payload.meta || {});
});

ipcMain.handle('kiosk:punch-camera', async (_event, payload) => {
  const store = readStore();
  const employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const typedEmployee = payload.code ? findEmployeeByCode(employees, payload.code) : null;
  if (store.terminal.requireCodeWithCamera && !store.terminal.autoCaptureCamera && !typedEmployee) {
    return { ok: false, message: 'Please enter your employee code before camera punch.' };
  }
  if (payload.code && !typedEmployee) return { ok: false, message: 'Employee code not found in terminal database.' };

  const candidates = typedEmployee ? [typedEmployee] : employees;
  if (typedEmployee && !getFaceDescriptors(typedEmployee).length) {
    return { ok: false, message: 'No camera face profile is enrolled for this employee. Enroll face from HR biometric setup first.' };
  }
  const match = identifyFaceDescriptor(candidates, payload.descriptor);
  if (!match.ok) return match;

  const employee = match.employee;
  if (employee.status === 'Terminated') return { ok: false, message: 'This employee account is terminated.' };
  if (employee.status === 'Suspended') return { ok: false, message: 'This employee account is suspended.' };

  return savePunch(store, employee, 'Camera', payload.evidence || null, {
    ...(payload.meta || {}),
    camera: payload.meta?.camera || 'webcam',
    score: match.score,
    recognizedBy: typedEmployee ? 'camera-code-confirmed' : 'camera-face',
  });
});

ipcMain.handle('kiosk:punch-fingerprint', async (_event, payload) => {
  const store = readStore();
  let employees = mergeEmployeeBiometricTemplates(store.employees || [], store.biometricTemplates || []);
  const typedEmployee = payload.code ? findEmployeeByCode(employees, payload.code) : null;

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
      addEvent('sync-error', 'Fingerprint scan could not refresh employee templates', error.message);
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
    device: match.device,
  });
});

ipcMain.handle('kiosk:test-fingerprint-scanner', async () => {
  const result = await testFingerprintScanner();
  addEvent(result.ok ? 'device' : 'error', result.ok ? 'Fingerprint scanner test passed' : 'Fingerprint scanner test failed', result);
  return result;
});

ipcMain.handle('kiosk:save-evidence', async (_event, payload) => {
  const store = readStore();
  const evidenceDir = path.join(app.getPath('userData'), 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const id = `ev-${Date.now()}`;
  const dataUrl = String(payload.dataUrl || '');
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const file = path.join(evidenceDir, `${id}.jpg`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  const evidence = { id, file, type: payload.type || 'camera', at: new Date().toISOString(), source: payload.source || '' };
  store.evidence = [evidence, ...(store.evidence || [])].slice(0, 1000);
  writeStore(store);
  return evidence;
});

ipcMain.handle('kiosk:start-bridge', ensureBiometricDriverHost);

ipcMain.handle('kiosk:check-bridge', async () => {
  const status = await ensureBiometricDriverHost();
  return { running: !!status.running, message: status.running ? 'Windows biometric driver host is online.' : status.message };
});

ipcMain.handle('kiosk:open-store', async () => {
  await shell.openPath(path.dirname(kioskStorePath()));
  return true;
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

function identifyFingerprint(gallery) {
  return new Promise(resolve => {
    const socket = new WebSocketClient(`ws://127.0.0.1:${bridgePort}`);
    const timeout = setTimeout(() => {
      socket.close();
      resolve({ ok: false, message: 'Fingerprint identification timed out after 45 seconds.' });
    }, 45000);

    socket.on('open', () => {
      socket.send(JSON.stringify({ action: 'Identify', threshold: 2147, gallery }));
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
      resolve({ ok: false, message: `Fingerprint reader not connected: ${error.message}` });
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
      resolve({ ok: false, message: `Scanner test could not connect to driver host: ${error.message}` });
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
      addEvent('sync', 'Startup sync failed; kiosk will use local cache', err.message);
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
          console.warn('Auto-sync error:', err.message);
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
  dialog.showErrorBox('Attendance Kiosk Error', error.stack || error.message);
});
