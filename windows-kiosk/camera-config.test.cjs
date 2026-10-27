const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCameraSettings, activeIpCameras, resolveCamera, cameraSupportsFaces, publicCameras, mergeSubmittedCameras, directionRefusal } = require('./camera-config.cjs');

const secret = value => ({ encrypted: false, value });

test('the single IP camera of earlier builds becomes camera 1 (In & Out) and the source becomes IP', () => {
  const terminal = normalizeCameraSettings({ id: 'K1', ipCameraUrl: 'rtsp://cam/102', ipCameraUser: 'kiosk', ipCameraPassword: secret('pw') });
  assert.equal(terminal.cameraSource, 'ip');
  assert.equal(terminal.ipCameraUrl, undefined);
  assert.deepEqual(terminal.ipCameras[0], { id: 'cam1', name: 'Camera 1', url: 'rtsp://cam/102', user: 'kiosk', password: secret('pw'), direction: 'both', zoom: 1 });
  assert.deepEqual(terminal.ipCameras[1], { id: 'cam2', name: 'Camera 2', url: '', user: '', direction: 'both', zoom: 1 });
  assert.equal(normalizeCameraSettings({}).cameraSource, 'webcam');
  assert.equal(normalizeCameraSettings({ cameraSource: 'webcam', ipCameras: [{ url: 'rtsp://x' }] }).cameraSource, 'webcam', 'an explicit choice is kept');
  assert.equal(normalizeCameraSettings({ ipCameras: [{ url: 'rtsp://x', direction: 'sideways' }] }).ipCameras[0].direction, 'both');
});

test('cameras are resolved by id; only a configured IP source counts, and only rtsp or webcam may run face punches', () => {
  const terminal = normalizeCameraSettings({ cameraSource: 'ip', ipCameras: [{ url: 'rtsp://in/102', direction: 'in' }, { url: 'http://out/picture', direction: 'out' }] });
  assert.deepEqual(activeIpCameras(terminal).map(camera => camera.id), ['cam1', 'cam2']);
  assert.equal(resolveCamera(terminal, 'cam2').camera.direction, 'out');
  assert.equal(resolveCamera(terminal, 'cam9').camera, null, 'unknown id');
  assert.equal(resolveCamera(terminal, undefined).camera, null, 'two cameras: an id is required');
  assert.equal(cameraSupportsFaces(resolveCamera(terminal, 'cam1')), true);
  assert.equal(cameraSupportsFaces(resolveCamera(terminal, 'cam2')), false, 'snapshot camera: evidence only');
  const one = normalizeCameraSettings({ cameraSource: 'ip', ipCameras: [{}, { url: 'rtsp://only' }] });
  assert.equal(resolveCamera(one, undefined).camera.id, 'cam2', 'single camera without id');
  const webcam = normalizeCameraSettings({ cameraSource: 'webcam', ipCameras: [{ url: 'rtsp://in' }] });
  assert.deepEqual(resolveCamera(webcam, 'cam1'), { source: 'webcam', camera: null });
  assert.equal(cameraSupportsFaces(resolveCamera(webcam)), true);
});

test('the renderer never receives a camera password', () => {
  const [camera] = publicCameras([{ id: 'cam1', url: 'rtsp://x', user: 'kiosk', password: secret('pw') }]);
  assert.equal(camera.password, undefined);
  assert.equal(camera.passwordSet, true);
});

test('a blank password keeps the saved one for the same user; a new user or a cleared URL drops it', () => {
  const previous = normalizeCameraSettings({ ipCameras: [{ url: 'rtsp://a', user: 'kiosk', password: secret('old') }, { url: 'rtsp://b', user: 'gate', password: secret('g') }] }).ipCameras;
  const merged = mergeSubmittedCameras(previous, [
    { name: 'Entrance', url: 'rtsp://a', user: 'kiosk', password: '', direction: 'in' },
    { name: 'Exit', url: 'rtsp://b', user: 'other', password: '', direction: 'out' },
  ], secret);
  assert.deepEqual(merged[0].password, secret('old'));
  assert.equal(merged[0].name, 'Entrance');
  assert.equal(merged[0].direction, 'in');
  assert.equal(merged[1].password, undefined, 'different user');
  const typed = mergeSubmittedCameras(previous, [{ url: 'rtsp://a', user: 'kiosk', password: 'new' }], secret);
  assert.deepEqual(typed[0].password, secret('new'));
  assert.equal(typed[1].url, '', 'missing slot is cleared');
  const cleared = mergeSubmittedCameras(previous, [{ url: '', user: 'kiosk', password: 'x' }], secret);
  assert.equal(cleared[0].password, undefined);
});

test('In cameras only punch in (or bring people back from a break); Out cameras only punch out', () => {
  assert.equal(directionRefusal('in', 'none'), '');
  assert.equal(directionRefusal('in', 'away'), '', 'returning from a break is a way in');
  assert.match(directionRefusal('in', 'in'), /OUT camera/);
  assert.equal(directionRefusal('out', 'in'), '');
  assert.match(directionRefusal('out', 'none'), /IN camera/);
  assert.match(directionRefusal('out', 'away'), /break/);
  for (const state of ['none', 'in', 'away']) assert.equal(directionRefusal('both', state), '');
});

test('camera zoom is one of the offered steps and survives saving; anything else is no zoom', () => {
  assert.equal(normalizeCameraSettings({ ipCameras: [{ url: 'rtsp://a', zoom: 2 }] }).ipCameras[0].zoom, 2);
  assert.equal(normalizeCameraSettings({ ipCameras: [{ url: 'rtsp://a', zoom: 7 }] }).ipCameras[0].zoom, 1);
  assert.equal(normalizeCameraSettings({ ipCameras: [{ url: 'rtsp://a' }] }).ipCameras[0].zoom, 1);
  const merged = mergeSubmittedCameras([], [{ url: 'rtsp://a', user: 'k', password: 'p', zoom: '2.5' }], value => ({ encrypted: false, value }));
  assert.equal(merged[0].zoom, 2.5);
});
