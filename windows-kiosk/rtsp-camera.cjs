'use strict';
// Live video from an RTSP camera (for example a Hikvision that only encodes H.264/H.265). Electron cannot play RTSP,
// so FFmpeg decodes the stream on the kiosk PC and writes small JPEG frames to its stdout; the frames are split here
// and handed to the renderer as data URLs, exactly like the MJPEG path in ip-camera.cjs.
//
// FFmpeg is found at runtime: windows-kiosk/ffmpeg-bin/ffmpeg.exe packed with the installer (asar-unpacked), then
// %ProgramData%\BinIshaqKiosk\ffmpeg.exe, then "ffmpeg" on the PATH (e.g. `winget install Gyan.FFmpeg`).
// RTSP has no separate credential channel in FFmpeg, so the user and password go into the URL of the child process;
// they are never logged (redactUrl) and never leave the kiosk PC.

const fs = require('node:fs');
const path = require('node:path');

const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);
const MAX_BUFFER = 8 * 1024 * 1024;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const isRtspUrl = url => /^rtsps?:\/\//i.test(String(url || '').trim());

/** Insert the terminal's credentials unless the URL already carries some. */
function rtspUrlWithCredentials(url, user, password) {
  const parsed = new URL(String(url).trim());
  if (!parsed.username && user) {
    parsed.username = encodeURIComponent(user);
    parsed.password = encodeURIComponent(password || '');
  }
  return parsed.toString();
}

/** URL safe for logs and messages: credentials replaced. */
function redactUrl(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.username || parsed.password) { parsed.username = '***'; parsed.password = '***'; }
    return parsed.toString();
  } catch { return '(invalid URL)'; }
}

// 960 px at JPEG quality 3: faces 2-3 m from a ceiling camera stay sharp enough for the identity model (640 px at
// quality 5 lost the eye and mouth detail it aligns on).
function ffmpegArgs(url, { fps = 12, width = 960, quality = 3, frames = 0, zoom = 1 } = {}) {
  // Zoom crops the centre of the picture (even dimensions, as the JPEG encoder requires) before scaling.
  const crop = zoom > 1 ? `crop=trunc(iw/${zoom}/2)*2:trunc(ih/${zoom}/2)*2,` : '';
  return [
    '-hide_banner', '-loglevel', 'error', '-nostdin',
    '-rtsp_transport', 'tcp', '-timeout', '8000000',
    '-i', url,
    '-an', '-vf', `${crop}fps=${fps},scale=${width}:-2`,
    ...(frames ? ['-frames:v', String(frames)] : []),
    '-q:v', String(quality), '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1',
  ];
}

