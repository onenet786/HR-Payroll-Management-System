// Client operations of the Provider Console: provisioning (one form → a running installation), template database,
// domains, licence / edition / switches, releases, backups, health, kiosk and mobile codes.
//
// The console writes only installation settings into a client database (app_settings, the company row, the first
// administrator, kiosk setup codes). It never reads or edits employees, attendance or payroll.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { pool, withAdmin, clientPool, closeClientPool, urlForDatabase } = require('./db.cjs');
const { config } = require('./config.cjs');
const { audit } = require('./audit.cjs');
const aapanel = require('./aapanel.cjs');
const dns = require('./dns.cjs');
const instances = require('./instances.cjs');
const { defineJob, createJob } = require('./jobs.cjs');
const installation = require('../../server/installation.cjs');
const { normalizeEdition } = require('../../server/edition.cjs');
const { ensureDefaultRoles } = require('../../server/default-roles.cjs');
const { encryptSecret, decryptSecret } = require('../../server/totp.cjs');

const SLUG = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;
const RESERVED = new Set(['www', 'admin', 'api', 'mail', 'smtp', 'ftp', 'panel', 'provider', 'console', 'status', 'app', 'portal', 'mcs', 'attendance', 'test', 'demo']);
const ident = value => `"${String(value).replace(/"/g, '""')}"`;
const dbNameFor = slug => `hr_${slug.replace(/-/g, '_')}`;
const platformUrl = slug => `https://${dns.platformHost(slug)}`;
const emptyDir = () => { const dir = path.join(os.tmpdir(), 'hr-provider-empty'); fs.mkdirSync(dir, { recursive: true }); return dir; };

async function getClient(idOrSlug) {
  const row = (await pool.query(`SELECT * FROM clients WHERE id::text=$1 OR slug=$1`, [String(idOrSlug)])).rows[0];
  if (!row) throw Object.assign(new Error('Client not found.'), { status: 404 });
  return row;
}

// ─── Template database ────────────────────────────────────────────────────────
// A database with every migration and the default roles and tax slabs already applied. A new client's database is
// a copy of it (CREATE DATABASE … TEMPLATE), which takes seconds instead of running migrations and seeds.

