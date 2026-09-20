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
const AUTO_GOOD_FRAMES_NEEDED = 3;
const AUTO_LOOP_MS = 700;
const AUTO_PUNCH_COOLDOWN_MS = 8000;
const FACE_FRAME_ASPECT = 4 / 3;
const CHECKOUT_REASONS = [
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

// ─── Application State ──────────────────────────────────────────────────────
let kioskState = null;
let activeMode = MODE.FP;
let preview = null;          // from kiosk:lookup-employee
let cameraStream = null;
let ipCamRefreshTimer = null;
let lookupTimer = null;
let resetTimer = null;
let countdownRaf = null;
let countdownStart = null;
let fpBusy = false;
let cameraPunchBusy = false;
let autoCaptureTimer = null;
let autoCaptureGoodFrames = 0;
let autoCaptureIsPunching = false;
let autoCaptureHoldUntil = 0;
let autoCaptureAwaitingFaceExit = false;
let messageResolver = null;
let messagePreviousFocus = null;
let maintenanceConfirmResolver = null;
let maintenanceConfirmStep = 1;
let maintenancePreviousFocus = null;

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
  codeModeBtn:    id('codeModeBtn'),
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
  fpPreviewCard:  id('fpPreviewCard'),
  fpPreviewCanvas:id('fpPreviewCanvas'),
  fpPreviewStatus:id('fpPreviewStatus'),
  fpPreviewMeta:  id('fpPreviewMeta'),
  fpScanBtn:      id('fpScanBtn'),
  fpTestBtn:      id('fpTestBtn'),
  camCaptureBtn:  id('camCaptureBtn'),
  // center
  centerPanel:    id('centerPanel'),
  cameraStack:    id('cameraStack'),
  cameraView:     id('cameraView'),
  webcamEl:       id('webcamEl'),
  ipcamEl:        id('ipcamEl'),
  snapCanvas:     id('snapCanvas'),
  capturedPhotoCard:id('capturedPhotoCard'),
  capturedPhotoImg:id('capturedPhotoImg'),
  camSourceBadge: id('camSourceBadge'),
  camAutoStatus:  id('camAutoStatus'),
  camAutoLabel:   id('camAutoLabel'),
  livenessRail:   id('livenessRail'),
  livenessAction: id('livenessAction'),
  resultCard:     id('resultCard'),
  resultIcon:     id('resultIcon'),
  resultState:    id('resultState'),
  resultEmployee: id('resultEmployee'),
  resultAvatar:   id('resultAvatar'),
  resultEmpName:  id('resultEmpName'),
  resultEmpMeta:  id('resultEmpMeta'),
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
  checkoutReasonOverlay:id('checkoutReasonOverlay'),
  checkoutReasonCancel: id('checkoutReasonCancel'),
  checkoutReasonEmployee:id('checkoutReasonEmployee'),
  checkoutReasonList:   id('checkoutReasonList'),
  messageOverlay: id('messageOverlay'),
  messageDialog: id('messageDialog'),
  messageClose: id('messageClose'),
  messageEyebrow: id('messageEyebrow'),
  messageTitle: id('messageTitle'),
  messageText: id('messageText'),
  messageDetail: id('messageDetail'),
  messageCancel: id('messageCancel'),
  messageConfirm: id('messageConfirm'),
  maintenanceConfirmOverlay: id('maintenanceConfirmOverlay'),
  maintenanceConfirmDialog: id('maintenanceConfirmDialog'),
  maintenanceConfirmClose: id('maintenanceConfirmClose'),
  maintenanceConfirmStep: id('maintenanceConfirmStep'),
  maintenanceConfirmMessage: id('maintenanceConfirmMessage'),
  maintenanceConfirmCancel: id('maintenanceConfirmCancel'),
  maintenanceConfirmContinue: id('maintenanceConfirmContinue'),
  // settings
  settingsOverlay:id('settingsOverlay'),
  settingsClose:  id('settingsClose'),
  stTerminalId:   id('stTerminalId'),
  stLocation:     id('stLocation'),
  stBranchId:     id('stBranchId'),
  stIpCamUrl:     id('stIpCamUrl'),
  stAllowCodeOnlyPunch: id('stAllowCodeOnlyPunch'),
  stReqCodeFp:    id('stReqCodeFp'),
  stReqCodeCam:   id('stReqCodeCam'),
  stAutoCaptureCamera: id('stAutoCaptureCamera'),
  stAutoFullscreen:id('stAutoFullscreen'),
  stSyncInfo:     id('stSyncInfo'),
  stEventsLog:    id('stEventsLog'),
  stStartBridge:  id('stStartBridge'),
  stTestScanner:  id('stTestScanner'),
  stClearAttendanceCache: id('stClearAttendanceCache'),
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
  if (mode === MODE.CODE && !kioskState?.terminal?.allowCodeOnlyPunch) mode = MODE.FP;
  activeMode = mode;

  // Update tab active state
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide panels
  const isCode = mode === MODE.CODE;
  const isFp   = mode === MODE.FP;
  const isCam  = mode === MODE.CAM;

  const autoCapture = isCam && isAutoCaptureEnabled();
  el.codeInputWrap.classList.toggle('hidden', false); // always show code field
  el.keypad.classList.toggle('hidden', isFp);
  el.punchBtn.classList.toggle('hidden', isFp || isCam);
  el.fpArea.classList.toggle('hidden', !isFp);
  el.fpScanBtn.classList.toggle('hidden', !isFp);
  el.fpTestBtn.classList.toggle('hidden', !isFp);
  el.camCaptureBtn.classList.toggle('hidden', !isCam);
  el.cameraStack.classList.toggle('hidden', !isCam);
  el.centerPanel?.classList.toggle('camera-active', isCam);

  if (isCam) {
    startCamera();
    if (autoCapture) startAutoCapture();
    else stopAutoCapture();
  } else {
    stopCamera();
    stopAutoCapture();
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
    resetResultToIdle();
  } else if (el.resultCard.classList.contains('idle')) {
    resetResultToIdle();
  }
}

