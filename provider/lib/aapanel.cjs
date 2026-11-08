// aaPanel API adapter. Everything on the server is done through aaPanel (Node projects, domain mapping, SSL), as the
// hosting rules require. aaPanel → Settings → API interface: enable it, copy the key into AAPANEL_API_KEY and add this
// server's IP to the API whitelist.
//
// aaPanel versions differ in their API. Every call here therefore returns either { ok: true } or
// { ok: false, manual: true, instructions } — the provisioning job then pauses at that step and shows the operator the
// exact clicks and values, and continues after "Mark done". Nothing fails silently.
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { config } = require('./config.cjs');

const md5 = value => crypto.createHash('md5').update(String(value)).digest('hex');

function post(pathAndQuery, fields = {}) {
  return new Promise((resolve, reject) => {
    if (!config.aapanelEnabled) return reject(Object.assign(new Error('aaPanel API is not configured (AAPANEL_URL / AAPANEL_API_KEY).'), { code: 'NOT_CONFIGURED' }));
    const time = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({ request_time: String(time), request_token: md5(`${time}${md5(config.aapanel.apiKey)}`), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])) }).toString();
    const url = new URL(`${config.aapanel.url}${pathAndQuery}`);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method: 'POST', timeout: 60_000, rejectUnauthorized: !config.aapanel.insecureTls,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { return reject(new Error(`aaPanel returned HTTP ${response.statusCode} (not JSON): ${data.slice(0, 160)}`)); }
        if (parsed && parsed.status === false) return reject(new Error(parsed.msg || 'aaPanel refused the request.'));
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new Error('aaPanel API timed out.')));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

const manual = (error, instructions) => ({ ok: false, manual: true, error: error?.message || String(error), instructions });

async function attempt(call, instructions) {
  try { return { ok: true, detail: await call() }; } catch (error) { return manual(error, instructions); }
}

async function testConnection() {
  try {
    const total = await post('/system?action=GetSystemTotal');
    return { ok: true, version: total?.version || '', system: total?.system || '', memTotal: total?.memTotal, cpuNum: total?.cpuNum };
  } catch (error) { return { ok: false, error: error.message, configured: config.aapanelEnabled }; }
}

function createNodeProject({ name, cwd, port, domains }) {
  return attempt(() => post('/project/nodejs/create_project', {
    project_name: name, project_cwd: cwd, project_script: `${cwd}/start.cjs`, project_port: String(port),
    run_user: config.aapanel.runUser, nodejs_version: config.nodeVersion, is_power_on: '1', project_ps: `HR client ${name}`,
    bind_extranet: '1', domains, max_memory_limit: '1024',
  }), [
    'aaPanel → Website → Node Project → Add Node project.',
    `Project directory: ${cwd}`,
    `Startup file / run command: ${cwd}/start.cjs   (run with: node start.cjs)`,
    `Project port: ${port}    Node version: ${config.nodeVersion}    Run user: ${config.aapanel.runUser}`,
    `Project name: ${name}    Tick "Start with system".`,
    `Domain (Mapping): ${domains.join(', ')}`,
    'Save, then press Start.',
  ]);
}

const projectAction = (action, name, label) => attempt(() => post(`/project/nodejs/${action}`, { project_name: name }), [`aaPanel → Website → Node Project → ${name} → ${label}.`]);
const restartProject = name => projectAction('restart_project', name, 'Restart');
const stopProject = name => projectAction('stop_project', name, 'Stop');
const startProject = name => projectAction('start_project', name, 'Start');

function addDomain(name, domain) {
  return attempt(() => post('/project/nodejs/project_add_domain', { project_name: name, domains: [domain] }), [
    `aaPanel → Website → Node Project → ${name} → Domain / Mapping → add ${domain} → Save.`,
  ]);
}

function removeDomain(name, domain) {
  return attempt(() => post('/project/nodejs/project_remove_domain', { project_name: name, domain }), [
    `aaPanel → Website → Node Project → ${name} → Domain / Mapping → delete ${domain}.`,
  ]);
}

/** Let's Encrypt for custom domains (HTTP validation; the domain must already point at this server). */
function applyLetsEncrypt(name, domains) {
  return attempt(() => post('/acme?action=apply_cert_api', { domains, auth_type: 'http', auth_to: name, auto_wildcard: '0' }), [
    `aaPanel → Website → Node Project → ${name} → SSL → Let's Encrypt.`,
    `Tick: ${domains.join(', ')} → Apply. Then switch on "Force HTTPS".`,
    'aaPanel renews the certificate automatically.',
  ]);
}

/** Deploys the wildcard *.BASE_DOMAIN certificate (issued once, DNS validation) to a client's site. */
function deployWildcardCertificate(name) {
  const fs = require('node:fs');
  const { certPath, keyPath } = config.wildcardCert;
  const instructions = [
    `aaPanel → Website → Node Project → ${name} → SSL → Certificate folder (or "Other certificate").`,
    `Choose the wildcard certificate *.${config.baseDomain} → Deploy, then switch on "Force HTTPS".`,
  ];
  if (!certPath || !keyPath || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    return Promise.resolve(manual(new Error('WILDCARD_CERT_PATH / WILDCARD_KEY_PATH not set or not readable.'), instructions));
  }
  return attempt(async () => {
    await post('/site?action=SetSSL', { type: '1', siteName: name, key: fs.readFileSync(keyPath, 'utf8'), csr: fs.readFileSync(certPath, 'utf8') });
    await post('/site?action=HttpToHttps', { siteName: name }).catch(() => undefined);
    return 'deployed';
  }, instructions);
}

module.exports = { post, testConnection, createNodeProject, restartProject, stopProject, startProject, addDomain, removeDomain, applyLetsEncrypt, deployWildcardCertificate };