async function refreshTemplate(releaseName, actor) {
  const release = releaseName ? { name: releaseName, path: instances.releasePath(releaseName) } : instances.latestRelease();
  if (!release) throw new Error(`No release found in ${config.releasesRoot}. Add one first (see the hosting guide).`);
  const exists = await withAdmin(null, async db => (await db.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [config.templateDb])).rowCount > 0);
  if (!exists) await withAdmin(null, db => db.query(`CREATE DATABASE ${ident(config.templateDb)}`));
  const env = { DATABASE_URL: urlForDatabase(config.templateDb), PG_SSL: 'false' };
  const migrate = await instances.runReleaseScript(release.path, 'postgres-migrate.cjs', [], env, emptyDir());
  let seed = '';
  try { seed = await instances.runReleaseScript(release.path, 'seed-tax-slabs.cjs', [], env, emptyDir()); } catch (error) { seed = `tax slabs: ${error.message}`; }
  const migrations = await withAdmin(config.templateDb, async db => (await db.query(`SELECT count(*)::int AS n FROM schema_migrations`)).rows[0].n);
  const info = { release: release.name, refreshedAt: new Date().toISOString(), migrations, log: `${migrate}\n${seed}`.trim().slice(-2000) };
  await pool.query(`INSERT INTO provider_settings(key, data) VALUES('template', $1::jsonb) ON CONFLICT (key) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [JSON.stringify(info)]);
  await audit(actor, 'template_refreshed', { detail: { release: release.name, migrations } });
  return info;
}

async function templateInfo() {
  const stored = (await pool.query(`SELECT data FROM provider_settings WHERE key='template'`)).rows[0]?.data || null;
  const exists = await withAdmin(null, async db => (await db.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [config.templateDb])).rowCount > 0).catch(() => false);
  return { name: config.templateDb, exists, ...(stored || {}) };
}

// ─── Provisioning ─────────────────────────────────────────────────────────────

async function nextPort() {
  const used = new Set((await pool.query(`SELECT port FROM clients`)).rows.map(row => row.port));
  let port = config.clientPortStart;
  while (used.has(port)) port += 1;
  return port;
}

function validateNewClient(input) {
  const slug = String(input.slug || '').trim().toLowerCase();
  if (!SLUG.test(slug)) throw new Error('The address name must be 3–32 characters: lowercase letters, digits and dashes, starting with a letter.');
  if (RESERVED.has(slug)) throw new Error(`"${slug}" is reserved. Choose another address name.`);
  if (!String(input.name || '').trim()) throw new Error('Enter the client\'s company name.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(input.adminEmail || ''))) throw new Error('Enter the administrator\'s email address.');
  return slug;
}

/** Creates the client record and starts the provisioning job. Returns { clientId, jobId }. */
async function startProvisioning(input, actor) {
  const slug = validateNewClient(input);
  if ((await pool.query(`SELECT 1 FROM clients WHERE slug=$1`, [slug])).rowCount) throw new Error(`A client with the address ${slug} already exists.`);
  const template = await templateInfo();
  if (!template.exists) throw new Error('The template database does not exist yet. Settings → Template database → Create/refresh.');
  const release = input.release || instances.latestRelease()?.name;
  if (!release) throw new Error('No application release is installed. Settings → Releases.');
  instances.releasePath(release);
  const id = crypto.randomUUID();
  const edition = normalizeEdition(input.edition || { id: 'full' });
  const licence = installation.normalizeLicence(input.licence || {});
  const features = { clientDataImport: input.clientDataImport === true };
  await pool.query(
    `INSERT INTO clients(id, slug, name, contact_name, contact_email, contact_phone, status, db_name, db_role, port, release, edition, licence, features, notes)
     VALUES($1,$2,$3,$4,$5,$6,'provisioning',$7,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13)`,
    [id, slug, String(input.name).trim(), String(input.contactName || ''), String(input.contactEmail || input.adminEmail || ''), String(input.contactPhone || ''),
      dbNameFor(slug), await nextPort(), release, JSON.stringify(edition), JSON.stringify(licence), JSON.stringify(features), String(input.notes || '')],
  );
  await pool.query(`INSERT INTO client_domains(id, client_id, domain, kind, is_primary, status) VALUES($1,$2,$3,'platform',true,'pending_dns')`, [crypto.randomUUID(), id, dns.platformHost(slug)]);
  await audit(actor, 'client_created', { clientId: id, target: slug, detail: { name: input.name, edition: edition.id, release } });
  const jobId = await createJob('provision', { clientId: id, createdBy: actor, input: { adminName: String(input.adminName || 'Administrator'), adminEmail: String(input.adminEmail).trim().toLowerCase() } });
  return { clientId: id, jobId };
}

async function writeClientSettings(client) {
  const db = clientPool(client.db_name);
  const actor = 'provider';
  await installation.writeSetting(db, 'edition', normalizeEdition({ ...client.edition, updatedAt: new Date().toISOString(), updatedBy: actor }));
  await installation.saveLicence(db, client.licence, actor);
  await installation.setClientDataImport(db, client.features?.clientDataImport === true, actor);
  const domains = (await pool.query(`SELECT domain, kind, is_primary, status FROM client_domains WHERE client_id=$1 AND status <> 'removed'`, [client.id])).rows;
  const custom = domains.filter(row => row.kind !== 'platform' && ['active', 'attached'].includes(row.status));
  const primaryCustom = custom.find(row => row.is_primary) || null;
  await installation.saveDomains(db, {
    platformUrl: platformUrl(client.slug),
    publicUrl: primaryCustom ? `https://${primaryCustom.domain}` : platformUrl(client.slug),
    allowedOrigins: custom.flatMap(row => [`https://${row.domain}`, ...(row.kind !== 'subdomain' ? [`https://www.${row.domain}`] : [])]),
  });
}

