// Login secrets on user records. Passwords are only ever stored as bcrypt hashes, secrets never leave the
// server, and MFA state can only be changed by the MFA routes (not by editing the user record).
const bcrypt = require('bcryptjs');

const SECRET_FIELDS = ['password', 'passwordHash', 'mfaSecretCipher'];
const SERVER_MANAGED_FIELDS = ['passwordHash', 'passwordChangedAt', 'mfaSecretCipher', 'mfaEnabled', 'mfaEnrolledAt', 'mfaEmailEnrolledAt', 'mfaMethod', 'mfaMethods', 'mfaResetAt', 'mfaResetById'];
const MIN_PASSWORD_LENGTH = 12;

/** A user record safe to send to the browser. */
function publicUserData(data) {
  if (!data || typeof data !== 'object') return data;
  const safe = { ...data };
  for (const field of SECRET_FIELDS) delete safe[field];
  return safe;
}

/**
 * Builds the record to store from what the browser sent. A non-empty `password` sets a new password (hashed);
 * otherwise the stored hash and every MFA field are kept exactly as they were.
 */
async function prepareUserWrite(next, previous) {
  const record = { ...next };
  for (const field of [...SECRET_FIELDS, ...SERVER_MANAGED_FIELDS]) delete record[field];
  for (const field of SERVER_MANAGED_FIELDS) if (previous?.[field] !== undefined) record[field] = previous[field];
  let passwordChanged = false;
  if (typeof next.password === 'string' && next.password.length > 0) {
    if (next.password.length < MIN_PASSWORD_LENGTH) {
      const error = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      error.status = 400;
      throw error;
    }
    record.passwordHash = await bcrypt.hash(next.password, 10);
    record.passwordChangedAt = new Date().toISOString();
    passwordChanged = Boolean(previous);
  } else if (!record.passwordHash && typeof previous?.password === 'string' && previous.password) {
    record.passwordHash = await bcrypt.hash(previous.password, 10); // legacy plain-text record
  }
  return { record, passwordChanged };
}

/** One-off upgrade: hash any password still stored in plain text. Safe to run on every start. */
async function hashLegacyPasswords(pool) {
  const rows = (await pool.query(`SELECT id, data FROM users WHERE data ? 'password'`)).rows;
  for (const row of rows) {
    const { password, ...rest } = row.data;
    const data = rest.passwordHash || typeof password !== 'string' || !password ? rest : { ...rest, passwordHash: await bcrypt.hash(password, 10) };
    await pool.query(`UPDATE users SET data=$2::jsonb, updated_at=now() WHERE id=$1`, [row.id, JSON.stringify(data)]);
  }
  return rows.length;
}

/** The user a login name (email or username, any case) belongs to: { id, data } or null. */
async function findLoginUser(pool, login) {
  const clean = String(login || '').trim().toLowerCase();
  if (!clean) return null;
  let result;
  try {
    result = await pool.query(
      `SELECT id AS document_id, data FROM users WHERE (LOWER(email) = $1 OR LOWER(username) = $1 OR LOWER(data->>'email') = $1 OR LOWER(data->>'username') = $1)`,
      [clean],
    );
  } catch {
    result = await pool.query(
      `SELECT document_id, data FROM hr_documents WHERE collection_name = 'users' AND (LOWER(data->>'email') = $1 OR LOWER(data->>'username') = $1)`,
      [clean],
    );
  }
  const row = result.rows[0];
  return row ? { id: row.document_id, data: row.data } : null;
}

/** Checks a password against the stored hash, or a legacy plain-text password (which is then hashed). */
async function verifyUserPassword(pool, user, password) {
  if (user?.passwordHash) return bcrypt.compare(String(password), user.passwordHash);
  if (typeof user?.password !== 'string' || !user.password) return false;
  const given = Buffer.from(String(password));
  const stored = Buffer.from(user.password);
  const valid = given.length === stored.length && require('node:crypto').timingSafeEqual(given, stored);
  if (valid) await hashLegacyPasswords(pool).catch(() => undefined);
  return valid;
}

module.exports = { publicUserData, prepareUserWrite, hashLegacyPasswords, findLoginUser, verifyUserPassword, MIN_PASSWORD_LENGTH };
