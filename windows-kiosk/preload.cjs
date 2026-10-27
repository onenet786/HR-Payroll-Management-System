const { contextBridge, ipcRenderer } = require('electron');

function invokeCameraPunch(payload = {}) {
  const isMultiFace = payload?.mode === 'multi-face';
  const observations = payload?.livenessProof?.observations;
  if (!isMultiFace && observations !== undefined && (!Array.isArray(observations) || observations.length > 240)) {
    return Promise.resolve({ ok: false, message: 'Liveness proof payload is invalid or too large.' });
  }
  const livenessProof = isMultiFace ? undefined : (payload.livenessProof && {
    challengeId: String(payload.livenessProof.challengeId || '').slice(0, 128),
    observations: Array.isArray(observations) ? observations.map(item => ({ at: Number(item?.at), yaw: Number(item?.yaw), centerX: Number(item?.centerX), centerY: Number(item?.centerY), scale: Number(item?.scale) })) : undefined,
  });
  return ipcRenderer.invoke('kiosk:punch-camera', { ...payload, livenessProof });
}

contextBridge.exposeInMainWorld('kioskApi', {
  getState: () => ipcRenderer.invoke('kiosk:get-state'),
  lookupEmployee: (code) => ipcRenderer.invoke('kiosk:lookup-employee', code),
  getStats: () => ipcRenderer.invoke('kiosk:get-stats'),
  getEvents: () => ipcRenderer.invoke('kiosk:get-events'),
  clearLocalAttendanceCache: () => ipcRenderer.invoke('kiosk:clear-local-attendance-cache'),
  saveSettings: settings => ipcRenderer.invoke('kiosk:save-settings', settings),
  sync: () => ipcRenderer.invoke('kiosk:sync'),
  deviceStatus: () => ipcRenderer.invoke('kiosk:device-status'),
  registerDevice: credentials => ipcRenderer.invoke('kiosk:register-device', { email: String(credentials?.email || '').slice(0, 254), password: String(credentials?.password || '').slice(0, 256) }),
  unregisterDevice: () => ipcRenderer.invoke('kiosk:unregister-device'),
  punchByCode: payload => ipcRenderer.invoke('kiosk:punch-by-code', payload),
  punchCamera: invokeCameraPunch,
  beginCameraLiveness: cameraId => ipcRenderer.invoke('kiosk:begin-camera-liveness', typeof cameraId === 'string' ? cameraId.slice(0, 16) : undefined),
  cancelCameraLiveness: challengeId => ipcRenderer.invoke('kiosk:cancel-camera-liveness', challengeId),
  punchFingerprint: payload => ipcRenderer.invoke('kiosk:punch-fingerprint', payload),
  testFingerprintScanner: () => ipcRenderer.invoke('kiosk:test-fingerprint-scanner'),
  saveEvidence: payload => ipcRenderer.invoke('kiosk:save-evidence', payload),
  startIpCameraStream: cameraIds => ipcRenderer.invoke('kiosk:start-ip-camera-stream', Array.isArray(cameraIds) ? cameraIds.map(String).slice(0, 4) : undefined),
  stopIpCameraStream: () => ipcRenderer.invoke('kiosk:stop-ip-camera-stream'),
  onIpCameraFrame: (callback) => {
    ipcRenderer.on('kiosk:ip-camera-frame', (_event, data) => callback(data));
  },
  testIpCamera: payload => ipcRenderer.invoke('kiosk:test-ip-camera', { url: String(payload?.url || '').slice(0, 512), user: String(payload?.user || '').slice(0, 64), password: String(payload?.password || '').slice(0, 128), cameraId: String(payload?.cameraId || '').slice(0, 16), zoom: Number(payload?.zoom) || 1 }),
  startBridge: () => ipcRenderer.invoke('kiosk:start-bridge'),
  checkBridge: () => ipcRenderer.invoke('kiosk:check-bridge'),
  exit: () => ipcRenderer.invoke('kiosk:exit'),
  onSyncComplete: (callback) => {
    ipcRenderer.on('kiosk:sync-complete', (_event, data) => callback(data));
  },
  onDriverStatus: (callback) => {
    ipcRenderer.on('kiosk:driver-status', (_event, data) => callback(data));
  },
  onPunchSynced: (callback) => {
    ipcRenderer.on('kiosk:punch-synced', (_event, data) => callback(data));
  },
});