defineJob('provision', {
  steps: [
    {
      key: 'database', label: 'Create the database from the template',
      run: async ctx => {
        const client = await getClient(ctx.clientId);
        const role = client.db_role;
        const password = ctx.output.dbPasswordCipher ? decryptSecret(ctx.output.dbPasswordCipher) : instances.randomPassword();
        ctx.output.dbPasswordCipher = encryptSecret(password);
        await withAdmin(null, async db => {
          const roleExists = (await db.query(`SELECT 1 FROM pg_roles WHERE rolname=$1`, [role])).rowCount > 0;
          if (roleExists) await db.query(`ALTER ROLE ${ident(role)} WITH LOGIN PASSWORD '${password}'`);
          else await db.query(`CREATE ROLE ${ident(role)} LOGIN PASSWORD '${password}'`);
          const dbExists = (await db.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [client.db_name])).rowCount > 0;
          if (!dbExists) await db.query(`CREATE DATABASE ${ident(client.db_name)} TEMPLATE ${ident(config.templateDb)} OWNER ${ident(role)}`);
          await db.query(`REVOKE CONNECT ON DATABASE ${ident(client.db_name)} FROM PUBLIC`);
          await db.query(`GRANT CONNECT ON DATABASE ${ident(client.db_name)} TO ${ident(role)}`);
        });
        // Objects copied from the template belong to the template owner: hand them to the client's own role.
        await withAdmin(client.db_name, db => db.query(`DO $$ DECLARE r record; BEGIN
          EXECUTE 'ALTER SCHEMA public OWNER TO ${ident(role).replace(/'/g, "''")}';
          FOR r IN SELECT format('%I.%I', schemaname, tablename) AS n FROM pg_tables WHERE schemaname='public' LOOP EXECUTE 'ALTER TABLE ' || r.n || ' OWNER TO ${ident(role).replace(/'/g, "''")}'; END LOOP;
          FOR r IN SELECT format('%I.%I', sequence_schema, sequence_name) AS n FROM information_schema.sequences WHERE sequence_schema='public' LOOP EXECUTE 'ALTER SEQUENCE ' || r.n || ' OWNER TO ${ident(role).replace(/'/g, "''")}'; END LOOP;
          FOR r IN SELECT format('%I.%I', schemaname, viewname) AS n FROM pg_views WHERE schemaname='public' LOOP EXECUTE 'ALTER VIEW ' || r.n || ' OWNER TO ${ident(role).replace(/'/g, "''")}'; END LOOP;
        END $$`));
        return { detail: `Database ${client.db_name} (owner ${role}) created from ${config.templateDb}.` };
      },
    },
    {
      key: 'files', label: 'Create the client folder and settings',
      run: async ctx => {
        const client = await getClient(ctx.clientId);
        const { dir } = instances.writeClientFolder({ slug: client.slug, name: client.name, port: client.port, dbName: client.db_name, dbRole: client.db_role, dbPassword: decryptSecret(ctx.output.dbPasswordCipher), release: client.release, appUrl: platformUrl(client.slug) });
        return { detail: `${dir} (release ${client.release}, port ${client.port}).` };
      },
    },
    {
      key: 'migrate', label: 'Bring the database up to the release',
      run: async ctx => {
        const client = await getClient(ctx.clientId);
        const log = await instances.runClientScript(client.slug, 'postgres-migrate.cjs');
        const applied = (log.match(/Applied /g) || []).length;
        return { detail: applied ? `${applied} newer migration(s) applied.` : 'Already up to date.' };
      },
    },
    {
      key: 'settings', label: 'Company, administrator, edition and licence',
      run: async ctx => {
        const client = await getClient(ctx.clientId);
        const db = clientPool(client.db_name);
        const company = { id: 'company-main', name: client.name, industry: '', taxRegistrationNumber: '', eobiRegistrationNumber: '', socialSecurityRegion: '', createdBy: 'provider' };
        await db.query(`INSERT INTO companies(id, status, data, version, updated_at) VALUES($1,'Active',$2::jsonb,1,now()) ON CONFLICT (id) DO NOTHING`, [company.id, JSON.stringify(company)]);
        await ensureDefaultRoles(db);
        const adminEmail = ctx.input.adminEmail;
        const existing = (await db.query(`SELECT id FROM users WHERE lower(data->>'email')=$1`, [adminEmail])).rows[0];
        if (!existing) {
          const password = `${crypto.randomBytes(9).toString('base64url')}-${crypto.randomInt(10, 99)}`;
          const user = { id: 'user-admin', name: ctx.input.adminName, email: adminEmail, username: adminEmail, roleId: 'role-admin', status: 'Active', passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString(), createdBy: 'provider' };
          await db.query(`INSERT INTO users(id, employee_id, status, data, version, updated_at) VALUES($1, NULL, 'Active', $2::jsonb, 1, now())`, [user.id, JSON.stringify(user)]);
          ctx.output.adminPasswordCipher = encryptSecret(password);
          ctx.output.adminEmail = adminEmail;
        }
        await writeClientSettings(client);
        return { detail: `Company "${client.name}", administrator ${adminEmail}, ${client.edition?.id || 'full'} edition.` };
      },
    },
    {
      key: 'project', label: 'aaPanel Node project and domain mapping',
      run: async ctx => {
        const client = await getClient(ctx.clientId);
        const result = await aapanel.createNodeProject({ name: instances.projectName(client.slug), cwd: instances.clientDir(client.slug), port: client.port, domains: [dns.platformHost(client.slug)] });
        return result.ok ? { detail: `Project ${instances.projectName(client.slug)} created on port ${client.port}.` } : { status: 'manual', detail: 'Create the Node project in aaPanel, then press "Mark done".', instructions: result.instructions, error: result.error };
      },
    },
    {
      key: 'ssl', label: `HTTPS with the *.${config.baseDomain} certificate`,
      run: async ctx => {
        const client = await getClient(ctx.clientId);
        const result = await aapanel.deployWildcardCertificate(instances.projectName(client.slug));
        return result.ok ? { detail: 'Wildcard certificate deployed, HTTPS forced.' } : { status: 'manual', detail: 'Deploy the wildcard certificate in aaPanel, then press "Mark done".', instructions: result.instructions, error: result.error };
      },
    },
    {
      key: 'health', label: 'Check that the installation answers',
      run: async ctx => {
        const client = await getClient(ctx.clientId);
        const local = await probe(`http://127.0.0.1:${client.port}/api/health`);
        if (!local.ok) return { status: 'manual', detail: `The app does not answer on port ${client.port} yet (${local.error}). Start the Node project in aaPanel, then press "Retry" — or "Mark done" to finish anyway.`, instructions: [`aaPanel → Website → Node Project → ${instances.projectName(client.slug)} → Start, then open its log if it stops.`] };
        const publicCheck = await probe(`${platformUrl(client.slug)}/api/health`);
        await pool.query(`UPDATE client_domains SET status=$2, dns_ok=$3, last_checked_at=now(), last_error=$4 WHERE client_id=$1 AND kind='platform'`, [client.id, publicCheck.ok ? 'active' : 'attached', publicCheck.ok, publicCheck.ok ? null : publicCheck.error]);
        return { detail: publicCheck.ok ? `Live at ${platformUrl(client.slug)} (${local.ms} ms).` : `Running on port ${client.port}; ${platformUrl(client.slug)} not reachable yet (${publicCheck.error}). Check DNS/SSL; the nightly check retries.` };
      },
    },
  ],
  onDone: async ctx => {
    await pool.query(`UPDATE clients SET status='active', updated_at=now() WHERE id=$1 AND status='provisioning'`, [ctx.clientId]);
    await audit('provider', 'client_provisioned', { clientId: ctx.clientId });
  },
  onFailed: async ctx => { await pool.query(`UPDATE clients SET updated_at=now() WHERE id=$1`, [ctx.clientId]); },
});

