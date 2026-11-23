// Mock of window.kioskApi (windows-kiosk/preload.cjs) for the video tutorials (chapter 29).
// The real kiosk renderer (windows-kiosk/renderer) is recorded in a browser; this file stands in for the Electron main
// process: AlJannat Mall employees, today's punches at this kiosk, events, stats, server registration, settings.
// No hardware and no server are used. The chapter can switch the kiosk to "not registered" with
// window.__kioskMock.setRegistered(false) to show a brand-new kiosk.
(() => {
  if (window !== window.top || window.kioskApi) return;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clone = value => JSON.parse(JSON.stringify(value));
  const pad = n => String(n).padStart(2, '0');
  const today = () => new Date().toISOString().slice(0, 10); // same day rule as the renderer
  const timeAgo = minutes => {
    const d = new Date(Date.now() - minutes * 60000);
    const total = Math.max(5, d.getHours() * 60 + d.getMinutes() - (d.getDate() !== new Date().getDate() ? 24 * 60 : 0));
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}:${pad(d.getSeconds())}`;
  };
  const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

  const DEMO_PIN = '482915';
  let adminUnlocked = false;
  const branch = { id: 'br-demo-hq', code: 'HQ', name: 'Head Office', city: 'Lahore' };
  const fp = n => Array.from({ length: n }, (_, i) => ({ template: `demo-template-${i + 1}` }));
  const employees = [
    ['emp-e01', 'AJM-HR-00001', 'Ayesha Siddiqui', 'HR Manager', 'Human Resources', 2],
    ['emp-e02', 'AJM-HR-00002', 'Bilal Ahmed', 'HR Officer', 'Human Resources', 2],
    ['emp-e03', 'AJM-FA-00001', 'Imran Qureshi', 'Finance Manager', 'Finance & Accounts', 2],
    ['emp-e04', 'AJM-FA-00002', 'Fatima Noor', 'Accountant', 'Finance & Accounts', 1],
    ['emp-e05', 'AJM-IT-00001', 'Hassan Raza', 'IT Officer', 'Information Technology', 2],
    ['emp-e06', 'AJM-SM-00001', 'Sana Javed', 'Sales Manager', 'Sales & Marketing', 2],
    ['emp-e07', 'AJM-SM-00002', 'Usman Tariq', 'Sales Executive', 'Sales & Marketing', 0],
    ['emp-e08', 'AJM-PRODUC-00001', 'Kashif Mehmood', 'Production Supervisor', 'Production', 2],
    ['emp-e09', 'AJM-PRODUC-00002', 'Zainab Bibi', 'Machine Operator', 'Production', 1],
    ['emp-e10', 'AJM-PRODUC-00003', 'Naveed Akhtar', 'Machine Operator', 'Production', 2],
    ['emp-e11', 'AJM-QC-00001', 'Rabia Anwar', 'QC Inspector', 'Quality Control', 2],
    ['emp-e12', 'AJM-QC-00002', 'Tariq Javed', 'QC Inspector', 'Quality Control', 1],
    ['emp-e13', 'AJM-AS-00001', 'Shahid Iqbal', 'Security Supervisor', 'Administration & Security', 2],
    ['emp-e14', 'AJM-AS-00002', 'Mariam Khan', 'Admin Officer', 'Administration & Security', 0],
  ].map(([id, employeeCode, fullName, designationName, departmentName, prints]) => ({
    id, employeeCode, fullName, designationName, departmentName, branchId: branch.id, branchName: branch.name,
    status: 'Active', fingerprintTemplates: fp(prints),
  }));
  const byCode = code => {
    const text = String(code || '').trim().toUpperCase();
    if (!text) return null;
    return employees.find(e => e.employeeCode.toUpperCase() === text || e.id.toUpperCase() === text)
      || (/^\d+$/.test(text) ? employees.find(e => e.employeeCode.endsWith(text.padStart(5, '0'))) : null) || null;
  };

  const attendances = [
    ['emp-e13', 96, null, 'Present', 'Fingerprint'],
    ['emp-e08', 84, null, 'Present', 'Fingerprint'],
    ['emp-e10', 77, null, 'Present', 'Camera'],
    ['emp-e01', 63, null, 'Present', 'Fingerprint'],
    ['emp-e11', 49, null, 'Present', 'Camera'],
    ['emp-e05', 40, 12, 'Present', 'Fingerprint'],
    ['emp-e09', 28, null, 'Late', 'Fingerprint'],
  ].map(([employeeId, inAgo, outAgo, status, method]) => ({
    id: `att-${employeeId}-${today()}`, employeeId, date: today(), punchIn: timeAgo(inAgo), punchOut: outAgo ? timeAgo(outAgo) : '',
    outReason: outAgo ? 'Official Duty' : '', status, method, atThisKiosk: true, terminalLocation: 'Main Entrance Gate-1',
  }));

  const events = [];
  const addEvent = (type, message, minutesAgo = 0) => events.unshift({ at: new Date(Date.now() - minutesAgo * 60000).toISOString(), type, message });
  addEvent('system', 'Kiosk started · AlJannat Mall Attendance Kiosk v2.6.1', 120);
  addEvent('sync', 'Synced: 14 employees, 25 biometric templates, 7 departments', 118);
  for (const log of [...attendances].reverse()) {
    const emp = employees.find(e => e.id === log.employeeId);
    if (log.punchOut) addEvent('punch', `${emp.fullName} punched OUT (${log.outReason})`, 12);
  }
  [...attendances].sort((a, b) => a.punchIn.localeCompare(b.punchIn)).forEach(log => {
    const emp = employees.find(e => e.id === log.employeeId);
    events.unshift({ at: new Date(`${today()}T${log.punchIn}`).toISOString(), type: 'punch', message: `${emp.fullName} punched IN by ${log.method}` });
  });
  events.sort((a, b) => b.at.localeCompare(a.at));
  addEvent('sync', 'Auto-sync complete · 0 pending', 3);

  let registration = {
    registered: true, name: 'KIOSK-HQ-01 — Main Entrance Gate-1', registeredAt: new Date(Date.now() - 41 * 86400000).toISOString(),
    clientName: 'AlJannat Mall', portalUrl: 'https://headoffice', portalUrls: ['https://headoffice'], primaryUrl: 'https://headoffice', usingFallback: false,
  };
  let terminal = {
    id: 'KIOSK-HQ-01', location: 'Main Entrance Gate-1', branchId: branch.id, cameraSource: 'webcam', ipCameras: [],
    outCameraReason: '', allowCodeOnlyPunch: true, requireCodeWithFingerprint: false, requireCodeWithCamera: false,
    autoCaptureCamera: true, autoFullscreen: true, classicTheme: false,
  };
  let lastSync = new Date(Date.now() - 3 * 60000).toISOString();
  const pendingSync = [];
  const listeners = {};

  const state = () => clone({
    appVersion: '2.6.1', terminal, branches: [branch], assignedBranch: branch, employees, attendances, pendingSync,
    bridgeRunning: true, deviceRegistration: registration, storePath: 'C:\\ProgramData\\AlJannatKiosk\\kiosk-store.json',
    syncTarget: { portalUrl: registration.portalUrl, portalUrls: registration.portalUrls, collections: ['employees', 'biometricTemplates', 'attendances', 'departments', 'branches'] },
  });

  const decodeSetupCode = text => {
    const compact = String(text || '').replace(/\s+/g, '');
    if (!compact) return { ok: false, error: 'Paste the setup code' };
    if (!/^HRK1\./i.test(compact)) return { ok: false, error: /^HRM1\./i.test(compact) ? 'This is the phone app connection code, not a kiosk setup code' : 'This is not a kiosk setup code' };
    try {
      const body = compact.slice(5).replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(body + '='.repeat((4 - (body.length % 4)) % 4)));
      return { ok: true, clientName: payload.n || '', urls: payload.u || [] };
    } catch { return { ok: false, error: 'The setup code is damaged' }; }
  };
  const normalizeAddress = value => {
    const text = String(value || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(text)) return text;
    const host = text.split(/[/:]/)[0];
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    return `${local ? 'http' : 'https'}://${text}`;
  };
  const registeredTo = (url, clientName) => {
    registration = {
      registered: true, name: `${terminal.id} — ${terminal.location}`, registeredAt: new Date().toISOString(), clientName,
      portalUrl: url, portalUrls: [url], primaryUrl: url, usingFallback: false,
    };
    addEvent('device', `Registered with ${url} as "${registration.name}"`);
    return { ok: true, ...clone(registration) };
  };

  const savePunch = (emp, method, meta = {}) => {
    const date = today();
    let log = attendances.find(l => l.employeeId === emp.id && l.date === date);
    const punchedIn = log && log.punchIn && !log.punchOut;
    if (punchedIn && !meta.outReason) return { ok: false, needsOutReason: true, employee: clone(emp) };
    const time = nowTime();
    if (punchedIn) {
      log.punchOut = time; log.outReason = meta.outReason;
      addEvent('punch', `${emp.fullName} punched OUT (${meta.outReason})`);
      return { ok: true, action: 'OUT', employee: clone(emp), attendance: clone(log), outReason: meta.outReason, eventTime: time };
    }
    log = { id: `att-${emp.id}-${date}`, employeeId: emp.id, date, punchIn: time, punchOut: '', status: 'Present', method, atThisKiosk: true, terminalLocation: terminal.location };
    attendances.push(log);
    addEvent('punch', `${emp.fullName} punched IN by ${method === 'RFID' ? 'card / code' : method}`);
    return { ok: true, action: 'IN', employee: clone(emp), attendance: clone(log), eventTime: time };
  };

  window.kioskApi = {
    getState: async () => state(),
    lookupEmployee: async code => {
      const emp = byCode(code);
      if (!emp) return { found: false };
      const log = attendances.find(l => l.employeeId === emp.id && l.date === today());
      return {
        found: true, employee: clone(emp), action: log && log.punchIn && !log.punchOut ? 'OUT' : 'IN',
        todayLog: log ? { punchIn: log.punchIn, punchOut: log.punchOut, outReason: log.outReason || '', canReturn: false } : null,
        fingerprintCount: emp.fingerprintTemplates.length, hasCameraProfile: true,
      };
    },
    getStats: async () => {
      const todays = attendances.filter(l => l.date === today() && l.atThisKiosk);
      return {
        totalActive: employees.length, totalWithFingerprint: employees.filter(e => e.fingerprintTemplates.length).length,
        inCount: todays.filter(l => l.punchIn && !l.punchOut).length, outCount: todays.filter(l => l.punchIn && l.punchOut).length,
        pendingSync: pendingSync.length, lastSync, lastSyncReport: null, bridgeRunning: true,
      };
    },
    getEvents: async () => clone(events),
    // Admin PIN (windows-kiosk/admin-pin.cjs): this demo kiosk already has PIN 482915. Settings asks for it; closing
    // Settings locks again, as on a real kiosk.
    adminStatus: async () => ({ pinSet: true, unlocked: adminUnlocked, lockedUntil: null }),
    adminUnlock: async pin => {
      await sleep(250);
      if (String(pin) !== DEMO_PIN) { addEvent('security', 'Wrong admin PIN entered'); return { ok: false, message: 'Wrong PIN.' }; }
      adminUnlocked = true;
      return { ok: true };
    },
    adminSetPin: async () => { addEvent('security', 'Admin PIN changed'); adminUnlocked = true; return { ok: true }; },
    adminLock: async () => { adminUnlocked = false; return { ok: true }; },
    clearLocalAttendanceCache: async () => ({ ok: true, clearedCount: 0, discardedPendingCount: 0 }),
    saveSettings: async settings => {
      const { ipCameras = [], ...rest } = settings || {};
      terminal = { ...terminal, ...rest, ipCameras: ipCameras.filter(c => c.url).map((c, i) => ({ id: `cam${i + 1}`, name: c.name || `Camera ${i + 1}`, direction: c.direction, zoom: c.zoom, url: c.url, user: c.user, passwordSet: !!c.password })) };
      addEvent('settings', `Settings saved: ${terminal.id} · ${terminal.location}`);
      return clone(terminal);
    },
    sync: async () => {
      await sleep(700);
      if (!registration.registered) return { report: { reachable: true, notRegistered: true, errors: [], employees: 0, pushed: 0 } };
      lastSync = new Date().toISOString();
      addEvent('sync', 'Synced: 14 employees, 25 biometric templates, 7 departments');
      return { report: { reachable: true, errors: [], employees: employees.length, biometricTemplates: 25, departments: 7, pushed: 0 } };
    },
    deviceStatus: async () => clone(registration),
    registerDevice: async credentials => {
      await sleep(900);
      if (credentials && credentials.setupCode) {
        const parsed = decodeSetupCode(credentials.setupCode);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        return registeredTo(parsed.urls[0], parsed.clientName);
      }
      if (!credentials || !credentials.email || !credentials.password) return { ok: false, error: 'Enter the kiosk account email and password.' };
      return registeredTo(normalizeAddress(credentials.serverUrl || registration.portalUrl), 'AlJannat Mall');
    },
    parseSetupCode: async text => decodeSetupCode(text),
    unregisterDevice: async () => {
      registration = { registered: false, clientName: '', portalUrl: registration.portalUrl, portalUrls: registration.portalUrls, primaryUrl: registration.portalUrl, usingFallback: false };
      addEvent('device', 'Device key removed');
      return clone(registration);
    },
    punchByCode: async payload => {
      await sleep(500);
      if (!terminal.allowCodeOnlyPunch) return { ok: false, message: 'Code-only attendance is disabled on this terminal for security. Scan fingerprint or face to punch.' };
      const emp = byCode(payload && payload.code);
      if (!emp) return { ok: false, message: `No active employee found with code "${payload && payload.code}".` };
      return savePunch(emp, payload.method || 'RFID', payload.meta || {});
    },
    punchCamera: async () => ({ ok: false, message: 'Face not recognised. Look straight at the camera and try again, or use fingerprint.' }),
    beginCameraLiveness: async () => ({ ok: true, id: `lv-${Date.now()}`, order: ['left', 'right'], expiresAt: Date.now() + 20000 }),
    cancelCameraLiveness: async () => ({ ok: true }),
    punchFingerprint: async payload => {
      await sleep(1600);
      const emp = byCode(payload && payload.code) || employees.find(e => e.id === 'emp-e03');
      return { ...savePunch(emp, 'Fingerprint', (payload && payload.meta) || {}), quality: 92 };
    },
    testFingerprintScanner: async () => { await sleep(1200); return { ok: true, message: 'DigitalPersona U.are.U 4500 ready', quality: 90 }; },
    saveEvidence: async () => ({ ok: true }),
    startIpCameraStream: async () => ({ ok: true }),
    stopIpCameraStream: async () => ({ ok: true }),
    onIpCameraFrame: cb => { listeners.frame = cb; },
    testIpCamera: async () => { await sleep(1100); return { ok: true, message: '', bytes: 48213 }; },
    startBridge: async () => ({ ok: true, running: true, message: 'Biometric driver host is running.' }),
    checkBridge: async () => ({ running: true }),
    exit: async () => ({ ok: true }),
    onSyncComplete: cb => { listeners.sync = cb; },
    onDriverStatus: cb => { listeners.driver = cb; },
    onPunchSynced: cb => { listeners.punch = cb; },
  };

  window.__kioskMock = {
    setRegistered(on) {
      if (on) registeredTo('https://headoffice', 'AlJannat Mall');
      else registration = { registered: false, clientName: '', portalUrl: 'https://headoffice', portalUrls: ['https://headoffice'], primaryUrl: 'https://headoffice', usingFallback: false };
    },
    setupCode: 'HRK1.eyJ2IjoxLCJuIjoiQWxKYW5uYXQgTWFsbCIsInUiOlsiaHR0cHM6Ly9oZWFkb2ZmaWNlIl0sInQiOiJrc3RfOWYyYzQxZDdlOGEwNWIzNmMxZDQifQ',
  };

  // Face detection and embeddings are not loaded in the tutorial (the chapter serves empty modules for them):
  // the camera view is shown and explained, but nobody is recognised.
  window.detectFaceGeometry = async () => [];
  window.faceLandmarkerReady = Promise.resolve();
  window.computeFaceEmbedding = async () => null;
  window.faceEmbeddingReady = Promise.resolve();

  // Webcam: a calm drawn preview of the entrance (no real camera in the recording).
  const fakeStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 480;
    const g = canvas.getContext('2d');
    let t = 0;
    const draw = () => {
      t += 1;
      const wall = g.createLinearGradient(0, 0, 0, 480);
      wall.addColorStop(0, '#d6d3cb'); wall.addColorStop(1, '#a8a29e');
      g.fillStyle = wall; g.fillRect(0, 0, 640, 480);
      g.fillStyle = '#78716c'; g.fillRect(60, 40, 150, 330); g.fillRect(430, 40, 150, 330);
      g.fillStyle = '#57534e'; g.fillRect(0, 370, 640, 110);
      const dx = Math.sin(t / 40) * 4;
      g.fillStyle = '#1e3a5f'; g.beginPath(); g.ellipse(320 + dx, 500, 190, 150, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b98361'; g.beginPath(); g.ellipse(320 + dx, 230, 78, 100, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111827'; g.beginPath(); g.ellipse(320 + dx, 160, 82, 44, 0, Math.PI, Math.PI * 2); g.fill();
      g.fillStyle = '#111827'; g.beginPath(); g.arc(292 + dx, 226, 7, 0, Math.PI * 2); g.arc(348 + dx, 226, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6b3f2a'; g.lineWidth = 4; g.beginPath(); g.arc(320 + dx, 266, 22, 0.25, Math.PI - 0.25); g.stroke();
      requestAnimationFrame(draw);
    };
    draw();
    return canvas.captureStream(24);
  };
  try {
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    navigator.mediaDevices.getUserMedia = async () => fakeStream();
    navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'cam0', label: 'USB Camera', groupId: 'g0' }];
  } catch { /* keep the browser's own */ }
})();