/** First existing candidate, or "ffmpeg" (PATH lookup at spawn time). */
function findFfmpeg({ moduleDir = __dirname, programData = process.env.ProgramData, exists = fs.existsSync } = {}) {
  const candidates = [
    path.join(moduleDir, 'ffmpeg-bin', 'ffmpeg.exe').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`),
    programData ? path.join(programData, 'BinIshaqKiosk', 'ffmpeg.exe') : '',
  ].filter(Boolean);
  return candidates.find(candidate => exists(candidate)) || 'ffmpeg';
}

/** Turn FFmpeg's stderr / exit into a message for the kiosk badge. */
function describeFailure({ error, stderr, code }) {
  if (error?.code === 'ENOENT') {
    return { message: 'FFmpeg is not installed on this kiosk PC. Install it (winget install Gyan.FFmpeg) or place ffmpeg.exe in %ProgramData%\\BinIshaqKiosk, then restart the kiosk.' };
  }
  const text = String(stderr || '');
  if (/401|unauthori[sz]ed/i.test(text)) return { rejected: true, message: 'Camera rejected the username or password (RTSP 401).' };
  if (/404|not found/i.test(text)) return { message: 'Camera has no stream at that RTSP path (404). Hikvision: rtsp://CAMERA-IP:554/Streaming/Channels/102' };
  if (/connection refused|timed out|timeout|no route|unreachable/i.test(text)) return { message: 'Camera RTSP port is unreachable. Check the IP and that RTSP (port 554) is enabled.' };
  const last = text.trim().split(/\r?\n/).filter(Boolean).pop();
  return { message: `RTSP stream ended${code != null ? ` (FFmpeg exit ${code})` : ''}${last ? `: ${last.slice(0, 160)}` : '.'}` };
}

/** Splits a byte stream of concatenated JPEGs. */
function createJpegSplitter(onFrame) {
  let buffer = Buffer.alloc(0);
  return chunk => {
    buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
    for (;;) {
      const start = buffer.indexOf(JPEG_START);
      if (start < 0) { buffer = Buffer.alloc(0); return; }
      const end = buffer.indexOf(JPEG_END, start + 2);
      if (end < 0) { buffer = start > 0 ? buffer.subarray(start) : buffer; break; }
      onFrame(buffer.subarray(start, end + 2));
      buffer = buffer.subarray(end + 2);
    }
    if (buffer.length > MAX_BUFFER) buffer = Buffer.alloc(0);
  };
}

const jpegDataUrl = frame => `data:image/jpeg;base64,${frame.toString('base64')}`;

/** Runs FFmpeg once; resolves when it exits. `spawn` is child_process.spawn (injected for tests). */
function runFfmpeg({ ffmpeg, args, spawn, onFrame, stallMs, register }) {
  return new Promise(resolve => {
    let child;
    let frames = 0;
    let stderr = '';
    let settled = false;
    let watchdog = null;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      resolve({ frames, ...result });
    };
    const kill = () => { try { child?.kill(); } catch { /* already gone */ } };
    const touch = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { kill(); finish({ ok: false, message: `Camera stopped sending video for ${Math.round(stallMs / 1000)} seconds.` }); }, stallMs);
    };
    try {
      child = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      return finish({ ok: false, ...describeFailure({ error }) });
    }
    register?.(child);
    touch();
    const split = createJpegSplitter(frame => { frames += 1; onFrame(frame); });
    child.stdout.on('data', chunk => { touch(); split(chunk); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on('error', error => finish({ ok: false, ...describeFailure({ error }) }));
    child.on('close', code => finish(frames ? { ok: true } : { ok: false, ...describeFailure({ stderr, code }) }));
  });
}

/** One frame for Settings → "Test camera". */
async function grabRtspFrame({ url, user = '', password = '', spawn, ffmpeg = findFfmpeg(), timeoutMs = 15000, zoom = 1 }) {
  if (!isRtspUrl(url)) return { ok: false, message: 'Not an rtsp:// URL.' };
  let dataUrl = '';
  let target;
  try { target = rtspUrlWithCredentials(url, user, password); } catch (error) { return { ok: false, message: `Invalid camera URL: ${error.message}` }; }
  const result = await runFfmpeg({ ffmpeg, args: ffmpegArgs(target, { frames: 1, zoom }), spawn, stallMs: timeoutMs, onFrame: frame => { if (!dataUrl) dataUrl = jpegDataUrl(frame); } });
  return dataUrl ? { ok: true, dataUrl } : { ok: false, rejected: !!result.rejected, message: result.message || 'No frame received.' };
}

class RtspCameraStream {
  constructor({ url, user = '', password = '', spawn, onFrame, onStatus, ffmpeg = findFfmpeg(), fps = 12, width = 960, zoom = 1, retryMs = 3000, refusedMs = 60000, stallMs = 12000 }) {
    Object.assign(this, { url: String(url || '').trim(), user, password, spawn, onFrame, onStatus: onStatus || (() => {}), ffmpeg, fps, width, zoom, retryMs, refusedMs, stallMs });
    this.active = false;
    this.child = null;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.loop();
  }

  stop() {
    this.active = false;
    try { this.child?.kill(); } catch { /* already gone */ }
    this.child = null;
  }

  async loop() {
    let target;
    try { target = rtspUrlWithCredentials(this.url, this.user, this.password); } catch (error) {
      this.onStatus(`Invalid camera URL: ${error.message}`, { ok: false });
      return;
    }
    const args = ffmpegArgs(target, { fps: this.fps, width: this.width, zoom: this.zoom });
    while (this.active) {
      const outcome = await runFfmpeg({
        ffmpeg: this.ffmpeg, args, spawn: this.spawn, stallMs: this.stallMs,
        register: child => { this.child = child; },
        onFrame: frame => { if (this.active) this.onFrame(jpegDataUrl(frame)); },
      });
      this.child = null;
      if (!this.active) break;
      if (!outcome.ok) this.onStatus(outcome.message, outcome);
      // FFmpeg missing will not fix itself; check rarely. A refusal waits long enough not to trip the camera's login lock.
      await sleep(outcome.rejected ? this.refusedMs : /not installed/.test(outcome.message || '') ? this.refusedMs : this.retryMs);
    }
  }
}

module.exports = { isRtspUrl, rtspUrlWithCredentials, redactUrl, ffmpegArgs, findFfmpeg, describeFailure, createJpegSplitter, grabRtspFrame, RtspCameraStream };
