// Printable sheets (open in the browser → Print → Save as PDF): DNS instructions for the client's IT, and the
// handover sheet for a new client. They hold no secrets: the temporary administrator password is handed over
// separately, and kiosk codes are printed from the Kiosks tab.
const { config } = require('./config.cjs');

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font: 10.5pt/1.55 "Segoe UI", system-ui, sans-serif; color: #1e293b; max-width: 180mm; margin: 0 auto; padding: 10mm 0; }
  h1 { color: #064e3b; font-size: 19pt; margin: 0 0 2mm; } h2 { color: #064e3b; font-size: 12.5pt; margin: 7mm 0 2mm; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 1mm; }
  .sub { color: #64748b; margin: 0 0 6mm; } table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 10pt; }
  th { text-align: left; background: #f1f5f9; color: #475569; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; } th, td { padding: 2mm 2.5mm; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  code { font-family: Consolas, "Cascadia Mono", monospace; background: #f1f5f9; padding: .3mm 1.2mm; border-radius: 1mm; word-break: break-all; }
  .box { border-left: 3px solid #047857; background: #ecfdf5; padding: 3mm 4mm; border-radius: 0 2mm 2mm 0; margin: 3mm 0; } .warn { border-color: #b45309; background: #fffbeb; }
  ol li, ul li { margin-bottom: 1.5mm; } .brand { color: #047857; font-weight: 700; font-size: 9pt; letter-spacing: .1em; text-transform: uppercase; }
  .print { position: fixed; top: 8px; right: 8px; } @media print { .print { display: none; } }
</style></head><body><button class="print" onclick="window.print()">Print / Save as PDF</button>${body}
<p style="margin-top:10mm;color:#94a3b8;font-size:8.5pt">Generated ${esc(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC by the OneNet Provider Console.</p></body></html>`;

const KIND_TEXT = {
  subdomain: 'a subdomain of your own domain',
  apex: 'your own domain (root domain)',
  nameservers: 'a domain whose DNS is managed by OneNet',
  platform: 'the OneNet platform address',
};

function domainInstructions(client, domain) {
  const records = (domain.dns_detail?.expected || []).filter(record => record.who === 'client');
  const platform = `${client.slug}.${config.baseDomain}`;
  const steps = domain.kind === 'nameservers'
    ? `<ol><li>Sign in at the company that sold you the domain (the registrar).</li><li>Open <b>${esc(domain.domain)}</b> → <b>Nameservers</b> (or DNS servers) → choose <b>custom nameservers</b>.</li><li>Replace the existing nameservers with the ones below and save. The change can take up to 24 hours.</li><li>Tell OneNet when it is done. OneNet creates every record and the certificate.</li></ol>`
    : `<ol><li>Sign in where your domain's DNS is managed (registrar, Cloudflare, hosting company…).</li><li>Open the DNS records of <b>${esc(domain.dns_detail?.registrable || domain.domain)}</b>.</li><li>Add the record(s) below exactly as shown. Leave TTL on automatic (or 3600). Do not change any other record.</li><li>Save and tell OneNet. DNS changes usually work within minutes, sometimes a few hours. OneNet then issues the HTTPS certificate.</li></ol>`;
  return page(`DNS setup — ${domain.domain}`, `
<p class="brand">OneNet · DNS instructions</p>
<h1>Connect ${esc(domain.domain)} to your HR system</h1>
<p class="sub">For the IT administrator of ${esc(client.name)}. Type: ${esc(KIND_TEXT[domain.kind] || domain.kind)}.</p>
<h2>What to do</h2>${steps}
<h2>Record(s) to add</h2>
<table><tr><th>Type</th><th>Name / host</th><th>Value / points to</th><th>Note</th></tr>
${records.map(record => `<tr><td><b>${esc(record.type)}</b></td><td><code>${esc(record.host)}</code></td><td><code>${esc(record.value)}</code></td><td>${esc(record.note || '')}</td></tr>`).join('')}</table>
<p style="font-size:9pt;color:#64748b">Some DNS panels want only the part before your domain in "Name" (for example <code>${esc(domain.domain.split('.')[0])}</code> instead of <code>${esc(domain.domain)}</code>).</p>
${domain.kind === 'apex' ? `<div class="box warn"><b>Important:</b> pointing <code>${esc(domain.domain)}</code> here replaces any website currently on it. Your email (MX records) is not affected. If you already have a website on this domain, use a subdomain such as <code>hr.${esc(domain.domain)}</code> instead.</div>` : ''}
${domain.kind === 'subdomain' ? `<div class="box">With a CNAME record you never need to change anything again, even if OneNet moves servers.</div>` : ''}
<div class="box">Your system always stays reachable at <code>https://${esc(platform)}</code>. Attendance kiosks and the mobile app use that address, so attendance keeps working even if this domain's DNS is changed by mistake.</div>
<h2>Using Cloudflare?</h2><p>If the record is "proxied" (orange cloud), set SSL/TLS mode to <b>Full</b>. Grey cloud (DNS only) also works.</p>`);
}

function handoverSheet(client, domains) {
  const platform = `https://${client.slug}.${config.baseDomain}`;
  const primary = domains.find(item => item.is_primary && item.kind !== 'platform' && item.status === 'active');
  const address = primary ? `https://${primary.domain}` : platform;
  return page(`Handover — ${client.name}`, `
<p class="brand">OneNet · Welcome</p>
<h1>Your HR &amp; Payroll system is ready</h1>
<p class="sub">${esc(client.name)} · ${esc((client.edition?.id || 'full') === 'lite' ? 'Lite edition' : 'Full compliance edition')}</p>
<h2>Addresses</h2>
<table><tr><th>Use</th><th>Address</th></tr>
<tr><td>Sign in (browser)</td><td><code>${esc(address)}</code></td></tr>
<tr><td>Backup address (always works)</td><td><code>${esc(platform)}</code></td></tr>
${domains.filter(item => item.kind !== 'platform' && item.status !== 'removed' && item.domain !== primary?.domain).map(item => `<tr><td>Also</td><td><code>https://${esc(item.domain)}</code> (${esc(item.status)})</td></tr>`).join('')}</table>
<h2>First steps</h2>
<ol>
<li>Sign in with the administrator email and the temporary password OneNet gave you separately. <b>Change the password at once</b> (top right → profile) and switch on two-step verification.</li>
<li>Company Setup: check the company details, add branches, departments, designations and shifts.</li>
<li>Add employees (or, if switched on, import them from CyberAP: menu <b>Data Import</b>).</li>
<li>Attendance kiosks: install the kiosk app and register each PC with a <b>kiosk setup code</b> from OneNet or from Kiosk devices in your system.</li>
<li>Mobile app: employees install the app and enter your <b>company connection code</b>.</li>
</ol>
<h2>Licence</h2>
<table><tr><td>Plan</td><td>${esc(client.licence?.plan || '—')}</td></tr><tr><td>Valid until</td><td>${esc(client.licence?.expiresAt || 'No end date')}</td></tr><tr><td>Active employees allowed</td><td>${esc(client.licence?.staffLimit || 'Unlimited')}</td></tr></table>
<h2>Support</h2><p>OneNet Solutions. Backups of your data are taken every night and kept encrypted.</p>`);
}

module.exports = { domainInstructions, handoverSheet };
