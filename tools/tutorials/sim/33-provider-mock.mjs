// Chapter 33: the REAL Provider Console web app (provider/dist, built with "npm run provider:build") with its API
// answered here by Playwright route interception, so nothing is provisioned: no database, folder, aaPanel project or
// certificate is created. Responses follow provider/server.cjs and provider/lib/clients.cjs (step labels, details and
// the manual aaPanel checklists the console shows when its aaPanel API is not configured).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { simDir } from './it-sim.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(simDir, '..', '..', '..');
const dist = path.join(root, 'provider', 'dist');
export const ORIGIN = 'https://admin.binishaqsoft.com';
const BASE = 'binishaqsoft.com';
const NODE = 'v20.18.0';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const iso = ms => new Date(ms).toISOString();
const ago = (h) => iso(Date.now() - h * 3_600_000);
const ahead = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

function manualProject(slug, port) {
  const name = `hr-${slug}`; const cwd = `/www/hr-clients/${slug}`;
  return ['aaPanel → Website → Node Project → Add Node project.', `Project directory: ${cwd}`, `Startup file / run command: ${cwd}/start.cjs   (run with: node start.cjs)`,
    `Project port: ${port}    Node version: ${NODE}    Run user: www`, `Project name: ${name}    Tick "Start with system".`, `Domain (Mapping): ${slug}.${BASE}`, 'Save, then press Start.'];
}

function createState(editions) {
  const releases = [
    { name: '2026.11.23', version: '0.0.16', migrations: 26, createdAt: ago(24 * 9), ready: true },
    { name: '2026.11.08', version: '0.0.15', migrations: 26, createdAt: ago(24 * 24), ready: true },
  ];
  const client = (o) => ({
    id: uuid(), status: 'active', release: '2026.11.23', edition: { id: 'full', features: { ...editions.presets.full } }, features: { clientDataImport: false },
    licence: { plan: '', expiresAt: ahead(300), staffLimit: null, graceDays: 7, autoSuspend: true, message: '', status: 'active' }, notes: '',
    created_at: ago(24 * 60), backups: [], kioskCodes: [], audit: [], jobs: [], ...o,
  });
  const clients = [
    client({ slug: 'bin-ishaq-traders', name: 'Bin Ishaq Traders', port: 9101, edition: { id: 'lite', features: { ...editions.presets.lite } }, contact_name: 'Bilal Ishaq', contact_email: 'bilal@binishaqtraders.pk', contact_phone: '0300-1234567',
      licence: { plan: 'Lite 15 staff', expiresAt: ahead(210), staffLimit: 15, graceDays: 7, autoSuspend: true, message: '', status: 'active' },
      health: { api_ok: true, api_ms: 92, checked_at: ago(0.1), active_employees: 14, attendance_today: 12, kiosks_total: 1, kiosks_seen_24h: 1, db_bytes: 38e6 }, lastBackup: ago(7) }),
    client({ slug: 'lahore-textile', name: 'Lahore Textile Mills', port: 9102, release: '2026.11.08', contact_name: 'Sana Rafiq', contact_email: 'it@lahoretextile.com', contact_phone: '042-35761100',
      licence: { plan: 'Full 750 staff', expiresAt: ahead(9), staffLimit: 750, graceDays: 7, autoSuspend: true, message: '', status: 'active' },
      health: { api_ok: true, api_ms: 141, checked_at: ago(0.1), active_employees: 642, attendance_today: 598, kiosks_total: 5, kiosks_seen_24h: 4, db_bytes: 912e6 }, lastBackup: ago(6),
      customDomain: 'hr.lahoretextile.com' }),
    client({ slug: 'karachi-foods', name: 'Karachi Foods (Pvt) Ltd', port: 9103, contact_name: 'Imran Shaikh', contact_email: 'imran@karachifoods.pk', contact_phone: '021-34530021',
      licence: { plan: 'Full 200 staff', expiresAt: ahead(160), staffLimit: 200, graceDays: 7, autoSuspend: true, message: '', status: 'active' },
      health: { api_ok: true, api_ms: 118, checked_at: ago(0.1), active_employees: 187, attendance_today: 171, kiosks_total: 2, kiosks_seen_24h: 2, db_bytes: 264e6 }, lastBackup: ago(40) }),
  ];
  for (const c of clients) {
    c.domains = [{ id: uuid(), domain: `${c.slug}.${BASE}`, kind: 'platform', is_primary: true, status: 'active', last_checked_at: ago(2), ssl_expires_at: ahead(70), ssl_issuer: "Let's Encrypt", domain_expires_at: null, last_error: null }];
    if (c.customDomain) c.domains.push({ id: uuid(), domain: c.customDomain, kind: 'subdomain', is_primary: true, status: 'active', last_checked_at: ago(2), ssl_expires_at: ahead(51), ssl_issuer: "Let's Encrypt", domain_expires_at: ahead(400), last_error: null });
    c.backups = [{ id: uuid(), created_at: c.lastBackup, trigger: 'nightly', status: 'done', file: `hr-payroll-${c.lastBackup.replace(/[:.]/g, '-')}.dump.enc`, bytes: Math.round(c.health.db_bytes / 9) }];
  }
  return { clients, jobs: new Map(), releases };
}

