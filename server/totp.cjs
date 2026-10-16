const crypto = require('node:crypto');

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32Encode = buffer => {
  let bits = 0; let value = 0; let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
};
const base32Decode = input => {
  const clean = String(input).toUpperCase().replace(/[^A-Z2-7]/g, '');
  if (clean.length < 16) throw new Error('Invalid TOTP secret.');
  let bits = 0; let value = 0; const bytes = [];
  for (const char of clean) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
};
const totpForCounter = (secret, counter) => {
  const counterBytes = Buffer.alloc(8); counterBytes.writeBigUInt64BE(BigInt(counter));
  const hash = crypto.createHmac('sha1', base32Decode(secret)).update(counterBytes).digest();
  const offset = hash[hash.length - 1] & 15;
  return String(((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
};
const verifyTotp = (secret, code, now = Date.now()) => {
  if (!/^\d{6}$/.test(String(code))) return false;
  const counter = Math.floor(now / 30_000);
  return [-1, 0, 1].some(offset => crypto.timingSafeEqual(Buffer.from(totpForCounter(secret, counter + offset)), Buffer.from(String(code))));
};
const secretKey = () => {
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY || '', 'base64');
  if (key.length !== 32) throw new Error('MFA_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64.');
  return key;
};
const encryptSecret = secret => {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
};
const decryptSecret = cipherText => {
  const value = Buffer.from(cipherText, 'base64');
  if (value.length < 29) throw new Error('Stored MFA secret is invalid.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), value.subarray(0, 12));
  decipher.setAuthTag(value.subarray(12, 28));
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
};
const newSecret = () => base32Encode(crypto.randomBytes(20));

module.exports = { newSecret, verifyTotp, encryptSecret, decryptSecret };