/** The temporary administrator password, shown once; "I have saved it" deletes it. */
async function revealAdminPassword(jobId, actor, { forget = false } = {}) {
  const job = (await pool.query(`SELECT * FROM jobs WHERE id=$1 AND kind='provision'`, [jobId])).rows[0];
  if (!job) throw new Error('Job not found.');
  if (forget) {
    const output = { ...job.output }; delete output.adminPasswordCipher;
    await pool.query(`UPDATE jobs SET output=$2::jsonb WHERE id=$1`, [jobId, JSON.stringify(output)]);
    await audit(actor, 'admin_password_forgotten', { clientId: job.client_id });
    return { forgotten: true };
  }
  if (!job.output.adminPasswordCipher) return { password: null };
  await audit(actor, 'admin_password_revealed', { clientId: job.client_id });
  return { email: job.output.adminEmail, password: decryptSecret(job.output.adminPasswordCipher) };
}

async function probe(url, timeoutMs = 8000) {
  const started = Date.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? { ok: true, ms: Date.now() - started } : { ok: false, error: `HTTP ${response.status}` };
  } catch (error) { return { ok: false, error: error.cause?.code || error.name || error.message }; }
}

// ─── Licence, edition, switches ───────────────────────────────────────────────

async function updateClientSettings(idOrSlug, patch, actor) {
  const client = await getClient(idOrSlug);
  const edition = patch.edition ? normalizeEdition(patch.edition) : client.edition;
  const licence = patch.licence ? installation.normalizeLicence({ ...client.licence, ...patch.licence }) : client.licence;
  const features = patch.features ? { ...client.features, ...patch.features } : client.features;
  const fields = {
    name: typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim() : client.name,
    contact_name: patch.contactName ?? client.contact_name, contact_email: patch.contactEmail ?? client.contact_email,
    contact_phone: patch.contactPhone ?? client.contact_phone, notes: patch.notes ?? client.notes,
  };
  const status = client.status === 'archived' ? 'archived' : licence.status === 'suspended' ? 'suspended' : client.status === 'suspended' ? 'active' : client.status;
  await pool.query(
    `UPDATE clients SET name=$2, contact_name=$3, contact_email=$4, contact_phone=$5, notes=$6, edition=$7::jsonb, licence=$8::jsonb, features=$9::jsonb, status=$10, updated_at=now() WHERE id=$1`,
    [client.id, fields.name, fields.contact_name, fields.contact_email, fields.contact_phone, fields.notes, JSON.stringify(edition), JSON.stringify(licence), JSON.stringify(features), status],
  );
  const updated = await getClient(client.id);
  if (client.status !== 'provisioning') await writeClientSettings(updated);
  await audit(actor, 'client_settings_updated', { clientId: client.id, detail: { edition: edition.id, licence, features } });
  return updated;
}

// ─── Domains ──────────────────────────────────────────────────────────────────

