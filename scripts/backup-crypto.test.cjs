const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('encrypted backup envelope round-trips and detects tampering', () => {
  process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  const { encryptFile, decryptFile } = require('./backup-crypto.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hr-backup-test-'));
  const source = path.join(directory, 'source.dump');
  const encrypted = path.join(directory, 'backup.dump.enc');
  const restored = path.join(directory, 'restored.dump');
  fs.writeFileSync(source, crypto.randomBytes(4096));
  encryptFile(source, encrypted);
  decryptFile(encrypted, restored);
  assert.deepEqual(fs.readFileSync(restored), fs.readFileSync(source));
  const damaged = fs.readFileSync(encrypted);
  damaged[30] ^= 1;
  fs.writeFileSync(encrypted, damaged);
  assert.throws(() => decryptFile(encrypted, path.join(directory, 'invalid.dump')));
  fs.rmSync(directory, { recursive: true, force: true });
});