// Advances a job by elapsed time; manual steps wait for "Mark done".
function tick(job) {
  const now = Date.now();
  while (job.cursor < job.steps.length) {
    const step = job.steps[job.cursor];
    if (step.type === 'auto') {
      if (now - job.stepStartedAt >= step.ms) { step.status = 'done'; step.detail = step.doneDetail; step.at = iso(now); job.cursor += 1; job.stepStartedAt += step.ms; continue; }
      step.status = 'running'; job.state = 'running'; return;
    }
    if (job.manualDone.has(step.key)) { step.status = 'done'; step.detail = step.doneDetail || 'Marked done by the operator.'; step.instructions = []; step.error = null; step.at = iso(now); job.cursor += 1; job.stepStartedAt = now; continue; }
    step.status = 'manual'; step.detail = step.manualDetail; step.instructions = step.manualInstructions; step.error = step.manualError || null; job.state = 'waiting'; return;
  }
  if (job.state !== 'done') { job.state = 'done'; job.finished_at = iso(now); job.onDone?.(); }
}
const publicJob = job => ({ id: job.id, client_id: job.client_id, kind: job.kind, state: job.state, created_by: job.created_by, created_at: job.created_at, finished_at: job.finished_at,
  steps: job.steps.map(({ key, label, status, detail, instructions, error, at }) => ({ key, label, status, detail: detail || '', instructions: instructions || [], error: error || null, at: at || null })),
  hasAdminPassword: !!job.adminPassword, adminEmail: job.adminEmail || null });

