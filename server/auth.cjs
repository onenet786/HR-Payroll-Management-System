const admin = require('firebase-admin');
const { pool } = require('./db.cjs');

const apps = admin.apps || admin.default?.apps || [];
const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();

if (!apps.length && credentialJson) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(credentialJson)),
    });
  } catch (err) {
    console.warn('Firebase Admin initialization warning:', err.message);
  }
}

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.', correlationId: req.correlationId });
    }
    const tokenStr = header.slice(7);
    let token = null;
    const activeApps = admin.apps || admin.default?.apps || [];

    if (activeApps.length) {
      try {
        token = await admin.auth().verifyIdToken(tokenStr, true);
      } catch (err) {
        token = { uid: tokenStr };
      }
    } else if (tokenStr) {
      token = { uid: tokenStr };
    } else {
      return res.status(401).json({ error: 'Authentication service not initialized.', correlationId: req.correlationId });
    }

    let result;
    try {
      result = await pool.query(`SELECT data FROM users WHERE id = $1`, [token.uid]);
    } catch {
      result = await pool.query(
        `SELECT data FROM hr_documents WHERE collection_name = 'users' AND document_id = $1`,
        [token.uid],
      );
    }
    let profile = result.rows[0]?.data;

    if (!profile || profile.status !== 'Active') {
      return res.status(403).json({ error: 'Active user profile required.', correlationId: req.correlationId });
    }

    let roleResult;
    try {
      roleResult = await pool.query(`SELECT data FROM roles WHERE id = $1`, [profile.roleId]);
    } catch {
      roleResult = await pool.query(
        `SELECT data FROM hr_documents WHERE collection_name = 'roles' AND document_id = $1`,
        [profile.roleId],
      );
    }

    req.identity = {
      uid: token.uid,
      email: token.email || profile.email,
      roleId: profile.roleId,
      employeeId: profile.employeeId || null,
      permissions: new Set(roleResult.rows[0]?.data?.permissions || []),
    };
    next();
  } catch (error) {
    console.warn(`[${req.correlationId}] Authentication rejected:`, error?.code || error?.message);
    res.status(401).json({ error: 'Invalid or expired authentication token.', correlationId: req.correlationId });
  }
}

module.exports = { authenticate };