async function addDomain(idOrSlug, input, actor) {
  const client = await getClient(idOrSlug);
  const classified = await dns.classifyDomain(input.domain, client.slug);
  if (classified.kind === 'platform') throw new Error('The platform subdomain is already set up.');
  const kind = classified.kind === 'apex' && input.mode === 'nameservers' ? 'nameservers' : classified.kind;
  if (kind === 'nameservers' && !config.nameservers.length) throw new Error('Set PROVIDER_NAMESERVERS in provider/.env to offer nameserver delegation.');
  const clash = (await pool.query(`SELECT c.slug FROM client_domains d JOIN clients c ON c.id=d.client_id WHERE d.domain=$1 AND d.status<>'removed'`, [classified.domain])).rows[0];
  if (clash) throw new Error(`${classified.domain} is already used by client ${clash.slug}.`);
  const id = crypto.randomUUID();
  await pool.query(`DELETE FROM client_domains WHERE domain=$1 AND status='removed'`, [classified.domain]);
  await pool.query(`INSERT INTO client_domains(id, client_id, domain, kind, is_primary, status, dns_detail) VALUES($1,$2,$3,$4,$5,'pending_dns',$6::jsonb)`,
    [id, client.id, classified.domain, kind, input.primary !== false, JSON.stringify({ expected: dns.expectedRecords(classified.domain, kind, client.slug), registrable: classified.registrable })]);
  if (input.primary !== false) await pool.query(`UPDATE client_domains SET is_primary=false WHERE client_id=$1 AND id<>$2 AND kind<>'platform'`, [client.id, id]);
  await audit(actor, 'domain_added', { clientId: client.id, target: classified.domain, detail: { kind } });
  const jobId = await createJob('domain-attach', { clientId: client.id, createdBy: actor, input: { domainId: id } });
  return { domainId: id, kind, jobId, warning: kind === 'apex' ? `Pointing ${classified.domain} at this server replaces any website currently on it. Email (MX) is not affected.` : null };
}

async function domainRow(id) {
  const row = (await pool.query(`SELECT d.*, c.slug, c.db_name FROM client_domains d JOIN clients c ON c.id=d.client_id WHERE d.id=$1`, [id])).rows[0];
  if (!row) throw new Error('Domain not found.');
  return row;
}

defineJob('domain-attach', {
  steps: [
    {
      key: 'dns', label: 'DNS points at this server',
      run: async ctx => {
        const row = await domainRow(ctx.input.domainId);
        const result = await dns.verifyDomain(row.domain, row.kind, row.slug);
        await pool.query(`UPDATE client_domains SET dns_ok=$2, dns_detail=dns_detail || $3::jsonb, last_checked_at=now(), status=CASE WHEN $2 THEN 'verified' ELSE 'pending_dns' END, last_error=$4 WHERE id=$1`,
          [row.id, result.ok, JSON.stringify({ found: result.found, message: result.message }), result.ok ? null : result.message]);
        if (!result.ok) return { status: 'manual', detail: `Waiting for DNS: ${result.message} DNS changes can take minutes to a few hours. Press "Retry" to check again.`, instructions: result.expected.filter(record => record.who === 'client').map(record => `${record.type}  ${record.host}  →  ${record.value}${record.note ? `   (${record.note})` : ''}`) };
        return { detail: result.message };
      },
    },
    {
      key: 'mapping', label: 'Add the domain to the aaPanel project',
      run: async ctx => {
        const row = await domainRow(ctx.input.domainId);
        const names = row.kind === 'subdomain' ? [row.domain] : [row.domain, `www.${row.domain}`];
        for (const name of names) {
          const result = await aapanel.addDomain(instances.projectName(row.slug), name);
          if (!result.ok) return { status: 'manual', detail: 'Add the domain in aaPanel, then press "Mark done".', instructions: names.flatMap(item => [`aaPanel → Website → Node Project → ${instances.projectName(row.slug)} → Domain / Mapping → add ${item}`]), error: result.error };
        }
        await pool.query(`UPDATE client_domains SET status='attached' WHERE id=$1`, [row.id]);
        return { detail: `${names.join(', ')} mapped.` };
      },
    },
    {
      key: 'ssl', label: "Let's Encrypt certificate",
      run: async ctx => {
        const row = await domainRow(ctx.input.domainId);
        const names = row.kind === 'subdomain' ? [row.domain] : [row.domain, `www.${row.domain}`];
        const result = await aapanel.applyLetsEncrypt(instances.projectName(row.slug), names);
        return result.ok ? { detail: 'Certificate issued; aaPanel renews it automatically.' } : { status: 'manual', detail: 'Issue the certificate in aaPanel, then press "Mark done".', instructions: result.instructions, error: result.error };
      },
    },
    {
      key: 'allow', label: 'Allow the domain in the application',
      run: async ctx => {
        const row = await domainRow(ctx.input.domainId);
        await pool.query(`UPDATE client_domains SET status='attached' WHERE id=$1 AND status<>'active'`, [row.id]);
        await writeClientSettings(await getClient(row.client_id));
        return { detail: 'Added to the allowed addresses (works within 30 seconds, no restart).' };
      },
    },
    {
      key: 'verify', label: 'HTTPS works',
      run: async ctx => {
        const row = await domainRow(ctx.input.domainId);
        const cert = await dns.checkCertificate(row.domain);
        const health = await probe(`https://${row.domain}/api/health`);
        await pool.query(`UPDATE client_domains SET ssl_expires_at=$2, ssl_issuer=$3, status=$4, last_checked_at=now(), last_error=$5 WHERE id=$1`,
          [row.id, cert.expiresAt || null, cert.issuer || null, cert.ok && health.ok ? 'active' : 'attached', cert.ok && health.ok ? null : (cert.error || health.error)]);
        if (!cert.ok || !health.ok) return { status: 'manual', detail: `Not working over HTTPS yet: ${cert.error || health.error}. Press "Retry" after the certificate is issued.`, instructions: [`Open https://${row.domain} in a browser to see the error.`] };
        const expiry = await dns.domainExpiry(row.domain);
        await pool.query(`UPDATE client_domains SET domain_expires_at=$2 WHERE id=$1`, [row.id, expiry.expiresAt]);
        await writeClientSettings(await getClient(row.client_id));
        return { detail: `https://${row.domain} is live (certificate by ${cert.issuer}, valid until ${cert.expiresAt.slice(0, 10)}).` };
      },
    },
  ],
});