function applyModeSecurity() {
  const allowCodeOnlyPunch = !!kioskState?.terminal?.allowCodeOnlyPunch;
  el.codeModeBtn.classList.toggle('hidden', !allowCodeOnlyPunch);
  el.codeModeBtn.setAttribute('aria-hidden', String(!allowCodeOnlyPunch));
  if (!allowCodeOnlyPunch && activeMode === MODE.CODE) {
    el.codeInput.value = '';
    clearPreview();
    setMode(MODE.FP);
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
  const pictureUrl = safeImageUrl(employee.pictureUrl);
  if (pictureUrl) {
    el.empAvatar.innerHTML = `<img src="${esc(pictureUrl)}" alt="" />`;
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
    const lastReturnAt = Array.isArray(todayLog.breaks) ? todayLog.breaks.at(-1)?.returnAt : '';
    el.empPunchState.className = 'emp-punch-state in-state';
    el.empPunchState.textContent = `● IN since ${(lastReturnAt || todayLog.punchIn)?.slice(0,5)}`;
  } else if (todayLog?.punchOut && todayLog?.canReturn) {
    el.empPunchState.className = 'emp-punch-state out-state';
    el.empPunchState.textContent = `● ${todayLog.outReason?.toUpperCase()} since ${todayLog.punchOut?.slice(0,5)} — verify to return`;
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

function resetFingerprintPreview(message = 'Run Test Fingerprint Scanner.') {
  const canvas = el.fpPreviewCanvas;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#020617');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1;
  for (let x = 12; x < canvas.width; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - 18, canvas.height);
    ctx.stroke();
  }
  el.fpPreviewCard.className = 'fp-preview-card';
  el.fpPreviewStatus.textContent = 'No scan yet';
  el.fpPreviewMeta.textContent = message;
}

function renderFingerprintPreview(result, statusText = 'Captured') {
  const canvas = el.fpPreviewCanvas;
  const ctx = canvas.getContext('2d');
  const quality = Number(result?.quality || 0);
  const provider = result?.provider || result?.device?.provider || 'reader';

  if (result?.imageBase64 && result?.imageWidth > 0 && result?.imageHeight > 0) {
    drawRawFingerprintImage(ctx, canvas, result.imageBase64, result.imageWidth, result.imageHeight);
    el.fpPreviewMeta.textContent = `${provider} image ${result.imageWidth}x${result.imageHeight} · ${quality || '--'}% quality`;
  } else {
    drawTemplateFingerprintPreview(ctx, canvas, result?.templateSeed || '', quality);
    el.fpPreviewMeta.textContent = `${provider} template captured · ${result?.templateLength || 0} chars · ${quality || '--'}% quality`;
  }

  el.fpPreviewCard.className = 'fp-preview-card ok';
  el.fpPreviewStatus.textContent = statusText;
}

function hasFingerprintPreview(result) {
  return !!(
    result?.imageBase64 ||
    result?.templateSeed ||
    result?.templateLength ||
    result?.quality
  );
}

function renderFingerprintPreviewError(message) {
  resetFingerprintPreview(message || 'Capture failed.');
  el.fpPreviewCard.className = 'fp-preview-card err';
  el.fpPreviewStatus.textContent = 'Failed';
}

function drawRawFingerprintImage(ctx, canvas, imageBase64, width, height) {
  const raw = atob(imageBase64);
  const source = ctx.createImageData(width, height);
  for (let i = 0; i < width * height; i++) {
    const value = raw.charCodeAt(i) || 0;
    source.data[i * 4] = value;
    source.data[i * 4 + 1] = value;
    source.data[i * 4 + 2] = value;
    source.data[i * 4 + 3] = 255;
  }

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  offscreen.getContext('2d').putImageData(source, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / width, canvas.height / height);
  const drawW = Math.max(1, Math.round(width * scale));
  const drawH = Math.max(1, Math.round(height * scale));
  const dx = Math.round((canvas.width - drawW) / 2);
  const dy = Math.round((canvas.height - drawH) / 2);
  ctx.drawImage(offscreen, dx, dy, drawW, drawH);
}

function drawTemplateFingerprintPreview(ctx, canvas, templateSeed, quality) {
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bytes = templateSeed
    ? Array.from(templateSeed).map(ch => ch.charCodeAt(0))
    : Array.from({ length: 96 }, (_, i) => (i * 37 + 91) % 255);

  ctx.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    const seed = bytes[i % bytes.length] || 1;
    const cx = canvas.width / 2 + ((bytes[(i + 7) % bytes.length] || 0) % 15) - 7;
    const cy = canvas.height / 2 + ((bytes[(i + 13) % bytes.length] || 0) % 11) - 5;
    const rx = 12 + ((seed + i * 3) % 36);
    const ry = 8 + ((seed + i * 5) % 27);
    ctx.strokeStyle = `rgba(${90 + (seed % 80)}, ${145 + (seed % 80)}, ${130 + (seed % 70)}, ${0.18 + Math.min(quality || 60, 100) / 180})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, (seed % 90) * Math.PI / 180, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = quality >= 60 ? 'rgba(52, 211, 153, 0.9)' : 'rgba(245, 158, 11, 0.9)';
  ctx.fillRect(8, canvas.height - 10, Math.max(8, Math.min(canvas.width - 16, (quality || 50) / 100 * (canvas.width - 16))), 3);
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

  const liveTrack = cameraStream?.getVideoTracks().find(track => track.readyState === 'live');
  if (liveTrack) {
    el.webcamEl.srcObject = cameraStream;
    el.webcamEl.classList.add('active');
    el.camSourceBadge.textContent = liveTrack.label || 'Webcam';
    return;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    el.webcamEl.srcObject = cameraStream;
    el.webcamEl.classList.add('active');
    el.camSourceBadge.textContent = 'Webcam';
  } catch (err) {
    const errorName = String(err?.name || '');
    const errorMessage = errorName === 'NotReadableError'
      ? 'Camera is already in use. Stop the HR enrollment camera and close Camera, Teams, Zoom, or browser tabs using the webcam, then retry.'
      : errorName === 'NotAllowedError' || errorName === 'SecurityError'
        ? 'Camera permission was denied. Allow desktop camera access in Windows Privacy settings, then restart the kiosk.'
        : errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError'
          ? 'No webcam was detected. Connect or enable the camera, then retry.'
          : `Could not open the webcam${err?.message ? `: ${err.message}` : '.'}`;
    showResult('err', errorName === 'NotReadableError' ? 'Camera Is Busy' : 'Camera Unavailable', errorMessage);
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
  clearCapturedPhoto();
  resetLivenessUI();
}

async function captureEvidence() {
  const canvas = el.snapCanvas;
  const ctx = canvas.getContext('2d');
  const source = kioskState?.terminal?.ipCameraUrl ? el.ipcamEl : el.webcamEl;
  const readiness = getCameraSourceReadiness(source);
  if (!readiness.ok) throw new Error(readiness.message);
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  const scale = Math.min(1, 1280 / sourceWidth, 720 / sourceHeight);
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  showCapturedPhoto(dataUrl);
  return api.saveEvidence({
    dataUrl,
    type: 'camera',
    source: kioskState?.terminal?.ipCameraUrl ? 'ip-camera' : 'webcam',
  });
}

function showCapturedPhoto(dataUrl) {
  if (!el.capturedPhotoCard || !el.capturedPhotoImg) return;
  el.capturedPhotoImg.src = dataUrl;
  el.capturedPhotoCard.classList.remove('hidden');
}

function clearCapturedPhoto() {
  if (!el.capturedPhotoCard || !el.capturedPhotoImg) return;
  el.capturedPhotoCard.classList.add('hidden');
  el.capturedPhotoImg.removeAttribute('src');
}

function getCameraSourceReadiness(source) {
  if (!source) return { ok: false, message: 'Camera source is not ready. Start camera mode and try again.' };
  if (source instanceof HTMLVideoElement) {
    if (!source.srcObject || source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || source.videoWidth <= 0 || source.videoHeight <= 0) {
      return { ok: false, message: 'Camera is not showing a live frame yet. Wait for the preview, then try again.' };
    }
  } else if (source instanceof HTMLImageElement) {
    if (!source.complete || source.naturalWidth <= 0 || source.naturalHeight <= 0) {
      return { ok: false, message: 'IP camera image is not loaded yet. Wait for the preview, then try again.' };
    }
  }
  return { ok: true, message: '' };
}

function captureCameraDescriptor() {
  const width = 16;
  const height = 20;
  const source = kioskState?.terminal?.ipCameraUrl ? el.ipcamEl : el.webcamEl;
  const readiness = getCameraSourceReadiness(source);
  if (!readiness.ok) throw new Error(readiness.message);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  drawNormalizedCameraFrame(ctx, source, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const luma = [];
  for (let i = 0; i < data.length; i += 4) {
    luma.push((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255);
  }
  const mean = luma.reduce((sum, value) => sum + value, 0) / luma.length;
  const vector = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const base = idx * 4;
      const r = data[base] / 255;
      const g = data[base + 1] / 255;
      const b = data[base + 2] / 255;
      const gx = x > 0 && x < width - 1 ? luma[idx + 1] - luma[idx - 1] : 0;
      const gy = y > 0 && y < height - 1 ? luma[idx + width] - luma[idx - width] : 0;
      vector.push(
        Number((luma[idx] - mean).toFixed(4)),
        Number((r - g).toFixed(4)),
        Number((b - (r + g) / 2).toFixed(4)),
        Number(Math.sqrt(gx * gx + gy * gy).toFixed(4))
      );
    }
  }
  return {
    version: 2,
    vector,
    capturedAt: new Date().toISOString(),
    source: kioskState?.terminal?.ipCameraUrl ? 'ip-camera' : 'webcam',
  };
}

function drawNormalizedCameraFrame(ctx, source, width, height) {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;

  if (sourceWidth / sourceHeight > FACE_FRAME_ASPECT) {
    cropWidth = sourceHeight * FACE_FRAME_ASPECT;
    sourceX = (sourceWidth - cropWidth) / 2;
  } else if (sourceWidth / sourceHeight < FACE_FRAME_ASPECT) {
    cropHeight = sourceWidth / FACE_FRAME_ASPECT;
    sourceY = (sourceHeight - cropHeight) / 2;
  }

  ctx.drawImage(source, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);
}

async function detectFaceInsideGuide(source) {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!width || !height) return { ok: false, message: 'Camera is not showing a live frame yet. Wait for the preview, then try again.' };

  try {
    if (!window.detectFaceGeometry) await window.faceLandmarkerReady;
    const faces = await window.detectFaceGeometry(source);
    if (!Array.isArray(faces) || faces.length === 0) {
      return { ok: false, message: 'No face detected. Put your full face inside the oval marker.' };
    }
    if (faces.length > 1) {
      return { ok: false, message: 'More than one face detected. Only one employee should be inside the camera frame.' };
    }

    const { centerX: faceCenterX, centerY: faceCenterY, width: faceWidth, height: faceHeight } = faces[0];

    const centerIsInGuide =
      faceCenterX >= 0.32 &&
      faceCenterX <= 0.68 &&
      faceCenterY >= 0.22 &&
      faceCenterY <= 0.78;
    const sizeIsValid =
      faceWidth >= 0.18 &&
      faceWidth <= 0.64 &&
      faceHeight >= 0.24 &&
      faceHeight <= 0.82;

    if (!centerIsInGuide) {
      return { ok: false, message: 'Face is not inside the oval marker. Center your full face, then try again.' };
    }
    if (!sizeIsValid) {
      return { ok: false, message: 'Face is not fully visible. Move closer and keep the full face inside the oval.' };
    }

    return { ok: true, message: 'Face is centered inside the oval.' };
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('not implemented')) return null;
    return { ok: false, message: `Camera face detection failed. ${error?.message || ''}`.trim() };
  }
}

async function assessCameraFrame() {
  const brightnessCanvas = document.createElement('canvas');
  brightnessCanvas.width = 48;
  brightnessCanvas.height = 60;
  const source = kioskState?.terminal?.ipCameraUrl ? el.ipcamEl : el.webcamEl;
  const readiness = getCameraSourceReadiness(source);
  if (!readiness.ok) return { ok: false, descriptor: null, message: readiness.message };
  const guideFace = await detectFaceInsideGuide(source);
  if (guideFace && !guideFace.ok) return { ok: false, descriptor: null, message: guideFace.message };
  const landmarkFaceIsReady = guideFace?.ok === true;
  const descriptor = captureCameraDescriptor();
  const ctx = brightnessCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 48, 60);
  const data = ctx.getImageData(0, 0, 48, 60).data;
  const values = [];
  let skinPixels = 0;
  let ovalPixels = 0;
  let leftEyeDarkPixels = 0;
  let rightEyeDarkPixels = 0;
  let mouthDarkPixels = 0;
  let leftEyeCoreDarkPixels = 0;
  let rightEyeCoreDarkPixels = 0;
  let mouthCoreDarkPixels = 0;
  let centerSkinPixels = 0;
  let leftCoreSkinPixels = 0;
  let rightCoreSkinPixels = 0;
  let noseMouthCoreSkinPixels = 0;
  let leftSkinPixels = 0;
  let rightSkinPixels = 0;
  let skinMinX = 48;
  let skinMaxX = -1;
  let skinMinY = 60;
  let skinMaxY = -1;
  let skinSumX = 0;
  let skinSumY = 0;
  let totalSkinPixels = 0;
  let totalSkinMinX = 48;
  let totalSkinMaxX = -1;
  let totalSkinSumX = 0;
  let totalSkinSumY = 0;
  let outsideSkinPixels = 0;
  let outsideSideSkinPixels = 0;
  let outsideLeftSkinPixels = 0;
  let outsideRightSkinPixels = 0;
  let symmetryDiff = 0;
  let symmetryPairs = 0;
  const lumaAt = (x, y) => {
    const i = (y * 48 + x) * 4;
    return (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  };

  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4;
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      values.push(lum);

      const nx = (x - 24) / (48 * 0.34);
      const ny = (y - 30) / (60 * 0.43);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const skinLike = r > 0.22 && g > 0.16 && b > 0.10 && r > b * 1.06 && max - min > 0.045;
      const inOval = nx * nx + ny * ny <= 1;

      if (skinLike && y >= 10 && y <= 52) {
        totalSkinPixels += 1;
        totalSkinMinX = Math.min(totalSkinMinX, x);
        totalSkinMaxX = Math.max(totalSkinMaxX, x);
        totalSkinSumX += x;
        totalSkinSumY += y;
      }

      if (!inOval) {
        if (skinLike && y >= 10 && y <= 52) {
          outsideSkinPixels += 1;
          if (x < 18) {
            outsideSideSkinPixels += 1;
            outsideLeftSkinPixels += 1;
          } else if (x > 30) {
            outsideSideSkinPixels += 1;
            outsideRightSkinPixels += 1;
          }
        }
        continue;
      }

      ovalPixels += 1;
      if (skinLike) {
        skinPixels += 1;
        skinMinX = Math.min(skinMinX, x);
        skinMaxX = Math.max(skinMaxX, x);
        skinMinY = Math.min(skinMinY, y);
        skinMaxY = Math.max(skinMaxY, y);
        skinSumX += x;
        skinSumY += y;
        if (x >= 17 && x <= 31 && y >= 18 && y <= 42) centerSkinPixels += 1;
        if (x >= 13 && x <= 22 && y >= 17 && y <= 44) leftCoreSkinPixels += 1;
        if (x >= 26 && x <= 35 && y >= 17 && y <= 44) rightCoreSkinPixels += 1;
        if (x >= 19 && x <= 29 && y >= 22 && y <= 48) noseMouthCoreSkinPixels += 1;
        if (x < 24) leftSkinPixels += 1;
        else rightSkinPixels += 1;
      }
      const yNorm = y / 60;
      if (yNorm > 0.33 && yNorm < 0.49 && lum < 0.34) {
        if (x < 24) leftEyeDarkPixels += 1;
        else rightEyeDarkPixels += 1;
      }
      if (yNorm > 0.62 && yNorm < 0.80 && lum < 0.38) mouthDarkPixels += 1;
      if (x >= 14 && x <= 23 && y >= 20 && y <= 32 && lum < 0.42) leftEyeCoreDarkPixels += 1;
      if (x >= 25 && x <= 34 && y >= 20 && y <= 32 && lum < 0.42) rightEyeCoreDarkPixels += 1;
      if (x >= 19 && x <= 29 && y >= 36 && y <= 48 && lum < 0.42) mouthCoreDarkPixels += 1;
    }
  }

  for (let y = 8; y < 52; y += 2) {
    for (let x = 8; x < 22; x += 2) {
      symmetryDiff += Math.abs(lumaAt(x, y) - lumaAt(47 - x, y));
      symmetryPairs += 1;
    }
  }
  const brightness = values.reduce((sum, value) => sum + value, 0) / values.length;
  const contrast = Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - brightness, 2), 0) / values.length);
  const skinRatio = ovalPixels ? skinPixels / ovalPixels : 0;
  const leftEyeRatio = ovalPixels ? leftEyeDarkPixels / ovalPixels : 0;
  const rightEyeRatio = ovalPixels ? rightEyeDarkPixels / ovalPixels : 0;
  const mouthRatio = ovalPixels ? mouthDarkPixels / ovalPixels : 0;
  const symmetry = symmetryPairs ? symmetryDiff / symmetryPairs : 1;
  const skinCenterX = skinPixels ? (skinSumX / skinPixels) / 48 : 0;
  const skinCenterY = skinPixels ? (skinSumY / skinPixels) / 60 : 0;
  const skinWidthRatio = skinPixels ? (skinMaxX - skinMinX + 1) / 48 : 0;
  const skinHeightRatio = skinPixels ? (skinMaxY - skinMinY + 1) / 60 : 0;
  const centerSkinRatio = centerSkinPixels / (15 * 25);
  const coreSkinPixels = leftCoreSkinPixels + rightCoreSkinPixels;
  const coreSkinBalance = Math.min(leftCoreSkinPixels, rightCoreSkinPixels) / Math.max(1, Math.max(leftCoreSkinPixels, rightCoreSkinPixels));
  const skinBalance = Math.min(leftSkinPixels, rightSkinPixels) / Math.max(1, Math.max(leftSkinPixels, rightSkinPixels));
  const strongestOutsideSide = Math.max(outsideLeftSkinPixels, outsideRightSkinPixels);
  const outsideSideRatio = strongestOutsideSide / Math.max(1, skinPixels);
  const outsideSideDominance = strongestOutsideSide / Math.max(1, outsideSideSkinPixels);
  const faceTouchesOvalSide = skinMinX <= 8 || skinMaxX >= 39;
  const totalSkinCenterX = totalSkinPixels ? (totalSkinSumX / totalSkinPixels) / 48 : 0;
  const totalSkinCenterY = totalSkinPixels ? (totalSkinSumY / totalSkinPixels) / 60 : 0;
  const faceInsideShare = skinPixels / Math.max(1, totalSkinPixels);
  const outsideSkinShare = outsideSkinPixels / Math.max(1, totalSkinPixels);
  const faceTouchesFrameSide = totalSkinMinX <= 2 || totalSkinMaxX >= 45;
  const wholeFaceOffCenter = totalSkinCenterX < 0.38 || totalSkinCenterX > 0.62 || totalSkinCenterY < 0.28 || totalSkinCenterY > 0.72;
  const faceIsOneSided = skinBalance < 0.42 || skinCenterX < 0.38 || skinCenterX > 0.62;

  if (brightness < 0.18) return { ok: false, descriptor, message: 'Face area is too dark. Add light and try again.' };
  if (brightness > 0.88) return { ok: false, descriptor, message: 'Face area is overexposed. Reduce glare and try again.' };
  // MediaPipe has already verified one complete, centered face using facial
  // landmarks. Do not reject that result with the color/dark-pixel fallback:
  // glasses, facial hair, skin tone, and exposure make those thresholds prone
  // to false negatives. Retain the fallback for platforms where landmark
  // detection is unavailable.
  if (!landmarkFaceIsReady && (
    coreSkinPixels < 26 ||
    leftCoreSkinPixels < 9 ||
    rightCoreSkinPixels < 9 ||
    noseMouthCoreSkinPixels < 12 ||
    coreSkinBalance < 0.46 ||
    leftEyeCoreDarkPixels < 3 ||
    rightEyeCoreDarkPixels < 3 ||
    mouthCoreDarkPixels < 3
  )) {
    return { ok: false, descriptor, message: 'Bring your full face inside the oval before punching.' };
  }
  if (contrast < 0.03) return { ok: false, descriptor, message: 'No face detected in camera. Move closer and keep your face inside the oval.' };
  if (!landmarkFaceIsReady && (skinRatio < 0.14 || skinRatio > 0.76)) return { ok: false, descriptor, message: 'No face detected in camera. Put a full face inside the oval marker.' };
  if (!landmarkFaceIsReady && (skinCenterX < 0.40 || skinCenterX > 0.60 || skinCenterY < 0.34 || skinCenterY > 0.66)) return { ok: false, descriptor, message: 'Face is not inside the oval marker. Center your full face, then try again.' };
  if (!landmarkFaceIsReady && (skinWidthRatio < 0.16 || skinWidthRatio > 0.88 || skinHeightRatio < 0.22 || skinHeightRatio > 0.92)) return { ok: false, descriptor, message: 'Face is not fully visible. Move closer and keep the full face inside the oval.' };
  if (!landmarkFaceIsReady && (centerSkinRatio < 0.18 || skinBalance < 0.35)) return { ok: false, descriptor, message: 'No centered full face detected. Keep your face straight inside the oval.' };
  // Dark-pixel eye/mouth thresholds vary heavily with glasses, facial hair,
  // skin tone, camera exposure, and compression. Enrollment and descriptor
  // matching provide identity verification; readiness should only reject an
  // uncentered or incomplete face instead of guessing individual features.
  // Pixel symmetry is not a reliable pose check: directional light, glasses,
  // facial hair, and off-axis laptop cameras produce large differences even
  // for a correctly centered employee. Descriptor matching remains mandatory.
  return { ok: true, descriptor, message: 'Face frame looks ready.' };
}

// ─── Auto-Capture (Face Recognition without Employee Code) ───────────────────
function isAutoCaptureEnabled() {
  return activeMode === MODE.CAM &&
    !kioskState?.terminal?.ipCameraUrl &&
    kioskState?.terminal?.autoCaptureCamera !== false;
}

function setAutoCaptureStatus(state, text) {
  if (!el.camAutoStatus) return;
  el.camAutoStatus.classList.remove('hidden');
  el.camAutoStatus.dataset.state = state;
  if (el.camAutoLabel) el.camAutoLabel.textContent = text;
}

function startAutoCapture() {
  stopAutoCapture();
  autoCaptureGoodFrames = 0;
  autoCaptureIsPunching = false;
  autoCaptureHoldUntil = 0;
  autoCaptureAwaitingFaceExit = false;
  setAutoCaptureStatus('scanning', 'Scanning for face…');
  autoCaptureTimer = setInterval(runAutoCaptureStep, AUTO_LOOP_MS);
}

function stopAutoCapture() {
  clearInterval(autoCaptureTimer);
  autoCaptureTimer = null;
  autoCaptureGoodFrames = 0;
  autoCaptureIsPunching = false;
  autoCaptureAwaitingFaceExit = false;
  if (el.camAutoStatus) el.camAutoStatus.classList.add('hidden');
}

async function runAutoCaptureStep() {
  if (activeMode !== MODE.CAM || autoCaptureIsPunching) return;

  if (autoCaptureAwaitingFaceExit) {
    try {
      const frame = await assessCameraFrame();
      if (!frame.ok) {
        autoCaptureAwaitingFaceExit = false;
        autoCaptureHoldUntil = Date.now() + 1000;
        setAutoCaptureStatus('scanning', 'Ready for the next employee…');
      } else {
        setAutoCaptureStatus('hold', 'Attendance recorded — move away before the next scan.');
      }
    } catch {
      autoCaptureAwaitingFaceExit = false;
    }
    return;
  }

  const now = Date.now();
  if (now < autoCaptureHoldUntil) {
    const secs = Math.ceil((autoCaptureHoldUntil - now) / 1000);
    setAutoCaptureStatus('hold', `Next scan in ${secs}s…`);
    return;
  }

  let frame;
  try {
    frame = await assessCameraFrame();
  } catch {
    autoCaptureGoodFrames = 0;
    setAutoCaptureStatus('scanning', 'Camera not ready…');
    return;
  }

  if (!frame.ok) {
    autoCaptureGoodFrames = 0;
    setAutoCaptureStatus('scanning', frame.message);
    return;
  }

  autoCaptureGoodFrames++;
  if (autoCaptureGoodFrames < AUTO_GOOD_FRAMES_NEEDED) {
    setAutoCaptureStatus('detected', `Face locked ${autoCaptureGoodFrames}/${AUTO_GOOD_FRAMES_NEEDED}…`);
    return;
  }

  autoCaptureGoodFrames = 0;
  autoCaptureIsPunching = true;
  setAutoCaptureStatus('punching', 'Identifying…');
  try {
    const result = await punchCamera();
    if (result?.ok) autoCaptureAwaitingFaceExit = true;
  } finally {
    autoCaptureIsPunching = false;
    autoCaptureHoldUntil = Date.now() + AUTO_PUNCH_COOLDOWN_MS;
    setAutoCaptureStatus('hold', 'Hold on…');
  }
}

// ─── Punch Handlers ──────────────────────────────────────────────────────────
function closeCheckoutReasonDialog() {
  el.checkoutReasonOverlay.classList.add('hidden');
  el.checkoutReasonList.innerHTML = '';
}

function askCheckoutReason(employeeName) {
  return new Promise(resolve => {
    let settled = false;
    let keyBuffer = '';
    let keyBufferTimer = null;

    const settle = reason => {
      if (settled) return;
      settled = true;
      clearTimeout(keyBufferTimer);
      cleanup();
      closeCheckoutReasonDialog();
      resolve(reason || '');
    };

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        settle('');
        return;
      }

      if (!/^[0-9]$/.test(event.key)) return;
      event.preventDefault();
      event.stopPropagation();

      keyBuffer += event.key;
      clearTimeout(keyBufferTimer);

      const selectedIndex = Number(keyBuffer) - 1;
      if (selectedIndex >= 0 && selectedIndex < CHECKOUT_REASONS.length) {
        if (keyBuffer === '1' && CHECKOUT_REASONS.length > 9) {
          keyBufferTimer = setTimeout(() => settle(CHECKOUT_REASONS[0]), 500);
          return;
        }
        settle(CHECKOUT_REASONS[selectedIndex]);
        return;
      }

      keyBuffer = event.key === '1' ? '1' : '';
      if (keyBuffer) keyBufferTimer = setTimeout(() => settle(CHECKOUT_REASONS[0]), 500);
    };

    const onCancel = () => settle('');
    const onOverlayClick = event => {
      if (event.target === el.checkoutReasonOverlay) settle('');
    };
    const cleanup = () => {
      document.removeEventListener('keydown', onKeyDown, true);
      el.checkoutReasonCancel.removeEventListener('click', onCancel);
      el.checkoutReasonOverlay.removeEventListener('click', onOverlayClick);
    };

    el.checkoutReasonEmployee.textContent = employeeName
      ? `Punch out for ${employeeName}`
      : 'Punch out requires a reason';
    el.checkoutReasonList.innerHTML = CHECKOUT_REASONS.map((reason, index) => `
      <button type="button" class="reason-option" data-reason="${esc(reason)}">
        <span class="reason-hotkey">${index + 1}</span>
        <span>${esc(reason)}</span>
      </button>
    `).join('');
    el.checkoutReasonList.querySelectorAll('.reason-option').forEach(button => {
      button.addEventListener('click', () => settle(button.dataset.reason || ''));
    });

    document.addEventListener('keydown', onKeyDown, true);
    el.checkoutReasonCancel.addEventListener('click', onCancel);
    el.checkoutReasonOverlay.addEventListener('click', onOverlayClick);
    el.checkoutReasonOverlay.classList.remove('hidden');
    el.checkoutReasonList.querySelector('.reason-option')?.focus();
  });
}

async function resolveCheckoutReasonAndRetry(result, retry) {
  if (!result?.needsOutReason) return result;
  const reason = await askCheckoutReason(result.employee?.fullName || preview?.employee?.fullName || '');
  if (!reason) return { ok: false, message: 'Checkout reason is required before punching out.' };
  return retry(reason);
}

async function runPunchAction(action) {
  try {
    const result = await action();
    handlePunchResult(result);
    return result;
  } catch (err) {
    showResult('err', 'Attendance Failed', 'Could not mark attendance. Please try again or contact HR.');
    scheduleReset();
    return { ok: false, message: 'Could not mark attendance. Please try again or contact HR.' };
  }
}

async function punchByCode() {
  const code = el.codeInput.value.trim();
  if (!code) {
    showResult('err', 'No Code Entered', 'Type or use the keypad to enter your employee code, then tap Punch.');
    return;
  }
  showResult('busy', 'Processing…', 'Verifying employee record and saving attendance…');
  await runPunchAction(async () => resolveCheckoutReasonAndRetry(
    await api.punchByCode({ code, method: 'RFID' }),
    outReason => api.punchByCode({ code, method: 'RFID', meta: { outReason } })
  ));
}

function resetLivenessUI() {
  if (!el.livenessRail) return;
  el.livenessRail.classList.remove('failed');
  if (el.livenessAction) el.livenessAction.textContent = 'Look at the camera, then start the live face check';
  const steps = el.livenessRail.querySelectorAll('.liveness-steps span');
  if (steps.length >= 5) {
    steps[0].textContent = 'Center';
    steps[1].textContent = 'Left';
    steps[2].textContent = 'Center';
    steps[3].textContent = 'Right';
    steps[4].textContent = 'Verified';
    steps.forEach(s => {
      s.classList.remove('done', 'current');
    });
  }
}

function setLivenessProgress(phase, message, failed = false, order = null) {
  if (!el.livenessRail) return;
  el.livenessRail.classList.toggle('failed', failed);
  el.livenessAction.textContent = message;
  const steps = el.livenessRail.querySelectorAll('.liveness-steps span');
  if (order && steps.length >= 5) {
    steps[1].textContent = order[0] === 'left' ? 'Left' : 'Right';
    steps[3].textContent = order[1] === 'left' ? 'Left' : 'Right';
  }
  steps.forEach((step, index) => {
    step.classList.toggle('done', phase > index);
    step.classList.toggle('current', phase === index && !failed);
  });
}

async function captureLivenessObservation() {
  const video = el.webcamEl;
  const faces = await window.detectFaceGeometry(video);
  if (faces.length !== 1) throw new Error('Keep exactly one face inside the oval.');
  const face = faces[0];
  return { at: Date.now(), yaw: face.yaw, centerX: face.centerX, centerY: face.centerY, scale: face.width };
}

async function runCameraLivenessChallenge() {
  if (!window.detectFaceGeometry) await window.faceLandmarkerReady;
  if (!window.detectFaceGeometry) throw new Error('The bundled face landmark model could not start.');
  const issued = await api.beginCameraLiveness();
  if (!issued?.ok) throw new Error(issued?.message || 'Could not start privileged liveness challenge.');
  const targets = ['center', issued.order[0], 'center', issued.order[1], 'center'];
  const labels = ['Center your face', `Turn ${issued.order[0].toUpperCase()}`, 'Return to center', `Turn ${issued.order[1].toUpperCase()}`, 'Return to center'];
  const observations = [];
  let phase = 0;
  let consecutive = 0;
  const matches = (target, yaw) => target === 'center' ? Math.abs(yaw) <= 0.18 : target === 'left' ? yaw >= 0.27 : yaw <= -0.27;
  try {
    while (Date.now() <= issued.expiresAt) {
      setLivenessProgress(phase, labels[phase], false, issued.order);
      let observation = null;
      try {
        observation = await captureLivenessObservation();
      } catch {
        consecutive = 0;
        await new Promise(resolve => setTimeout(resolve, 110));
        continue;
      }
      observations.push(observation);
      consecutive = matches(targets[phase], observation.yaw) ? consecutive + 1 : 0;
      if (consecutive >= 3) {
        if (phase === 4) { setLivenessProgress(5, 'Live person verified', false, issued.order); return { challengeId: issued.id, observations }; }
        phase += 1;
        consecutive = 0;
      }
      await new Promise(resolve => setTimeout(resolve, 110));
    }
    throw new Error('Active liveness challenge expired. Start again.');
  } catch (error) {
    await api.cancelCameraLiveness(issued.id).catch(() => {});
    throw error;
  }
}

async function punchCamera() {
  if (cameraPunchBusy) return { ok: false, message: 'Face verification is already in progress.' };
  cameraPunchBusy = true;
  el.camCaptureBtn.disabled = true;
  try {
    return await performCameraPunch();
  } finally {
    cameraPunchBusy = false;
    el.camCaptureBtn.disabled = false;
  }
}

async function performCameraPunch() {
  const code = el.codeInput.value.trim();
  if (kioskState?.terminal?.ipCameraUrl) {
    showResult('err', 'IP Camera Blocked', 'IP camera still images cannot prove liveness. Use the local webcam or fingerprint.');
    return { ok: false, message: 'IP camera attendance is blocked for security.' };
  }
  clearCapturedPhoto();
  showResult('busy', 'Capturing Evidence…', 'Saving camera snapshot as attendance proof…');
  let evidence = null;
  let descriptor = null;
  let livenessProof = null;
  try {
    livenessProof = await runCameraLivenessChallenge();
    let lastReadyFrame = null;
    for (let i = 0; i < 3; i += 1) {
      const frame = await assessCameraFrame();
      if (!frame.ok) {
        showResult('err', 'Face Not Ready', frame.message);
        return { ok: false, message: frame.message };
      }
      lastReadyFrame = frame;
      if (i < 2) await new Promise(resolve => setTimeout(resolve, 140));
    }
    descriptor = lastReadyFrame.descriptor;
    evidence = await captureEvidence();
  } catch (err) {
    const message = err?.message || 'Could not complete active liveness.';
    setLivenessProgress(-1, message, true);
    showResult('err', 'Liveness Failed', message);
    return { ok: false, message };
  }
  const cameraPayload = {
    code,
    descriptor,
    evidence,
    livenessProof,
    meta: { camera: kioskState?.terminal?.ipCameraUrl ? 'ip-camera' : 'webcam' },
  };
  return runPunchAction(async () => {
    const firstResult = await api.punchCamera(cameraPayload);
    return resolveCheckoutReasonAndRetry(
      firstResult,
      outReason => api.punchCamera({ ...cameraPayload, livenessProof: null, cameraAuthorization: firstResult.cameraAuthorization, meta: { ...cameraPayload.meta, outReason } })
    );
  });
}

async function punchFingerprint() {
  if (fpBusy) return;
  fpBusy = true;
  const code = el.codeInput.value.trim();

  setFpOrb('scanning', 'Scanning… keep finger flat on reader');
  resetFingerprintPreview('Attendance scan started. If this fails before capture, run Test Fingerprint Scanner.');
  showResult('busy', 'Fingerprint Scan', 'Place your finger flat on the fingerprint reader and hold still.');

  const fpPayload = { code };
  const result = await (async () => {
    try {
      return await resolveCheckoutReasonAndRetry(
        await api.punchFingerprint(fpPayload),
        outReason => api.punchFingerprint({ ...fpPayload, meta: { outReason } })
      );
    } catch (err) {
      return { ok: false, message: 'Could not mark attendance. Please try again or contact HR.' };
    } finally {
      fpBusy = false;
    }
  })();

  if (result.ok) {
    setFpOrb('success', 'Fingerprint matched!');
    el.fpQualityFill.style.width = `${Math.max(5, Math.min(100, Number(result.quality || 95)))}%`;
    renderFingerprintPreview(result, 'Matched');
  } else {
    setFpOrb('error', result.message || 'Scan failed. Please try again.');
    if (hasFingerprintPreview(result)) {
      el.fpQualityFill.style.width = `${Math.max(5, Math.min(100, Number(result.quality || 60)))}%`;
      renderFingerprintPreview(result, 'Not matched');
    } else {
      renderFingerprintPreviewError(result.message || 'Attendance scan did not reach scanner capture.');
    }
  }
  handlePunchResult(result);
}

async function testFingerprintScanner() {
  if (fpBusy) return;
  fpBusy = true;
  setFpOrb('scanning', 'Testing scanner... place any finger on the reader');
  resetFingerprintPreview('Waiting for scanner capture...');
  showResult('busy', 'Scanner Test', 'Place any finger on the fingerprint reader. This will not mark attendance.');

  const result = await api.testFingerprintScanner();
  fpBusy = false;

  if (result.ok) {
    const deviceName = result.device?.name || result.device?.type || result.provider || 'Fingerprint reader';
    const quality = Number(result.quality || 0);
    setFpOrb('success', `Scanner OK (${quality}% quality)`);
    el.fpQualityFill.style.width = `${Math.max(5, Math.min(100, quality || 80))}%`;
    renderFingerprintPreview(result);
    showResult('ok', 'Scanner Working', deviceName, `${quality || '--'}%`, [
      result.provider || '',
      result.templateLength ? `${result.templateLength} chars captured` : '',
    ].filter(Boolean));
  } else {
    setFpOrb('error', result.message || 'Scanner test failed.');
    renderFingerprintPreviewError(result.message || 'Could not capture from fingerprint reader.');
    showResult('err', 'Scanner Test Failed', result.message || 'Could not capture from fingerprint reader.');
  }
  scheduleReset();
}

function handlePunchResult(result) {
  if (result.ok) {
    const { employee, action } = result;
    const attendance = result.attendance || result.log || {};
    const timeStr = (result.eventTime || (action === 'OUT' ? attendance.punchOut : attendance.punchIn) || '').slice(0, 5);
    const orgLine = [
      employee.departmentName,
      employee.designationName,
      employee.branchName,
    ].filter(Boolean).join(' · ');
    const reasonLine = result.returnedFromBreak
      ? `Returned from ${result.breakReason || 'break'}`
      : action === 'OUT'
        ? `Out reason: ${result.outReason || 'Shift exit'}`
        : 'Entry recorded';

    showResult('ok',
      result.returnedFromBreak ? 'Return from Break Recorded' : `${action === 'OUT' ? 'Punch Out' : 'Punch In'} Recorded`,
      employee.fullName,
      timeStr,
      [
        employee.employeeCode,
        employee.designationName,
        employee.departmentName,
        result.returnedFromBreak
          ? `Returned from ${result.breakReason || 'break'}`
          : action === 'OUT' ? (result.outReason || 'Shift exit') : attendance.status,
        attendance.method,
        attendance.terminalLocation || kioskState?.terminal?.location || '',
      ].filter(Boolean)
    );
    renderResultEmployee(employee, orgLine || reasonLine);

    el.codeInput.value = '';
    preview = null;
    clearPreview();
    api.getState().then(state => {
      kioskState = state;
      refreshTodayFeed();
      renderDirectory(el.dirSearch.value);
    }).catch(() => refreshTodayFeed());
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
  clearResultEmployee();

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

function renderResultEmployee(employee, metaLine) {
  if (!employee) return;
  const name = employee.fullName || 'Employee';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  el.resultEmpName.textContent = name;
  el.resultEmpMeta.textContent = metaLine || [employee.departmentName, employee.designationName].filter(Boolean).join(' · ');
  const pictureUrl = safeImageUrl(employee.pictureUrl);
  if (pictureUrl) {
    el.resultAvatar.innerHTML = `<img src="${esc(pictureUrl)}" alt="" />`;
  } else {
    el.resultAvatar.textContent = initials || '?';
  }
  el.resultEmployee.classList.remove('hidden');
}

function clearResultEmployee() {
  el.resultEmployee.classList.add('hidden');
  el.resultAvatar.innerHTML = '';
  el.resultEmpName.textContent = '';
  el.resultEmpMeta.textContent = '';
}

function resetResultToIdle() {
  el.resultCard.className = 'result-card idle';
  clearCapturedPhoto();
  clearResultEmployee();
  resetLivenessUI();
  el.resultState.textContent = 'TERMINAL READY';
  el.resultName.textContent = 'Attendance Kiosk Online';
  if (activeMode === MODE.CAM) {
    const auto = isAutoCaptureEnabled();
    el.resultDetail.innerHTML = [
      '<span class="guide-line"><b>1.</b> Keep face inside the oval marker.</span>',
      '<span class="guide-line"><b>2.</b> Look straight and hold still.</span>',
      auto
        ? '<span class="guide-line"><b>3.</b> Auto-capture will punch automatically.</span>'
        : '<span class="guide-line"><b>3.</b> Tap Capture &amp; Punch.</span>',
      kioskState?.terminal?.branchId
        ? '<span class="guide-line"><b>4.</b> Visiting from another branch? Enter your complete employee ID first.</span>'
        : '',
    ].filter(Boolean).join('');
  } else {
    el.resultDetail.textContent = 'Select a punch method, then enter employee code or scan fingerprint.';
  }
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

function refreshTodayOnlyFeedLegacy() {
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

function refreshTodayFeed() {
  if (!kioskState) return;
  el.todayDateLabel.textContent = 'Last 10 across all employees';

  const employees = kioskState.employees || [];
  const transactions = (kioskState.attendances || []).flatMap(log => {
    const items = [];
    if (log.punchIn) items.push({ log, action: 'IN', at: `${log.date || ''}T${log.punchIn}` });
    for (const attendanceBreak of Array.isArray(log.breaks) ? log.breaks : []) {
      if (attendanceBreak.outAt) {
        items.push({
          log,
          action: 'OUT',
          at: `${log.date || ''}T${attendanceBreak.outAt}`,
          eventTime: attendanceBreak.outAt,
          reason: attendanceBreak.reason,
        });
      }
      if (attendanceBreak.returnAt) {
        items.push({
          log,
          action: 'IN',
          at: `${log.date || ''}T${attendanceBreak.returnAt}`,
          eventTime: attendanceBreak.returnAt,
          reason: `Returned from ${attendanceBreak.reason || 'break'}`,
        });
      }
    }
    if (log.punchOut) items.push({ log, action: 'OUT', at: `${log.date || ''}T${log.punchOut}` });
    return items;
  }).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10);

  if (!transactions.length) {
    el.todayFeed.innerHTML = '<div class="feed-empty">No punches recorded yet.</div>';
    return;
  }

  el.todayFeed.innerHTML = transactions.map(item => {
    const { log, action } = item;
    const emp = employees.find(e => e.id === log.employeeId);
    const name = emp?.fullName || log.employeeId;
    const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const pictureUrl = safeImageUrl(emp?.pictureUrl || emp?.photoUrl || emp?.profileImage || emp?.imageUrl || '');
    const isOut = action === 'OUT';
    const isLate = action === 'IN' && log.status === 'Late';
    const rowClass = isOut ? 'row-out' : isLate ? 'row-late' : 'row-ok';
    const badge = isOut ? `<span class="feed-badge badge-out">OUT</span>`
      : isLate ? `<span class="feed-badge badge-late">LATE</span>`
      : `<span class="feed-badge badge-in">IN</span>`;
    const time = item.eventTime || (action === 'OUT' ? log.punchOut : log.punchIn);
    const dateLabel = log.date ? new Date(`${log.date}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';
    const avatar = pictureUrl ? `<img src="${esc(pictureUrl)}" alt="" />` : esc(initials);

    return `<div class="feed-row ${rowClass}">
      <div class="feed-avatar-sm">${avatar}</div>
      <div class="feed-info">
        <div class="feed-name">${esc(name)}</div>
        <div class="feed-sub">${esc([dateLabel, item.reason || log.method || 'Code', log.status || ''].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="feed-times">
        <div class="${isOut ? 'feed-out' : 'feed-in'}">${esc(time?.slice(0,5) || '--')}</div>
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
    const templates = getFingerprintTemplates(emp);
    const hasFp = templates.length > 0;
    const log = todayLogs.find(l => l.employeeId === emp.id);
    const punchedIn = log?.punchIn && !log?.punchOut;
    const classes = [hasFp ? 'has-fp' : '', punchedIn ? 'punched-in' : ''].filter(Boolean).join(' ');
    const lastReturnAt = Array.isArray(log?.breaks) ? log.breaks.at(-1)?.returnAt : '';
    const status = punchedIn
      ? `In since ${(lastReturnAt || log.punchIn)?.slice(0,5)}`
      : log?.punchOut
        ? `${log.outReason || 'Out'} ${log.punchOut?.slice(0,5)}`
        : hasFp ? `${templates.length} FP template${templates.length > 1 ? 's' : ''}` : 'No fingerprint';
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

function normalizeFingerprintTemplate(template) {
  if (!template) return '';
  if (typeof template === 'string') return template.trim();
  if (typeof template !== 'object') return '';
  return String(template.template || template.sample || template.data || template.fmd || template.value || template.base64 || '').trim();
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
    const { report } = await api.sync();
    kioskState = await api.getState();
    applyModeSecurity();
    const errs = report.errors?.length || 0;
    el.syncStatus.textContent = errs
      ? `${errs} sync warning(s)`
      : `Synced: ${report.employees} emp, ${report.biometricTemplates || 0} bio, ${report.departments || 0} dept, ${report.pushed} pushed`;
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
  el.stBranchId.innerHTML = [
    '<option value="">Select a branch…</option>',
    ...(kioskState.branches || []).map(branch => {
      const label = [branch.code, branch.name, branch.city].filter(Boolean).join(' · ');
      return `<option value="${esc(branch.id)}">${esc(label)}</option>`;
    }),
  ].join('');
  el.stBranchId.value = t.branchId || '';
  el.stIpCamUrl.value       = t.ipCameraUrl || '';
  el.stAllowCodeOnlyPunch.checked = !!t.allowCodeOnlyPunch;
  el.stReqCodeFp.checked    = !!t.requireCodeWithFingerprint;
  el.stReqCodeCam.checked   = false;
  el.stAutoCaptureCamera.checked = t.autoCaptureCamera !== false;
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
  if (!el.stBranchId.value) {
    el.stBranchId.focus();
    el.stBranchId.style.borderColor = 'var(--red)';
    el.stSyncInfo.textContent = 'Assign this kiosk to a branch before saving. This limits the local employee and biometric cache.';
    return;
  }
  el.stBranchId.style.borderColor = '';
  const enablingCodeOnly = el.stAllowCodeOnlyPunch.checked && !kioskState?.terminal?.allowCodeOnlyPunch;
  if (enablingCodeOnly) {
    const confirmed = await showMessageDialog({
      tone: 'danger',
      eyebrow: 'Security Exception',
      title: 'Enable code-only attendance?',
      message: 'This removes biometric proof from the Employee Code tab and can allow one person to punch for another employee.',
      detail: 'Enable it only as a controlled temporary fallback. Fingerprint or Camera verification is strongly recommended.',
      confirmLabel: 'Enable High-Risk Mode',
      cancelLabel: 'Keep Disabled',
      showCancel: true,
    });
    if (!confirmed) {
      el.stAllowCodeOnlyPunch.checked = false;
      return;
    }
  }
  const terminal = await api.saveSettings({
    id: el.stTerminalId.value.trim() || 'KIOSK-WIN-01',
    location: el.stLocation.value.trim() || 'Main Entrance Gate-1',
    branchId: el.stBranchId.value,
    ipCameraUrl: el.stIpCamUrl.value.trim(),
    allowCodeOnlyPunch: el.stAllowCodeOnlyPunch.checked,
    requireCodeWithFingerprint: el.stReqCodeFp.checked,
    requireCodeWithCamera: false,
    autoCaptureCamera: el.stAutoCaptureCamera.checked,
    autoFullscreen: el.stAutoFullscreen.checked,
  });
  if (kioskState) kioskState.terminal = terminal;
  applyModeSecurity();
  closeSettings();
  await performSync();
  const branchName = kioskState?.assignedBranch?.name || 'Branch not assigned';
  el.terminalLine.textContent = `${branchName} · ${terminal.location} · ${terminal.id}`;
  if (activeMode === MODE.CAM) {
    const autoCapture = !!terminal.autoCaptureCamera;
    el.camCaptureBtn.classList.remove('hidden');
    if (autoCapture) startAutoCapture();
    else stopAutoCapture();
    resetResultToIdle();
  }
  showResult('ok', 'SETTINGS SAVED', 'Kiosk configuration updated successfully.');
  scheduleReset();
}

// ─── Local Maintenance Confirmation ──────────────────────────────────────────
function closeMessageDialog(confirmed = false) {
  if (!messageResolver) return;
  const resolve = messageResolver;
  messageResolver = null;
  el.messageOverlay.classList.add('hidden');
  el.messageOverlay.setAttribute('aria-hidden', 'true');
  resolve(confirmed);
  const focusTarget = messagePreviousFocus;
  messagePreviousFocus = null;
  if (focusTarget?.isConnected) focusTarget.focus();
}

function showMessageDialog({ tone = 'info', eyebrow = 'Kiosk Notice', title = 'Confirm action', message = '', detail = '', confirmLabel = 'OK', cancelLabel = 'Cancel', showCancel = false } = {}) {
  if (messageResolver) return Promise.resolve(false);
  el.messageDialog.dataset.tone = ['info', 'warning', 'danger', 'success'].includes(tone) ? tone : 'info';
  el.messageEyebrow.textContent = eyebrow;
  el.messageTitle.textContent = title;
  el.messageText.textContent = message;
  el.messageDetail.textContent = detail;
  el.messageDetail.classList.toggle('hidden', !detail);
  el.messageConfirm.textContent = confirmLabel;
  el.messageCancel.textContent = cancelLabel;
  el.messageCancel.classList.toggle('hidden', !showCancel);
  messagePreviousFocus = document.activeElement;
  el.messageOverlay.classList.remove('hidden');
  el.messageOverlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => (showCancel ? el.messageCancel : el.messageConfirm).focus());
  return new Promise(resolve => { messageResolver = resolve; });
}

function messageDialogFocusableButtons() {
  return [...el.messageDialog.querySelectorAll('button:not([disabled])')].filter(button => !button.classList.contains('hidden'));
}

const MAINTENANCE_CONFIRM_MESSAGES = [
  'This clears attendance records stored locally on this kiosk only. It does not delete attendance already stored in Firestore.',
  'Pending offline attendance uploads will also be permanently discarded. Employees, settings, evidence, and Firestore remain protected.',
  'Final irreversible warning: unsynced attendance cannot be recovered after the local cache and queued uploads are cleared.',
];

function renderMaintenanceConfirmStep() {
  const step = maintenanceConfirmStep;
  el.maintenanceConfirmDialog.dataset.step = String(step);
  el.maintenanceConfirmStep.textContent = `Step ${step} of 3`;
  el.maintenanceConfirmMessage.textContent = MAINTENANCE_CONFIRM_MESSAGES[step - 1];
  el.maintenanceConfirmContinue.textContent = step === 3 ? 'Clear Local Attendance' : 'Continue';
  [...el.maintenanceConfirmDialog.querySelectorAll('[data-maintenance-step]')].forEach((node, index) => {
    const nodeStep = index + 1;
    node.classList.toggle('is-complete', nodeStep < step);
    node.classList.toggle('is-current', nodeStep === step);
  });
  [...el.maintenanceConfirmDialog.querySelectorAll('.maintenance-rail')]
    .forEach((rail, index) => rail.classList.toggle('is-complete', index + 1 < step));
}

function closeMaintenanceConfirm(confirmed = false) {
  if (!maintenanceConfirmResolver) return;
  const resolve = maintenanceConfirmResolver;
  maintenanceConfirmResolver = null;
  el.maintenanceConfirmOverlay.classList.add('hidden');
  el.maintenanceConfirmOverlay.setAttribute('aria-hidden', 'true');
  resolve(confirmed);
  const focusTarget = maintenancePreviousFocus;
  maintenancePreviousFocus = null;
  if (focusTarget?.isConnected) focusTarget.focus();
}

function openMaintenanceConfirm() {
  if (maintenanceConfirmResolver) return Promise.resolve(false);
  maintenanceConfirmStep = 1;
  maintenancePreviousFocus = document.activeElement;
  renderMaintenanceConfirmStep();
  el.maintenanceConfirmOverlay.classList.remove('hidden');
  el.maintenanceConfirmOverlay.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => el.maintenanceConfirmContinue.focus());
  return new Promise(resolve => { maintenanceConfirmResolver = resolve; });
}

async function clearLocalAttendanceCache() {
  const confirmed = await openMaintenanceConfirm();
  if (!confirmed) return;

  el.stClearAttendanceCache.disabled = true;
  el.stClearAttendanceCache.textContent = 'Clearing...';
  try {
    const result = await api.clearLocalAttendanceCache();
    await performSync();
    closeSettings();
    showResult(
      'ok',
      'LOCAL CACHE CLEARED',
      `${result.clearedCount} cached record${result.clearedCount === 1 ? '' : 's'} and ${result.discardedPendingCount} queued upload${result.discardedPendingCount === 1 ? '' : 's'} removed. Firestore sync completed.`
    );
    scheduleReset();
  } catch {
    closeSettings();
    showResult('err', 'LOCAL CACHE NOT CLEARED', 'The local attendance cache could not be cleared. No Firestore records were deleted.');
    scheduleReset();
  } finally {
    el.stClearAttendanceCache.disabled = false;
    el.stClearAttendanceCache.textContent = 'Clear Local Cache';
  }
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
  el.codeInput.addEventListener('input', () => {
    if (el.codeInput.value.trim()) {
      autoCaptureAwaitingFaceExit = false;
      autoCaptureHoldUntil = 0;
    }
    scheduleEmployeeLookup();
  });
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
  el.fpTestBtn.addEventListener('click', testFingerprintScanner);
  el.camCaptureBtn.addEventListener('click', punchCamera);

  // Sync
  el.syncBtn.addEventListener('click', performSync);

  // Settings
  el.settingsBtn.addEventListener('click', openSettings);
  el.settingsClose.addEventListener('click', closeSettings);
  el.stSave.addEventListener('click', saveSettings);
  el.stClearAttendanceCache.addEventListener('click', clearLocalAttendanceCache);
  el.messageCancel.addEventListener('click', () => closeMessageDialog(false));
  el.messageClose.addEventListener('click', () => closeMessageDialog(false));
  el.messageConfirm.addEventListener('click', () => closeMessageDialog(true));
  el.messageOverlay.addEventListener('click', e => {
    if (e.target === el.messageOverlay) closeMessageDialog(false);
  });
  el.messageOverlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMessageDialog(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = messageDialogFocusableButtons();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  el.maintenanceConfirmCancel.addEventListener('click', () => closeMaintenanceConfirm(false));
  el.maintenanceConfirmClose.addEventListener('click', () => closeMaintenanceConfirm(false));
  el.maintenanceConfirmContinue.addEventListener('click', () => {
    if (maintenanceConfirmStep < 3) {
      maintenanceConfirmStep += 1;
      renderMaintenanceConfirmStep();
      el.maintenanceConfirmContinue.focus();
      return;
    }
    closeMaintenanceConfirm(true);
  });
  el.maintenanceConfirmOverlay.addEventListener('click', e => {
    if (e.target === el.maintenanceConfirmOverlay) closeMaintenanceConfirm(false);
  });
  el.maintenanceConfirmOverlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMaintenanceConfirm(false);
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...el.maintenanceConfirmDialog.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  el.stStartBridge.addEventListener('click', async () => {
    const result = await api.startBridge();
    await refreshStats();
    renderSettingsEvents();
    // Brief feedback
    el.stStartBridge.textContent = result.ok ? 'Driver Host Ready' : `Driver Host Error: ${result.message.slice(0, 32)}`;
    setTimeout(() => { el.stStartBridge.textContent = 'Check Biometric Driver Host'; }, 3000);
  });
  el.stTestScanner.addEventListener('click', async () => {
    el.stTestScanner.textContent = 'Place Finger...';
    resetFingerprintPreview('Waiting for scanner capture...');
    const result = await api.testFingerprintScanner();
    await refreshStats();
    renderSettingsEvents();
    el.stTestScanner.textContent = result.ok ? 'Scanner OK' : 'Scanner Failed';
    if (result.ok) renderFingerprintPreview(result);
    else renderFingerprintPreviewError(result.message || 'Could not capture from fingerprint reader.');
    showResult(
      result.ok ? 'ok' : 'err',
      result.ok ? 'Scanner Working' : 'Scanner Test Failed',
      result.ok ? (result.device?.name || result.device?.type || 'Fingerprint reader captured successfully.') : result.message,
      result.ok ? `${result.quality || '--'}%` : '',
      result.ok ? [result.provider || '', result.templateLength ? `${result.templateLength} chars captured` : ''].filter(Boolean) : []
    );
    scheduleReset();
    setTimeout(() => { el.stTestScanner.textContent = 'Test Scanner'; }, 3000);
  });

  // Exit
  el.exitBtn.addEventListener('click', async () => {
    const confirmed = await showMessageDialog({
      tone: 'danger',
      eyebrow: 'Secure Session',
      title: 'Exit attendance kiosk?',
      message: 'Attendance capture will stop on this terminal until the kiosk is started again.',
      detail: 'Employees will not be able to record fingerprint, camera, or authorized code punches on this device.',
      confirmLabel: 'Exit Kiosk',
      cancelLabel: 'Cancel',
      showCancel: true,
    });
    if (confirmed) api.exit();
  });

  // Directory search
  el.dirSearch.addEventListener('input', () => renderDirectory(el.dirSearch.value));

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (el.settingsOverlay.classList.contains('hidden')) {
      if (e.key === 'F1' && kioskState?.terminal?.allowCodeOnlyPunch) { e.preventDefault(); setMode(MODE.CODE); }
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
      applyModeSecurity();
      refreshTodayFeed();
      renderDirectory(el.dirSearch.value);
    }).catch(() => {});
  });

  api.onDriverStatus(data => {
    setPill(el.pillBridge, data?.running ? 'online' : 'offline');
  });

  // Driver host check every minute
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

function safeImageUrl(value) {
  const url = String(value || '');
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(url) && url.length <= 700000 ? url : '';
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
    const branchName = kioskState.assignedBranch?.name || 'Branch not assigned';
    el.terminalLine.textContent = `${branchName} · ${kioskState.terminal.location} · ${kioskState.terminal.id}`;

    // Initial UI
    setPill(el.pillBridge, kioskState.bridgeRunning ? 'online' : 'offline');
    setPill(el.pillOnline, 'warning');
    setPill(el.pillSync, (kioskState.pendingSync || []).length > 0 ? 'warning' : 'online');

    refreshTodayFeed();
    renderDirectory('');
    renderEventLog();
    resetFingerprintPreview();
    applyModeSecurity();
    setMode(MODE.FP);

    // Kick off initial sync
    performSync().catch(() => {});

    // Stats refresh every 30s
    setInterval(refreshStats, 30000);

  } catch (err) {
    showResult('err', 'Startup Error', 'Failed to load kiosk state. Restart the terminal.');
  }
}

boot();
