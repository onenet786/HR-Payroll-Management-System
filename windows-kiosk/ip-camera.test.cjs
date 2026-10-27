const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { fetchIpCameraFrame, IpCameraStream, firstJpegFrame, imageDataUrl } = require('./ip-camera.cjs');

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('frame-body'), Buffer.from([0xff, 0xd9])]);
const jpegWith = text => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(text), Buffer.from([0xff, 0xd9])]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Fake Electron net.request: `script(client)` drives the events once end() is called. */
function fakeRequest(script) {
  return options => {
    const client = new EventEmitter();
    client.options = options;
    client.aborted = false;
    client.abort = () => { client.aborted = true; client.emit('abort'); };
    client.end = () => setImmediate(() => script(client));
    return client;
  };
}
function respond(client, { status = 200, type = 'image/jpeg', chunks = [jpeg] }) {
  const response = new EventEmitter();
  response.statusCode = status;
  response.headers = { 'content-type': type };
  client.emit('response', response);
  setImmediate(() => {
    for (const chunk of chunks) { if (client.aborted) return; response.emit('data', chunk); }
    response.emit('end');
  });
  return response;
}

test('a JPEG snapshot becomes a data URL and MJPEG yields its first frame', () => {
  assert.equal(imageDataUrl('image/jpeg; charset=binary', jpeg).dataUrl, `data:image/jpeg;base64,${jpeg.toString('base64')}`);
  assert.equal(firstJpegFrame(Buffer.concat([Buffer.from('--boundary\r\nContent-Type: image/jpeg\r\n\r\n'), jpeg, Buffer.from('\r\n--boundary')])).equals(jpeg), true);
  assert.equal(firstJpegFrame(Buffer.from('<html>login</html>')), null);
  assert.match(imageDataUrl('text/html', Buffer.from('<html>')).message, /instead of an image/);
});

test('digest challenge is answered once with the terminal credentials', async () => {
  const seen = [];
  const request = fakeRequest(client => {
    client.emit('login', { scheme: 'digest', host: '192.168.1.50' }, (user, password) => {
      seen.push([user, password]);
      respond(client, {});
    });
  });
  const result = await fetchIpCameraFrame({ url: 'http://192.168.1.50/ISAPI/Streaming/channels/101/picture', user: 'kiosk', password: 'Secret1', request });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, [['kiosk', 'Secret1']]);
});

test('wrong credentials stop after the second challenge; no credentials explain what to configure', async () => {
  const looping = fakeRequest(client => {
    const challenge = () => client.emit('login', { scheme: 'digest', realm: 'IP Camera(C1234)' }, (user) => { if (user) challenge(); });
    challenge();
  });
  const refused = await fetchIpCameraFrame({ url: 'http://cam/picture', user: 'kiosk', password: 'bad', request: looping });
  assert.equal(refused.ok, false);
  assert.equal(refused.rejected, true);
  assert.match(refused.message, /rejected .* \(digest, realm "IP Camera\(C1234\)"\)/);
  const missing = await fetchIpCameraFrame({ url: 'http://cam/picture', request: looping });
  assert.match(missing.message, /username and password/);
});

test('MJPEG streams are cut after the first frame; HTTP errors and timeouts are reported', async () => {
  const stream = fakeRequest(client => respond(client, {
    type: 'multipart/x-mixed-replace; boundary=frame',
    chunks: [Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), jpeg.subarray(0, 6), jpeg.subarray(6), Buffer.from('\r\n--frame\r\n'), jpeg],
  }));
  const first = await fetchIpCameraFrame({ url: 'http://cam/mjpeg', request: stream });
  assert.equal(first.dataUrl, `data:image/jpeg;base64,${jpeg.toString('base64')}`);

  const unauthorized = await fetchIpCameraFrame({ url: 'http://cam/picture', request: fakeRequest(client => respond(client, { status: 401, type: 'text/plain', chunks: [] })) });
  assert.match(unauthorized.message, /401/);
  const notFound = await fetchIpCameraFrame({ url: 'http://cam/picture', request: fakeRequest(client => respond(client, { status: 404, type: 'text/plain', chunks: [] })) });
  assert.match(notFound.message, /HTTP 404/);
  const silent = await fetchIpCameraFrame({ url: 'http://cam/picture', request: fakeRequest(() => {}), timeoutMs: 30 });
  assert.match(silent.message, /did not answer/);
  const offline = await fetchIpCameraFrame({ url: 'http://cam/picture', request: fakeRequest(client => client.emit('error', new Error('ECONNREFUSED'))) });
  assert.match(offline.message, /unreachable/);
  assert.equal((await fetchIpCameraFrame({ url: '', request: stream })).ok, false);
});

test('live stream reports every MJPEG frame, survives frames split across chunks and reconnects when the camera closes', async () => {
  const frames = [];
  let connections = 0;
  const request = fakeRequest(client => {
    connections += 1;
    if (connections > 2) return; // third connection stays open until stop()
    const a = jpegWith('one'); const b = jpegWith('two');
    respond(client, { type: 'multipart/x-mixed-replace; boundary=frame', chunks: [Buffer.from('--frame\r\nContent-Type: image/jpeg\r\n\r\n'), a.subarray(0, 5), Buffer.concat([a.subarray(5), Buffer.from('\r\n--frame\r\n'), b])] });
  });
  const stream = new IpCameraStream({ url: 'http://cam/httpPreview', user: 'kiosk', password: 'pw', request, onFrame: url => frames.push(url), minFrameMs: 0, retryMs: 5 });
  stream.start();
  await sleep(60);
  stream.stop();
  assert.equal(connections, 3, 'reconnected after each normal end');
  assert.deepEqual(frames, [jpegWith('one'), jpegWith('two'), jpegWith('one'), jpegWith('two')].map(f => `data:image/jpeg;base64,${f.toString('base64')}`));
  await sleep(20);
  assert.equal(connections, 3, 'no reconnect after stop');
});

test('live stream polls a snapshot URL back to back and backs off after a refused login', async () => {
  const frames = [];
  let polls = 0;
  const snapshots = fakeRequest(client => { polls += 1; respond(client, { chunks: [jpegWith(`n${polls}`)] }); });
  const polling = new IpCameraStream({ url: 'http://cam/picture', request: snapshots, onFrame: url => frames.push(url), snapshotGapMs: 5 });
  polling.start();
  await sleep(60);
  polling.stop();
  // stop() may abort the request in flight, so that last poll yields no frame.
  assert.ok(polls >= 3 && frames.length >= polls - 1 && frames.length <= polls, `polled ${polls} times, ${frames.length} frames`);

  const statuses = [];
  let challenges = 0;
  const refusing = fakeRequest(client => { challenges += 1; const again = () => client.emit('login', { scheme: 'digest' }, user => { if (user) again(); }); again(); });
  const refused = new IpCameraStream({ url: 'http://cam/picture', user: 'kiosk', password: 'bad', request: refusing, onFrame: () => {}, onStatus: (message, outcome) => statuses.push([message, outcome.rejected]), refusedMs: 40, retryMs: 1 });
  refused.start();
  await sleep(25);
  assert.equal(challenges, 1, 'waits instead of hammering the camera after a refusal');
  assert.equal(statuses.length, 1);
  assert.match(statuses[0][0], /rejected/);
  assert.equal(statuses[0][1], true);
  refused.stop();
});
