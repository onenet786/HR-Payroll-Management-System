/* ═══════════════════════════════════════════════════════════════════════════
   Bin Ishaq Attendance Kiosk — Professional Frontend
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

const api = window.kioskApi;

// ─── Constants ──────────────────────────────────────────────────────────────
const MODE = { CODE: 'code', FP: 'fingerprint', CAM: 'camera' };
const RESULT_AUTO_RESET_MS = 7000;
const LOOKUP_DEBOUNCE_MS = 280;
const DIR_RENDER_LIMIT = 80;
const IP_CAM_REFRESH_MS = 2000;

// ─── Application State ──────────────────────────────────────────────────────
let kioskState = null;
let activeMode = MODE.CODE;
let preview = null;          // from kiosk:lookup-employee
let cameraStream = null;
let ipCamRefreshTimer = null;
let lookupTimer = null;
let resetTimer = null;
let countdownRaf = null;
let countdownStart = null;
let fpBusy = false;

// ─── DOM Cache ───────────────────────────────────────────────────────────────
const el = {
  // header
  terminalLine:   id('terminalLine'),
  clockTime:      id('clockTime'),
  clockDate:      id('clockDate'),
  pillBridge:     id('pillBridge'),
  pillOnline:     id('pillOnline'),
  pillSync:       id('pillSync'),
  settingsBtn:    id('settingsBtn'),
  exitBtn:        id('exitBtn'),
  modeNav:        id('modeNav'),
  // stats
  statIn:         id('statIn'),
  statOut:        id('statOut'),
  statTotal:      id('statTotal'),
  statPending:    id('statPending'),
  syncStatus:     id('syncStatus'),
  syncBtn:        id('syncBtn'),
  // input panel
  empPreview:     id('empPreview'),
  empAvatar:      id('empAvatar'),
  avatarInitial:  id('avatarInitial'),
  empName:        id('empName'),
  empMeta:        id('empMeta'),
  empPunchState:  id('empPunchState'),
  codeInput:      id('codeInput'),
  codeClearBtn:   id('codeClearBtn'),
  codeInputWrap:  id('codeInputWrap'),
  keypad:         id('keypad'),
  punchBtn:       id('punchBtn'),
  punchLabel:     id('punchLabel'),
  punchSub:       id('punchSub'),
  fpArea:         id('fpArea'),
  fpOrb:          id('fpOrb'),
  fpInstruction:  id('fpInstruction'),
  fpQualityFill:  id('fpQualityFill'),
  fpScanBtn:      id('fpScanBtn'),
  camCaptureBtn:  id('camCaptureBtn'),
  // center
  cameraView:     id('cameraView'),
  webcamEl:       id('webcamEl'),
  ipcamEl:        id('ipcamEl'),
  snapCanvas:     id('snapCanvas'),
  camSourceBadge: id('camSourceBadge'),
  resultCard:     id('resultCard'),
  resultIcon:     id('resultIcon'),
  resultState:    id('resultState'),
  resultName:     id('resultName'),
  resultDetail:   id('resultDetail'),
  resultTime:     id('resultTime'),
  resultMeta:     id('resultMeta'),
  resultCountdown:id('resultCountdown'),
  countdownBar:   id('countdownBar'),
  todayFeed:      id('todayFeed'),
  todayDateLabel: id('todayDateLabel'),
  // activity panel
  dirCount:       id('dirCount'),
  dirSearch:      id('dirSearch'),
  dirList:        id('dirList'),
  eventLog:       id('eventLog'),
  // settings
  settingsOverlay:id('settingsOverlay'),
  settingsClose:  id('settingsClose'),
  stTerminalId:   id('stTerminalId'),
  stLocation:     id('stLocation'),
  stIpCamUrl:     id('stIpCamUrl'),
  stReqCodeFp:    id('stReqCodeFp'),
  stReqCodeCam:   id('stReqCodeCam'),
  stAutoFullscreen:id('stAutoFullscreen'),
  stSyncInfo:     id('stSyncInfo'),
  stEventsLog:    id('stEventsLog'),
  stStartBridge:  id('stStartBridge'),
  stOpenStore:    id('stOpenStore'),
  stSave:         id('stSave'),
};

function id(name) { return document.getElementById(name); }

// ─── Clock ───────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date();
    el.clockTime.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    el.clockDate.textContent = now.toLocaleDateString('en-GB', {
      weekday: 'long', day: '2-digit', month: 'short', year: 'numeric'
    });
  }
  tick();
  setInterval(tick, 1000);
}

// ─── Mode Switching ──────────────────────────────────────────────────────────
function setMode(mode) {
  activeMode = mode;

  // Update tab active state
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide panels
  const isCode = mode === MODE.CODE;
  const isFp   = mode === MODE.FP;
  const isCam  = mode === MODE.CAM;

  el.codeInputWrap.classList.toggle('hidden', false); // always show code field
  el.keypad.classList.toggle('hidden', isFp);
  el.punchBtn.classList.toggle('hidden', isFp || isCam);
  el.fpArea.classList.toggle('hidden', !isFp);
  el.fpScanBtn.classList.toggle('hidden', !isFp);
  el.camCaptureBtn.classList.toggle('hidden', !isCam);
  el.cameraView.classList.toggle('hidden', !isCam);

  if (isCam) {
    startCamera();
  } else {
    stopCamera();
  }

  if (!isFp) {
    setFpOrb('idle');
  }

  // Mode-specific hints
  if (isCode) {
    el.punchSub.textContent = preview
      ? (preview.action === 'OUT' ? 'Tap to record punch OUT' : 'Tap to record punch IN')
      : 'Enter code above then tap to punch';
    el.codeInput.focus();
  }
  if (isFp) {
    el.fpInstruction.textContent = kioskState?.terminal?.requireCodeWithFingerprint
      ? 'Enter code above, then scan fingerprint'
      : 'Place finger on reader or enter code to narrow search';
    setFpOrb('idle');
  }
  if (isCam) {
    // camera mode hint shown on button
  }
}

// ─── Employee Lookup (real-time preview) ─────────────────────────────────────
function scheduleEmployeeLookup() {
  clearTimeout(lookupTimer);
  const code = el.codeInput.value.trim();
  if (!code) {
    clearPreview();
    return;
  }
  lookupTimer = setTimeout(() => performLookup(code), LOOKUP_DEBOUNCE_MS);
}

async function performLookup(code) {
  try {
    const result = await api.lookupEmployee(code);
    if (result.found) {
      preview = result;
      renderPreview(result);
    } else {
      preview = null;
      renderPreviewNotFound(code);
    }
    updatePunchBtn();
  } catch {}
}

function renderPreview(result) {
  const { employee, action, todayLog, fingerprintCount } = result;
  el.empPreview.className = `emp-preview found ${action === 'OUT' ? 'action-out' : ''}`;

  // Avatar: photo or initials
  const initials = (employee.fullName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  if (employee.pictureUrl) {
    el.empAvatar.innerHTML = `<img src="${esc(employee.pictureUrl)}" alt="" />`;
  } else {
    const color = action === 'OUT' ? 'var(--blue)' : 'var(--em)';
    el.avatarInitial.innerHTML = '';
    el.avatarInitial.style.color = color;
    el.avatarInitial.textContent = initials;
    el.empAvatar.innerHTML = '';
    el.empAvatar.appendChild(el.avatarInitial);
  }

  el.empName.textContent = employee.fullName || '—';

  const parts = [employee.employeeCode, employee.designationName, employee.branchName].filter(Boolean);
  el.empMeta.textContent = parts.join(' · ') || '—';

  // Punch state badge
  el.empPunchState.className = '';
  if (todayLog?.punchIn && !todayLog?.punchOut) {
    el.empPunchState.className = 'emp-punch-state in-state';
    el.empPunchState.textContent = `● IN since ${todayLog.punchIn?.slice(0,5)}`;
  } else if (todayLog?.punchOut) {
    el.empPunchState.className = 'emp-punch-state out-state';
    el.empPunchState.textContent = `● OUT at ${todayLog.punchOut?.slice(0,5)}`;
  } else {
    el.empPunchState.textContent = '';
  }
}

function renderPreviewNotFound(code) {
  el.empPreview.className = 'emp-preview';
  el.empAvatar.innerHTML = `<div class="avatar-initial" id="avatarInitial" style="color:var(--t4)">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg></div>`;
  el.empName.textContent = '—';
  el.empMeta.textContent = `No match found for "${code}"`;
  el.empPunchState.className = '';
  el.empPunchState.textContent = '';
}

function clearPreview() {
  preview = null;
  el.empPreview.className = 'emp-preview';
  el.empAvatar.innerHTML = `<div class="avatar-initial" id="avatarInitial">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg></div>`;
  el.empName.textContent = '—';
  el.empMeta.textContent = 'Enter code to identify employee';
  el.empPunchState.className = '';
  el.empPunchState.textContent = '';
  el.punchLabel.textContent = 'PUNCH IN / OUT';
  el.punchSub.textContent = 'Enter employee code above';
}

function updatePunchBtn() {
  if (!preview) {
    el.punchLabel.textContent = 'PUNCH IN / OUT';
    el.punchSub.textContent = 'Enter employee code above';
    el.punchBtn.style.background = '';
    return;
  }
  if (preview.action === 'OUT') {
    el.punchLabel.textContent = `PUNCH OUT  ·  ${preview.employee.fullName.split(' ')[0]}`;
    el.punchSub.textContent = `Currently punched in · Tap to record departure`;
    el.punchBtn.style.background = 'linear-gradient(135deg, var(--blue-dark), var(--blue))';
    el.punchBtn.style.boxShadow = '0 4px 20px rgba(59,130,246,0.3)';
  } else {
    el.punchLabel.textContent = `PUNCH IN  ·  ${preview.employee.fullName.split(' ')[0]}`;
    el.punchSub.textContent = `Not yet punched today · Tap to record arrival`;
    el.punchBtn.style.background = '';
    el.punchBtn.style.boxShadow = '';
  }
}

// ─── Fingerprint Orb States ──────────────────────────────────────────────────
function setFpOrb(state, instruction) {
  el.fpOrb.className = `fp-orb ${state}`;
  if (instruction) el.fpInstruction.textContent = instruction;
  if (state === 'idle') {
    el.fpQualityFill.style.width = '0%';
  }
}

// ─── Camera ──────────────────────────────────────────────────────────────────
async function startCamera() {
  const ipUrl = kioskState?.terminal?.ipCameraUrl?.trim();
  el.webcamEl.classList.remove('active');
  el.ipcamEl.classList.remove('active');

  if (ipUrl) {
    el.camSourceBadge.textContent = 'IP Camera';
    el.ipcamEl.src = withTs(ipUrl);
    el.ipcamEl.classList.add('active');
    // Periodically refresh snapshot
    clearInterval(ipCamRefreshTimer);
    ipCamRefreshTimer = setInterval(() => {
      if (activeMode === MODE.CAM) el.ipcamEl.src = withTs(ipUrl);
    }, IP_CAM_REFRESH_MS);
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    el.webcamEl.srcObject = cameraStream;
    el.webcamEl.classList.add('active');
    el.camSourceBadge.textContent = 'Webcam';
  } catch (err) {
    showResult('err', 'Camera Unavailable', err.message || 'Please allow camera access or configure an IP camera URL in Settings.');
  }
}

function stopCamera() {
  clearInterval(ipCamRefreshTimer);
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  el.webcamEl.srcObject = null;
  el.webcamEl.classList.remove('active');
  el.ipcamEl.removeAttribute('src');
  el.ipcamEl.classList.remove('active');
}

async function captureEvidence() {
  const canvas = el.snapCanvas;
  const ctx = canvas.getContext('2d');
  const source = kioskState?.terminal?.ipCameraUrl ? el.ipcamEl : el.webcamEl;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return api.saveEvidence({
    dataUrl,
    type: 'camera',
    source: kioskState?.terminal?.ipCameraUrl ? 'ip-camera' : 'webcam',
  });
}

// ─── Punch Handlers ──────────────────────────────────────────────────────────
async function punchByCode() {
  const code = el.codeInput.value.trim();
  if (!code) {
    showResult('err', 'No Code Entered', 'Type or use the keypad to enter your employee code, then tap Punch.');
    return;
  }
  showResult('busy', 'Processing…', 'Verifying employee record and saving attendance…');
  const result = await api.punchByCode({ code, method: 'RFID' });
  handlePunchResult(result);
}

async function punchCamera() {
  const code = el.codeInput.value.trim();
  if (kioskState?.terminal?.requireCodeWithCamera && !code) {
    showResult('err', 'Employee Code Required', 'Enter your employee code before camera punch.');
    return;
  }
  if (!code) {
    showResult('err', 'No Code Entered', 'Enter employee code before camera proof punch.');
    return;
  }
  showResult('busy', 'Capturing Evidence…', 'Saving camera snapshot as attendance proof…');
  let evidence = null;
  try {
    evidence = await captureEvidence();
  } catch (err) {
    showResult('err', 'Capture Failed', err.message || 'Could not save camera image.');
    return;
  }
  const result = await api.punchByCode({ code, method: 'Camera', evidence, meta: { camera: kioskState?.terminal?.ipCameraUrl ? 'ip-camera' : 'webcam' } });
  handlePunchResult(result);
}

async function punchFingerprint() {
  if (fpBusy) return;
  fpBusy = true;
  const code = el.codeInput.value.trim();

  setFpOrb('scanning', 'Scanning… keep finger flat on reader');
  showResult('busy', 'Fingerprint Scan', 'Place your finger flat on the fingerprint reader and hold still.');

  const result = await api.punchFingerprint({ code });
  fpBusy = false;

  if (result.ok) {
    setFpOrb('success', 'Fingerprint matched!');
    el.fpQualityFill.style.width = `${Math.min(100, Math.round((result.log?.method ? 95 : 80)))}%`;
  } else {
    setFpOrb('error', result.message || 'Scan failed. Please try again.');
  }
  handlePunchResult(result);
}

function handlePunchResult(result) {
  if (result.ok) {
    const { employee, log, action } = result;
    const timeStr = action === 'OUT' ? (log.punchOut || '').slice(0, 5) : (log.punchIn || '').slice(0, 5);
    const isLate = log.status === 'Late';

    showResult('ok',
      `${action === 'OUT' ? 'Punch Out' : 'Punch In'} Recorded`,
      employee.fullName,
      timeStr,
      [
        `${log.method}`,
        log.status,
        log.terminalLocation || kioskState?.terminal?.location || '',
      ].filter(Boolean)
    );

    el.codeInput.value = '';
    preview = null;
    clearPreview();
    refreshTodayFeed();
    refreshStats();
    scheduleReset();
  } else {
    showResult('err', 'Attendance Failed', result.message || 'Could not mark attendance. Please try again or contact HR.');
    scheduleReset();
  }
}

// ─── Result Card ──────────────────────────────────────────────────────────────
function showResult(state, status, name, timeStr, metaItems) {
  // Clear any pending reset
  clearTimeout(resetTimer);
  cancelAnimationFrame(countdownRaf);
  el.resultCountdown.classList.add('hidden');
  el.countdownBar.style.transform = '';

  el.resultCard.className = `result-card ${state}`;
  el.resultState.textContent = state === 'ok' ? 'ACCEPTED' : state === 'err' ? 'REJECTED' : 'PROCESSING';
  el.resultName.textContent = name || '';
  el.resultDetail.textContent = state === 'busy' ? name : (state === 'ok' ? '' : name);
  el.resultTime.textContent = timeStr || '';

  // For ok state, name goes into resultName and detail is empty; for errors, name IS the detail
  if (state === 'ok') {
    el.resultName.textContent = name;
    el.resultDetail.textContent = '';
  } else if (state === 'err') {
    el.resultName.textContent = '';
    el.resultDetail.textContent = name;
  } else {
    el.resultName.textContent = status;
    el.resultDetail.textContent = name;
    el.resultState.textContent = 'PROCESSING';
  }

  if (state !== 'busy') el.resultState.textContent = status;

  // Meta tags
  el.resultMeta.innerHTML = '';
  if (metaItems?.length) {
    el.resultMeta.innerHTML = metaItems.map(m => `<span>${esc(m)}</span>`).join('');
  }

  // Icon SVGs
  if (state === 'ok') {
    el.resultIcon.innerHTML = `
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>`;
  } else if (state === 'err') {
    el.resultIcon.innerHTML = `
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>`;
  } else {
    el.resultIcon.innerHTML = `
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.7">
        <circle cx="12" cy="12" r="10" stroke-dasharray="4 3"/>
      </svg>`;
  }
}

function resetResultToIdle() {
  el.resultCard.className = 'result-card idle';
  el.resultState.textContent = 'TERMINAL READY';
  el.resultName.textContent = 'Attendance Kiosk Online';
  el.resultDetail.textContent = 'Select a punch method, then enter employee code or scan fingerprint.';
  el.resultTime.textContent = '';
  el.resultMeta.innerHTML = '';
  el.resultCountdown.classList.add('hidden');
  el.resultIcon.innerHTML = `
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>`;
  setFpOrb('idle');
  if (activeMode === MODE.CODE) el.codeInput.focus();
}

function scheduleReset() {
  clearTimeout(resetTimer);
  cancelAnimationFrame(countdownRaf);
  el.resultCountdown.classList.remove('hidden');
  el.countdownBar.style.transform = 'scaleX(1)';
  countdownStart = performance.now();

  function animateBar(now) {
    const elapsed = now - countdownStart;
    const progress = Math.min(1, elapsed / RESULT_AUTO_RESET_MS);
    el.countdownBar.style.transform = `scaleX(${1 - progress})`;
    if (progress < 1) {
      countdownRaf = requestAnimationFrame(animateBar);
    }
  }
  countdownRaf = requestAnimationFrame(animateBar);
  resetTimer = setTimeout(resetResultToIdle, RESULT_AUTO_RESET_MS);
}

// ─── Stats & Feed ────────────────────────────────────────────────────────────
async function refreshStats() {
  try {
    const stats = await api.getStats();
    el.statIn.textContent = stats.inCount;
    el.statOut.textContent = stats.outCount;
    el.statTotal.textContent = stats.totalActive;
    el.statPending.textContent = stats.pendingSync;

    setPill(el.pillBridge, stats.bridgeRunning ? 'online' : 'offline');
    setPill(el.pillSync, stats.pendingSync > 0 ? 'warning' : 'online');

    if (stats.lastSync) {
      const t = new Date(stats.lastSync);
      el.syncStatus.textContent = `Last sync: ${t.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}`;
    } else {
      el.syncStatus.textContent = 'Not yet synced';
    }
  } catch {}
}

function refreshTodayFeed() {
  if (!kioskState) return;
  const today = todayStr();
  el.todayDateLabel.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const logs = (kioskState.attendances || [])
    .filter(l => l.date === today)
    .sort((a, b) => {
      const ta = b.punchOut || b.punchIn || '';
      const tb = a.punchOut || a.punchIn || '';
      return ta.localeCompare(tb);
    });

  if (!logs.length) {
    el.todayFeed.innerHTML = '<div class="feed-empty">No punches recorded today.</div>';
    return;
  }

  const employees = kioskState.employees || [];
  el.todayFeed.innerHTML = logs.map(log => {
    const emp = employees.find(e => e.id === log.employeeId);
    const name = emp?.fullName || log.employeeId;
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isOut = log.punchOut;
    const isLate = log.status === 'Late';
    const rowClass = isOut ? 'row-out' : isLate ? 'row-late' : 'row-ok';
    const badge = isOut ? `<span class="feed-badge badge-out">OUT</span>`
      : isLate ? `<span class="feed-badge badge-late">LATE</span>`
      : `<span class="feed-badge badge-in">IN</span>`;
    return `<div class="feed-row ${rowClass}">
      <div class="feed-avatar-sm">${esc(initials)}</div>
      <div class="feed-info">
        <div class="feed-name">${esc(name)}</div>
        <div class="feed-sub">${esc(log.method || 'Code')} · ${esc(log.status || '')}</div>
      </div>
      <div class="feed-times">
        <div class="feed-in">${esc(log.punchIn?.slice(0,5) || '--')}</div>
        ${log.punchOut ? `<div class="feed-out">${esc(log.punchOut.slice(0,5))}</div>` : ''}
      </div>
      ${badge}
    </div>`;
  }).join('');
}

function renderDirectory(filter) {
  if (!kioskState) return;
  const q = (filter || '').toLowerCase();
  const today = todayStr();
  const todayLogs = (kioskState.attendances || []).filter(l => l.date === today);

  const list = (kioskState.employees || [])
    .filter(e => e.status !== 'Terminated')
    .filter(e => !q || `${e.fullName} ${e.employeeCode}`.toLowerCase().includes(q))
    .slice(0, DIR_RENDER_LIMIT);

  el.dirCount.textContent = String((kioskState.employees || []).filter(e => e.status === 'Active').length);

  if (!list.length) {
    el.dirList.innerHTML = '<div class="feed-empty">No employees found.</div>';
    return;
  }

  el.dirList.innerHTML = list.map(emp => {
    const hasFp = (emp.fingerprintTemplates || []).length > 0;
    const log = todayLogs.find(l => l.employeeId === emp.id);
    const punchedIn = log?.punchIn && !log?.punchOut;
    const classes = [hasFp ? 'has-fp' : '', punchedIn ? 'punched-in' : ''].filter(Boolean).join(' ');
    const status = punchedIn
      ? `In since ${log.punchIn?.slice(0,5)}`
      : log?.punchOut
        ? `Out ${log.punchOut?.slice(0,5)}`
        : hasFp ? `${(emp.fingerprintTemplates||[]).length} FP template${(emp.fingerprintTemplates||[]).length > 1 ? 's' : ''}` : 'No fingerprint';
    return `<div class="dir-row ${classes}" data-code="${esc(emp.employeeCode)}">
      <div class="dir-dot"></div>
      <div class="dir-info">
        <div class="dir-name">${esc(emp.fullName)}</div>
        <div class="dir-code">${esc(emp.employeeCode)} · ${esc(status)}</div>
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.dir-row').forEach(row => {
    row.addEventListener('click', () => {
      el.codeInput.value = row.dataset.code;
      el.codeInput.focus();
      scheduleEmployeeLookup();
      // On small screens, scroll input into view
      el.codeInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

async function renderEventLog() {
  try {
    const events = await api.getEvents();
    el.eventLog.innerHTML = events.slice(0, 20).map(ev => {
      const t = new Date(ev.at);
      const timeStr = t.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
      return `<div class="event-row">
        <div class="event-type-dot ${ev.type || 'system'}"></div>
        <span class="event-msg">${esc(ev.message || '')}</span>
        <span class="event-time">${timeStr}</span>
      </div>`;
    }).join('') || '<div class="feed-empty">No recent events.</div>';
  } catch {}
}

// ─── Sync ────────────────────────────────────────────────────────────────────
async function performSync() {
  el.syncBtn.classList.add('spinning');
  el.syncStatus.textContent = 'Syncing…';
  try {
    const { report, store } = await api.sync();
    kioskState = store;
    const errs = report.errors?.length || 0;
    el.syncStatus.textContent = errs
      ? `${errs} sync warning(s)`
      : `Synced: ${report.employees} emp, ${report.pushed} records pushed`;
    setPill(el.pillOnline, 'online');
    renderDirectory(el.dirSearch.value);
    refreshTodayFeed();
    refreshStats();
    renderEventLog();
  } catch (err) {
    el.syncStatus.textContent = 'Sync failed — offline mode';
    setPill(el.pillOnline, 'offline');
  } finally {
    el.syncBtn.classList.remove('spinning');
  }
}

// ─── Status Pills ─────────────────────────────────────────────────────────────
function setPill(pill, state) {
  pill.className = `status-pill ${state}`;
}

// ─── Settings Dialog ──────────────────────────────────────────────────────────
function openSettings() {
  if (!kioskState) return;
  const t = kioskState.terminal;
  el.stTerminalId.value     = t.id || '';
  el.stLocation.value       = t.location || '';
  el.stIpCamUrl.value       = t.ipCameraUrl || '';
  el.stReqCodeFp.checked    = !!t.requireCodeWithFingerprint;
  el.stReqCodeCam.checked   = !!t.requireCodeWithCamera;
  el.stAutoFullscreen.checked = !!t.autoFullscreen;

  const st = kioskState.syncTarget;
  if (st) {
    el.stSyncInfo.textContent = [
      `Portal: ${st.portalUrl}`,
      `Project: ${st.projectId}`,
      `Database: ${st.databaseId}`,
      `Collections: ${(st.collections || []).join(', ')}`,
      `Store: ${kioskState.storePath || '—'}`,
    ].join('\n');
  }

  renderSettingsEvents();
  el.settingsOverlay.classList.remove('hidden');
}

async function renderSettingsEvents() {
  try {
    const events = await api.getEvents();
    el.stEventsLog.innerHTML = events.slice(0, 50).map(ev => {
      const t = new Date(ev.at);
      const timeStr = t.toLocaleTimeString('en-GB', { hour12: false });
      return `<div class="ev-row">
        <div class="ev-dot ${ev.type || 'system'}"></div>
        <span class="ev-msg">${esc(ev.message || '')}</span>
        <span class="ev-time">${timeStr}</span>
      </div>`;
    }).join('') || '<div style="color:var(--t3);font-size:12px;padding:8px">No events logged yet.</div>';
  } catch {}
}

function closeSettings() {
  el.settingsOverlay.classList.add('hidden');
}

async function saveSettings() {
  const terminal = await api.saveSettings({
    id: el.stTerminalId.value.trim() || 'KIOSK-WIN-01',
    location: el.stLocation.value.trim() || 'Main Entrance Gate-1',
    ipCameraUrl: el.stIpCamUrl.value.trim(),
    requireCodeWithFingerprint: el.stReqCodeFp.checked,
    requireCodeWithCamera: el.stReqCodeCam.checked,
    autoFullscreen: el.stAutoFullscreen.checked,
  });
  if (kioskState) kioskState.terminal = terminal;
  closeSettings();
  el.terminalLine.textContent = `${terminal.location} · ${terminal.id}`;
  showResult('ok', 'SETTINGS SAVED', 'Kiosk configuration updated successfully.');
  scheduleReset();
}

// ─── Keypad ───────────────────────────────────────────────────────────────────
function buildKeypad() {
  const keys = ['1','2','3','4','5','6','7','8','9','CLR','0','BSP'];
  keys.forEach(k => {
    const btn = el.keypad.querySelector(`[data-val="${k}"]`);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (k === 'CLR') {
        el.codeInput.value = '';
      } else if (k === 'BSP') {
        el.codeInput.value = el.codeInput.value.slice(0, -1);
      } else {
        el.codeInput.value += k;
      }
      el.codeInput.focus();
      scheduleEmployeeLookup();
    });
  });
}

// ─── Event Binding ─────────────────────────────────────────────────────────
function bindEvents() {
  // Mode tabs
  el.modeNav.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Code input
  el.codeInput.addEventListener('input', scheduleEmployeeLookup);
  el.codeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeMode === MODE.CODE) punchByCode();
      else if (activeMode === MODE.CAM) punchCamera();
    }
    if (e.key === 'Escape') {
      el.codeInput.value = '';
      clearPreview();
    }
  });

  // Clear button
  el.codeClearBtn.addEventListener('click', () => {
    el.codeInput.value = '';
    clearPreview();
    el.codeInput.focus();
  });

  // Action buttons
  el.punchBtn.addEventListener('click', punchByCode);
  el.fpScanBtn.addEventListener('click', punchFingerprint);
  el.camCaptureBtn.addEventListener('click', punchCamera);

  // Sync
  el.syncBtn.addEventListener('click', performSync);

  // Settings
  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', closeSettings);
  el.stSave.addEventListener('click', saveSettings);
  el.stStartBridge.addEventListener('click', async () => {
    const result = await api.startBridge();
    await refreshStats();
    renderSettingsEvents();
    // Brief feedback
    el.stStartBridge.textContent = result.ok ? '✓ Bridge Started' : '✗ ' + result.message.slice(0, 40);
    setTimeout(() => { el.stStartBridge.textContent = 'Start Fingerprint Bridge'; }, 3000);
  });
  el.stOpenStore.addEventListener('click', () => api.openStore());

  // Exit
  el.exitBtn.addEventListener('click', () => {
    if (confirm('Close the attendance kiosk?')) api.exit();
  });

  // Directory search
  el.dirSearch.addEventListener('input', () => renderDirectory(el.dirSearch.value));

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (el.settingsOverlay.classList.contains('hidden')) {
      if (e.key === 'F1') { e.preventDefault(); setMode(MODE.CODE); }
      if (e.key === 'F2') { e.preventDefault(); setMode(MODE.FP); }
      if (e.key === 'F3') { e.preventDefault(); setMode(MODE.CAM); }
      if (e.key === 'F5') { e.preventDefault(); performSync(); }
    }
    if (e.key === 'Escape' && !el.settingsOverlay.classList.contains('hidden')) {
      closeSettings();
    }
  });

  // Settings overlay click-outside to close
  el.settingsOverlay.addEventListener('click', e => {
    if (e.target === el.settingsOverlay) closeSettings();
  });

  // Auto-sync complete notification from main process
  api.onSyncComplete(data => {
    const errs = data?.report?.errors?.length || 0;
    el.syncStatus.textContent = errs
      ? `Auto-sync: ${errs} warning(s)`
      : `Auto-synced at ${new Date(data.timestamp).toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' })}`;
    setPill(el.pillSync, errs > 0 ? 'warning' : 'online');
    // Refresh state after auto-sync
    api.getState().then(s => {
      kioskState = s;
      refreshTodayFeed();
      renderDirectory(el.dirSearch.value);
    }).catch(() => {});
  });

  // Bridge check every minute
  setInterval(async () => {
    const { running } = await api.checkBridge().catch(() => ({ running: false }));
    setPill(el.pillBridge, running ? 'online' : 'offline');
  }, 60000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[c]));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function withTs(url) {
  return `${url}${url.includes('?') ? '&' : '?'}_ts=${Date.now()}`;
}

// ─── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  startClock();
  buildKeypad();
  bindEvents();

  try {
    kioskState = await api.getState();

    // Terminal info
    el.terminalLine.textContent = `${kioskState.terminal.location} · ${kioskState.terminal.id}`;

    // Initial UI
    setPill(el.pillBridge, kioskState.bridgeRunning ? 'online' : 'offline');
    setPill(el.pillOnline, 'warning');
    setPill(el.pillSync, (kioskState.pendingSync || []).length > 0 ? 'warning' : 'online');

    refreshTodayFeed();
    renderDirectory('');
    renderEventLog();
    setMode(MODE.CODE);

    // Kick off initial sync
    performSync().catch(() => {});

    // Stats refresh every 30s
    setInterval(refreshStats, 30000);

  } catch (err) {
    showResult('err', 'Startup Error', err.message || 'Failed to load kiosk state. Restart the terminal.');
  }
}

boot();


