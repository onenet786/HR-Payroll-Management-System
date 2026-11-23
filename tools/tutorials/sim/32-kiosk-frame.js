// Brings the static kiosk markup (windows-kiosk/renderer/index.html without its scripts) to life for chapter 32:
// first start (not registered), Settings → Server Registration, branch, camera, driver-host check and Save.
// Messages are the kiosk's own texts from windows-kiosk/renderer/app.js and main.cjs.
(() => {
  const $ = id => document.getElementById(id);
  const pill = (id, state) => { const p = $(id); p.classList.remove('online', 'offline', 'warning'); p.classList.add(state); };
  const tick = () => {
    const d = new Date(2026, 10, 23, 8, 47, 0);
    d.setSeconds(d.getSeconds() + Math.floor((Date.now() - start) / 1000));
    $('clockTime').textContent = d.toLocaleTimeString('en-GB');
    $('clockDate').textContent = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };
  const start = Date.now();
  const kf = window.kf = {
    init() {
      $('terminalLine').textContent = 'Attendance Terminal · KIOSK-WIN-01';
      $('appVersion').textContent = 'v1.0.44';
      $('regBanner').classList.remove('hidden');
      pill('pillBridge', 'online'); pill('pillOnline', 'offline'); pill('pillSync', 'warning');
      $('syncStatus').textContent = 'Not registered';
      $('stRegStatus').textContent = 'Not registered. This kiosk cannot download employees or upload punches until it is registered. Use the setup code from the web portal.';
      $('stRegStatus').style.color = 'var(--red)';
      $('stTerminalId').value = 'KIOSK-WIN-01';
      $('stLocation').value = '';
      const ip = $('stIpCameraFields'); if (ip) ip.classList.add('hidden');
      tick(); setInterval(tick, 1000);
      // A new kiosk has no admin PIN: the first Settings open asks to set one (windows-kiosk/admin-pin.cjs).
      $('settingsBtn').onclick = kf.askPin;
      $('regBannerBtn').onclick = kf.askPin;
      $('pinConfirm').onclick = () => { $('pinOverlay').classList.add('hidden'); kf.pinSet = true; kf.openSettings(); };
      $('pinCancel').onclick = $('pinClose').onclick = () => $('pinOverlay').classList.add('hidden');
      $('settingsClose').onclick = kf.closeSettings;
      document.querySelectorAll('input[name=stRegMethod]').forEach(r => { r.onchange = kf.method; });
      $('stRegSetupCode').oninput = kf.preview;
      $('stRegister').onclick = kf.register;
      $('stStartBridge').onclick = () => { $('stStartBridge').textContent = 'Driver Host Ready'; };
      $('stCameraSource').onchange = () => $('stIpCameraFields')?.classList.toggle('hidden', $('stCameraSource').value !== 'ip');
      $('stSave').onclick = kf.save;
    },
    askPin() {
      if (kf.pinSet) { kf.openSettings(); return; }
      $('pinTitle').textContent = 'Set the admin PIN';
      $('pinText').textContent = 'This kiosk has no admin PIN yet. Choose one now; it will be needed for Settings, Exit, clearing the local cache and removing the device key. Keep it away from employees.';
      $('pinConfirmField').classList.remove('hidden');
      $('pinOverlay').classList.remove('hidden');
      setTimeout(() => $('pinInput').focus(), 50);
    },
    openSettings() { $('settingsOverlay').classList.remove('hidden'); },
    closeSettings() { $('settingsOverlay').classList.add('hidden'); },
    method() {
      const account = $('stRegMethodAccount').checked;
      $('stRegCodeFields').classList.toggle('hidden', account);
      $('stRegAccountFields').classList.toggle('hidden', !account);
    },
    preview() {
      const text = $('stRegSetupCode').value.trim(); const box = $('stRegCodePreview');
      if (!text) { box.textContent = ''; return; }
      try {
        const body = JSON.parse(atob(text.slice(5).replace(/-/g, '+').replace(/_/g, '/')));
        box.textContent = `Client: ${body.n || '—'} · Server: ${body.u[0]}${body.u[1] ? ` (fallback: ${body.u[1]})` : ''}`;
        box.className = 'form-help full reg-code-preview-ok';
      } catch { box.textContent = 'This is not a kiosk setup code'; box.className = 'form-help full reg-code-preview-error'; }
    },
    async register() {
      $('stRegStatus').textContent = 'Registering…'; $('stRegStatus').style.color = '';
      await new Promise(r => setTimeout(r, 1200));
      const account = $('stRegMethodAccount').checked;
      let server = account ? $('stRegServerUrl').value.trim() : 'https://headoffice';
      if (!/^https?:\/\//.test(server)) server = `${/^(\d+\.){3}\d+|^[a-z0-9-]+(:\d+)?$/i.test(server) ? 'http' : 'https'}://${server}`;
      const name = [$('stTerminalId').value, $('stLocation').value].filter(Boolean).join(' — ');
      $('stRegStatus').textContent = `Registered${account ? '' : ' for AlJannat Mall'} as "${name}" on 23 Nov 2026.`;
      $('stRegStatus').style.color = 'var(--em)';
      $('stRegServer').textContent = `Server in use: ${server}`; $('stRegServer').classList.remove('hidden');
      $('stRegForm').classList.add('hidden'); $('stRegister').classList.add('hidden'); $('stUnregister').classList.remove('hidden');
      $('stRegPassword').value = '';
      const sel = $('stBranchId');
      sel.innerHTML = '<option value="">Select a branch…</option><option value="br-head-office">Head Office</option><option value="br-mall-road">Mall Road Outlet</option>';
      pill('pillOnline', 'online');
    },
    save() {
      kf.closeSettings();
      $('regBanner').classList.add('hidden');
      $('terminalLine').textContent = `Attendance Terminal · ${$('stTerminalId').value} · ${$('stLocation').value}`;
      pill('pillSync', 'online');
      $('syncStatus').textContent = 'Synced · just now';
      
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kf.init); else kf.init();
})();