async function removeDomain(domainId, actor) {
  const row = await domainRow(domainId);
  if (row.kind === 'platform') throw new Error('The platform subdomain cannot be removed; kiosks and the mobile app use it.');
  await pool.query(`UPDATE client_domains SET status='removed', is_primary=false WHERE id=$1`, [row.id]);
  await writeClientSettings(await getClient(row.client_id));
  const names = row.kind === 'subdomain' ? [row.domain] : [row.domain, `www.${row.domain}`];
  const results = [];
  for (const name of names) results.push(await aapanel.removeDomain(instances.projectName(row.slug), name));
  await audit(actor, 'domain_removed', { clientId: row.client_id, target: row.domain });
  const manual = results.filter(result => !result.ok);
  return { removed: true, manual: manual.length ? manual.flatMap(result => result.instructions) : [] };
}

async function setPrimaryDomain(domainId, actor) {
  const row = await domainRow(domainId);
  await pool.query(`UPDATE client_domains SET is_primary=(id=$2) WHERE client_id=$1 AND kind<>'platform'`, [row.client_id, row.id]);
  await writeClientSettings(await getClient(row.client_id));
  await audit(actor, 'domain_primary', { clientId: row.client_id, target: row.domain });
}

/** Re-checks DNS, certificate and registration expiry of every domain (nightly from aaPanel Cron). */
async function checkAllDomains() {
  const rows = (await pool.query(`SELECT d.*, c.slug FROM client_domains d JOIN clients c ON c.id=d.client_id WHERE d.status <> 'removed' AND c.status <> 'archived'`)).rows;
  const problems = [];
  for (const row of rows) {
    const result = await dns.verifyDomain(row.domain, row.kind, row.slug);
    const cert = result.ok ? await dns.checkCertificate(row.domain) : { ok: false, error: 'DNS' };
    const expiry = row.kind === 'platform' ? { expiresAt: null } : await dns.domainExpiry(row.domain);
    const certDays = cert.expiresAt ? Math.floor((Date.parse(cert.expiresAt) - Date.now()) / 86_400_000) : null;
    const domainDays = expiry.expiresAt ? Math.floor((Date.parse(expiry.expiresAt) - Date.now()) / 86_400_000) : null;
    const issue = !result.ok ? result.message : !cert.ok ? `HTTPS: ${cert.error}` : certDays !== null && certDays < 15 ? `Certificate expires in ${certDays} days` : domainDays !== null && domainDays < 30 ? `Domain registration expires in ${domainDays} days` : null;
    if (issue) problems.push({ domain: row.domain, client: row.slug, issue });
    await pool.query(`UPDATE client_domains SET dns_ok=$2, ssl_expires_at=COALESCE($3, ssl_expires_at), ssl_issuer=COALESCE($4, ssl_issuer), domain_expires_at=COALESCE($5, domain_expires_at), last_checked_at=now(), last_error=$6,
      status=CASE WHEN status IN ('active','error') THEN (CASE WHEN $7 THEN 'active' ELSE 'error' END) ELSE status END WHERE id=$1`,
      [row.id, result.ok, cert.expiresAt || null, cert.issuer || null, expiry.expiresAt, issue, result.ok && cert.ok]);
  }
  return { checked: rows.length, problems };
}

