import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConnectionCode } from './apiBase';

const code = (payload: object) => `HRM1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

test('company connection code (HRM1) gives the server addresses', () => {
  const parsed = parseConnectionCode(code({ v: 1, n: 'Acme', u: ['https://acme.binishaqsoft.com/', 'https://hr.acme.com'] }));
  assert.equal(parsed.clientName, 'Acme');
  assert.deepEqual(parsed.urls, ['https://acme.binishaqsoft.com', 'https://hr.acme.com']);
});

test('a plain company address works too', () => {
  assert.deepEqual(parseConnectionCode('acme.binishaqsoft.com').urls, ['https://acme.binishaqsoft.com']);
  assert.deepEqual(parseConnectionCode('https://hr.acme.com/login').urls, ['https://hr.acme.com']);
});

test('wrong codes are refused with a clear message', () => {
  assert.throws(() => parseConnectionCode(''), /Enter the connection code/);
  assert.throws(() => parseConnectionCode('HRK1.abc'), /kiosk setup code/);
  assert.throws(() => parseConnectionCode('HRM1.%%%'), /damaged/);
  assert.throws(() => parseConnectionCode(code({ v: 1, n: 'x', u: ['http://evil.example'] })), /no valid server/);
  assert.throws(() => parseConnectionCode('http://acme.com'), /https/);
});