export async function installProviderMock(page, { actor = 'saad@onenet.pk' } = {}) {
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('provider/dist is missing: run "npm run provider:build" first.');
  const QRCode = require(path.join(root, 'node_modules', 'qrcode'));
  const { EDITION_PRESETS, EDITION_FEATURE_KEYS } = require(path.join(root, 'server', 'edition.cjs'));
  const state = createState({ presets: EDITION_PRESETS });
  const find = id => state.clients.find(c => c.id === id || c.slug === id);
  const audit = (c, action, target, detail) => c.audit.unshift({ id: uuid(), at: iso(Date.now()), actor, action, target, detail: detail || {} });
  const platformUrl = c => `https://${c.slug}.${BASE}`;

  const overviewRow = c => {
    const open = c.jobs.map(id => state.jobs.get(id)).filter(Boolean).map(j => { tick(j); return j; }).find(j => ['running', 'waiting', 'failed'].includes(j.state));
    const h = c.health || {};
    const daysLeft = c.licence.expiresAt ? Math.ceil((new Date(c.licence.expiresAt) - Date.now()) / 86_400_000) : null;
    return { ...c, checked_at: h.checked_at || null, api_ok: h.api_ok ?? null, api_ms: h.api_ms ?? null, db_bytes: h.db_bytes ?? null, active_employees: h.active_employees ?? null, attendance_today: h.attendance_today ?? null,
      kiosks_total: h.kiosks_total ?? null, kiosks_seen_24h: h.kiosks_seen_24h ?? null, last_backup_at: c.backups.find(b => b.status === 'done')?.created_at || null,
      licenceSummary: { state: c.licence.status === 'suspended' ? 'suspended' : daysLeft != null && daysLeft <= 14 ? 'expiring' : 'active', daysLeft },
      domains: c.domains.map(d => ({ id: d.id, domain: d.domain, kind: d.kind, status: d.status, isPrimary: d.is_primary })), open_job: open ? { id: open.id, kind: open.kind, state: open.state } : null };
  };
  const alerts = () => {
    const list = [];
    for (const c of state.clients) {
      const row = overviewRow(c);
      if (row.open_job?.state === 'waiting') list.push({ level: 'action', client: c.slug, clientId: c.id, text: `${row.open_job.kind} is waiting for you` });
      if (row.licenceSummary.state === 'expiring') list.push({ level: 'warn', client: c.slug, clientId: c.id, text: `Licence expires in ${row.licenceSummary.daysLeft} days` });
      if (c.status === 'active' && row.last_backup_at && Date.now() - new Date(row.last_backup_at) > 36 * 3_600_000) list.push({ level: 'warn', client: c.slug, clientId: c.id, text: 'No backup in the last 36 hours' });
    }
    return list;
  };
  const detail = c => {
    const row = overviewRow(c);
    return {
      client: { ...row, platformUrl: platformUrl(c), projectName: `hr-${c.slug}`, folder: `/www/hr-clients/${c.slug}`, db_name: `hr_${c.slug.replace(/-/g, '_')}` },
      domains: c.domains, jobs: c.jobs.map(id => publicJob(state.jobs.get(id))).reverse(), backups: c.backups, health: c.health || null, audit: c.audit,
      releases: state.releases, kioskCodes: c.kioskCodes, backupFiles: c.backups.filter(b => b.file).map(b => ({ file: b.file, bytes: b.bytes })),
      editionPresets: EDITION_PRESETS, editionFeatureKeys: EDITION_FEATURE_KEYS,
    };
  };

  function provision(body) {
    const slug = String(body.slug || '').toLowerCase();
    const port = 9101 + state.clients.length;
    const c = {
      id: uuid(), slug, name: String(body.name || '').trim(), status: 'provisioning', port, release: body.release || state.releases[0].name,
      edition: { id: body.edition?.id === 'lite' ? 'lite' : 'full', features: { ...EDITION_PRESETS[body.edition?.id === 'lite' ? 'lite' : 'full'] } },
      licence: { plan: body.licence?.plan || '', expiresAt: body.licence?.expiresAt || null, staffLimit: body.licence?.staffLimit ?? null, graceDays: 7, autoSuspend: true, message: '', status: 'active' },
      features: { clientDataImport: body.clientDataImport === true }, contact_name: body.contactName || body.adminName || '', contact_email: body.contactEmail || body.adminEmail || '', contact_phone: body.contactPhone || '',
      notes: body.notes || '', created_at: iso(Date.now()), backups: [], kioskCodes: [], audit: [], jobs: [], health: null,
      domains: [{ id: uuid(), domain: `${slug}.${BASE}`, kind: 'platform', is_primary: true, status: 'pending_dns', last_checked_at: null, ssl_expires_at: null, ssl_issuer: null, domain_expires_at: null, last_error: null }],
    };
    state.clients.push(c);
    audit(c, 'client_created', slug, { name: c.name, edition: c.edition.id, release: c.release });
    const db = `hr_${slug.replace(/-/g, '_')}`;
    const job = {
      id: uuid(), client_id: c.id, kind: 'provision', state: 'running', created_by: actor, created_at: iso(Date.now()), finished_at: null, cursor: 0, stepStartedAt: Date.now(), manualDone: new Set(),
      adminEmail: String(body.adminEmail || '').toLowerCase(), adminPassword: `${crypto.randomBytes(9).toString('base64url')}-${crypto.randomInt(10, 99)}`,
      steps: [
        { key: 'database', label: 'Create the database from the template', type: 'auto', ms: 1800, doneDetail: `Database ${db} (owner ${db}) created from hr_template.` },
        { key: 'files', label: 'Create the client folder and settings', type: 'auto', ms: 1200, doneDetail: `/www/hr-clients/${slug} (release ${c.release}, port ${port}).` },
        { key: 'migrate', label: 'Bring the database up to the release', type: 'auto', ms: 1400, doneDetail: 'Already up to date.' },
        { key: 'settings', label: 'Company, administrator, edition and licence', type: 'auto', ms: 1400, doneDetail: `Company "${c.name}", administrator ${String(body.adminEmail || '').toLowerCase()}, ${c.edition.id} edition.` },
        { key: 'project', label: 'aaPanel Node project and domain mapping', type: 'manual', manualDetail: 'Create the Node project in aaPanel, then press "Mark done".', manualInstructions: manualProject(slug, port), manualError: 'aaPanel API is not configured (AAPANEL_URL / AAPANEL_API_KEY).' },
        { key: 'ssl', label: `HTTPS with the *.${BASE} certificate`, type: 'manual', manualDetail: 'Deploy the wildcard certificate in aaPanel, then press "Mark done".', manualInstructions: [`aaPanel → Website → Node Project → hr-${slug} → SSL → Certificate folder (or "Other certificate").`, `Choose the wildcard certificate *.${BASE} → Deploy, then switch on "Force HTTPS".`], manualError: 'aaPanel API is not configured (AAPANEL_URL / AAPANEL_API_KEY).' },
        { key: 'health', label: 'Check that the installation answers', type: 'auto', ms: 1600, doneDetail: `Live at https://${slug}.${BASE} (38 ms).` },
      ],
      onDone: () => {
        c.status = 'active'; c.domains[0].status = 'active'; c.domains[0].last_checked_at = iso(Date.now()); c.domains[0].ssl_expires_at = ahead(70); c.domains[0].ssl_issuer = "Let's Encrypt";
        c.health = { api_ok: true, api_ms: 38, checked_at: iso(Date.now()), active_employees: 0, attendance_today: 0, kiosks_total: 0, kiosks_seen_24h: 0, db_bytes: 14.2e6 };
        audit(c, 'client_provisioned', slug);
      },
    };
    state.jobs.set(job.id, job); c.jobs.push(job.id);
    return { clientId: c.id, jobId: job.id };
  }

  function addDomain(c, body) {
    const domain = String(body.domain || '').trim().toLowerCase();
    const d = { id: uuid(), domain, kind: 'subdomain', is_primary: true, status: 'pending_dns', last_checked_at: iso(Date.now()), ssl_expires_at: null, ssl_issuer: null, domain_expires_at: null, last_error: `Add the CNAME record ${domain} → ${c.slug}.${BASE}.` };
    c.domains.push(d);
    audit(c, 'domain_added', domain, { kind: 'subdomain' });
    const job = { id: uuid(), client_id: c.id, kind: 'domain-attach', state: 'running', created_by: actor, created_at: iso(Date.now()), finished_at: null, cursor: 0, stepStartedAt: Date.now(), manualDone: new Set(),
      steps: [
        { key: 'dns', label: 'DNS points at this server', type: 'manual', manualDetail: `Waiting for DNS: Add the CNAME record ${domain} → ${c.slug}.${BASE}. DNS changes can take minutes to a few hours. Press "Retry" to check again.`, manualInstructions: [`CNAME  ${domain}  →  ${c.slug}.${BASE}`] },
        { key: 'mapping', label: 'Add the domain to the aaPanel project', type: 'auto', ms: 900, doneDetail: `${domain} mapped.` },
        { key: 'ssl', label: "Let's Encrypt certificate", type: 'auto', ms: 1500, doneDetail: 'Certificate issued; aaPanel renews it automatically.' },
        { key: 'allow', label: 'Allow the domain in the application', type: 'auto', ms: 700, doneDetail: 'Added to the allowed addresses (works within 30 seconds, no restart).' },
        { key: 'verify', label: 'HTTPS works', type: 'auto', ms: 1200, doneDetail: `https://${domain} is live.` },
      ] };
    state.jobs.set(job.id, job); c.jobs.push(job.id);
    return { domainId: d.id, kind: 'subdomain', jobId: job.id, warning: null };
  }

  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const p = url.pathname;
    if (!p.startsWith('/api/')) {
      const file = path.join(dist, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
      if (!file.startsWith(dist) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    const body = (() => { try { return request.postDataJSON() || {}; } catch { return {}; } })();
    const parts = p.replace(/^\/api\//, '').split('/');
    try {
      if (p === '/api/auth/me') return json(route, 200, { user: { id: 'u1', email: actor, name: 'Saad Ahmed', role: 'owner', totpEnabled: true }, mfaOk: true });
      if (p === '/api/overview') return json(route, 200, { clients: state.clients.map(overviewRow), alerts: alerts(), baseDomain: BASE });
      if (p === '/api/settings') return json(route, 200, {
        server: { baseDomain: BASE, serverIp: '203.0.113.25', nameservers: [], clientsRoot: '/www/hr-clients', releasesRoot: '/www/hr-releases', backupRoot: '/www/hr-backups', clientPortStart: 9101, nodeVersion: NODE, publicUrl: ORIGIN, wildcardCert: true, smtpConfigured: true },
        aapanel: { ok: false, error: 'aaPanel API is not configured (AAPANEL_URL / AAPANEL_API_KEY).', configured: false },
        template: { exists: true, name: 'hr_template', migrations: 26, release: '2026.11.23', refreshedAt: ago(24 * 8) },
        releases: state.releases,
      });
      if (p === '/api/activity') return json(route, 200, { entries: state.clients.flatMap(c => c.audit.map(a => ({ ...a, slug: c.slug }))) });
      if (p === '/api/clients' && method === 'POST') return json(route, 201, provision(body));
      if (parts[0] === 'clients' && parts[1]) {
        const c = find(parts[1]);
        if (!c) return json(route, 404, { error: 'Client not found.' });
        if (parts.length === 2 && method === 'GET') return json(route, 200, detail(c));
        if (parts.length === 2 && method === 'PUT') { Object.assign(c.licence, body.licence || {}); audit(c, 'client_updated', c.slug); return json(route, 200, { ok: true }); }
        if (parts[2] === 'mobile-code') {
          const code = `HRM1.${Buffer.from(JSON.stringify({ v: 1, n: c.name, u: [platformUrl(c)] })).toString('base64url')}`;
          return json(route, 200, { code, qr: await QRCode.toDataURL(code, { margin: 1, width: 240 }), urls: [platformUrl(c)] });
        }
        if (parts[2] === 'kiosk-codes' && method === 'POST') {
          const token = crypto.randomBytes(18).toString('base64url');
          const code = `HRK1.${Buffer.from(JSON.stringify({ v: 1, n: c.name, u: [platformUrl(c)], t: token })).toString('base64url')}`;
          const expiresAt = iso(Date.now() + (Number(body.expiresInHours) || 72) * 3_600_000);
          c.kioskCodes.unshift({ id: uuid(), label: body.label || 'Kiosk', uses: 0, max_uses: Number(body.maxUses) || 1, expires_at: expiresAt, revoked_at: null });
          audit(c, 'kiosk_setup_code_created', body.label || 'Kiosk', { maxUses: Number(body.maxUses) || 1 });
          return json(route, 200, { code, qr: await QRCode.toDataURL(code, { margin: 1, width: 240 }), expiresAt, maxUses: Number(body.maxUses) || 1 });
        }
        if (parts[2] === 'domains' && method === 'POST') return json(route, 200, addDomain(c, body));
        if (parts[2] === 'backup' && method === 'POST') {
          const at = iso(Date.now());
          c.backups.unshift({ id: uuid(), created_at: at, trigger: 'manual', status: 'done', file: `hr-payroll-${at.replace(/[:.]/g, '-')}.dump.enc`, bytes: 1.9e6 });
          audit(c, 'client_backup', c.slug);
          return json(route, 200, { ok: true });
        }
        if (parts[2] === 'health' && method === 'POST') return json(route, 200, { ok: true });
        if (parts[2] === 'restart') return json(route, 200, { ok: false, instructions: [`aaPanel → Website → Node Project → hr-${c.slug} → Restart.`] });
        return json(route, 200, { ok: true });
      }
      if (parts[0] === 'jobs' && parts[1]) {
        const job = state.jobs.get(parts[1]);
        if (!job) return json(route, 404, { error: 'Job not found.' });
        if (parts.length === 2) { tick(job); return json(route, 200, { job: publicJob(job) }); }
        if (parts[2] === 'steps' && parts[4] === 'done') { job.manualDone.add(parts[3]); job.stepStartedAt = Date.now(); tick(job); return json(route, 200, { ok: true }); }
        if (parts[2] === 'retry') { tick(job); return json(route, 200, { ok: true }); }
        if (parts[2] === 'admin-password') {
          if (body.forget) { job.adminPassword = null; return json(route, 200, { ok: true }); }
          return json(route, 200, { email: job.adminEmail, password: job.adminPassword });
        }
      }
      if (p.startsWith('/api/tasks/')) return json(route, 200, { ok: true });
      return json(route, 404, { error: 'Not found.' });
    } catch (error) {
      return json(route, 500, { error: error.message });
    }
  });
  return state;
}
