// Init script for chapter 28 (the phone app). Runs in every frame; only the app inside the phone frame
// (tools/tutorials/sim/phone.html) is changed: it is made to behave like the Android (Capacitor) build, so the real
// ConnectServerScreen and MobileApp are recorded. No hardware is used: GPS, fingerprint and camera are simulated.
(() => {
  if (window === window.top) return; // the outer phone page stays a plain page
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      BiometricPlugin: {
        checkAvailability: async () => ({ available: true, biometryType: 'fingerprint' }),
        authenticate: async () => { await sleep(1400); return { verified: true }; },
      },
      LocationPlugin: { reverseGeocode: async () => ({ address: 'Liberty Market, Gulberg III, Lahore' }) },
      OrientationPlugin: { setMode: async () => ({}) },
      DeviceSettingsPlugin: {
        setKioskFullscreen: async () => ({}), clearKioskCache: async () => ({}), openAppSettings: async () => ({}),
        ensureCameraPermission: async () => ({ granted: true }),
      },
    },
  };

  // GPS: a fresh, accurate fix in Gulberg, Lahore.
  const fix = () => ({
    coords: { latitude: 31.5104, longitude: 74.3415, accuracy: 9, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    timestamp: Date.now(),
  });
  try {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok) => setTimeout(() => ok(fix()), 600),
        watchPosition: (ok) => { setTimeout(() => ok(fix()), 600); return 1; },
        clearWatch: () => {},
      },
    });
  } catch { /* keep the browser's own */ }

  // Front camera: a calm animated preview (a drawn head and shoulders) instead of a real camera.
  const fakeStream = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 480; canvas.height = 360;
    const g = canvas.getContext('2d');
    let t = 0;
    const draw = () => {
      t += 1;
      const grad = g.createLinearGradient(0, 0, 0, 360);
      grad.addColorStop(0, '#cbd5e1'); grad.addColorStop(1, '#94a3b8');
      g.fillStyle = grad; g.fillRect(0, 0, 480, 360);
      const dx = Math.sin(t / 30) * 3;
      g.fillStyle = '#334155'; g.beginPath(); g.ellipse(240 + dx, 380, 150, 110, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c08a64'; g.beginPath(); g.ellipse(240 + dx, 170, 66, 84, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1f2937'; g.beginPath(); g.ellipse(240 + dx, 112, 70, 38, 0, Math.PI, Math.PI * 2); g.fill();
      g.fillStyle = '#1f2937'; g.beginPath(); g.arc(216 + dx, 168, 6, 0, Math.PI * 2); g.arc(264 + dx, 168, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7c4a32'; g.lineWidth = 3; g.beginPath(); g.arc(240 + dx, 200, 18, 0.2, Math.PI - 0.2); g.stroke();
      requestAnimationFrame(draw);
    };
    draw();
    return canvas.captureStream(24);
  };
  if (navigator.mediaDevices) {
    try { navigator.mediaDevices.getUserMedia = async () => fakeStream(); } catch { /* read-only in some builds */ }
  }
})();
