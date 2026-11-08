#!/usr/bin/env node
// First-time setup of a self-hosted installation (used by the Windows Server setup, deploy/windows/).
// Creates the company, the first administrator, the edition, the addresses users may open the app at and the
// client data import switch. Safe to run again: existing records are kept.
//
//   SETUP_INPUT_FILE=<json file> node scripts/setup-installation.cjs      (run in the folder holding the .env)
//
// JSON: { companyName, adminName, adminEmail, adminPassword, edition: "full"|"lite", urls: [..], publicUrl, clientDataImport }
const fs = require('node:fs');
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const installation = require('../server/installation.cjs');
const { normalizeEdition } = require('../server/edition.cjs');
const { ensureDefaultRoles } = require('../server/default-roles.cjs');

(async () => {
  const file = process.env.SETUP_INPUT_FILE;
  if (!file || !fs.existsSync(file)) throw new Error('SETUP_INPUT_FILE must point to the setup JSON.');
  const input = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); // Windows PowerShell writes a BOM
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing (run from the folder that holds the .env).');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const company = { id: 'company-main', name: String(input.companyName || 'Company').trim(), industry: '', taxRegistrationNumber: '', eobiRegistrationNumber: '', socialSecurityRegion: '', createdBy: 'windows-setup' };
    const companyResult = await pool.query(`INSERT INTO companies(id, name, status, data, version, updated_at) VALUES($1,$2,'Active',$3::jsonb,1,now()) ON CONFLICT (id) DO NOTHING`, [company.id, company.name, JSON.stringify(company)]);

    const email = String(input.adminEmail || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid administrator email is required.');
    if (String(input.adminPassword || '').length < 12) throw new Error('The administrator password must have at least 12 characters.');
    await ensureDefaultRoles(pool);
    const existing = (await pool.query(`SELECT id FROM users WHERE lower(email)=$1 OR lower(data->>'email')=$1`, [email])).rows[0];
    if (!existing) {
      const user = { id: 'user-admin', name: String(input.adminName || 'Administrator'), email, username: email, roleId: 'role-admin', status: 'Active', passwordHash: await bcrypt.hash(String(input.adminPassword), 10), createdAt: new Date().toISOString(), createdBy: 'windows-setup' };
      await pool.query(`INSERT INTO users(id, username, email, role_id, status, data, version, updated_at) VALUES($1,$2,$2,'role-admin','Active',$3::jsonb,1,now()) ON CONFLICT (id) DO NOTHING`, [user.id, email, JSON.stringify(user)]);
    }

    await installation.writeSetting(pool, 'edition', normalizeEdition({ id: input.edition === 'lite' ? 'lite' : 'full', updatedAt: new Date().toISOString(), updatedBy: 'windows-setup' }));
    const urls = (Array.isArray(input.urls) ? input.urls : []).filter(Boolean);
    const publicUrl = input.publicUrl || urls[0] || null;
    await installation.saveDomains(pool, { platformUrl: publicUrl, publicUrl, allowedOrigins: urls });
    await installation.setClientDataImport(pool, input.clientDataImport === true, 'windows-setup');
    await pool.query(`INSERT INTO hr_audit_log(actor_uid, actor_role_id, action, collection_name, document_id, new_data) VALUES('windows-setup','system','installation_setup','appSettings','installation',$1::jsonb)`,
      [JSON.stringify({ company: company.name, admin: email, edition: input.edition, urls, clientDataImport: input.clientDataImport === true })]).catch(() => undefined);
    console.log(JSON.stringify({ company: companyResult.rowCount ? 'created' : 'kept', administrator: existing ? 'kept' : 'created', edition: input.edition === 'lite' ? 'lite' : 'full', urls, clientDataImport: input.clientDataImport === true }));
  } finally {
    await pool.end();
  }
})().catch(error => { console.error(error.message); process.exit(1); });
