#!/usr/bin/env node
// Builds the OneNet Provider Console guides (PDF): User guide, Admin guide, Hosting setup guide (aaPanel).
//   node deploy/installer/build-provider-guides.mjs     (or: npm run docs:provider-guides)
// Screenshots are read from docs/assets/provider/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bullets, checks, esc, fig, note, pre, renderGuide, steps, table, today } from './guide-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shot = name => `assets/provider/${name}.png`;
const meta = [['Product', 'OneNet Provider Console'], ['Server', 'Ubuntu 24.04 · aaPanel'], ['Issued', today]];

// ═══════════════════════════════════════════════════════════════════════════ USER GUIDE
const userGuide = {
  file: 'OneNet-Provider-Console-User-Guide',
  title: 'OneNet Provider Console — User Guide',
  footer: 'OneNet Provider Console · User guide',
  tag: 'OneNet · User guide',
  coverTitle: 'Provider Console<br>User Guide',
  subtitle: 'Daily work for OneNet staff: set up a new hosted client in minutes, connect any type of domain, manage licences, kiosks, the mobile app, backups and releases.',
  flow: [['1 · Create', 'One form → a running installation'], ['2 · Connect', 'Domains, kiosks, mobile app'], ['3 · Manage', 'Licence, edition, switches'], ['4 · Look after', 'Health, backups, releases']],
  meta,
  toc: ['Signing in', 'The dashboard', 'Creating a new client', 'The client page', 'Domains — every type', 'Licence, edition and switches', 'Kiosks and the mobile app', 'Releases', 'Backups', 'Jobs, activity and the handover sheet', 'Quick reference'],
  body: `
<h2>Signing in</h2>
<p>Open the console address (for example <code>https://admin.binishaqsoft.com</code>) and sign in with your email and password. Every account needs an authenticator app (Google Authenticator, Microsoft Authenticator or similar):</p>
${steps(['<b>First sign-in:</b> the console shows a QR code. Scan it with the authenticator app and type the 6-digit code.', '<b>Every sign-in after that:</b> email, password, then the current 6-digit code.', 'After 5 wrong passwords the account is locked for 15 minutes. A session lasts 12 hours; <b>Sign out</b> is at the bottom of the menu.'])}
${table(['Role', 'Can do'], [['<b>Owner</b>', 'Everything, including provider users, the template database and archiving clients'], ['<b>Operator</b>', 'Create clients, domains, licences, kiosk codes, backups, releases'], ['<b>Viewer</b>', 'Look at everything, change nothing']], ['22%'])}

<h2>The dashboard</h2>
${fig(shot('dashboard'), 'Dashboard: totals, items that need attention and every client with its health, licence, kiosks and last backup.')}
<p>The tiles count active clients, installations that do not answer, active employees across all clients and open alerts. <b>Needs attention</b> lists what to do now, for example a job waiting for you, an expiring licence, a certificate or domain registration about to expire, a client that is down, or a missing nightly backup. Click a client row (or <b>Open</b>) to go to its page. <b>Check health now</b> refreshes every client immediately; it also runs automatically every 10 minutes.</p>

<h2>Creating a new client</h2>
<p>Menu → <b>New client</b>. One form is enough; the console does the rest.</p>
${fig(shot('new-client'), 'New client: company, address name, first administrator, edition and licence.')}
${table(['Field', 'What to enter'], [
  ['Company name', 'The client\'s name as it appears in the app and on payslips.'],
  ['Address name', 'Filled in from the name; becomes <code>https://&lt;name&gt;.binishaqsoft.com</code>. Lowercase letters, digits and dashes. It cannot be changed later, so keep it short (e.g. <code>binishaq</code>).'],
  ['First administrator', 'Name and email of the client\'s main user. A temporary password is created and shown once.'],
  ['Edition', '<b>Full compliance</b> (FBR, EOBI, social security, PF, gratuity, bank payroll, approvals) or <b>Lite</b> (small shops, cash payroll, no FBR data).'],
  ['Licence', 'Plan name, end date (empty = no end) and the active staff limit (empty = unlimited).'],
  ['Data import', 'Tick when the client will move data from CyberAP themselves (see the Client Data Migration Guide).'],
  ['Release', 'The application version to run; normally the newest.'],
], ['26%'])}
<p>Press <b>Create client</b>. The job page opens and shows each step live:</p>
${fig(shot('job'), 'The setup job. Green = done; the hand = something to do in aaPanel; red = failed (press Retry).')}
${table(['Step', 'What happens'], [
  ['Create the database', 'A copy of the template database (all tables, default roles, FBR tax slabs) with its own PostgreSQL login. Takes seconds.'],
  ['Client folder and settings', 'The client\'s folder with its settings file, encryption keys, document and backup folders.'],
  ['Bring the database up to the release', 'Any database changes newer than the template.'],
  ['Company, administrator, edition and licence', 'The company record, the first administrator and the chosen settings.'],
  ['aaPanel Node project and domain mapping', 'Creates the site in aaPanel. If the aaPanel API is not connected, the step shows exactly what to click and type.'],
  ['HTTPS', 'Deploys the wildcard certificate to the new site.'],
  ['Check that the installation answers', 'Calls the new installation and confirms it is live.'],
], ['34%'])}
${note('When a step shows a hand (waiting for you)', 'Do what the box says in aaPanel (each value has a Copy button), then press <b>Mark done</b>. If it needs a moment (for example DNS), press <b>Retry</b> later. You can leave the page; the job waits.', 'warn')}
${note('The temporary administrator password', 'When the job finishes, press <b>Show password</b>, give it to the client by phone or in person (not in the same email as the address), then press <b>I have handed it over: delete it</b>. The client must change it at first sign-in.')}

<h2>The client page</h2>
${fig(shot('client-overview'), 'Client overview: open job, health, staff, attendance today, database size, addresses and technical details.')}
<p>The header shows status, licence, the platform address, edition, release and port, with <b>Handover sheet</b> and <b>Restart</b>. The tabs are explained below. Every action you take here is recorded in the activity log.</p>

<h2>Domains — every type</h2>
<p>Every client always has its platform address <code>&lt;name&gt;.binishaqsoft.com</code>. It works from the first minute (wildcard DNS and certificate) and can never be removed, because <b>kiosks and the mobile app always use it</b>. If a client's own DNS breaks, attendance still works. A client's own domain is extra, for people opening the system in a browser.</p>
${table(['Type', 'Example', 'What the client does', 'Advice'], [
  ['<b>Their subdomain</b>', '<code>hr.company.com</code>', 'One CNAME record → <code>&lt;name&gt;.binishaqsoft.com</code>', '<b>Recommended.</b> Set once; a server move needs nothing from the client; their website and email are untouched.'],
  ['<b>Root domain</b>', '<code>company.com</code>', 'An A record → the server IP (or ALIAS/flattened CNAME where the DNS provider supports it), plus <code>www</code>', 'Only if nothing else is on the domain: it replaces their website. A server move needs the client to update the record.'],
  ['<b>Dedicated domain, nameservers to us</b>', '<code>companyhr.com</code>', 'Changes the domain\'s nameservers to ours, once', 'Best for a domain bought just for HR: we manage every record; the client cannot break it.'],
  ['<b>Platform only</b>', '<code>name.binishaqsoft.com</code>', 'Nothing', 'Default for small and Lite clients.'],
], ['18%', '20%', '30%'])}
${fig(shot('client-domains'), 'Domains tab: add a domain; the console detects its type and shows the records to create.')}
${steps([
  'Domains tab → type the domain → choose, for a root domain, whether the client adds an A record or points the nameservers to us → <b>Add domain</b>. The console works out the type by itself and warns when a root domain would replace a website.',
  'Click the document icon next to the domain: a printable <b>DNS instruction sheet</b> for the client\'s IT opens (Print → Save as PDF). Send it to them.',
  'The connection job waits at "DNS points at this server". After the client has added the record, press <b>Retry</b> (DNS can take minutes to a few hours).',
  'The console then maps the domain in aaPanel, issues a Let\'s Encrypt certificate, allows the address in the application (no restart) and checks HTTPS. Manual steps work as in client setup.',
  'Status <b>active</b> = live. The star makes a domain the <b>primary</b> address (used in emails and on the handover sheet). The bin removes it.',
])}
<p>Every night the console re-checks each domain: DNS still pointing here, certificate valid for at least 15 more days, and registration not expiring within 30 days. Problems appear on the dashboard.</p>

<h2>Licence, edition and switches</h2>
${fig(shot('client-licence'), 'Licence & edition: plan, end date, staff limit, grace, automatic suspension, edition features.')}
${bullets([
  '<b>Valid until / grace days:</b> users see a warning from 14 days before the end date. After the end date the grace period runs; when it ends the installation is suspended automatically (untick "Suspend automatically" to suspend only by hand).',
  '<b>Active staff limit:</b> the client cannot make more employees active than the limit; they get a clear message.',
  '<b>Suspend now / Resume:</b> takes effect within 15 seconds. Suspended: nobody can sign in and the message you entered is shown. <b>Kiosks keep recording attendance</b>, so no punches are lost.',
  '<b>Edition:</b> Full or Lite, and each feature can be switched individually.',
  '<b>Client data import:</b> lets the client\'s IT import their CyberAP data themselves. Switch it off after go-live.',
  'Press <b>Save changes</b>; the client sees changes within 15 seconds.',
])}

<h2>Kiosks and the mobile app</h2>
${fig(shot('client-devices'), 'Kiosk setup codes and the mobile app connection code.')}
<h3>Kiosk setup codes</h3>
${steps(['Enter a label (e.g. "Main gate"), how many kiosks may use the code and how many hours it is valid → <b>Create setup code</b>.', 'The code and its QR are shown <b>once</b>: copy or print them.', 'On the kiosk PC: Settings → Server registration → <b>Setup code</b> → paste it (the kiosk shows the client name and server first) → Register.', 'Used, expired and revoked codes are listed; an unused code can be revoked.'])}
<p>No account password is typed at the branch. The code carries the platform address (and the client\'s domain as a fallback); the kiosk switches automatically if one address stops answering.</p>
<h3>Mobile app connection code</h3>
<p>Employees install the HR app and, on its first screen, scan or type the company connection code (or the company address). The code holds only addresses; employees still sign in with their own account. Print it for the client's notice board.</p>

<h2>Releases</h2>
${fig(shot('client-releases'), 'Releases: the version this client runs, and switching to another.')}
<p>Choose a release → <b>Switch release</b>. The job takes a safety backup, switches, runs the database changes, restarts the client and checks it answers. Try a new release on one client first; if something is wrong, switch back the same way.</p>

<h2>Backups</h2>
${fig(shot('client-backups'), 'Backups: history and files. Back up now runs one immediately.')}
<p>Each client is backed up every night (encrypted with the client's own key). <b>Back up now</b> runs one at once, for example before a big change. Restoring is an Admin task (see the Admin Guide).</p>

<h2>Jobs, activity and the handover sheet</h2>
${bullets(['<b>Jobs:</b> every setup, domain connection and release switch with its steps; open one to continue or retry it.', '<b>Activity:</b> who did what for this client (all clients: menu → Activity log).', '<b>Handover sheet:</b> a printable welcome page for the client: addresses, first steps, licence. It contains no password.'])}

<h2>Quick reference</h2>
${table(['I want to…', 'Where'], [
  ['Set up a new client', 'New client → fill in → Create client → finish manual steps → hand over the password'],
  ['Give a client their own domain', 'Client → Domains → Add domain → send the DNS sheet → Retry after DNS is added'],
  ['Register a kiosk', 'Client → Kiosks & app → Create setup code → paste it on the kiosk'],
  ['Connect phones', 'Client → Kiosks & app → print the mobile connection code'],
  ['Renew a licence', 'Client → Licence & edition → new end date → Save'],
  ['Stop access (unpaid)', 'Client → Licence & edition → Suspend now'],
  ['Let the client import CyberAP data', 'Client → Licence & edition → Client data import → Save'],
  ['Upgrade a client', 'Client → Releases → choose → Switch release'],
  ['Back up before a change', 'Client → Backups → Back up now'],
  ['See what happened', 'Activity log (all) or client → Activity'],
], ['36%'])}
`,
};

