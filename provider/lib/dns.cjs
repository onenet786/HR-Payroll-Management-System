// Domains for a client installation. Every client has a platform subdomain (<slug>.<BASE_DOMAIN>, covered by the
// wildcard DNS record and certificate). A client may add their own domain of any type:
//   subdomain    hr.client.com        CNAME → <slug>.<BASE_DOMAIN>              (recommended)
//   apex         client.com           A → SERVER_IP (+ www CNAME); CNAME-flattening providers may point at the subdomain
//   nameservers  clienthr.com         the domain's nameservers are ours (PROVIDER_NAMESERVERS); we manage every record
// This module classifies a domain, checks its DNS, its certificate and its registration expiry, and writes the
// instruction sheet the client's IT follows.
const dnsPromises = require('node:dns').promises;
const tls = require('node:tls');
const { config } = require('./config.cjs');

const HOSTNAME = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;
// Common multi-part public suffixes (registrable domain = one label more). DNS (SOA) is checked first; this list is
// the fallback when the lookup is not possible.
const MULTI_SUFFIXES = new Set([
  'com.pk', 'net.pk', 'org.pk', 'edu.pk', 'gov.pk', 'biz.pk', 'web.pk', 'fam.pk', 'gok.pk', 'gob.pk', 'gop.pk', 'gos.pk', 'info.pk',
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.in', 'net.in', 'org.in', 'firm.in', 'com.sa', 'com.ae', 'co.ae',
  'com.tr', 'com.cn', 'com.my', 'com.sg', 'co.za', 'com.bd', 'com.qa', 'com.om', 'com.kw', 'com.bh',
]);

function normalizeDomain(input) {
  let value = String(input || '').trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (!HOSTNAME.test(value)) throw new Error('Enter a domain name such as hr.company.com.');
  return value;
}

