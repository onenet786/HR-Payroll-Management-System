'use strict';
// IP camera frames for the kiosk. Browsers and Electron renderers cannot answer an HTTP Digest challenge for an <img>, and
// a frame loaded straight from the camera would taint the evidence canvas, so the main process talks to the camera with
// the terminal's credentials and hands the renderer same-origin data URLs. Two entry points:
//   fetchIpCameraFrame  - one still frame (Settings → "Test camera").
//   IpCameraStream      - live picture: holds an MJPEG connection open and reports every frame, or re-requests a snapshot
//                         URL back to back; reconnects on errors and waits a minute after a refused login.
// Pure helpers live here so they can be tested without Electron or a camera.

const JPEG_START = Buffer.from([0xff, 0xd8]);
const JPEG_END = Buffer.from([0xff, 0xd9]);
const MAX_BYTES = 8 * 1024 * 1024;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const headerValue = (headers, name) => {
  const raw = headers?.[name] ?? headers?.[name.toLowerCase()];
  return String(Array.isArray(raw) ? raw[0] : raw || '').toLowerCase();
};

/** First complete JPEG inside a buffer (MJPEG multipart or a plain snapshot), or null. */
function firstJpegFrame(buffer) {
  const start = buffer.indexOf(JPEG_START);
  if (start < 0) return null;
  const end = buffer.indexOf(JPEG_END, start + 2);
  return end > start ? buffer.subarray(start, end + 2) : null;
}

/** Turn a finished response body into a data URL, or explain why it is not an image. */
function imageDataUrl(contentType, buffer) {
  if (!buffer.length) return { ok: false, message: 'Camera returned an empty image.' };
  const type = String(contentType || '').split(';')[0].trim();
  if (type.startsWith('image/')) return { ok: true, dataUrl: `data:${type};base64,${buffer.toString('base64')}` };
  const frame = firstJpegFrame(buffer);
  if (frame) return { ok: true, dataUrl: `data:image/jpeg;base64,${frame.toString('base64')}` };
  return { ok: false, message: `Camera returned ${type || 'unknown content'} instead of an image. Use a snapshot (JPEG) or MJPEG URL.` };
}

const jpegDataUrl = frame => `data:image/jpeg;base64,${frame.toString('base64')}`;

/** Answer the camera's Digest/Basic challenge once; a second challenge means the credentials were refused. */
function attachLogin(client, user, password, finish) {
  let logins = 0;
  client.on('login', (authInfo, callback) => {
    logins += 1;
    if (authInfo?.isProxy) { callback(); return; }
    const challenge = authInfo?.scheme ? ` (${authInfo.scheme}${authInfo.realm ? `, realm "${authInfo.realm}"` : ''})` : '';
    if (!user) {
      callback();
      return finish({ ok: false, rejected: true, message: `Camera requires a username and password${challenge}. Enter them in kiosk Settings → IP Camera.` });
    }
    if (logins > 1) {
      // Chromium asks again only when the credentials were refused; stop instead of looping.
      callback();
      return finish({ ok: false, rejected: true, message: `Camera rejected the username or password${challenge}.` });
    }
    callback(user, password);
  });
}

/** Opens the URL; `finish(result)` settles exactly once. Returns the client (or null when the URL is invalid). */
function openCamera({ url, user, password, request, finish }) {
  let client;
  try {
    client = request({ url: String(url).trim(), method: 'GET', useSessionCookies: false });
  } catch (error) {
    finish({ ok: false, message: `Invalid camera URL: ${error.message}` });
    return null;
  }
  attachLogin(client, user, password, finish);
  client.on('error', error => finish({ ok: false, message: `Camera unreachable: ${error.message}` }));
  return client;
}

/**
 * Fetch one frame. `request` is Electron's net.request (or a compatible factory in tests): it must emit
 * 'login'(authInfo, callback), 'response'(response) and 'error'(error), and the response 'data', 'end' and 'error'.
 */
function fetchIpCameraFrame({ url, user = '', password = '', request, timeoutMs = 8000 }) {
  return new Promise(resolve => {
    const target = String(url || '').trim();
    if (!target) return resolve({ ok: false, message: 'No IP camera URL is configured.' });
    let settled = false;
    let client = null;
    const abort = () => { try { client?.abort(); } catch { /* already closed */ } };
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => { abort(); finish({ ok: false, message: `Camera did not answer within ${Math.round(timeoutMs / 1000)} seconds.` }); }, timeoutMs);
    client = openCamera({ url: target, user, password, request, finish });
    if (!client) return;
    client.on('response', response => {
      const status = Number(response.statusCode);
      const type = headerValue(response.headers, 'content-type');
      if (status === 401) return finish({ ok: false, rejected: true, message: 'Camera rejected the username or password (HTTP 401).' });
      if (status < 200 || status >= 300) return finish({ ok: false, message: `Camera answered HTTP ${status}.` });
      const multipart = type.includes('multipart');
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        if (settled) return;
        chunks.push(chunk);
        size += chunk.length;
        if (multipart) {
          const frame = firstJpegFrame(Buffer.concat(chunks));
          if (frame) { abort(); return finish({ ok: true, dataUrl: jpegDataUrl(frame) }); }
        }
        if (size > MAX_BYTES) { abort(); finish({ ok: false, message: 'Camera response is too large. Use a snapshot URL or the sub stream.' }); }
      });
      response.on('end', () => finish(imageDataUrl(type, Buffer.concat(chunks))));
      response.on('error', error => finish({ ok: false, message: `Camera stream error: ${error.message}` }));
      response.on('aborted', () => finish({ ok: false, message: 'Camera stream was interrupted.' }));
    });
    client.end();
  });
}

