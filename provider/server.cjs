// OneNet Provider Console: manages every hosted client installation on this server (provisioning, domains, licence,
// releases, backups, health). Run as its own aaPanel Node project, e.g. admin.binishaqsoft.com → 127.0.0.1:8200.
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { config, assertConfig } = require('./lib/config.cjs');
assertConfig();
const { pool, migrate, clientPool } = require('./lib/db.cjs');
const auth = require('./lib/auth.cjs');
const clients = require('./lib/clients.cjs');
const jobs = require('./lib/jobs.cjs');
const aapanel = require('./lib/aapanel.cjs');
const instances = require('./lib/instances.cjs');
const sheets = require('./lib/sheets.cjs');
const { audit } = require('./lib/audit.cjs');
const installation = require('../server/installation.cjs');
const { EDITION_PRESETS, EDITION_FEATURE_KEYS } = require('../server/edition.cjs');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'", "'unsafe-inline'"], connectSrc: ["'self'"], frameAncestors: ["'none'"], formAction: ["'self'"] } },
  hsts: config.publicUrl.startsWith('https://') ? { maxAge: 31536000 } : false,
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use('/api', express.json({ limit: '200kb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, handler: (_req, res) => res.status(429).json({ error: 'Too many sign-in attempts.' }) }));

const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const signedIn = auth.authenticate();
const operator = auth.authenticate({ minRole: 'operator' });
const owner = auth.authenticate({ minRole: 'owner' });
const beforeMfa = auth.authenticate({ requireMfa: false });

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', wrap(auth.login));
app.get('/api/auth/me', beforeMfa, (req, res) => res.json({ user: req.provider.user, mfaOk: req.provider.mfaOk }));
app.post('/api/auth/mfa/setup', beforeMfa, wrap(auth.mfaSetup));
app.post('/api/auth/mfa/verify', beforeMfa, wrap(auth.mfaVerify));
app.post('/api/auth/logout', beforeMfa, wrap(auth.logout));

// ─── Overview ─────────────────────────────────────────────────────────────────
app.get('/api/overview', signedIn, wrap(async (_req, res) => {
  const rows = (await pool.query(`
    SELECT c.*, h.checked_at, h.api_ok, h.api_ms, h.db_bytes, h.active_employees, h.attendance_today, h.kiosks_total, h.kiosks_seen_24h, h.last_kiosk_seen, h.licence_state, h.error AS health_error,
      (SELECT json_agg(json_build_object('id', d.id, 'domain', d.domain, 'kind', d.kind, 'status', d.status, 'isPrimary', d.is_primary, 'sslExpiresAt', d.ssl_expires_at, 'domainExpiresAt', d.domain_expires_at, 'lastError', d.last_error) ORDER BY d.kind <> 'platform', d.domain)
         FROM client_domains d WHERE d.client_id=c.id AND d.status<>'removed') AS domains,
      (SELECT max(created_at) FROM backups b WHERE b.client_id=c.id AND b.status='done') AS last_backup_at,
      (SELECT json_build_object('id', j.id, 'kind', j.kind, 'state', j.state) FROM jobs j WHERE j.client_id=c.id AND j.state IN ('running','waiting','failed') ORDER BY j.created_at DESC LIMIT 1) AS open_job
    FROM clients c LEFT JOIN health_checks h ON h.client_id=c.id ORDER BY c.status='archived', c.name`)).rows;
  const alerts = [];
  const now = Date.now();
  for (const row of rows) {
    if (row.status === 'archived') continue;
    const licence = installation.licenceState(installation.normalizeLicence(row.licence));
    row.licenceSummary = licence;
    if (row.open_job?.state === 'waiting') alerts.push({ level: 'action', client: row.slug, clientId: row.id, text: `${row.open_job.kind} is waiting for you` });
    if (row.open_job?.state === 'failed') alerts.push({ level: 'error', client: row.slug, clientId: row.id, text: `${row.open_job.kind} failed` });
    if (row.status === 'active' && row.checked_at && !row.api_ok) alerts.push({ level: 'error', client: row.slug, clientId: row.id, text: `Not answering: ${row.health_error || 'down'}` });
    if (['expiring', 'grace'].includes(licence.state)) alerts.push({ level: 'warn', client: row.slug, clientId: row.id, text: licence.state === 'grace' ? `Licence expired, ${licence.graceDaysLeft} grace day(s) left` : `Licence expires in ${licence.daysLeft} days` });
    if (row.status === 'active' && (!row.last_backup_at || now - new Date(row.last_backup_at).getTime() > 36 * 3_600_000)) alerts.push({ level: 'warn', client: row.slug, clientId: row.id, text: 'No backup in the last 36 hours' });
    for (const domain of row.domains || []) {
      if (domain.status === 'error') alerts.push({ level: 'error', client: row.slug, clientId: row.id, text: `${domain.domain}: ${domain.lastError}` });
      else if (domain.sslExpiresAt && new Date(domain.sslExpiresAt).getTime() - now < 15 * 86_400_000) alerts.push({ level: 'warn', client: row.slug, clientId: row.id, text: `${domain.domain}: certificate expires ${String(domain.sslExpiresAt).slice(0, 10)}` });
      if (domain.domainExpiresAt && new Date(domain.domainExpiresAt).getTime() - now < 30 * 86_400_000) alerts.push({ level: 'warn', client: row.slug, clientId: row.id, text: `${domain.domain}: domain registration expires ${String(domain.domainExpiresAt).slice(0, 10)}` });
    }
  }
  res.json({ clients: rows, alerts, baseDomain: config.baseDomain });
}));

// ─── Clients ──────────────────────────────────────────────────────────────────
app.post('/api/clients', operator, wrap(async (req, res) => res.status(201).json(await clients.startProvisioning(req.body || {}, req.actor))));

app.get('/api/clients/:id', signedIn, wrap(async (req, res) => {
  const client = await clients.getClient(req.params.id);
  const [domains, jobList, backups, health, auditRows] = await Promise.all([
    pool.query(`SELECT * FROM client_domains WHERE client_id=$1 AND status<>'removed' ORDER BY kind<>'platform', is_primary DESC, domain`, [client.id]),
    pool.query(`SELECT id, kind, state, steps, created_by, created_at, finished_at FROM jobs WHERE client_id=$1 ORDER BY created_at DESC LIMIT 15`, [client.id]),
    pool.query(`SELECT * FROM backups WHERE client_id=$1 ORDER BY created_at DESC LIMIT 20`, [client.id]),
    pool.query(`SELECT * FROM health_checks WHERE client_id=$1`, [client.id]),
    pool.query(`SELECT at, actor, action, target, detail FROM provider_audit WHERE client_id=$1 ORDER BY at DESC LIMIT 40`, [client.id]),
  ]);
  let kioskCodes = [];
  if (client.status !== 'provisioning' && client.status !== 'archived') kioskCodes = await installation.listKioskSetupTokens(clientPool(client.db_name)).catch(() => []);
  res.json({
    client: { ...client, licenceSummary: installation.licenceState(installation.normalizeLicence(client.licence)), platformUrl: clients.platformUrl(client.slug), projectName: instances.projectName(client.slug), folder: instances.clientDir(client.slug) },
    domains: domains.rows, jobs: jobList.rows, backups: backups.rows, health: health.rows[0] || null, audit: auditRows.rows, kioskCodes,
    backupFiles: instances.listBackupFiles(client.slug), releases: instances.listReleases().map(({ path: _path, ...release }) => release),
    editionPresets: EDITION_PRESETS, editionFeatureKeys: EDITION_FEATURE_KEYS,
  });
}));

app.put('/api/clients/:id', operator, wrap(async (req, res) => res.json({ client: await clients.updateClientSettings(req.params.id, req.body || {}, req.actor) })));
app.post('/api/clients/:id/restart', operator, wrap(async (req, res) => res.json(await clients.restartClient(req.params.id, req.actor))));
app.post('/api/clients/:id/archive', owner, wrap(async (req, res) => res.json(await clients.archiveClient(req.params.id, req.actor))));
app.post('/api/clients/:id/unarchive', owner, wrap(async (req, res) => res.json(await clients.unarchiveClient(req.params.id, req.actor))));
app.post('/api/clients/:id/release', operator, wrap(async (req, res) => res.status(202).json({ jobId: await clients.switchRelease(req.params.id, String(req.body?.release || ''), req.actor) })));
app.post('/api/clients/:id/backup', operator, wrap(async (req, res) => {
  const client = await clients.getClient(req.params.id);
  await audit(req.actor, 'backup_started', { clientId: client.id });
  res.json(await clients.runBackup(client, 'manual'));
}));
app.post('/api/clients/:id/health', signedIn, wrap(async (req, res) => res.json(await clients.checkHealth(await clients.getClient(req.params.id)))));

app.post('/api/clients/:id/domains', operator, wrap(async (req, res) => res.status(201).json(await clients.addDomain(req.params.id, req.body || {}, req.actor))));
app.delete('/api/domains/:id', operator, wrap(async (req, res) => res.json(await clients.removeDomain(req.params.id, req.actor))));
app.post('/api/domains/:id/primary', operator, wrap(async (req, res) => { await clients.setPrimaryDomain(req.params.id, req.actor); res.json({ ok: true }); }));
app.get('/api/domains/:id/instructions', signedIn, wrap(async (req, res) => {
  const domain = (await pool.query(`SELECT * FROM client_domains WHERE id=$1`, [req.params.id])).rows[0];
  if (!domain) return res.status(404).send('Not found');
  res.type('html').send(sheets.domainInstructions(await clients.getClient(domain.client_id), domain));
}));
app.get('/api/clients/:id/handover', signedIn, wrap(async (req, res) => {
  const client = await clients.getClient(req.params.id);
  const domains = (await pool.query(`SELECT * FROM client_domains WHERE client_id=$1`, [client.id])).rows;
  res.type('html').send(sheets.handoverSheet(client, domains));
}));

app.post('/api/clients/:id/kiosk-codes', operator, wrap(async (req, res) => {
  const created = await clients.createKioskCode(req.params.id, req.body || {}, req.actor);
  res.setHeader('Cache-Control', 'no-store');
  res.status(201).json({ ...created, qr: await QRCode.toDataURL(created.code, { margin: 1, width: 260, errorCorrectionLevel: 'M' }) });
}));
app.post('/api/clients/:id/kiosk-codes/:codeId/revoke', operator, wrap(async (req, res) => {
  const client = await clients.getClient(req.params.id);
  await installation.revokeKioskSetupToken(clientPool(client.db_name), req.params.codeId);
  await audit(req.actor, 'kiosk_code_revoked', { clientId: client.id, target: req.params.codeId });
  res.json({ revoked: true });
}));
app.get('/api/clients/:id/mobile-code', signedIn, wrap(async (req, res) => {
  const result = await clients.mobileCode(req.params.id);
  res.json({ ...result, qr: await QRCode.toDataURL(result.code, { margin: 1, width: 260 }) });
}));

// ─── Jobs ─────────────────────────────────────────────────────────────────────
app.get('/api/jobs/:id', signedIn, wrap(async (req, res) => {
  const job = await jobs.loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  const { output, ...rest } = job;
  res.json({ job: { ...rest, hasAdminPassword: Boolean(output?.adminPasswordCipher), adminEmail: output?.adminEmail || null } });
}));
app.post('/api/jobs/:id/steps/:key/done', operator, wrap(async (req, res) => { await jobs.markStepDone(req.params.id, req.params.key, req.actor); await audit(req.actor, 'job_step_marked_done', { target: `${req.params.id}/${req.params.key}` }); res.json({ ok: true }); }));
app.post('/api/jobs/:id/retry', operator, wrap(async (req, res) => { await jobs.retryJob(req.params.id); res.json({ ok: true }); }));
app.post('/api/jobs/:id/admin-password', operator, wrap(async (req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json(await clients.revealAdminPassword(req.params.id, req.actor, { forget: req.body?.forget === true })); }));

// ─── Settings, users, audit, tasks ────────────────────────────────────────────
app.get('/api/settings', signedIn, wrap(async (_req, res) => {
  res.json({
    server: { baseDomain: config.baseDomain, serverIp: config.serverIp, nameservers: config.nameservers, clientsRoot: config.clientsRoot, releasesRoot: config.releasesRoot, backupRoot: config.backupRoot, clientPortStart: config.clientPortStart, nodeVersion: config.nodeVersion, publicUrl: config.publicUrl, wildcardCert: Boolean(config.wildcardCert.certPath && fs.existsSync(config.wildcardCert.certPath)), smtpConfigured: Boolean(config.smtp.host) },
    aapanel: await aapanel.testConnection(),
    template: await clients.templateInfo(),
    releases: instances.listReleases().map(({ path: _path, ...release }) => release),
  });
}));
app.post('/api/settings/template', owner, wrap(async (req, res) => res.json(await clients.refreshTemplate(req.body?.release, req.actor))));

app.get('/api/users', owner, wrap(async (_req, res) => res.json({ users: (await pool.query(`SELECT * FROM provider_users ORDER BY created_at`)).rows.map(auth.publicUser) })));
app.post('/api/users', owner, wrap(async (req, res) => {
  const { email, name, role, password } = req.body || {};
  const id = await auth.createUser({ email: String(email || ''), name: String(name || ''), role, password });
  await audit(req.actor, 'provider_user_created', { target: email, detail: { role } });
  res.status(201).json({ id });
}));
app.put('/api/users/:id', owner, wrap(async (req, res) => {
  const { role, status, resetMfa } = req.body || {};
  if (req.params.id === req.provider.user.id && (status === 'disabled' || (role && role !== 'owner'))) return res.status(400).json({ error: 'You cannot disable yourself or remove your own owner role.' });
  if (role && !auth.ROLE_RANK[role]) return res.status(400).json({ error: 'Unknown role.' });
  await pool.query(`UPDATE provider_users SET role=COALESCE($2, role), status=COALESCE($3, status), totp_enabled=CASE WHEN $4 THEN false ELSE totp_enabled END, totp_secret_cipher=CASE WHEN $4 THEN NULL ELSE totp_secret_cipher END WHERE id=$1`,
    [req.params.id, role || null, status === 'disabled' || status === 'active' ? status : null, resetMfa === true]);
  if (status === 'disabled' || resetMfa) await pool.query(`UPDATE provider_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL`, [req.params.id]);
  await audit(req.actor, 'provider_user_updated', { target: req.params.id, detail: { role, status, resetMfa } });
  res.json({ ok: true });
}));

app.get('/api/audit', signedIn, wrap(async (req, res) => {
  const params = []; let where = '';
  if (req.query.client) { params.push(String(req.query.client)); where = `WHERE a.client_id::text=$1 OR c.slug=$1`; }
  const rows = (await pool.query(`SELECT a.*, c.slug FROM provider_audit a LEFT JOIN clients c ON c.id=a.client_id ${where} ORDER BY a.at DESC LIMIT 300`, params)).rows;
  res.json({ entries: rows });
}));

app.post('/api/tasks/:task', operator, wrap(async (req, res) => {
  const tasks = { 'check-domains': () => clients.checkAllDomains(), health: () => clients.checkAllHealth(), 'backup-all': () => clients.backupAll('manual') };
  const task = tasks[req.params.task];
  if (!task) return res.status(404).json({ error: 'Unknown task.' });
  await audit(req.actor, `task_${req.params.task}`);
  res.json(await task());
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// ─── Web app ──────────────────────────────────────────────────────────────────
const dist = path.join(config.root, 'dist');
app.use(express.static(dist, { index: false }));
app.get('*', (_req, res) => {
  const index = path.join(dist, 'index.html');
  if (fs.existsSync(index)) return res.sendFile(index);
  res.status(503).send('Provider Console web files are missing. Run: npm run provider:build');
});

app.use((error, _req, res, _next) => {
  const status = error.status || (/not found/i.test(error.message) ? 404 : 400);
  if (status >= 500 || !error.status) console.error('Provider Console error:', error.message);
  res.status(status).json({ error: error.message || 'Something went wrong.' });
});

(async () => {
  await migrate();
  const users = Number((await pool.query(`SELECT count(*)::int AS n FROM provider_users`)).rows[0].n);
  if (!users) console.warn('No provider users yet. Create the first owner: node provider/cli.cjs create-owner <email> "<name>"');
  const resumed = await jobs.resumeInterruptedJobs();
  if (resumed) console.log(`Resumed ${resumed} interrupted job(s).`);
  app.listen(config.port, config.host, () => console.log(`OneNet Provider Console on http://${config.host}:${config.port} (${config.publicUrl})`));
})().catch(error => { console.error(error); process.exit(1); });