// ═══════════════════════════════════════════════════════════════════════════ ADMIN GUIDE
const adminGuide = {
  file: 'OneNet-Provider-Console-Admin-Guide',
  title: 'OneNet Provider Console — Admin Guide',
  footer: 'OneNet Provider Console · Admin guide',
  tag: 'OneNet · Admin guide',
  coverTitle: 'Provider Console<br>Admin Guide',
  subtitle: 'For the console owner: security model, provider users, template database, release roll-out, backup and restore, licensing policy, client lifecycle and troubleshooting.',
  meta,
  toc: ['How the hosting works', 'Security model', 'Provider users', 'Server, template database and releases', 'Rolling out a new release', 'Backups and restoring a client', 'Licences and suspension', 'Client data import (self-service)', 'Client lifecycle: archive and delete', 'Monitoring and scheduled tasks', 'Self-hosted clients', 'Security checklist', 'Troubleshooting'],
  body: `
<h2>How the hosting works</h2>
${table(['Part', 'Where', 'Notes'], [
  ['Application code (a "release")', '<code>/www/hr-releases/&lt;release&gt;/</code>', 'One complete copy per version, shared by every client on it. No copying per client.'],
  ['A client', '<code>/www/hr-clients/&lt;name&gt;/</code>', '<code>.env</code> (settings and keys, mode 600), <code>start.cjs</code>, <code>release.json</code>, <code>documents/</code>, <code>imports/</code>.'],
  ['Its database', 'PostgreSQL <code>hr_&lt;name&gt;</code>', 'Own login role. Copied from the template database.'],
  ['Its site', 'aaPanel Node project <code>hr-&lt;name&gt;</code>', 'Port from 9101 up, bound to 127.0.0.1; nginx publishes it on 443.'],
  ['Its backups', '<code>/www/hr-backups/&lt;name&gt;/</code>', 'Encrypted with the client\'s own BACKUP_ENCRYPTION_KEY.'],
  ['The console', '<code>/www/hr-provider/</code> + database <code>hr_provider</code>', 'Its own aaPanel Node project (port 8200) at admin.binishaqsoft.com.'],
], ['26%', '34%'])}
<p>Every client has its own database: one client's data can never appear in another's. Backups, restores, moving a client to its own server and deleting a client's data at contract end each concern one database.</p>

<h2>Security model</h2>
${bullets([
  '<b>Data boundary:</b> the console writes only installation settings into a client database (edition, licence, domains, the import switch, the company record, the first administrator and kiosk setup codes) and reads only counts for health. It never reads or changes employees, attendance or payroll.',
  '<b>Sign-in:</b> email + password + authenticator app (mandatory). 5 wrong passwords lock the account for 15 minutes. Sessions last 12 hours (PROVIDER_SESSION_HOURS) in an httpOnly, SameSite=Strict cookie; every change also needs the console\'s request header, which blocks cross-site requests.',
  '<b>Secrets:</b> authenticator secrets and one-time passwords are encrypted with MFA_ENCRYPTION_KEY. A client\'s temporary administrator password is stored encrypted only until the operator presses "I have handed it over". Database passwords live only in the client\'s .env.',
  '<b>Hosted installations</b> cannot be claimed from the web (the first-admin setup screen is switched off) and the vendor console with the daily password is disabled (VENDOR_CONSOLE_DISABLED=true).',
  '<b>Audit:</b> every action is written to the activity log with the person and their IP address; the client\'s own audit log also records kiosk codes, data imports and licence changes.',
])}

<h2>Provider users</h2>
${fig(shot('users'), 'Provider users: roles, authenticator status, reset and disable.')}
${bullets(['Add a user with a temporary password (12+ characters) and give it in person; they set up the authenticator at first sign-in.', '<b>Reset authenticator</b> when someone loses their phone: they enrol again at the next sign-in.', '<b>Disable</b> ends every session of that user at once. You cannot disable yourself or remove your own owner role; keep at least two owners.', 'The first owner is created on the server: <code>node …/provider/cli.cjs create-owner you@onenet.pk "Your Name"</code> (see the Hosting Setup Guide).'])}

<h2>Server, template database and releases</h2>
${fig(shot('settings'), 'Server & releases: hosting settings, aaPanel connection, template database, releases and scheduled tasks.')}
<p><b>aaPanel API:</b> when connected, creating projects, mapping domains and issuing certificates is automatic. When it is not (or an aaPanel version answers differently), those steps become checklists with exact values; nothing fails silently. Always try a new aaPanel version with a throw-away client first.</p>
<p><b>Template database:</b> new client databases are copied from it. Refresh it (owner only) after installing a new release, so new clients start on the newest structure.</p>

<h2>Rolling out a new release</h2>
${steps([
  'Install the release folder on the server (Hosting Setup Guide, "Install a new release"). It appears under Releases as <b>ready</b> once <code>node_modules</code> and the built web files exist.',
  'Server & releases → <b>Refresh template</b>.',
  'Pick one client (ideally your own test client) → Releases → <b>Switch release</b>. The job backs up, switches, migrates, restarts and checks.',
  'Check that client in the browser and on a kiosk. Then switch the other clients, a few at a time.',
  'To go back: switch the client to the previous release. Database changes are designed to be backward compatible; if one is not, restore the backup taken by the switch job.',
  'Upgrade the console itself: point <code>/www/hr-releases/current</code> at the new release and restart the <code>provider</code> project in aaPanel.',
])}

<h2>Backups and restoring a client</h2>
<p>Nightly backups run from aaPanel Cron (<code>cli.cjs nightly</code>); each is encrypted with the client\'s own key and the newest 14 are kept (BACKUP_RETENTION_COUNT in the client\'s .env). aaPanel\'s directory backup copies <code>/www/hr-backups</code> off the server.</p>
${note('Keep the keys off the server', 'A backup can only be restored with the BACKUP_ENCRYPTION_KEY from that client\'s .env. Keep an encrypted copy of every client\'s .env (or at least BACKUP_ENCRYPTION_KEY and MFA_ENCRYPTION_KEY) somewhere other than this server.', 'warn')}
<h3>Restore a client backup</h3>
${steps([
  'aaPanel → Website → Node Project → <code>hr-&lt;name&gt;</code> → <b>Stop</b>.',
  'aaPanel → Terminal:',
])}
${pre(`cd /www/hr-clients/&lt;name&gt;
CONFIRM_DATABASE_RESTORE=RESTORE_HR_PAYROLL_DATABASE \\
  node /www/hr-releases/$(node -p "require('./release.json').release")/scripts/postgres-restore.cjs \\
  /www/hr-backups/&lt;name&gt;/hr-payroll-&lt;date&gt;.dump.enc`)}
${steps(['Start the project again in aaPanel and check the client. Record the restore in the client\'s notes.'])}
<p>The restore replaces the whole client database with the backup. Anything entered after the backup is lost, so agree the time with the client.</p>

<h2>Licences and suspension</h2>
${table(['State', 'When', 'Effect'], [
  ['Active', 'Before the last 14 days', 'Normal.'],
  ['Expiring', 'Last 14 days', 'Users see a yellow warning with the end date.'],
  ['Grace', 'After the end date, for the grace days', 'Red warning with the days left; everything still works.'],
  ['Suspended', 'Grace over (automatic) or "Suspend now"', 'Nobody can sign in; your message is shown. Kiosks keep recording punches. Resume restores access within 15 seconds.'],
], ['16%', '34%'])}
<p>The <b>staff limit</b> stops a client making more employees active than their plan allows; existing data is never removed. Renewing = new end date + Save.</p>

<h2>Client data import (self-service)</h2>
<p>When the switch is on, the client's Super Admin (or a user with the "Data import" permission) gets <b>Data Import</b> in their menu and moves their CyberAP data without OneNet. Safety rails in the application:</p>
${bullets(['Analyse first (no changes). The import never overwrites attendance the new system already recorded.', '"Remove all current data first" needs the typed confirmation <b>and</b> the user\'s password, and takes a full encrypted backup automatically before deleting anything; without working backups the wipe is refused.', 'Once the client is live (a payroll paid or an attendance month locked) the wipe is refused permanently; only "keep current data" imports are possible.'])}
<p>Switch it on during onboarding and off after go-live. The procedure for the client is in the <i>CyberAP Data Migration Guide</i>.</p>

<h2>Client lifecycle: archive and delete</h2>
${bullets([
  '<b>Archive</b> (owner): stops the aaPanel project and hides the client from daily checks. Database, files and backups stay. <b>Restore from archive</b> starts it again.',
  '<b>Permanent deletion</b> is deliberately not a button. After the contract\'s retention period, and after giving the client an export if required: delete the aaPanel project; in PostgreSQL <code>DROP DATABASE hr_&lt;name&gt;; DROP ROLE hr_&lt;name&gt;;</code>; remove <code>/www/hr-clients/&lt;name&gt;</code> and, when no longer required, <code>/www/hr-backups/&lt;name&gt;</code>. Record it in the client notes first.',
])}

<h2>Monitoring and scheduled tasks</h2>
${table(['Task (aaPanel Cron)', 'Schedule', 'Does'], [
  ['<code>cli.cjs nightly</code>', 'Daily 02:00', 'Backs up every active client, re-checks every domain (DNS, certificate, registration) and health. Exit code 2 when something needs attention.'],
  ['<code>cli.cjs health</code>', 'Every 10 minutes', 'Answers, response time, database size, active staff, attendance today, kiosks online.'],
], ['30%', '18%'])}
<p>Set aaPanel to notify you when a Cron task fails (aaPanel → Cron → notification), and look at the dashboard\'s "Needs attention" every morning.</p>

<h2>Self-hosted clients</h2>
<p>A client on their own server is not in the console. For them the vendor console still exists (login <code>onenet</code> with the daily password): <b>Edition</b> and <b>Installation &amp; licence</b> (client data import switch, licence, suspend). On hosted installations it is disabled.</p>

<h2>Security checklist</h2>
${checks(['At least two owners, each with an authenticator; no shared accounts.', 'admin.binishaqsoft.com restricted in aaPanel to OneNet IP addresses where possible.', 'Client ports (9101+) and 8200 not opened in the firewall; only 80/443 public, aaPanel port restricted.', 'An off-server copy of every client\'s keys and of the console\'s .env.', 'Nightly Cron enabled with failure notifications; off-server copy of /www/hr-backups.', 'Temporary administrator passwords deleted after handover (the job page reminds you).', 'Data import switched off for clients that are live.', 'Disable provider users who leave OneNet the same day.'])}

<h2>Troubleshooting</h2>
${table(['Problem', 'Cause and fix'], [
  ['A setup step shows the hand with "aaPanel API is not configured"', 'Do the step in aaPanel with the values shown, then Mark done; or connect the API (Hosting Setup Guide, step 8).'],
  ['Health: "App: ECONNREFUSED"', 'The client\'s project is stopped or crashed. aaPanel → Node Project → hr-&lt;name&gt; → Start; open its log for the error (often a wrong value in its .env).'],
  ['"Database: password authentication failed"', 'The client\'s role password differs from its .env. Re-run the setup job\'s database step (Retry) or set the password in PostgreSQL to the one in the .env.'],
  ['Domain stays "pending dns"', 'The record is missing or wrong. Open the DNS sheet, compare with the client\'s DNS panel (common: the panel wants only "hr" as the name). Retry after fixing.'],
  ['Domain: "HTTPS: certificate has expired / not trusted"', 'Let\'s Encrypt renewal failed in aaPanel (DNS changed, port 80 blocked). aaPanel → site → SSL → renew; then Retry the domain job.'],
  ['Release switch: "does not answer after the switch"', 'Check the project log. Switch back to the previous release; restore the switch job\'s backup if a migration failed.'],
  ['Backup failed: "could not start pg_dump"', 'PG_DUMP_PATH in the client\'s .env does not exist: set PG_BIN_DIR in the console\'s .env to the server\'s PostgreSQL bin folder and fix the client\'s .env.'],
  ['Kiosk: "setup code invalid, expired or already used"', 'Create a new code (codes are single-use by default and expire).'],
  ['Users of a client cannot sign in, message about suspension', 'Licence suspended (by hand or after the grace period). Renew or Resume.'],
  ['Locked out of the console', 'Another owner resets your authenticator. If no owner can sign in: on the server, create a new owner with cli.cjs create-owner.'],
], ['36%'])}
`,
};