class IpCameraStream {
  /**
   * @param {object} options
   * @param {(dataUrl: string) => void} options.onFrame   called for every frame, at most once per minFrameMs
   * @param {(message: string, outcome: object) => void} options.onStatus   called when a connection fails
   */
  constructor({ url, user = '', password = '', request, onFrame, onStatus, minFrameMs = 80, snapshotGapMs = 150, retryMs = 3000, refusedMs = 60000, stallMs = 10000 }) {
    Object.assign(this, { url: String(url || '').trim(), user, password, request, onFrame, onStatus: onStatus || (() => {}), minFrameMs, snapshotGapMs, retryMs, refusedMs, stallMs });
    this.active = false;
    this.client = null;
    this.connections = 0;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.loop();
  }

  stop() {
    this.active = false;
    this.abort();
  }

  abort() {
    try { this.client?.abort(); } catch { /* already closed */ }
    this.client = null;
  }

  async loop() {
    while (this.active) {
      const outcome = await this.connect();
      this.connections += 1;
      if (!this.active) break;
      if (!outcome.ok) {
        this.onStatus(outcome.message, outcome);
        await sleep(outcome.rejected ? this.refusedMs : this.retryMs);
      } else if (outcome.mode === 'snapshot') {
        await sleep(this.snapshotGapMs);
      }
      // An MJPEG connection that ended normally is reopened straight away.
    }
  }

  /** One connection; resolves when it ends. Frames are reported through onFrame while it is open. */
  connect() {
    return new Promise(resolve => {
      if (!this.url) return resolve({ ok: false, message: 'No IP camera URL is configured.' });
      let settled = false;
      let watchdog = null;
      const finish = result => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        this.client = null;
        resolve(result);
      };
      const stall = () => { this.abort(); finish({ ok: false, message: `Camera stopped sending frames for ${Math.round(this.stallMs / 1000)} seconds.` }); };
      const touch = () => { clearTimeout(watchdog); watchdog = setTimeout(stall, this.stallMs); };
      touch();
      const client = openCamera({ url: this.url, user: this.user, password: this.password, request: this.request, finish });
      if (!client) return;
      this.client = client;
      let lastFrameAt = 0;
      const emit = frame => {
        const now = Date.now();
        if (now - lastFrameAt < this.minFrameMs) return;
        lastFrameAt = now;
        this.onFrame(jpegDataUrl(frame));
      };
      client.on('response', response => {
        touch();
        const status = Number(response.statusCode);
        const type = headerValue(response.headers, 'content-type');
        if (status === 401) return finish({ ok: false, rejected: true, message: 'Camera rejected the username or password (HTTP 401).' });
        if (status < 200 || status >= 300) return finish({ ok: false, message: `Camera answered HTTP ${status}.` });
        const multipart = type.includes('multipart');
        let buffer = Buffer.alloc(0);
        let frames = 0;
        response.on('data', chunk => {
          if (settled) return;
          touch();
          buffer = Buffer.concat([buffer, chunk]);
          if (!multipart) {
            if (buffer.length > MAX_BYTES) { this.abort(); finish({ ok: false, message: 'Camera response is too large. Use a snapshot URL or the sub stream.' }); }
            return;
          }
          // Report every complete JPEG and drop the bytes already consumed.
          for (;;) {
            const start = buffer.indexOf(JPEG_START);
            if (start < 0) { buffer = Buffer.alloc(0); break; }
            const end = buffer.indexOf(JPEG_END, start + 2);
            if (end < 0) { if (start > 0) buffer = buffer.subarray(start); break; }
            frames += 1;
            emit(buffer.subarray(start, end + 2));
            buffer = buffer.subarray(end + 2);
          }
          if (buffer.length > MAX_BYTES) buffer = Buffer.alloc(0);
        });
        response.on('end', () => {
          if (multipart) return finish(frames ? { ok: true, mode: 'mjpeg' } : { ok: false, message: 'Camera closed the MJPEG stream without sending a frame.' });
          const result = imageDataUrl(type, buffer);
          if (result.ok) this.onFrame(result.dataUrl);
          finish(result.ok ? { ok: true, mode: 'snapshot' } : result);
        });
        response.on('error', error => finish({ ok: false, message: `Camera stream error: ${error.message}` }));
        response.on('aborted', () => finish(frames ? { ok: true, mode: 'mjpeg' } : { ok: false, message: 'Camera stream was interrupted.' }));
      });
      client.end();
    });
  }
}

module.exports = { fetchIpCameraFrame, IpCameraStream, firstJpegFrame, imageDataUrl };