// ─── Releases, restarts, backups ──────────────────────────────────────────────

async function restartClient(idOrSlug, actor) {
  const client = await getClient(idOrSlug);
  const result = await aapanel.restartProject(instances.projectName(client.slug));
  await audit(actor, 'client_restarted', { clientId: client.id, detail: { ok: result.ok } });
  return result;
}

defineJob('release-switch', {
  steps: [
    { key: 'backup', label: 'Safety backup', run: async ctx => { const client = await getClient(ctx.clientId); const backup = await runBackup(client, 'release-switch'); return { detail: backup.file || 'done' }; } },
    { key: 'switch', label: 'Point the client at the new release', run: async ctx => { const client = await getClient(ctx.clientId); instances.setClientRelease(client.slug, ctx.input.release); await pool.query(`UPDATE clients SET release=$2, updated_at=now() WHERE id=$1`, [client.id, ctx.input.release]); return { detail: `${ctx.input.from} → ${ctx.input.release}` }; } },
    { key: 'migrate', label: 'Database migrations', run: async ctx => { const client = await getClient(ctx.clientId); const log = await instances.runClientScript(client.slug, 'postgres-migrate.cjs'); return { detail: `${(log.match(/Applied /g) || []).length} migration(s) applied.` }; } },
    { key: 'restart', label: 'Restart the Node project', run: async ctx => { const client = await getClient(ctx.clientId); const result = await aapanel.restartProject(instances.projectName(client.slug)); return result.ok ? { detail: 'Restarted.' } : { status: 'manual', detail: 'Restart the project in aaPanel, then press "Mark done".', instructions: result.instructions, error: result.error }; } },
    { key: 'health', label: 'Check that the installation answers', run: async ctx => { const client = await getClient(ctx.clientId); await new Promise(resolve => setTimeout(resolve, 3000)); const local = await probe(`http://127.0.0.1:${client.port}/api/health`); if (!local.ok) throw new Error(`The app does not answer after the switch (${local.error}). Switch back to ${ctx.input.from} from the Releases tab if it does not start.`); return { detail: `Answering (${local.ms} ms).` }; } },
  ],
});

async function switchRelease(idOrSlug, release, actor) {
  const client = await getClient(idOrSlug);
  instances.releasePath(release);
  await audit(actor, 'release_switch_started', { clientId: client.id, detail: { from: client.release, to: release } });
  return createJob('release-switch', { clientId: client.id, createdBy: actor, input: { release, from: client.release } });
}