// ═══════════════════════════════════════════════════════════════════════════ HOSTING SETUP GUIDE
const hostingGuide = {
  file: 'OneNet-Provider-Console-Hosting-Guide',
  title: 'OneNet Provider Console — Hosting Setup Guide',
  footer: 'OneNet Provider Console · Hosting setup (aaPanel)',
  tag: 'OneNet · Hosting setup',
  coverTitle: 'Provider Console<br>Hosting Setup Guide',
  subtitle: 'Set up your Ubuntu 24.04 + aaPanel server once to host many HR & Payroll clients: wildcard domain and certificate, PostgreSQL, releases, the console, the aaPanel API, scheduled tasks and off-server backups.',
  flow: [['1 · DNS + SSL', '*.binishaqsoft.com, once'], ['2 · Database', 'PostgreSQL in aaPanel'], ['3 · Code', 'Release folder + console'], ['4 · Automate', 'aaPanel API, Cron, backups']],
  meta,
  toc: ['What you are building', 'Requirements and sizing', 'Step 1 — Wildcard DNS', 'Step 2 — Wildcard certificate', 'Step 3 — PostgreSQL', 'Step 4 — Folders', 'Step 5 — Install the first release', 'Step 6 — The console project', 'Step 7 — First owner and sign-in', 'Step 8 — aaPanel API', 'Step 9 — Template database', 'Step 10 — Scheduled tasks', 'Step 11 — Off-server backups', 'Step 12 — Firewall', 'Step 13 — First test client', 'Install a new release', 'Kiosk and mobile app builds', 'Troubleshooting'],
  body: `
<h2>What you are building</h2>
${table(['Address', 'Served by', 'aaPanel'], [
  ['<code>admin.binishaqsoft.com</code>', 'Provider Console (port 8200)', 'Node project <code>provider</code>, directory /www/hr-provider'],
  ['<code>&lt;client&gt;.binishaqsoft.com</code>', 'That client\'s installation (port 9101, 9102, …)', 'Node project <code>hr-&lt;client&gt;</code>, created by the console'],
  ['<code>hr.clientcompany.com</code> (optional)', 'Same client installation', 'Extra domain on its project, Let\'s Encrypt certificate'],
], ['34%', '30%'])}
<p>Everything is done in aaPanel: Node versions in its Node version manager, sites as aaPanel Node projects, domains through Mapping, HTTPS through its SSL, databases on its Databases page and scheduled tasks in its Cron. The existing <code>attendance.binishaqsoft.com</code> keeps running as it is.</p>

<h2>Requirements and sizing</h2>
${table(['Item', 'Needed'], [
  ['Server', 'Ubuntu 24.04 with aaPanel (as now). Public IP; ports 80 and 443 open.'],
  ['Node.js', 'v20 LTS installed with aaPanel → App Store → Node.js version manager.'],
  ['PostgreSQL', '15 or 16 from aaPanel → App Store (PostgreSQL manager).'],
  ['Git', '<code>git</code> (present on Ubuntu; else aaPanel Terminal: <code>apt install git</code>).'],
  ['Memory', 'About 200–250 MB RAM per client process + 300 MB for PostgreSQL per few clients. 8 GB RAM ≈ 20–25 clients.'],
  ['Disk', 'About 1.5 GB per 1 million attendance days, plus 14 backups per client and one release (~600 MB) per version.'],
], ['22%'])}
${note('Large clients', 'A client with 500+ active staff makes manager browsers reload attendance often. Enable gzip for JSON in nginx (aaPanel → Website → site → Config: <code>gzip_types application/json</code>) and watch CPU and bandwidth on the dashboard.', 'warn')}

<h2>Step 1 — Wildcard DNS</h2>
<p>At the DNS provider of <code>binishaqsoft.com</code> create (once):</p>
${table(['Type', 'Name', 'Value'], [['A', '<code>*</code> (i.e. *.binishaqsoft.com)', 'your server IP'], ['A', '<code>admin</code>', 'your server IP (optional: the wildcard covers it)']])}
<p>Existing records such as <code>attendance</code> and <code>mcs</code> keep working: a specific record always wins over the wildcard.</p>

<h2>Step 2 — Wildcard certificate</h2>
${steps([
  'aaPanel → Website → add the console site first (Step 6) or any site on the domain, then → <b>SSL</b> → <b>Let\'s Encrypt</b>.',
  'Choose <b>DNS verification</b> with your DNS provider\'s API (e.g. Cloudflare: API token), and request <code>*.binishaqsoft.com</code> and <code>binishaqsoft.com</code>.',
  'aaPanel stores the files under <code>/www/server/panel/vhost/cert/&lt;site&gt;/</code> (<code>fullchain.pem</code>, <code>privkey.pem</code>) and renews them automatically. Note the exact paths for <code>WILDCARD_CERT_PATH</code> and <code>WILDCARD_KEY_PATH</code> (Step 6).',
])}
<p>Client domains (their own) do not use this certificate; the console requests a Let\'s Encrypt certificate per domain.</p>

<h2>Step 3 — PostgreSQL</h2>
${steps([
  'aaPanel → Databases → <b>PgSQL</b> → Add database: name <code>hr_provider</code>, user <code>provider</code>, a strong password. This is the console\'s own database (no HR data).',
  'Note the PostgreSQL administrator password (PgSQL → root password / postgres). The console uses it to create one role and one database per client: <code>PG_ADMIN_URL</code>.',
  'Find the PostgreSQL tools folder: aaPanel → Terminal → <code>ls /www/server/pgsql/bin</code> (it must contain <code>pg_dump</code> and <code>pg_restore</code>): <code>PG_BIN_DIR</code>.',
])}

<h2>Step 4 — Folders</h2>
${pre(`mkdir -p /www/hr-releases /www/hr-clients /www/hr-backups /www/hr-provider
chown -R www:www /www/hr-releases /www/hr-clients /www/hr-backups /www/hr-provider
chmod 750 /www/hr-clients /www/hr-provider && chmod 700 /www/hr-backups`)}

<h2>Step 5 — Install the first release</h2>
<p>A release is one complete copy of the application. Name it by date, e.g. <code>2026.11.1</code>. In aaPanel → Terminal (use the npm of the aaPanel Node version, e.g. <code>/www/server/nodejs/v20.18.0/bin/npm</code>, if <code>npm</code> is not on the PATH):</p>
${pre(`cd /www/hr-releases
git clone &lt;your repository&gt; 2026.11.1      <span class="c"># or upload a zip with aaPanel → Files and extract</span>
cd 2026.11.1
git checkout &lt;tag or branch&gt;
npm ci
npm run build                 <span class="c"># the HR web app (dist/)</span>
npm run provider:build        <span class="c"># the console web app (provider/dist/)</span>
ln -sfn /www/hr-releases/2026.11.1 /www/hr-releases/current
chown -R www:www /www/hr-releases`)}
${note('No server address in the build', 'Do not place a <code>.env.local</code> with <code>VITE_API_BASE_URL</code> in a release folder: hosted builds must use relative addresses so one build serves every client domain.', 'bad')}

<h2>Step 6 — The console project</h2>
<p>Create <code>/www/hr-provider/.env</code> from <code>provider/.env.example</code> of the release (aaPanel → Files), mode 600:</p>
${table(['Setting', 'Value'], [
  ['PROVIDER_PUBLIC_URL', '<code>https://admin.binishaqsoft.com</code>'],
  ['PROVIDER_DATABASE_URL', '<code>postgresql://provider:&lt;password&gt;@127.0.0.1:5432/hr_provider</code>'],
  ['PG_ADMIN_URL', '<code>postgresql://postgres:&lt;admin password&gt;@127.0.0.1:5432/postgres</code>'],
  ['PG_BIN_DIR', 'from Step 3, e.g. <code>/www/server/pgsql/bin</code>'],
  ['MFA_ENCRYPTION_KEY', 'output of <code>openssl rand -base64 32</code> (keep a copy off the server)'],
  ['BASE_DOMAIN / SERVER_IP', '<code>binishaqsoft.com</code> / your public IP'],
  ['CLIENTS_ROOT / RELEASES_ROOT / BACKUP_ROOT', '<code>/www/hr-clients</code>, <code>/www/hr-releases</code>, <code>/www/hr-backups</code>'],
  ['WILDCARD_CERT_PATH / WILDCARD_KEY_PATH', 'from Step 2'],
  ['AAPANEL_*', 'Step 8 (can stay empty at first)'],
  ['SMTP_*', 'default mail settings copied into each new client'],
], ['38%'])}
<p>Create <code>/www/hr-provider/start.cjs</code>:</p>
${pre(`process.chdir(__dirname);
require('/www/hr-releases/current/provider/server.cjs');`)}
${steps([
  'aaPanel → Website → <b>Node Project</b> → Add: name <code>provider</code>, directory <code>/www/hr-provider</code>, startup file <code>start.cjs</code>, port <code>8200</code>, Node v20, run user <code>www</code>, start with system.',
  'Domain (Mapping): <code>admin.binishaqsoft.com</code> → Save → Start.',
  'SSL: deploy the wildcard certificate (or Let\'s Encrypt for admin.binishaqsoft.com) and switch on <b>Force HTTPS</b>.',
  'Recommended: restrict the site to OneNet IP addresses (site → Config / access restriction).',
])}

<h2>Step 7 — First owner and sign-in</h2>
${pre(`cd /www/hr-provider
node /www/hr-releases/current/provider/cli.cjs create-owner you@onenet.pk "Your Name"`)}
<p>It prints a temporary password. Open <code>https://admin.binishaqsoft.com</code>, sign in, scan the QR code with your authenticator app and confirm the code. Add a second owner under Provider users.</p>

<h2>Step 8 — aaPanel API</h2>
${steps([
  'aaPanel → Settings → <b>API interface</b> → enable.',
  'IP whitelist: add <code>127.0.0.1</code> and the server\'s own IP.',
  'Copy the API key into <code>AAPANEL_API_KEY</code>; set <code>AAPANEL_URL=https://127.0.0.1:&lt;aaPanel port&gt;</code> and <code>AAPANEL_INSECURE_TLS=true</code> (aaPanel\'s own certificate). Set <code>AAPANEL_NODE_VERSION</code> to the exact version name shown in the Node version manager.',
  'Restart the <code>provider</code> project. Server &amp; releases must show <b>Connected</b>.',
])}
${note('Test it once with a throw-away client', 'aaPanel versions differ in their API. Create a test client: if a step (Node project, domain, certificate) does not work through the API, it turns into a checklist with exact values, so setup still completes. Tell OneNet development which step needed manual work.', 'warn')}

<h2>Step 9 — Template database</h2>
<p>Console → Server &amp; releases → <b>Create template</b> (or <code>cd /www/hr-provider &amp;&amp; node /www/hr-releases/current/provider/cli.cjs refresh-template</code>). It takes a few seconds.</p>

<h2>Step 10 — Scheduled tasks</h2>
<p>aaPanel → <b>Cron</b> → Add task → type <b>Shell script</b>, run as root or www:</p>
${table(['Name', 'Schedule', 'Script'], [
  ['HR provider nightly', 'Daily 02:00', '<code>cd /www/hr-provider &amp;&amp; /www/server/nodejs/v20.18.0/bin/node /www/hr-releases/current/provider/cli.cjs nightly</code>'],
  ['HR provider health', 'Every 10 minutes', '<code>cd /www/hr-provider &amp;&amp; /www/server/nodejs/v20.18.0/bin/node /www/hr-releases/current/provider/cli.cjs health</code>'],
], ['22%', '16%'])}
<p>Switch on aaPanel\'s notification for failed tasks.</p>

<h2>Step 11 — Off-server backups</h2>
${steps([
  'aaPanel → App Store: install a cloud storage plugin (S3-compatible, Google Drive, FTP…) and connect it.',
  'aaPanel → Cron → <b>Backup directory</b>: <code>/www/hr-backups</code>, daily 03:00, to that storage, keep 14.',
  'aaPanel → Cron → <b>Backup database</b>: <code>hr_provider</code>, daily.',
  'Keep an encrypted copy of <code>/www/hr-provider/.env</code> and of every <code>/www/hr-clients/*/.env</code> off the server (they hold the keys that decrypt backups).',
])}

<h2>Step 12 — Firewall</h2>
<p>aaPanel → Security: allow only 22 (SSH, ideally restricted), 80, 443 and the aaPanel port (restricted to your IP). Never open 8200 or 9101+: the applications listen on 127.0.0.1 and are published by nginx.</p>

<h2>Step 13 — First test client</h2>
${steps(['Console → New client → name "OneNet Test", address <code>test1</code> (any free name), your own email, Lite edition.', 'Follow the job to the end (Mark done for any manual step).', 'Open <code>https://test1.binishaqsoft.com</code>, sign in with the temporary password, change it.', 'Create a kiosk setup code and register a kiosk; connect the mobile app with the connection code.', 'Back up now; check the dashboard shows the client as Up. Archive the test client when done.'])}

<h2>Install a new release</h2>
${pre(`cd /www/hr-releases
git clone &lt;your repository&gt; 2026.12.1 &amp;&amp; cd 2026.12.1 &amp;&amp; git checkout &lt;tag&gt;
npm ci &amp;&amp; npm run build &amp;&amp; npm run provider:build
chown -R www:www /www/hr-releases/2026.12.1`)}
<p>Then in the console: Refresh template → switch one client → then the others (Admin Guide, "Rolling out a new release"). To upgrade the console itself: <code>ln -sfn /www/hr-releases/2026.12.1 /www/hr-releases/current</code> and restart the <code>provider</code> project. Old release folders can be deleted once no client uses them.</p>

<h2>Kiosk and mobile app builds</h2>
${bullets(['<b>Kiosk:</b> build the Windows kiosk from the same release (<code>npm run kiosk:build</code>). A kiosk built from this release (or later) registers with setup codes and switches to the fallback address automatically; older kiosks still register with a Kiosk Terminal account. Leave PORTAL_URL empty or set to a default; the setup code decides the server.', '<b>Mobile app:</b> build once without <code>VITE_API_BASE_URL</code>. On first launch it asks for the company connection code, so one app in the Play Store serves every client.'])}

<h2>Troubleshooting</h2>
${table(['Problem', 'Fix'], [
  ['Console page: "Provider Console web files are missing"', '<code>npm run provider:build</code> was not run in the release used by /www/hr-releases/current.'],
  ['Console does not start: "configuration is missing"', '/www/hr-provider/.env missing a value (PROVIDER_DATABASE_URL, PG_ADMIN_URL, MFA_ENCRYPTION_KEY), or start.cjs does not chdir to /www/hr-provider.'],
  ['Template: "permission denied to create database"', 'PG_ADMIN_URL must be the PostgreSQL administrator, not the provider user.'],
  ['New client site shows 502', 'Its Node project is stopped or crashed: aaPanel → Node Project → hr-&lt;client&gt; → log. Common: Node version mismatch with AAPANEL_NODE_VERSION.'],
  ['https://&lt;client&gt;.binishaqsoft.com certificate error', 'The wildcard certificate was not deployed to the project (SSL step) or has not renewed: aaPanel → site → SSL.'],
  ['Server &amp; releases: aaPanel "IP not in whitelist"', 'Add 127.0.0.1 and the server IP to the API whitelist.'],
  ['Release shows "not ready"', '<code>npm ci</code> or <code>npm run build</code> did not finish in that folder.'],
], ['40%'])}
`,
};

for (const guide of [userGuide, adminGuide, hostingGuide]) renderGuide(root, guide);
void esc;