function registrableDomain(domain) {
  const labels = domain.split('.');
  const lastTwo = labels.slice(-2).join('.');
  return MULTI_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

const platformHost = slug => `${slug}.${config.baseDomain}`;

/** subdomain | apex (the domain is a zone apex / registrable domain) | platform. Throws for another client's platform name. */
async function classifyDomain(input, slug) {
  const domain = normalizeDomain(input);
  if (domain === platformHost(slug)) return { domain, kind: 'platform', registrable: registrableDomain(domain) };
  if (domain === config.baseDomain || domain.endsWith(`.${config.baseDomain}`)) {
    throw new Error(`Names under ${config.baseDomain} are reserved for platform subdomains (${platformHost(slug)}).`);
  }
  const registrable = registrableDomain(domain);
  let apex = domain === registrable;
  try { await dnsPromises.resolveSoa(domain); apex = true; } catch { /* no SOA at this name: not a zone apex */ }
  return { domain, kind: apex ? 'apex' : 'subdomain', registrable };
}

const safe = async promise => { try { return await promise; } catch { return []; } };

/** Checks that the domain points at this server the way its kind requires. */
async function verifyDomain(domain, kind, slug) {
  const target = platformHost(slug);
  const [cname, a, ns] = await Promise.all([safe(dnsPromises.resolveCname(domain)), safe(dnsPromises.resolve4(domain)), kind === 'nameservers' ? safe(dnsPromises.resolveNs(domain)) : Promise.resolve([])]);
  const found = { cname: cname.map(v => v.toLowerCase().replace(/\.$/, '')), a, ns: ns.map(v => v.toLowerCase().replace(/\.$/, '')) };
  const pointsAtServer = config.serverIp ? a.includes(config.serverIp) : a.length > 0;
  let ok = false; let message = '';
  if (kind === 'platform') {
    ok = pointsAtServer;
    message = ok ? 'The wildcard record covers this subdomain.' : `${domain} does not resolve to ${config.serverIp || 'this server'}. Check the *.${config.baseDomain} record.`;
  } else if (kind === 'subdomain') {
    ok = found.cname.includes(target) || pointsAtServer;
    message = found.cname.includes(target) ? `CNAME → ${target} found.` : pointsAtServer ? 'Points at this server by IP (works; a CNAME is preferred so a server move needs no change).' : `Add the CNAME record ${domain} → ${target}.`;
  } else if (kind === 'apex') {
    ok = pointsAtServer;
    message = ok ? `A record → ${config.serverIp} found.` : `Add the A record ${domain} → ${config.serverIp || 'SERVER_IP'} (or ALIAS/ANAME → ${target}).`;
  } else if (kind === 'nameservers') {
    const delegated = config.nameservers.length > 0 && found.ns.some(name => config.nameservers.includes(name));
    ok = delegated && pointsAtServer;
    message = !delegated ? `Change the domain's nameservers at the registrar to: ${config.nameservers.join(', ') || '(set PROVIDER_NAMESERVERS)'}.` : pointsAtServer ? 'Nameservers delegated and the domain points at this server.' : `Nameservers are delegated; create the A record ${domain} → ${config.serverIp} in our DNS.`;
  }
  return { ok, message, found, expected: expectedRecords(domain, kind, slug), checkedAt: new Date().toISOString() };
}

/** The DNS records the client (or we, for nameserver delegation) must create. */
function expectedRecords(domain, kind, slug) {
  const target = platformHost(slug);
  const ip = config.serverIp || 'SERVER_IP';
  if (kind === 'platform') return [{ type: 'A', host: `*.${config.baseDomain}`, value: ip, who: 'provider', note: 'Wildcard record (set once for every client).' }];
  if (kind === 'subdomain') return [{ type: 'CNAME', host: domain, value: target, who: 'client' }];
  if (kind === 'apex') {
    return [
      { type: 'A', host: domain, value: ip, who: 'client', note: `Or ALIAS / ANAME / flattened CNAME → ${target} if your DNS provider supports it.` },
      { type: 'CNAME', host: `www.${domain}`, value: domain, who: 'client' },
    ];
  }
  return [
    ...config.nameservers.map(ns => ({ type: 'NS', host: domain, value: ns, who: 'client', note: 'Set at the domain registrar (nameservers).' })),
    { type: 'A', host: domain, value: ip, who: 'provider' },
    { type: 'CNAME', host: `www.${domain}`, value: domain, who: 'provider' },
  ];
}

/** TLS certificate the domain currently serves (any issuer). */
function checkCertificate(host, timeoutMs = 8000) {
  return new Promise(resolve => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      const result = cert && cert.valid_to
        ? { ok: socket.authorized, expiresAt: new Date(cert.valid_to).toISOString(), issuer: cert.issuer?.O || cert.issuer?.CN || '', subject: cert.subject?.CN || '', error: socket.authorized ? null : String(socket.authorizationError || 'not trusted') }
        : { ok: false, error: 'No certificate' };
      socket.end();
      resolve(result);
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ ok: false, error: 'Timed out connecting on port 443' }); });
    socket.on('error', error => resolve({ ok: false, error: error.code || error.message }));
  });
}

/** Registration expiry from RDAP (not every registry, e.g. some .pk, publishes it: null then). */
async function domainExpiry(domain) {
  const registrable = registrableDomain(domain);
  try {
    const response = await fetch(`https://rdap.org/domain/${registrable}`, { headers: { Accept: 'application/rdap+json' }, signal: AbortSignal.timeout(10_000), redirect: 'follow' });
    if (!response.ok) return { registrable, expiresAt: null, note: `RDAP ${response.status}` };
    const body = await response.json();
    const event = (body.events || []).find(item => item.eventAction === 'expiration');
    return { registrable, expiresAt: event?.eventDate ? new Date(event.eventDate).toISOString() : null, registrar: (body.entities || []).find(entity => (entity.roles || []).includes('registrar'))?.vcardArray?.[1]?.find(field => field[0] === 'fn')?.[3] || null };
  } catch (error) {
    return { registrable, expiresAt: null, note: error.name === 'TimeoutError' ? 'RDAP timeout' : 'RDAP not available' };
  }
}

module.exports = { normalizeDomain, registrableDomain, classifyDomain, verifyDomain, expectedRecords, checkCertificate, domainExpiry, platformHost, MULTI_SUFFIXES };