async function runBackup(client, trigger = 'manual') {
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO backups(id, client_id, status, trigger) VALUES($1,$2,'running',$3)`, [id, client.id, trigger]);
  try {
    const log = await instances.runClientScript(client.slug, 'postgres-backup.cjs');
    const newest = instances.listBackupFiles(client.slug)[0];
    await pool.query(`UPDATE backups SET status='done', file=$2, bytes=$3, detail=$4, finished_at=now() WHERE id=$1`, [id, newest?.file || null, newest?.bytes || null, log.slice(-500)]);
    return { id, file: newest?.file, bytes: newest?.bytes };
  } catch (error) {
    await pool.query(`UPDATE backups SET status='failed', detail=$2, finished_at=now() WHERE id=$1`, [id, error.message.slice(0, 1000)]);
    throw error;
  }
}

async function backupAll(trigger = 'nightly') {
  const clients = (await pool.query(`SELECT * FROM clients WHERE status IN ('active','suspended')`)).rows;
  const results = [];
  for (const client of clients) {
    try { results.push({ client: client.slug, ok: true, ...(await runBackup(client, trigger)) }); }
    catch (error) { results.push({ client: client.slug, ok: false, error: error.message }); }
  }
  return results;
}

// ─── Health ───────────────────────────────────────────────────────────────────

async function checkHealth(client) {
  const local = await probe(`http://127.0.0.1:${client.port}/api/health`);
  const metrics = {};
  let error = local.ok ? null : `App: ${local.error}`;
  try {
    const db = clientPool(client.db_name);
    const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    const [size, employees, attendance, kiosks, licence] = await Promise.all([
      db.query(`SELECT pg_database_size(current_database())::bigint AS n`),
      db.query(`SELECT count(*)::int AS n FROM employees WHERE COALESCE(data->>'status','Active')='Active'`),
      db.query(`SELECT count(*)::int AS n FROM attendances WHERE date=$1::date`, [today]),
      db.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE last_seen_at > now() - interval '24 hours')::int AS seen, max(last_seen_at) AS last FROM kiosk_devices WHERE revoked_at IS NULL`).catch(() => ({ rows: [{ total: 0, seen: 0, last: null }] })),
      installation.loadLicence(db),
    ]);
    Object.assign(metrics, { db_bytes: Number(size.rows[0].n), active_employees: employees.rows[0].n, attendance_today: attendance.rows[0].n, kiosks_total: kiosks.rows[0].total, kiosks_seen_24h: kiosks.rows[0].seen, last_kiosk_seen: kiosks.rows[0].last, licence_state: installation.licenceState(licence).state });
  } catch (dbError) { error = `${error ? `${error}; ` : ''}Database: ${dbError.message}`; }
  await pool.query(
    `INSERT INTO health_checks(client_id, checked_at, api_ok, api_ms, db_bytes, active_employees, attendance_today, kiosks_total, kiosks_seen_24h, last_kiosk_seen, licence_state, error)
     VALUES($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (client_id) DO UPDATE SET checked_at=now(), api_ok=EXCLUDED.api_ok, api_ms=EXCLUDED.api_ms, db_bytes=EXCLUDED.db_bytes, active_employees=EXCLUDED.active_employees,
       attendance_today=EXCLUDED.attendance_today, kiosks_total=EXCLUDED.kiosks_total, kiosks_seen_24h=EXCLUDED.kiosks_seen_24h, last_kiosk_seen=EXCLUDED.last_kiosk_seen, licence_state=EXCLUDED.licence_state, error=EXCLUDED.error`,
    [client.id, local.ok, local.ms || null, metrics.db_bytes ?? null, metrics.active_employees ?? null, metrics.attendance_today ?? null, metrics.kiosks_total ?? null, metrics.kiosks_seen_24h ?? null, metrics.last_kiosk_seen ?? null, metrics.licence_state ?? null, error],
  );
  return { ok: local.ok && !error, ms: local.ms, ...metrics, error };
}

async function checkAllHealth() {
  const clients = (await pool.query(`SELECT * FROM clients WHERE status IN ('active','suspended')`)).rows;
  const results = [];
  for (const client of clients) results.push({ client: client.slug, ...(await checkHealth(client)) });
  return results;
}

// ─── Devices ──────────────────────────────────────────────────────────────────

async function deviceUrlsFor(client) {
  const custom = (await pool.query(`SELECT domain FROM client_domains WHERE client_id=$1 AND kind<>'platform' AND status='active' ORDER BY is_primary DESC LIMIT 1`, [client.id])).rows[0];
  return [platformUrl(client.slug), ...(custom ? [`https://${custom.domain}`] : [])];
}

async function createKioskCode(idOrSlug, { label, expiresInHours, maxUses }, actor) {
  const client = await getClient(idOrSlug);
  const created = await installation.createKioskSetupToken(clientPool(client.db_name), { label, expiresInHours, maxUses, createdBy: `provider:${actor}`, clientName: client.name, urls: await deviceUrlsFor(client) });
  await audit(actor, 'kiosk_code_created', { clientId: client.id, detail: { label, maxUses: created.maxUses, expiresAt: created.expiresAt } });
  return created;
}

async function mobileCode(idOrSlug) {
  const client = await getClient(idOrSlug);
  const urls = await deviceUrlsFor(client);
  return { code: installation.encodeMobileCode({ clientName: client.name, urls }), urls };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/** Archive: the project is stopped and the client is hidden from daily checks. Database, files and backups stay. */
async function archiveClient(idOrSlug, actor) {
  const client = await getClient(idOrSlug);
  const result = await aapanel.stopProject(instances.projectName(client.slug));
  await pool.query(`UPDATE clients SET status='archived', updated_at=now() WHERE id=$1`, [client.id]);
  await closeClientPool(client.db_name);
  await audit(actor, 'client_archived', { clientId: client.id });
  return result;
}

async function unarchiveClient(idOrSlug, actor) {
  const client = await getClient(idOrSlug);
  const result = await aapanel.startProject(instances.projectName(client.slug));
  await pool.query(`UPDATE clients SET status=CASE WHEN licence->>'status'='suspended' THEN 'suspended' ELSE 'active' END, updated_at=now() WHERE id=$1`, [client.id]);
  await audit(actor, 'client_unarchived', { clientId: client.id });
  return result;
}

module.exports = {
  getClient, refreshTemplate, templateInfo, startProvisioning, revealAdminPassword, updateClientSettings, writeClientSettings,
  addDomain, removeDomain, setPrimaryDomain, checkAllDomains, restartClient, switchRelease, runBackup, backupAll, checkHealth, checkAllHealth,
  createKioskCode, mobileCode, archiveClient, unarchiveClient, platformUrl, probe,
};
