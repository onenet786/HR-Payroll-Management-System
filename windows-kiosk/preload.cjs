const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskApi', {
  getState: () => ipcRenderer.invoke('kiosk:get-state'),
  lookupEmployee: (code) => ipcRenderer.invoke('kiosk:lookup-employee', code),
  getStats: () => ipcRenderer.invoke('kiosk:get-stats'),
  getEvents: () => ipcRenderer.invoke('kiosk:get-events'),
  saveSettings: settings => ipcRenderer.invoke('kiosk:save-settings', settings),
  sync: () => ipcRenderer.invoke('kiosk:sync'),
  punchByCode: payload => ipcRenderer.invoke('kiosk:punch-by-code', payload),
  punchFingerprint: payload => ipcRenderer.invoke('kiosk:punch-fingerprint', payload),
  testFingerprintScanner: () => ipcRenderer.invoke('kiosk:test-fingerprint-scanner'),
  saveEvidence: payload => ipcRenderer.invoke('kiosk:save-evidence', payload),
  startBridge: () => ipcRenderer.invoke('kiosk:start-bridge'),
  checkBridge: () => ipcRenderer.invoke('kiosk:check-bridge'),
  openStore: () => ipcRenderer.invoke('kiosk:open-store'),
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
