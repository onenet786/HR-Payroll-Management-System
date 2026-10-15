const crypto = require('node:crypto');
const fs = require('node:fs');

const MAGIC = Buffer.from('HRPBK001');

function encryptionKey() {
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64.');
  return key;
}

function encryptFile(source, target) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const plaintext = fs.readFileSync(source);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  fs.writeFileSync(target, Buffer.concat([MAGIC, iv, encrypted, cipher.getAuthTag()]), { mode: 0o600, flag: 'wx' });
}

function decryptFile(source, target) {
  const payload = fs.readFileSync(source);
  if (payload.length < 36 || !payload.subarray(0, 8).equals(MAGIC)) throw new Error('Backup envelope is invalid or unsupported.');
  const iv = payload.subarray(8, 20);
  const tag = payload.subarray(payload.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(payload.subarray(20, -16)), decipher.final()]);
  fs.writeFileSync(target, plaintext, { mode: 0o600, flag: 'wx' });
}

function sha256File(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

module.exports = { encryptFile, decryptFile, sha256File };
