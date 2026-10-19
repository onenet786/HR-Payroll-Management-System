#!/usr/bin/env node
// Renders the "New client server setup" guide to PDF with headless Chrome/Edge.
//
//   node deploy/installer/build-setup-guide.mjs        (or: npm run docs:setup-guide)
//
// Writes docs/New-Client-Server-Setup-Guide.pdf (+ the .html source next to it)
// and copies the PDF into deploy/installer/dist/ so it ships beside the .run file.
// The Lite / Full table is read from server/edition.cjs, so it follows the presets.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);
const { EDITION_PRESETS } = require(path.join(root, 'server', 'edition.cjs'));

const branding = Object.fromEntries(fs.readFileSync(path.join(here, 'branding.conf'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const PRODUCT = branding.PRODUCT_NAME || 'HR & Payroll Suite';
const VENDOR = branding.VENDOR_NAME || 'OneNet Solutions';
const latest = path.join(here, 'dist', 'LATEST');
const VERSION = fs.existsSync(latest) ? fs.readFileSync(latest, 'utf8').trim() : '<version>';
const RUN = `hrpayroll-setup-${VERSION}.run`;
const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Human labels mirror EDITION_FEATURE_INFO in src/data/edition.ts.
const FEATURES = [
  ['Statutory deductions', 'incomeTax', 'FBR income tax withholding', 'Tax slabs, NTN, salary tax, CPR deposits, annual tax certificates'],
  ['Statutory deductions', 'eobi', 'EOBI contributions', 'Employee and employer EOBI, registration numbers, returns'],
  ['Statutory deductions', 'socialSecurity', 'Provincial social security (PESSI / SESSI)', 'Employer contribution and returns'],
  ['Statutory deductions', 'providentFund', 'Provident fund', 'PF deduction, employer match, PF ledger'],
  ['Statutory deductions', 'gratuity', 'Gratuity and final settlement', 'Gratuity provision and final-settlement runs'],
  ['Payroll controls', 'bankPayroll', 'Bank payroll', 'Off: cash salaries allowed, bank details optional'],
  ['Payroll controls', 'makerChecker', 'Maker-checker approvals', 'Off: one owner can prepare, approve and pay'],
  ['Payroll controls', 'requireEmployeeEmail', 'Employee email required', 'Off: email is optional'],
  ['Modules', 'recruitment', 'Recruitment', 'Job postings and applicants'],
  ['Modules', 'performance', 'Performance reviews', 'KPI scoring and appraisals'],
  ['Modules', 'assets', 'Asset management', 'Assets issued to staff, exit clearance'],
  ['Modules', 'loans', 'Loans and advances', 'Recovered through payroll'],
  ['Modules', 'salaryRevisions', 'Salary revisions', 'Increments and promotions with arrears'],
  ['Modules', 'parallelRun', 'Parallel-run reconciliation', 'Compare against a legacy payroll file'],
  ['Modules', 'goLiveChecklist', 'Live payroll readiness checklist', 'Statutory, MFA and approvals checklist'],
];
const mark = on => on ? '<span class="on">✔ On</span>' : '<span class="off">— Off</span>';
let lastGroup = '';
const editionRows = FEATURES.map(([group, key, label, detail]) => {
  const head = group !== lastGroup ? `<tr class="group"><td colspan="4">${esc(group)}</td></tr>` : '';
  lastGroup = group;
  return `${head}<tr><td><b>${esc(label)}</b><br><span class="muted">${esc(detail)}</span></td><td>${mark(EDITION_PRESETS.full[key])}</td><td>${mark(EDITION_PRESETS.lite[key])}</td></tr>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(PRODUCT)} — New Client Server Setup Guide</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm 15mm;
    @bottom-left { content: "${esc(PRODUCT)} · New client setup · ${esc(VERSION)}"; font: 7.5pt system-ui, sans-serif; color: #94a3b8; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt system-ui, sans-serif; color: #94a3b8; } }
  @page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
  :root { --ink:#1e293b; --muted:#64748b; --line:#e2e8f0; --brand:#047857; --brand-dk:#064e3b; --soft:#ecfdf5; --warn:#b45309; --warnbg:#fffbeb; --bad:#b91c1c; --badbg:#fef2f2; --code:#0f172a; }
  * { box-sizing: border-box; }
  body { margin:0; font: 10pt/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 20pt; margin: 0 0 4mm; color: var(--brand-dk); letter-spacing: -.01em; }
  h2 { font-size: 13pt; margin: 7mm 0 2.5mm; color: var(--brand-dk); padding-bottom: 1.5mm; border-bottom: 1.5px solid var(--line); break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 5mm 0 1.5mm; break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; } li { margin-bottom: 1mm; }
  code, .mono { font-family: "Cascadia Mono", Consolas, "JetBrains Mono", monospace; font-size: 8.8pt; }
  code { background: #f1f5f9; padding: .2mm 1.2mm; border-radius: 1mm; }
  pre { background: var(--code); color: #e2e8f0; padding: 3mm 4mm; border-radius: 2mm; font-size: 8.6pt; line-height: 1.55; white-space: pre-wrap; margin: 0 0 3.5mm; break-inside: avoid; }
  pre .c { color: #6ee7b7; } pre .p { color: #94a3b8; user-select: none; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9pt; break-inside: auto; }
  th { text-align: left; background: #f8fafc; color: var(--muted); font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  th, td { padding: 1.8mm 2.5mm; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr { break-inside: avoid; }
  tr.group td { background: var(--soft); color: var(--brand-dk); font-weight: 700; font-size: 8.5pt; padding-top: 1.4mm; padding-bottom: 1.4mm; }
  .muted { color: var(--muted); font-size: 8.5pt; }
  .on { color: var(--brand); font-weight: 700; white-space: nowrap; } .off { color: #94a3b8; white-space: nowrap; }
  .page { break-before: page; }
  .note, .warn, .bad { border-left: 3px solid var(--brand); background: var(--soft); padding: 2.5mm 3.5mm; border-radius: 0 2mm 2mm 0; margin: 0 0 4mm; break-inside: avoid; }
  .warn { border-color: var(--warn); background: var(--warnbg); } .bad { border-color: var(--bad); background: var(--badbg); }
  .note b:first-child, .warn b:first-child, .bad b:first-child { display: block; margin-bottom: .8mm; }
  .steps { counter-reset: s; list-style: none; padding: 0; }
  .steps > li { counter-increment: s; position: relative; padding-left: 10mm; margin-bottom: 3mm; break-inside: avoid; }
  .steps > li::before { content: counter(s); position: absolute; left: 0; top: .2mm; width: 6.5mm; height: 6.5mm; border-radius: 50%; background: var(--brand); color: #fff; font-weight: 700; font-size: 9pt; display: grid; place-items: center; }
  .flow { display: flex; gap: 2mm; margin: 2mm 0 5mm; }
  .flow div { flex: 1; background: var(--soft); border: 1px solid #a7f3d0; border-radius: 2mm; padding: 2.5mm; font-size: 8.5pt; text-align: center; }
  .flow b { display: block; color: var(--brand-dk); font-size: 9.5pt; margin-bottom: .8mm; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .card { border: 1px solid var(--line); border-radius: 2mm; padding: 3mm 4mm; break-inside: avoid; }
  .card h3 { margin-top: 0; }
  .check li { list-style: none; position: relative; } .check { padding-left: 6mm; }
  .check li::before { content: ""; position: absolute; left: -6mm; top: .9mm; width: 3.2mm; height: 3.2mm; border: 1.3px solid var(--muted); border-radius: .6mm; }
  .form td:first-child { width: 42%; color: var(--muted); } .form td { height: 9mm; }
  .toc { columns: 2; column-gap: 10mm; margin-bottom: 4mm; } .toc li { margin-bottom: 1.2mm; break-inside: avoid; }

  .cover { height: 297mm; padding: 26mm 22mm; color: #fff; background: linear-gradient(140deg, #064e3b 0%, #065f46 38%, #0f172a 100%); display: flex; flex-direction: column; }
  .cover .tag { display: inline-block; align-self: flex-start; background: #10b981; color: #fff; font-weight: 700; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; padding: 1.2mm 3mm; border-radius: 1mm; }
  .cover h1 { color: #fff; font-size: 34pt; line-height: 1.12; margin: 12mm 0 5mm; }
  .cover .sub { font-size: 13pt; color: #a7f3d0; max-width: 140mm; }
  .cover .meta { margin-top: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; border-top: 1px solid rgba(255,255,255,.18); padding-top: 6mm; font-size: 9pt; color: #cbd5e1; }
  .cover .meta b { display: block; color: #fff; font-size: 10.5pt; }
  .cover .flow div { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.16); color: #e2e8f0; }
  .cover .flow b { color: #6ee7b7; }
</style></head>
<body>

<section class="cover">
  <span class="tag">${esc(VENDOR)} · Deployment guide</span>
  <h1>${esc(PRODUCT)}<br>New Client Server Setup</h1>
  <p class="sub">How to install a ready-to-use HR &amp; Payroll system for a new client: on their own Ubuntu server or yours, with or without aaPanel, in the Full or the Lite edition.</p>
  <div class="flow" style="margin-top:16mm">
    <div><b>1 · Prepare</b>Server, DNS, ports, client details</div>
    <div><b>2 · Build</b>One .run file on your PC</div>
    <div><b>3 · Install</b>sudo bash … about 5 minutes</div>
    <div><b>4 · Hand over</b>Sign-in, edition, backups</div>
  </div>
  <div class="meta">
    <div><b>Bundle</b>${esc(VERSION)}</div>
    <div><b>Editions</b>Full · Lite</div>
    <div><b>Issued</b>${esc(today)}</div>
  </div>
</section>

<section class="page">
  <h1>Contents</h1>
  <ol class="toc">
    <li>What the installer does</li>
    <li>Before you start — server, DNS and client details</li>
    <li>Choosing the edition: Full or Lite</li>
    <li>Step 1 — Build the setup bundle (your PC)</li>
    <li>Step 2 — Copy it to the client's server</li>
    <li>Step 3 — Run the setup wizard</li>
    <li>Step 4 — Finish screen and handover</li>
    <li>Unattended installs with a client config file</li>
    <li>Running several clients on one server</li>
    <li>Day-to-day management with hrpayrollctl</li>
    <li>Updating clients to a new version</li>
    <li>aaPanel notes</li>
    <li>Troubleshooting</li>
    <li>Security notes</li>
    <li>Appendix — Client intake form</li>
  </ol>

  <h2>1 · What the installer does</h2>
  <p>You build <b>one file</b> per release, <code>${esc(RUN)}</code>. Run it as root on a fresh or existing Ubuntu server. A guided, menu-driven wizard asks a few questions, then the installer does everything else without further input.</p>
  <table>
    <tr><th style="width:28%">Part</th><th>What happens</th></tr>
    <tr><td><b>Node.js</b></td><td>A private, checksum-verified Node.js 24 runtime in <code>/opt/hrpayroll/node</code>. It never touches aaPanel's Node manager or other websites.</td></tr>
    <tr><td><b>PostgreSQL</b></td><td>Uses aaPanel's PostgreSQL or the system's. If neither exists, it installs PostgreSQL 16. It then creates a database and user for this client with a random password.</td></tr>
    <tr><td><b>Application</b></td><td>Installed as a versioned release with a <code>current</code> link, running as its own Linux user. All database migrations are applied.</td></tr>
    <tr><td><b>Edition</b></td><td>Sets <b>Full</b> or <b>Lite</b>, using the same code (and audit-log entry) as the OneNet edition console.</td></tr>
    <tr><td><b>Service</b></td><td>A hardened systemd service <code>hrpayroll-&lt;id&gt;</code>. It starts on boot and restarts on failure, and it listens only on 127.0.0.1.</td></tr>
    <tr><td><b>Website &amp; HTTPS</b></td><td>An nginx site for the client's domain, a free Let's Encrypt certificate with automatic renewal, and HTTP→HTTPS redirection.</td></tr>
    <tr><td><b>First admin</b></td><td>The client's Super Admin account and company are created, so they can sign in immediately.</td></tr>
    <tr><td><b>Backups</b></td><td>An encrypted database backup every night at 02:15 (the last 14 are kept), plus one straight after installation.</td></tr>
  </table>
  <div class="note"><b>One bundle fits every client.</b>The web app is built to call the server that served it, so the same <code>.run</code> file works for any domain. Nothing is customised per client at build time.</div>
</section>

<section class="page">
  <h2>2 · Before you start</h2>
  <div class="two">
    <div class="card"><h3>Server</h3>
      <ul class="check">
        <li>Ubuntu <b>24.04</b> or 22.04 LTS, 64-bit (x86-64 or ARM64)</li>
        <li><b>2 GB RAM</b> or more (1 GB works for Lite with few users)</li>
        <li>At least <b>2 GB free</b> disk on <code>/var</code></li>
        <li>SSH or aaPanel terminal access as <b>root</b> / sudo</li>
        <li>Internet access (packages, Node.js, Let's Encrypt)</li>
      </ul></div>
    <div class="card"><h3>Network</h3>
      <ul class="check">
        <li>DNS <b>A record</b>: <code>hr.client.com</code> → server's public IP</li>
        <li>Ports <b>80</b> and <b>443</b> open in aaPanel <i>Security → Firewall</i></li>
        <li>…and in the cloud provider's firewall / security group</li>
        <li>Nothing except nginx using port 80</li>
        <li>The domain <b>not</b> already added under aaPanel <i>Website</i></li>
      </ul></div>
  </div>
  <h3>Collect from the client</h3>
  <table>
    <tr><th style="width:30%">Item</th><th>Example</th><th style="width:32%">Notes</th></tr>
    <tr><td>Domain</td><td><code>hr.acme-traders.com</code></td><td>DNS must already point at the server</td></tr>
    <tr><td>Company name</td><td>Acme Traders (Pvt) Ltd</td><td>Shown in the app, titles, MFA</td></tr>
    <tr><td>Edition</td><td>Full or Lite</td><td>See section 3</td></tr>
    <tr><td>Super Admin name &amp; email</td><td>Ali Khan, admin@acme-traders.com</td><td>Their first sign-in</td></tr>
    <tr><td>Admin password</td><td>12+ characters</td><td>Or let the installer generate one</td></tr>
    <tr><td>Email for SSL notices</td><td>it@acme-traders.com</td><td>Optional</td></tr>
    <tr><td>SMTP (payslips, sign-in codes)</td><td>smtp.gmail.com : 587 + app password</td><td>Optional; can be added later</td></tr>
  </table>
  <p class="muted">A printable intake form is in the appendix.</p>

  <h2>3 · Choosing the edition: Full or Lite</h2>
  <p><b>Full</b> is the complete Pakistan payroll-compliance system. <b>Lite</b> is for shops and small businesses with about 10–15 staff, who only need attendance, leave, salaries, advances and payslips. Lite does not ask for FBR, EOBI or social-security data, and one owner can run payroll alone.</p>
  <table>
    <tr><th>Feature</th><th style="width:15%">Full</th><th style="width:15%">Lite</th></tr>
    ${editionRows}
  </table>
  <div class="note"><b>The edition can be changed at any time.</b>Switching never deletes or changes customer data. Moving back to Full restores every rule. Use <code>sudo hrpayrollctl edition &lt;id&gt; lite|full</code> on the server, or the OneNet vendor console on the sign-in screen (section 10).</div>
</section>

<section class="page">
  <h2>4 · Step 1 — Build the setup bundle (your PC)</h2>
  <p>In the project folder on your development PC (Windows or Linux), run:</p>
<pre><span class="p">PS&gt;</span> cd D:\\GIT-HUB\\HR-Payroll-Management-System
<span class="p">PS&gt;</span> npm run server:bundle            <span class="c"># optional: -- --version 1.5.0</span></pre>
  <p>About 15 seconds later <code>deploy\\installer\\dist\\</code> contains:</p>
  <table>
    <tr><th style="width:44%">File</th><th>Use</th></tr>
    <tr><td><code>hrpayroll-setup-&lt;version&gt;.run</code></td><td>Installs a new client, and updates existing ones</td></tr>
    <tr><td><code>hrpayroll-app-&lt;version&gt;.tar.gz</code></td><td>The app only, as an alternative update package</td></tr>
    <tr><td><code>SHA256SUMS</code></td><td>Checksums for verifying a copy</td></tr>
    <tr><td><code>New-Client-Server-Setup-Guide.pdf</code></td><td>This guide</td></tr>
  </table>
  <div class="warn"><b>Build from committed, tested code.</b>The version name ends in <code>-dirty</code> if there are uncommitted changes. Release bundles should come from a clean, committed state. The build also refuses to finish if a domain from your <code>.env</code> files ended up inside the web app.</div>

  <h2>5 · Step 2 — Copy it to the client's server</h2>
  <p>Use any one of these:</p>
  <ul>
    <li><b>aaPanel → Files</b>: upload the <code>.run</code> file to <code>/root</code>.</li>
    <li><b>WinSCP / FileZilla</b>: SFTP to the server, <b>binary</b> mode, into <code>/root</code>.</li>
    <li><b>Command line</b> from your PC:</li>
  </ul>
<pre><span class="p">PS&gt;</span> scp deploy\\installer\\dist\\${esc(RUN)} root@SERVER-IP:/root/</pre>
  <p>Optionally, check the file arrived intact:</p>
<pre><span class="p">#</span> sha256sum /root/${esc(RUN)}      <span class="c"># must match SHA256SUMS</span>
<span class="p">#</span> bash /root/${esc(RUN)} --info</pre>

  <h2>6 · Step 3 — Run the setup wizard</h2>
  <p>Open an SSH session (or aaPanel → Terminal) and run:</p>
<pre><span class="p">#</span> sudo bash /root/${esc(RUN)}</pre>
  <p>Use the arrow keys, <b>Tab</b> and <b>Enter</b> to move through the blue setup screens:</p>
  <ol class="steps">
    <li><b>Welcome</b>: shows what was detected on this server (aaPanel, PostgreSQL, nginx).</li>
    <li><b>Client domain</b>: e.g. <code>hr.acme-traders.com</code>.</li>
    <li><b>Instance id</b>: a short name for this client, such as <code>acme</code>. It is used for the service, database and folders. Accept the suggestion unless it clashes.</li>
    <li><b>Company</b>: the name shown in the app.</li>
    <li><b>Edition</b>: choose <b>Full</b> or <b>Lite</b>.</li>
    <li><b>Administrator</b>: full name, sign-in email and password (12+ characters). Leave the password blank to generate one; it is shown once at the end.</li>
    <li><b>HTTPS</b>: <b>Yes</b> gets a Let's Encrypt certificate. You can give an email for expiry notices.</li>
    <li><b>Email delivery</b>: optionally enter the SMTP settings now.</li>
    <li><b>Payroll tax</b> (Full only): load the Pakistan FBR tax slabs. Lite skips this.</li>
    <li><b>PostgreSQL password</b>: only asked if the installer cannot sign in to aaPanel's PostgreSQL on its own. Find it in aaPanel → Databases → PostgreSQL → root password.</li>
    <li><b>Ready to install</b>: check the summary and press <b>Yes</b>.</li>
  </ol>
  <p>Each step then shows a tick as it completes. A typical install takes 3–5 minutes, most of it downloading packages.</p>
</section>

<section class="page">
  <h2>7 · Step 4 — Finish screen and handover</h2>
<pre>  ✔ ${esc(PRODUCT)} is live for Acme Traders (Pvt) Ltd

    Open:        https://hr.acme-traders.com
    Sign in:     admin@acme-traders.com
    Password:    (the one you chose)
    Edition:     Lite
    Manage:      hrpayrollctl status acme | logs acme | backup acme | update acme &lt;bundle.run&gt;
    Summary:     /etc/hrpayroll/acme/install-summary.txt</pre>
  <h3>Handover checklist</h3>
  <ul class="check">
    <li><b>Save the two keys off the server.</b> Copy <code>BACKUP_ENCRYPTION_KEY</code> and <code>MFA_ENCRYPTION_KEY</code> from <code>/etc/hrpayroll/&lt;id&gt;/app.env</code> into your password manager. <b>Without the backup key, the backups cannot be restored.</b></li>
    <li>Open the website, sign in as the Super Admin, and complete <b>Company Setup</b> (legal name, logo, branches). The installer creates a "Head Office" branch.</li>
    <li>Check the edition the client sees in the menu: Lite hides statutory pages and modules.</li>
    <li>Enrol authenticator MFA for every admin and payroll user. Then run <code>hrpayrollctl edit &lt;id&gt;</code>, set <code>MFA_ENFORCE_PRIVILEGED=true</code>, and save.</li>
    <li><b>Windows kiosk</b>: install it on the client's attendance PC and set its server address to the client's URL (<code>PORTAL_URL</code>). By default the kiosk connects to OneNet's own server.</li>
    <li><b>Mobile app</b>: sign in with the client's URL.</li>
    <li>Optionally, copy <code>/var/backups/hrpayroll/&lt;id&gt;</code> to off-site storage (aaPanel cron, rclone or similar).</li>
    <li>Delete any client config file that contains passwords (section 8).</li>
  </ul>

  <h2>8 · Unattended installs with a client config file</h2>
  <p>For repeat rollouts, keep one small file per client and install with no questions asked:</p>
<pre><span class="p">#</span> bash ${esc(RUN)} --extract-only /tmp/hrp &amp;&amp; cp /tmp/hrp/installer/client.conf.example acme.conf
<span class="p">#</span> nano acme.conf
<span class="p">#</span> sudo bash ${esc(RUN)} --config acme.conf --yes</pre>
<pre><span class="c"># acme.conf</span>
DOMAIN=hr.acme-traders.com
COMPANY_NAME="Acme Traders (Pvt) Ltd"
EDITION=lite
ADMIN_NAME="Ali Khan"
ADMIN_EMAIL=admin@acme-traders.com
ADMIN_PASSWORD=             <span class="c"># blank = generate and print once</span>
SSL=yes
SSL_EMAIL=it@acme-traders.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=payroll@acme-traders.com
SMTP_PASS=app-password-here</pre>
  <p class="muted">Every setting can also be given as an option, e.g. <code>--domain</code>, <code>--company</code>, <code>--edition lite</code>, <code>--admin-email</code>, <code>--no-ssl</code> or <code>--no-vendor-console</code>. Run the bundle with <code>--help</code> for the full list.</p>

  <h2>9 · Running several clients on one server</h2>
  <p>Run the same bundle again with another domain. Each client is fully separate:</p>
  <table>
    <tr><th style="width:30%">Per client</th><th>Location (instance id <code>acme</code>)</th></tr>
    <tr><td>Application</td><td><code>/www/wwwroot/acme</code> (aaPanel) or <code>/opt/hrpayroll/apps/acme</code></td></tr>
    <tr><td>Settings &amp; secrets</td><td><code>/etc/hrpayroll/acme/app.env</code></td></tr>
    <tr><td>Database / user</td><td><code>hrp_acme</code> / <code>hrp_acme</code></td></tr>
    <tr><td>Employee documents</td><td><code>/var/lib/hrpayroll/acme/documents</code></td></tr>
    <tr><td>Backups</td><td><code>/var/backups/hrpayroll/acme</code></td></tr>
    <tr><td>Service · port</td><td><code>hrpayroll-acme</code> · 8080, 8081, … assigned automatically</td></tr>
    <tr><td>Logs</td><td><code>/var/log/hrpayroll/acme-*.log</code> and <code>hrpayrollctl logs acme</code></td></tr>
  </table>
</section>

<section class="page">
  <h2>10 · Day-to-day management with hrpayrollctl</h2>
  <table>
    <tr><th style="width:46%">Command (run with sudo)</th><th>What it does</th></tr>
    <tr><td><code>hrpayrollctl list</code></td><td>All clients on this server, with state and version</td></tr>
    <tr><td><code>hrpayrollctl status acme</code></td><td>Service, health, version, edition, certificate expiry, last backup</td></tr>
    <tr><td><code>hrpayrollctl logs acme -f</code></td><td>Live application log</td></tr>
    <tr><td><code>hrpayrollctl restart acme</code></td><td>Restart and wait until healthy (also <code>start</code>, <code>stop</code>)</td></tr>
    <tr><td><code>hrpayrollctl edition acme</code></td><td>Show the current edition</td></tr>
    <tr><td><code>hrpayrollctl edition acme lite</code></td><td>Switch to Lite (or <code>full</code>). Users see it within seconds; no data changes.</td></tr>
    <tr><td><code>hrpayrollctl edit acme</code></td><td>Edit settings (SMTP, SMS/WhatsApp, MFA enforcement…) and restart</td></tr>
    <tr><td><code>hrpayrollctl backup acme</code></td><td>Encrypted backup now</td></tr>
    <tr><td><code>hrpayrollctl restore acme &lt;file.dump.enc&gt;</code></td><td>Replace the database with a backup (asks you to confirm)</td></tr>
    <tr><td><code>hrpayrollctl ssl acme</code></td><td>Issue or repair HTTPS (e.g. once DNS is fixed)</td></tr>
    <tr><td><code>hrpayrollctl rollback acme</code></td><td>Go back to the previous version</td></tr>
    <tr><td><code>hrpayrollctl uninstall acme</code></td><td>Remove the service and website, keeping the data</td></tr>
    <tr><td><code>hrpayrollctl uninstall acme --purge</code></td><td>Also delete the database, files and documents (backups are kept unless <code>--delete-backups</code>)</td></tr>
  </table>
  <h3>Switching the edition from the browser (vendor console)</h3>
  <p>On the client's sign-in screen, enter login <code>onenet</code> and the password <code>OneNet</code> followed by today's date as <code>DDMonYYYY</code> on Pakistan time, e.g. <code>OneNet19Oct2026</code>. This opens the edition console, which can change <b>only</b> the edition. The change is recorded in the audit log.</p>

  <h2>11 · Updating clients to a new version</h2>
  <ol class="steps">
    <li>Build the new bundle (Step 1) and copy it to the server (Step 2).</li>
    <li>Run, for each client on that server:
<pre style="margin-top:2mm"><span class="p">#</span> sudo hrpayrollctl update acme /root/hrpayroll-setup-&lt;new-version&gt;.run</pre></li>
    <li>The update takes a backup, unpacks the new version, applies migrations, switches over and runs a health check. If the new version is unhealthy, it <b>switches back automatically</b>.</li>
  </ol>
  <p>The client's edition, settings, documents and data are kept. Only the program changes.</p>
  <div class="warn"><b>Rolling back does not undo database migrations.</b>If you roll back after an update that changed the database structure, the pre-update backup is in the client's backup folder.</div>

  <h2>12 · aaPanel notes</h2>
  <ul>
    <li>The website is a configuration file at <code>/www/server/panel/vhost/nginx/hrpayroll-&lt;id&gt;.conf</code>. It does <b>not</b> appear under aaPanel <i>Website → Sites</i>, so <b>don't add the same domain there</b>. The installer stops if the domain is already used by an aaPanel site.</li>
    <li>The app runs as a systemd service, <b>not</b> under aaPanel's Node Project Manager. Don't add it there as well, or two copies will fight over the port.</li>
    <li>aaPanel's own firewall must allow 80 and 443. The installer opens them in <code>ufw</code> if it is active.</li>
  </ul>
</section>

<section class="page">
  <h2>13 · Troubleshooting</h2>
  <table>
    <tr><th style="width:36%">Symptom</th><th>What to do</th></tr>
    <tr><td>"HTTPS could not be issued yet"</td><td>The site works over HTTP. Fix DNS so the domain points at this server, and make sure port 80 is open, then run <code>hrpayrollctl ssl &lt;id&gt;</code>.</td></tr>
    <tr><td>A step shows a red ✖</td><td>The last lines of the log are printed, and the full log is in <code>/var/log/hrpayroll/&lt;id&gt;-install.log</code>. Fix the cause, run <code>hrpayrollctl uninstall &lt;id&gt; --purge</code>, then run the bundle again.</td></tr>
    <tr><td>"This setup file is damaged"</td><td>The file was changed in transfer, e.g. FTP in text mode. Copy it again in binary mode and compare with <code>SHA256SUMS</code>.</td></tr>
    <tr><td>"…is already configured in …conf"</td><td>The domain is already used by an aaPanel website. Delete that site in aaPanel, then re-run.</td></tr>
    <tr><td>"Cannot reach PostgreSQL as superuser"</td><td>Give the aaPanel PostgreSQL root password when asked, or pass <code>--pg-password</code>.</td></tr>
    <tr><td>"Port 80 is used by something other than nginx"</td><td>Stop Apache (or whatever else is using port 80), or use a server running nginx.</td></tr>
    <tr><td>Site down after editing settings</td><td>Run <code>hrpayrollctl logs &lt;id&gt;</code>. The app refuses to start with <code>DEBUG=true</code> or an empty <code>APP_URL</code>.</td></tr>
    <tr><td>Kiosk says it cannot reach the server</td><td>Its server address still points at OneNet's server. Set the client's URL (<code>PORTAL_URL</code>).</td></tr>
    <tr><td>Client sees the wrong menus</td><td>Check the edition with <code>hrpayrollctl edition &lt;id&gt;</code>, switch it, and reload the page.</td></tr>
  </table>

  <h2>14 · Security notes</h2>
  <ul>
    <li>Each client gets its own Linux user, database user and randomly generated secrets. The application listens only on 127.0.0.1, behind nginx and HTTPS.</li>
    <li><code>app.env</code> and <code>install-summary.txt</code> can be read only by root and the app's own user. Never send them by email or chat.</li>
    <li>Treat client config files (<code>*.conf</code>) like passwords, and delete them after installing.</li>
  </ul>
  <div class="bad"><b>The vendor console password follows a predictable pattern.</b>Anyone who learns the "OneNet + today's date" pattern can switch <i>any</i> client between Full and Lite. Switching to Lite turns off maker-checker approvals, so a single user could then approve and pay payroll. For clients where that matters:
    <ul style="margin:1.5mm 0 0">
      <li>install with <code>--no-vendor-console</code> and switch editions with <code>hrpayrollctl edition</code> on the server; or</li>
      <li>set a private <code>VENDOR_PASSWORD_PREFIX</code> per client with <code>hrpayrollctl edit &lt;id&gt;</code>.</li>
    </ul></div>
</section>

<section class="page">
  <h2>Appendix — Client intake form</h2>
  <p class="muted">Fill one in per client before installing. Keep it with the client's file; don't write passwords on it.</p>
  <table class="form">
    <tr><th colspan="2">Client</th></tr>
    <tr><td>Company legal name</td><td></td></tr>
    <tr><td>Contact person &amp; phone</td><td></td></tr>
    <tr><td>Number of employees</td><td></td></tr>
    <tr><td>Edition (Full / Lite)</td><td></td></tr>
    <tr><th colspan="2">Server</th></tr>
    <tr><td>Hosting provider · server IP</td><td></td></tr>
    <tr><td>Ubuntu version · aaPanel (yes/no)</td><td></td></tr>
    <tr><td>Domain (DNS A record set?)</td><td></td></tr>
    <tr><td>Ports 80/443 open (panel + cloud)</td><td></td></tr>
    <tr><th colspan="2">Accounts</th></tr>
    <tr><td>Super Admin name</td><td></td></tr>
    <tr><td>Super Admin email</td><td></td></tr>
    <tr><td>SSL notice email</td><td></td></tr>
    <tr><td>SMTP host · port · user</td><td></td></tr>
    <tr><th colspan="2">After installation</th></tr>
    <tr><td>Instance id · port</td><td></td></tr>
    <tr><td>Bundle version installed</td><td></td></tr>
    <tr><td>Keys saved to password manager (date / by)</td><td></td></tr>
    <tr><td>Kiosk installed &amp; pointed at client URL</td><td></td></tr>
    <tr><td>MFA enrolled · enforcement on</td><td></td></tr>
    <tr><td>Handed over to client (date / signature)</td><td></td></tr>
  </table>
</section>
</body></html>`;

const docsDir = path.join(root, 'docs');
fs.mkdirSync(docsDir, { recursive: true });
const htmlPath = path.join(docsDir, 'New-Client-Server-Setup-Guide.html');
const pdfPath = path.join(docsDir, 'New-Client-Server-Setup-Guide.pdf');
fs.writeFileSync(htmlPath, html, 'utf8');

const browsers = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = browsers.find(b => fs.existsSync(b));
if (!browser) throw new Error('No Chrome/Edge found. Set CHROME_PATH to a Chromium-based browser.');
fs.rmSync(pdfPath, { force: true });
execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { stdio: 'ignore' });
if (!fs.existsSync(pdfPath)) throw new Error('The browser did not produce a PDF.');

const distDir = path.join(here, 'dist');
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(pdfPath, path.join(distDir, 'New-Client-Server-Setup-Guide.pdf'));
console.log(`✔ ${path.relative(root, pdfPath)} (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB) — also copied to deploy/installer/dist/`);
