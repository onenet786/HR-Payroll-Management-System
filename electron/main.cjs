const { app, BrowserWindow, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

let mainWindow;
let bridgeProcess;

const bridgePort = 15896;

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
      `Fingerprint bridge not found:\n${bridgePath}`
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'Bin Ishaq HR Suite',
    backgroundColor: '#08111f',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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

  app.whenReady().then(async () => {
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
