#!/usr/bin/env node
// Sets a new password for an administrator of a self-hosted installation (Windows Server package tool
// Reset-AdminPassword.ps1). Run in the folder holding the .env. The password is read from the environment,
// never from the command line, so it does not show up in process listings.
//
//   RESET_EMAIL=<admin email, optional>  RESET_PASSWORD=<new password, optional>  node scripts/reset-admin-password.cjs
//
// Without RESET_EMAIL the built-in administrator (user-admin, else the first active admin) is used.
// Without RESET_PASSWORD a strong password is generated and printed once.
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { ensureDefaultRoles } = require('../server/default-roles.cjs');

function generatePassword() {
  return `${crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 14)}-7a`;
}

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing (run from the folder that holds the .env).');
  const email = String(process.env.RESET_EMAIL || '').trim().toLowerCase();
  const generated = !process.env.RESET_PASSWORD;
  const password = generated ? generatePassword() : String(process.env.RESET_PASSWORD);
  if (password.length < 12) throw new Error('The password must have at least 12 characters.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await ensureDefaultRoles(pool); // installs created before roles were seeded show "No Role"
    const found = email
      ? await pool.query(`SELECT id, email, data FROM users WHERE lower(email)=$1 OR lower(data->>'email')=$1 OR lower(username)=$1 LIMIT 1`, [email])
      : await pool.query(`SELECT id, email, data FROM users WHERE role_id='role-admin' ORDER BY (id='user-admin') DESC, (status='Active') DESC, created_at LIMIT 1`);
    const user = found.rows[0];
    if (!user) {
      const admins = (await pool.query(`SELECT email FROM users WHERE role_id='role-admin' ORDER BY email`)).rows.map(row => row.email);
      throw new Error(email ? `No user with the email ${email}. Administrators: ${admins.join(', ') || 'none'}` : 'No administrator account exists.');
    }
    const { password: _legacy, ...rest } = user.data || {};
    const data = { ...rest, passwordHash: await bcrypt.hash(password, 10), passwordChangedAt: new Date().toISOString(), status: 'Active' };
    await pool.query(`UPDATE users SET data=$2::jsonb, status='Active', version=version+1, updated_at=now() WHERE id=$1`, [user.id, JSON.stringify(data)]);
    await pool.query(`INSERT INTO hr_audit_log(actor_uid, actor_role_id, action, collection_name, document_id, new_data) VALUES('server-console','system','admin_password_reset','users',$1,$2::jsonb)`,
      [user.id, JSON.stringify({ email: user.email })]).catch(() => undefined);
    console.log(JSON.stringify({ email: user.email, password: generated ? password : undefined }));
  } finally {
    await pool.end();
  }
})().catch(error => { console.error(error.message); process.exit(1); });
