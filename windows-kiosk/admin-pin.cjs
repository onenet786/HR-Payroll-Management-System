'use strict';
// Kiosk administrator PIN: protects Settings, Exit, clearing the local cache and removing the device key.
//
// The PIN is set the first time Settings is opened (so a kiosk upgraded from a build without a PIN keeps its server
// registration and asks for a new PIN once), stored only as a salted scrypt hash in the kiosk store, and verified in
// the main process. Wrong PINs are throttled per terminal: after 5 failures the PIN is refused for 30 s, doubling with
// every further failure up to 15 minutes. A correct PIN opens an admin session that ends after 5 idle minutes or when
// the renderer locks it (Settings closed). Pure functions plus a small state object, so it runs under `node --test`.
const crypto = require('crypto');

const PIN_PATTERN = /^\d{6,12}$/;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
const SESSION_IDLE_MS = 5 * 60_000;

function validPinFormat(pin) {
  return typeof pin === 'string' && PIN_PATTERN.test(pin);
}

function hashPin(pin, salt = crypto.randomBytes(16)) {
  const hash = crypto.scryptSync(pin, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return { algo: 'scrypt', N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString('base64'), hash: hash.toString('base64'), setAt: new Date().toISOString() };
}

function verifyPinHash(pin, record) {
  if (typeof pin !== 'string' || !record || record.algo !== 'scrypt' || typeof record.salt !== 'string' || typeof record.hash !== 'string') return false;
  const expected = Buffer.from(record.hash, 'base64');
  const params = { N: Number(record.N) || SCRYPT.N, r: Number(record.r) || SCRYPT.r, p: Number(record.p) || SCRYPT.p };
  if (expected.length !== SCRYPT.keylen || params.N > 1 << 20) return false;
  const actual = crypto.scryptSync(pin, Buffer.from(record.salt, 'base64'), expected.length, params);
  return crypto.timingSafeEqual(actual, expected);
}

// readRecord()/writeRecord(record) load and save the stored hash (the kiosk store's adminPin field); throttle state
// (failures, lock) is saved with it so restarting the kiosk does not reset the counter.
function createAdminGuard({ readRecord, writeRecord, now = Date.now, randomBytes = crypto.randomBytes } = {}) {
  let session = null;

  const lockState = record => {
    const lockedUntil = Number(record?.lockedUntil) || 0;
    return lockedUntil > now() ? lockedUntil : 0;
  };

  const status = () => {
    const record = readRecord();
    const active = !!session && session.expiresAt > now();
    if (!active) session = null;
    return { pinSet: !!record?.hash, unlocked: active, lockedUntil: lockState(record) };
  };

  const openSession = () => {
    session = { id: randomBytes(16).toString('hex'), expiresAt: now() + SESSION_IDLE_MS };
    return session;
  };

  // First PIN (none stored yet), or a new PIN while an admin session is open.
  const setPin = pin => {
    const record = readRecord();
    if (record?.hash && !status().unlocked) return { ok: false, message: 'Enter the current admin PIN first.' };
    if (!validPinFormat(pin)) return { ok: false, message: 'The admin PIN must be 6 to 12 digits.' };
    if (/^(\d)\1+$/.test(pin) || '01234567890123'.includes(pin) || '98765432109876'.includes(pin)) {
      return { ok: false, message: 'Choose a PIN that is not a repeated or consecutive digit sequence.' };
    }
    writeRecord(hashPin(pin));
    openSession();
    return { ok: true, firstPin: !record?.hash };
  };

  const unlock = pin => {
    const record = readRecord();
    if (!record?.hash) return { ok: false, needsSetup: true, message: 'No admin PIN is set on this kiosk yet.' };
    const lockedUntil = lockState(record);
    if (lockedUntil) return { ok: false, lockedUntil, message: `Too many wrong PINs. Try again in ${Math.ceil((lockedUntil - now()) / 1000)} seconds.` };
    if (typeof pin === 'string' && pin.length <= 64 && verifyPinHash(pin, record)) {
      if (record.failures || record.lockedUntil) writeRecord({ ...record, failures: 0, lockedUntil: 0 });
      openSession();
      return { ok: true };
    }
    const failures = (Number(record.failures) || 0) + 1;
    const over = failures - FREE_ATTEMPTS;
    const nextLock = over >= 0 ? now() + Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** over) : 0;
    writeRecord({ ...record, failures, lockedUntil: nextLock });
    return nextLock
      ? { ok: false, lockedUntil: nextLock, message: `Wrong PIN. Locked for ${Math.ceil((nextLock - now()) / 1000)} seconds.` }
      : { ok: false, attemptsLeft: FREE_ATTEMPTS - failures, message: `Wrong PIN. ${FREE_ATTEMPTS - failures} attempt${FREE_ATTEMPTS - failures === 1 ? '' : 's'} left before a lock.` };
  };

  // True while an admin session is open; each protected action keeps it alive.
  const isUnlocked = () => {
    if (!session || session.expiresAt <= now()) { session = null; return false; }
    session.expiresAt = now() + SESSION_IDLE_MS;
    return true;
  };

  const lock = () => { session = null; return { ok: true }; };

  return { status, setPin, unlock, isUnlocked, lock };
}

module.exports = { PIN_PATTERN, FREE_ATTEMPTS, BASE_LOCK_MS, MAX_LOCK_MS, SESSION_IDLE_MS, validPinFormat, hashPin, verifyPinHash, createAdminGuard };
