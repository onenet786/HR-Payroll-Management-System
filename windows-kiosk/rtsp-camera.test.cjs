const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { isRtspUrl, rtspUrlWithCredentials, redactUrl, ffmpegArgs, findFfmpeg, describeFailure, createJpegSplitter, grabRtspFrame, RtspCameraStream } = require('./rtsp-camera.cjs');

const jpegWith = text => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(text), Buffer.from([0xff, 0xd9])]);
const dataUrl = buffer => `data:image/jpeg;base64,${buffer.toString('base64')}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Fake child_process.spawn: `script(child, args)` writes to stdout/stderr and closes. */
function fakeSpawn(script, calls = []) {
  return (command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => { if (child.killed) return; child.killed = true; setImmediate(() => child.emit('close', null)); };
    calls.push({ command, args });
    setImmediate(() => script(child, args));
    return child;
  };
}

test('RTSP URLs get the terminal credentials, encoded, unless they carry their own; logs never show them', () => {
  assert.equal(isRtspUrl('rtsp://192.168.1.45:554/Streaming/Channels/102'), true);
  assert.equal(isRtspUrl('http://192.168.1.45/picture'), false);
  assert.equal(rtspUrlWithCredentials('rtsp://192.168.1.45:554/Streaming/Channels/102', 'hr kiosk', 'p@ss:w/rd#1'), 'rtsp://hr%20kiosk:p%40ss%3Aw%2Frd%231@192.168.1.45:554/Streaming/Channels/102');
  assert.equal(rtspUrlWithCredentials('rtsp://own:pw@cam/x', 'kiosk', 'other'), 'rtsp://own:pw@cam/x');
  assert.equal(redactUrl('rtsp://kiosk:Secret1@cam:554/x'), 'rtsp://***:***@cam:554/x');
  const args = ffmpegArgs('rtsp://cam/x', { fps: 10, width: 480 });
  assert.deepEqual(args.slice(args.indexOf('-rtsp_transport'), args.indexOf('-rtsp_transport') + 2), ['-rtsp_transport', 'tcp']);
  assert.ok(args.includes('fps=10,scale=480:-2') && args.at(-1) === 'pipe:1' && !args.includes('-frames:v'));
  assert.deepEqual(ffmpegArgs('rtsp://cam/x', { frames: 1 }).slice(-9, -7), ['-frames:v', '1']);
});

test('FFmpeg is looked up next to the installer first, then ProgramData, then the PATH', () => {
  const packed = path.join('C:', 'Kiosk', 'resources', 'app.asar', 'windows-kiosk');
  const unpacked = path.join('C:', 'Kiosk', 'resources', 'app.asar.unpacked', 'windows-kiosk', 'ffmpeg-bin', 'ffmpeg.exe');
  assert.equal(findFfmpeg({ moduleDir: packed, programData: 'C:\\ProgramData', exists: file => file === unpacked }), unpacked);
  const shared = path.join('C:\\ProgramData', 'BinIshaqKiosk', 'ffmpeg.exe');
  assert.equal(findFfmpeg({ moduleDir: packed, programData: 'C:\\ProgramData', exists: file => file === shared }), shared);
  assert.equal(findFfmpeg({ moduleDir: packed, programData: 'C:\\ProgramData', exists: () => false }), 'ffmpeg');
});

test('FFmpeg failures become plain messages; a 401 is marked as a refused login', () => {
  assert.match(describeFailure({ error: Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }) }).message, /not installed/);
  const refused = describeFailure({ stderr: '[rtsp @ 0x1] method DESCRIBE failed: 401 Unauthorized', code: 1 });
  assert.equal(refused.rejected, true);
  assert.match(describeFailure({ stderr: 'method DESCRIBE failed: 404 Not Found', code: 1 }).message, /404/);
  assert.match(describeFailure({ stderr: 'Connection to tcp://cam:554 failed: Connection refused', code: 1 }).message, /unreachable/);
  assert.match(describeFailure({ stderr: 'odd error\nlast line', code: 2 }).message, /exit 2\): last line/);
});

test('JPEG frames are split correctly across arbitrary chunk boundaries', () => {
  const seen = [];
  const split = createJpegSplitter(frame => seen.push(Buffer.from(frame)));
  const stream = Buffer.concat([jpegWith('a'), jpegWith('bb'), jpegWith('ccc')]);
  for (let i = 0; i < stream.length; i += 3) split(stream.subarray(i, i + 3));
  assert.deepEqual(seen.map(String), [jpegWith('a'), jpegWith('bb'), jpegWith('ccc')].map(String));
});

test('test grab returns the first frame; the live stream pushes frames, restarts FFmpeg and backs off on 401', async () => {
  const calls = [];
  const oneFrame = fakeSpawn(child => { child.stdout.write(jpegWith('grab')); child.stdout.end(); child.emit('close', 0); }, calls);
  const grabbed = await grabRtspFrame({ url: 'rtsp://cam:554/Streaming/Channels/102', user: 'kiosk', password: 'pw', spawn: oneFrame, ffmpeg: 'ffmpeg' });
  assert.equal(grabbed.dataUrl, dataUrl(jpegWith('grab')));
  assert.ok(calls[0].args.includes('rtsp://kiosk:pw@cam:554/Streaming/Channels/102'));

  const frames = [];
  let runs = 0;
  const streaming = fakeSpawn(child => {
    runs += 1;
    if (runs > 2) return; // keeps running until stop()
    child.stdout.write(Buffer.concat([jpegWith(`r${runs}a`), jpegWith(`r${runs}b`)]));
    child.emit('close', 0);
  });
  const live = new RtspCameraStream({ url: 'rtsp://cam/x', spawn: streaming, ffmpeg: 'ffmpeg', onFrame: url => frames.push(url), retryMs: 5 });
  live.start();
  await sleep(80);
  live.stop();
  assert.equal(runs, 3);
  assert.deepEqual(frames, ['r1a', 'r1b', 'r2a', 'r2b'].map(text => dataUrl(jpegWith(text))));

  const statuses = [];
  let attempts = 0;
  const refusing = fakeSpawn(child => { attempts += 1; child.stderr.write('method DESCRIBE failed: 401 Unauthorized\n'); setImmediate(() => child.emit('close', 1)); });
  const refused = new RtspCameraStream({ url: 'rtsp://cam/x', user: 'kiosk', password: 'bad', spawn: refusing, ffmpeg: 'ffmpeg', onFrame: () => {}, onStatus: (message, outcome) => statuses.push(outcome.rejected), retryMs: 1, refusedMs: 200 });
  refused.start();
  await sleep(60);
  refused.stop();
  assert.equal(attempts, 1, 'waits after a refused login');
  assert.deepEqual(statuses, [true]);
});

test('zoom crops the centre of the picture before scaling; no zoom leaves the picture whole', () => {
  const vf = args => args[args.indexOf('-vf') + 1];
  assert.equal(vf(ffmpegArgs('rtsp://cam/x')), 'fps=12,scale=960:-2');
  assert.equal(vf(ffmpegArgs('rtsp://cam/x', { zoom: 2 })), 'crop=trunc(iw/2/2)*2:trunc(ih/2/2)*2,fps=12,scale=960:-2');
  assert.equal(vf(ffmpegArgs('rtsp://cam/x', { zoom: 1.5, frames: 1 })), 'crop=trunc(iw/1.5/2)*2:trunc(ih/1.5/2)*2,fps=12,scale=960:-2');
});
