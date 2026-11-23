'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAdminGuard, hashPin, verifyPinHash, BASE_LOCK_MS, SESSION_IDLE_MS } = require('./admin-pin.cjs');

function fixture(initial = null) {
  let record = initial;
  let clock = 1_000_000;
  const guard = createAdminGuard({ readRecord: () => record, writeRecord: next => { record = next; }, now: () => clock });
  return { guard, record: () => record, advance: ms => { clock += ms; } };
}

test('the PIN is stored only as a salted scrypt hash', () => {
  const a = hashPin('482915');
  const b = hashPin('482915');
  assert.equal(a.algo, 'scrypt');
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.equal(JSON.stringify(a).includes('482915'), false);
  assert.equal(verifyPinHash('482915', a), true);
  assert.equal(verifyPinHash('482916', a), false);
  assert.equal(verifyPinHash('482915', { ...a, algo: 'plain' }), false);
});

test('first open of Settings sets the PIN (upgraded kiosks keep working), later opens need it', () => {
  const f = fixture();
  assert.deepEqual(f.guard.status(), { pinSet: false, unlocked: false, lockedUntil: 0 });
  assert.equal(f.guard.unlock('482915').needsSetup, true);
  assert.equal(f.guard.setPin('1234').ok, false, 'too short');
  assert.equal(f.guard.setPin('111111').ok, false, 'repeated digits');
  assert.equal(f.guard.setPin('123456').ok, false, 'consecutive digits');
  assert.equal(f.guard.setPin('482915').ok, true);
  assert.equal(f.guard.isUnlocked(), true, 'setting the PIN opens the session');
  f.guard.lock();
  assert.equal(f.guard.isUnlocked(), false);
  assert.equal(f.guard.setPin('739104').ok, false, 'a set PIN cannot be replaced without unlocking');
  assert.equal(f.guard.unlock('482915').ok, true);
  assert.equal(f.guard.setPin('739104').ok, true, 'changed while unlocked');
});

test('the admin session ends after the idle timeout', () => {
  const f = fixture();
  f.guard.setPin('482915');
  f.advance(SESSION_IDLE_MS - 1000);
  assert.equal(f.guard.isUnlocked(), true, 'activity extends it');
  f.advance(SESSION_IDLE_MS - 1000);
  assert.equal(f.guard.isUnlocked(), true);
  f.advance(SESSION_IDLE_MS + 1);
  assert.equal(f.guard.isUnlocked(), false);
});

test('wrong PINs are throttled, and the lock survives a restart', () => {
  const f = fixture();
  f.guard.setPin('482915');
  f.guard.lock();
  for (let i = 0; i < 4; i += 1) assert.equal(f.guard.unlock('000001').ok, false);
  const fifth = f.guard.unlock('000001');
  assert.ok(fifth.lockedUntil > 0, 'fifth failure locks');
  assert.equal(f.guard.unlock('482915').ok, false, 'even the right PIN is refused while locked');
  // A new guard over the same stored record (kiosk restarted) still sees the lock.
  const restarted = createAdminGuard({ readRecord: f.record, writeRecord: () => {}, now: () => fifth.lockedUntil - 1 });
  assert.ok(restarted.status().lockedUntil > 0);
  f.advance(BASE_LOCK_MS + 1);
  const sixth = f.guard.unlock('000001');
  assert.ok(sixth.lockedUntil - (1_000_000 + BASE_LOCK_MS + 1) >= 2 * BASE_LOCK_MS - 1, 'lock doubles');
  f.advance(2 * BASE_LOCK_MS + 1);
  assert.equal(f.guard.unlock('482915').ok, true);
  assert.equal(f.record().failures, 0, 'counter reset after success');
});
