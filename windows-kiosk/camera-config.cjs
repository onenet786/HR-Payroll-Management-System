'use strict';
// Kiosk camera settings: which source the terminal uses (local webcam or IP cameras), up to two IP cameras with a
// direction each (In & Out / In only / Out only), and the checkout reason an Out camera records. Pure helpers, so the
// rules are tested without Electron.

const { isRtspUrl } = require('./rtsp-camera.cjs');

const MAX_IP_CAMERAS = 2;
const CAMERA_DIRECTIONS = Object.freeze(['both', 'in', 'out']);
const DIRECTION_LABELS = Object.freeze({ both: 'In & Out', in: 'In only', out: 'Out only' });
// Digital zoom (rtsp:// only): FFmpeg crops the middle of the camera picture before scaling, so faces at a distance
// keep the camera's own pixels instead of being enlarged later.
const CAMERA_ZOOMS = Object.freeze([1, 1.5, 2, 2.5, 3]);

const text = (value, max) => String(value ?? '').trim().slice(0, max);

function cameraSlot(index, camera = {}) {
  return {
    id: `cam${index + 1}`,
    name: text(camera.name, 40) || `Camera ${index + 1}`,
    url: text(camera.url, 512),
    user: text(camera.user, 64),
    ...(camera.password?.value ? { password: camera.password } : {}),
    direction: CAMERA_DIRECTIONS.includes(camera.direction) ? camera.direction : 'both',
    zoom: CAMERA_ZOOMS.includes(Number(camera.zoom)) ? Number(camera.zoom) : 1,
  };
}

/** Normalised terminal: migrates the single-camera fields of kiosk 1.0.24–1.0.28 into camera slot 1. */
function normalizeCameraSettings(terminal = {}) {
  const { ipCameraUrl, ipCameraUser, ipCameraPassword, ...rest } = terminal || {};
  let cameras = Array.isArray(terminal?.ipCameras) ? terminal.ipCameras : [];
  if (!cameras.length && ipCameraUrl) cameras = [{ url: ipCameraUrl, user: ipCameraUser, password: ipCameraPassword, direction: 'both' }];
  const ipCameras = Array.from({ length: MAX_IP_CAMERAS }, (_, index) => cameraSlot(index, cameras[index]));
  const cameraSource = terminal?.cameraSource === 'ip' || terminal?.cameraSource === 'webcam'
    ? terminal.cameraSource
    : ipCameras.some(camera => camera.url) ? 'ip' : 'webcam';
  return { ...rest, cameraSource, ipCameras, outCameraReason: text(terminal?.outCameraReason, 60) };
}

/** IP cameras in use (source "ip" and a URL filled in). */
function activeIpCameras(terminal) {
  return terminal?.cameraSource === 'ip' ? (terminal.ipCameras || []).filter(camera => camera.url) : [];
}

/**
 * The camera a punch came from. Webcam terminals resolve to { source: 'webcam' }. On an IP terminal an unknown id
 * resolves to { source: 'ip', camera: null } (refused by the caller); without an id the only camera is used.
 */
function resolveCamera(terminal, cameraId) {
  const cameras = activeIpCameras(terminal);
  if (!cameras.length) return { source: 'webcam', camera: null };
  const camera = cameras.find(item => item.id === cameraId) || (!cameraId && cameras.length === 1 ? cameras[0] : null);
  return { source: 'ip', camera };
}

/** Live video (face recognition + liveness) needs a webcam or an rtsp:// camera; snapshot / MJPEG URLs cannot prove liveness. */
function cameraSupportsFaces(resolved) {
  return resolved?.source === 'webcam' || (!!resolved?.camera && isRtspUrl(resolved.camera.url));
}

/** Cameras as sent to the renderer: no password, only whether one is saved. */
function publicCameras(cameras = []) {
  return cameras.map(({ password, ...camera }) => ({ ...camera, passwordSet: !!password?.value }));
}

/**
 * Settings form → stored cameras. A blank password keeps the saved one while the user name is unchanged; clearing the
 * URL or the user name drops it. `encrypt(text)` returns the stored secret.
 */
function mergeSubmittedCameras(previous = [], submitted = [], encrypt) {
  return Array.from({ length: MAX_IP_CAMERAS }, (_, index) => {
    const before = cameraSlot(index, previous[index]);
    const form = submitted?.[index] || {};
    const next = cameraSlot(index, { ...form, password: undefined });
    const typed = typeof form.password === 'string' ? form.password : '';
    if (next.url && next.user) {
      const password = typed ? encrypt(typed.slice(0, 128)) : before.user === next.user ? before.password : undefined;
      if (password) next.password = password;
    }
    return next;
  });
}

/**
 * Refusal for a punch on a direction-bound camera, or '' when it may go ahead.
 * `state`: 'none' (no punch today), 'in' (punched in), 'away' (on a temporary exit and may return).
 */
function directionRefusal(direction, state) {
  if (direction === 'in' && state === 'in') return 'Already punched in. Use the OUT camera to punch out.';
  if (direction === 'out' && state === 'none') return 'Not punched in yet. Use the IN camera to punch in.';
  if (direction === 'out' && state === 'away') return 'You are out on a break. Use the IN camera to come back.';
  return '';
}

module.exports = {
  MAX_IP_CAMERAS, CAMERA_DIRECTIONS, DIRECTION_LABELS, CAMERA_ZOOMS,
  normalizeCameraSettings, activeIpCameras, resolveCamera, cameraSupportsFaces, publicCameras, mergeSubmittedCameras, directionRefusal,
};
