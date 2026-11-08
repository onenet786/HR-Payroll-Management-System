const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSetupCode, buildSetupCode, orderedPortalUrls, isNetworkFailure, tryPortalUrls, normalizeServerAddress, isLocalNetworkHost } = require('./setup-code.cjs');

const encode = payload => `HRK1.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;

test('a code built by the server round-trips with one or two addresses', () => {
  const one = buildSetupCode({ clientName: 'Acme Textiles', urls: ['https://acme.binishaqsoft.com'], token: 'tok-1' });
  assert.ok(one.startsWith('HRK1.'));
  assert.deepEqual(parseSetupCode(one), { clientName: 'Acme Textiles', urls: ['https://acme.binishaqsoft.com'], token: 'tok-1' });

  const two = encode({ v: 1, n: 'Acme', u: ['https://acme.binishaqsoft.com', 'https://203.0.113.5:8443'], t: 'tok-2' });
  assert.deepEqual(parseSetupCode(two).urls, ['https://acme.binishaqsoft.com', 'https://203.0.113.5:8443']);
});

test('whitespace and line breaks from a paste are ignored, and a trailing slash is dropped', () => {
  const code = encode({ v: 1, n: 'Acme', u: ['https://acme.binishaqsoft.com/'], t: 'tok' });
  const mangled = `  \n${code.slice(0, 10)} ${code.slice(10, 25)}\r\n${code.slice(25)}  \n`;
  assert.deepEqual(parseSetupCode(mangled), { clientName: 'Acme', urls: ['https://acme.binishaqsoft.com'], token: 'tok' });
});

test('text that is not a setup code is refused with a clear message', () => {
  assert.throws(() => parseSetupCode('hello world'), { message: 'This is not a kiosk setup code' });
  assert.throws(() => parseSetupCode('HRK2.eyJ2IjoxfQ'), { message: 'This is not a kiosk setup code' });
  assert.throws(() => parseSetupCode(''), /Paste the setup code/);
});

test('a damaged code is refused', () => {
  assert.throws(() => parseSetupCode('HRK1.'), { message: 'The setup code is damaged' });
  assert.throws(() => parseSetupCode('HRK1.***not-base64***'), { message: 'The setup code is damaged' });
  assert.throws(() => parseSetupCode(`HRK1.${Buffer.from('not json').toString('base64url')}`), { message: 'The setup code is damaged' });
  const good = encode({ v: 1, n: 'Acme', u: ['https://acme.binishaqsoft.com'], t: 'tok' });
  assert.throws(() => parseSetupCode(good.slice(0, good.length - 6)), { message: 'The setup code is damaged' }, 'truncated');
  assert.throws(() => parseSetupCode(encode({ v: 1, n: 'Acme', u: [], t: 'tok' })), { message: 'The setup code is damaged' });
  assert.throws(() => parseSetupCode(encode({ v: 1, n: 'Acme', u: ['https://a.com', 'https://b.com', 'https://c.com'], t: 'tok' })), { message: 'The setup code is damaged' });
  assert.throws(() => parseSetupCode(encode({ v: 1, n: 'Acme', u: ['https://a.com'] })), { message: 'The setup code is damaged' }, 'no token');
});

test('server addresses must use https, except local-network addresses', () => {
  const httpsOnly = /^Server address must use https/;
  assert.throws(() => parseSetupCode(encode({ v: 1, n: 'Acme', u: ['http://acme.binishaqsoft.com'], t: 'tok' })), { message: httpsOnly });
  assert.throws(() => parseSetupCode(encode({ v: 1, n: 'Acme', u: ['https://acme.binishaqsoft.com', 'http://203.0.113.5'], t: 'tok' })), { message: httpsOnly });
  assert.throws(() => parseSetupCode(encode({ v: 1, n: 'Acme', u: ['ftp://acme.binishaqsoft.com'], t: 'tok' })), { message: 'Server address must use https' });
  assert.throws(() => parseSetupCode(encode({ v: 1, n: 'Acme', u: ['http://172.32.0.1:8080'], t: 'tok' })), { message: httpsOnly });
  assert.deepEqual(parseSetupCode(encode({ v: 1, n: 'Dev', u: ['http://localhost:3001'], t: 'tok' })).urls, ['http://localhost:3001']);
  assert.deepEqual(parseSetupCode(encode({ v: 1, n: 'Dev', u: ['http://127.0.0.1:8080/'], t: 'tok' })).urls, ['http://127.0.0.1:8080']);
  assert.deepEqual(parseSetupCode(encode({ v: 1, n: 'HQ', u: ['http://192.168.86.83:8080'], t: 'tok' })).urls, ['http://192.168.86.83:8080']);
  assert.deepEqual(parseSetupCode(encode({ v: 1, n: 'HQ', u: ['http://HEADOFFICE:8080', 'http://10.0.0.5'], t: 'tok' })).urls, ['http://headoffice:8080', 'http://10.0.0.5']);
});

test('local-network hosts are recognised', () => {
  for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.86.83', '169.254.1.1', '[::1]', 'fd12:3456::1', 'HEADOFFICE', 'hr.local', 'srv.lan', 'hr.corp.internal']) {
    assert.equal(isLocalNetworkHost(host), true, host);
  }
  for (const host of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '203.0.113.5', 'attendance.binishaqsoft.com', '2001:db8::1', '']) {
    assert.equal(isLocalNetworkHost(host), false, host);
  }
});

test('a server address typed in Settings gets the right scheme', () => {
  assert.equal(normalizeServerAddress('192.168.86.83:8080'), 'http://192.168.86.83:8080');
  assert.equal(normalizeServerAddress(' localhost:8080/ '), 'http://localhost:8080');
  assert.equal(normalizeServerAddress('attendance.binishaqsoft.com'), 'https://attendance.binishaqsoft.com');
  assert.equal(normalizeServerAddress('http://192.168.86.83:8080'), 'http://192.168.86.83:8080');
  assert.equal(normalizeServerAddress('https://192.168.86.83'), 'https://192.168.86.83');
  assert.throws(() => normalizeServerAddress('http://attendance.binishaqsoft.com'), { message: /^Server address must use https/ });
  assert.throws(() => normalizeServerAddress(''), { message: 'Enter the server address' });
  assert.throws(() => normalizeServerAddress('http://user:pw@192.168.1.1'), { message: 'The server address is not valid' });
  assert.throws(() => normalizeServerAddress('bad host name'), { message: 'The server address is not valid' });
});

test('the address list comes from the setup code, then an old registration, then kiosk.env', () => {
  const env = 'https://attendance.binishaqsoft.com/';
  assert.deepEqual(orderedPortalUrls(null, env), ['https://attendance.binishaqsoft.com']);
  assert.deepEqual(orderedPortalUrls({ portalUrl: 'https://old.example.com' }, env), ['https://old.example.com']);
  const reg = { portalUrl: 'https://b.example.com', portalUrls: ['https://a.example.com', 'https://b.example.com'] };
  assert.deepEqual(orderedPortalUrls(reg, env), ['https://b.example.com', 'https://a.example.com'], 'last working address saved in the file goes first');
  assert.deepEqual(orderedPortalUrls(reg, env, 'https://a.example.com'), ['https://a.example.com', 'https://b.example.com'], 'in-memory choice wins');
  assert.deepEqual(orderedPortalUrls(reg, env, 'https://elsewhere.example.com'), ['https://b.example.com', 'https://a.example.com'], 'unknown preference ignored');
});

test('only a network-level failure moves on to the next address', async () => {
  assert.equal(isNetworkFailure(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), true);
  assert.equal(isNetworkFailure(Object.assign(new Error('x'), { statusCode: 503 })), false);

  const calls = [];
  const down = url => { calls.push(url); return Promise.reject(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' })); };
  const ok = await tryPortalUrls(['https://a', 'https://b'], url => (url === 'https://a' ? down(url) : Promise.resolve({ hello: url })));
  assert.deepEqual(ok, { url: 'https://b', result: { hello: 'https://b' } });

  calls.length = 0;
  await assert.rejects(
    tryPortalUrls(['https://a', 'https://b'], url => { calls.push(url); return Promise.reject(Object.assign(new Error('Invalid setup token'), { statusCode: 401 })); }),
    error => error.statusCode === 401 && error.portalUrl === 'https://a',
  );
  assert.deepEqual(calls, ['https://a'], 'an HTTP error is not retried on the fallback');

  calls.length = 0;
  await assert.rejects(tryPortalUrls(['https://a', 'https://b'], down), error => error.code === 'ECONNREFUSED' && error.triedUrls.join() === 'https://a,https://b');
  assert.deepEqual(calls, ['https://a', 'https://b']);
});
