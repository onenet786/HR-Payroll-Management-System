# Bin Ishaq HR Suite - Multi-Platform Build & Run Guide

This document provides step-by-step commands and instructions to run and compile the application for **Web**, **Mobile (Android APK)**, and **Windows Desktop** environments.

---

## 🖥️ 1. Web Application (Vite + React)

The core web portal houses the Super Admin controls, live attendance logs, and payroll calculations.

### Run in Development Mode
Start the local development server (accessible at `http://localhost:3000` or on your local network):
```bash
npm run dev
```

### Build Production Web Assets
Compile and minify the React web application into the `/dist` directory:
```bash
npm run build
```

### Preview Production Web Build
Run a local web server pointing directly to the compiled production assets in `/dist`:
```bash
npm run preview
```

---

## 📱 2. Mobile App (Android APK via Ionic Capacitor)

These commands package the Web App's Employee Self-Service (ESS) interface into a native Android container with a professional app launcher icon.

### Initial Configuration Setup
*(Only run these once to set up the mobile configuration)*
```bash
# 1. Install core Capacitor libraries and launcher asset tool
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install -D @capacitor/assets

# 2. Initialize Capacitor configurations (com.binishaq.hrsuite)
npx cap init "Bin Ishaq HR Suite" "com.binishaq.hrsuite" --web-dir=dist

# 3. Generate native Android Gradle project folder
npx cap add android
```

### Compile App Icons & Splash Screens
Place your high-resolution custom icon at the root `assets/icon.png`, then compile it into all Android mipmap resolutions automatically:
```bash
npx capacitor-assets generate --android
```

### Package & Build the APK
Run these commands whenever you update the React codebase to generate a fresh Android APK:
```bash
# 1. Compile the web code
npm run build

# 2. Sync web assets into the Android container
npx cap sync

# 3. Navigate into the Android folder
cd android

# 4. Build Debug APK (Signed with local key, immediately installable)
.\gradlew.bat assembleDebug

# OR Build unsigned Release APK
.\gradlew.bat assembleRelease
```
* **Output APK File**: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 💻 3. Windows Desktop Application (via Electron)

To compile the application as a standalone Windows client (`.exe`) capable of biometric scan integration, we use **Electron**.

### Initial Electron Integration Setup
*(Only run these once to configure Electron packaging)*
```bash
# 1. Install Electron packaging tools
npm install -D electron electron-builder
```

### Create Electron Entry Point File
Create a `main.js` script in the root directory to load the production folder:
```javascript
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  // Load Vite build index file
  win.loadFile(path.join(__dirname, 'dist/index.html'));
}

app.whenReady().then(createWindow);
```

### Run & Build Windows Standalone App
Add these shortcut scripts to your `package.json` under `"scripts"`:
* `"electron:dev": "electron ."`
* `"electron:build": "electron-builder --win"`

Run the following commands:
```bash
# 1. Compile web assets
npm run build

# 2. Test Electron window in development mode
npm run electron:dev

# 3. Package into a native Windows standalone installer (.exe)
npm run electron:build
```
* **Output Installer File**: Located inside the `/dist_electron` directory.
