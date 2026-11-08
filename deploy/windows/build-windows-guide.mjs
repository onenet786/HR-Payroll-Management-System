#!/usr/bin/env node
// Renders docs/HR-Payroll-Windows-Server-Guide.pdf (installation and administration on the client's own Windows Server).
//   node deploy/windows/build-windows-guide.mjs     (or: npm run docs:windows-guide)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bullets, checks, note, pre, renderGuide, steps, table, today } from '../installer/guide-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

renderGuide(root, {
  file: 'HR-Payroll-Windows-Server-Guide',
  title: 'HR & Payroll on Windows Server — Installation and Administration Guide',
  footer: 'HR & Payroll · Windows Server guide',
  tag: 'OneNet · Self-hosted on Windows Server',
  coverTitle: 'HR &amp; Payroll<br>on Windows Server',
  subtitle: 'For your IT administrator: install HR &amp; Payroll on your own Windows Server 2019/2022 with its built-in database, make it reachable securely, back it up, update it and keep it healthy, next to your existing SQL Server.',
  flow: [['1 · Prepare', 'Server, address, HTTPS'], ['2 · Install', 'Setup.cmd, about 5 minutes'], ['3 · Secure', 'HTTPS, firewall, backups'], ['4 · Run', 'Status, updates, restore']],
  meta: [['Platform', 'Windows Server 2019 / 2022'], ['Database', 'Built-in PostgreSQL 16'], ['Issued', today]],
  toc: ['What gets installed', 'Requirements', 'Decisions before installing', 'Installing', 'Unattended installation', 'First sign-in and next steps', 'HTTPS', 'Network and access from outside', 'Running next to SQL Server and CyberAP', 'Daily administration', 'Backups', 'Restoring a backup', 'Updating', 'Licence and edition', 'Security checklist', 'Uninstalling', 'Troubleshooting', 'Appendix — folders and settings'],
  body: `
<h2>What gets installed</h2>
<p>Everything comes from one package (<code>HRPayroll-Windows-Setup-&lt;version&gt;.zip</code>). The server needs <b>no internet access</b> to install and nothing else has to be installed first.</p>
${table(['Part', 'What it is', 'Where'], [
  ['<b>HR Payroll Database</b> (service <code>HRPayrollDB</code>)', 'Built-in PostgreSQL 16 database engine. Listens <b>only on this server</b> (localhost), port 5433. Pre-tuned for an HR system (about 256 MB memory).', '<code>C:\\HRPayroll\\runtime\\pgsql</code>, data in <code>C:\\HRPayrollData\\pgdata</code>'],
  ['<b>HR Payroll Application</b> (service <code>HRPayrollApp</code>)', 'The HR &amp; Payroll web application (Node.js). Starts after the database, restarts by itself if it stops.', '<code>C:\\HRPayroll\\app\\&lt;version&gt;</code>'],
  ['<b>HR Payroll Nightly Backup</b> (scheduled task)', 'Encrypted database backup every night, 14 kept, optional copy to a network share.', '<code>C:\\HRPayrollData\\backups</code>'],
  ['Firewall rule "HR Payroll Application"', 'Opens the application port for Domain and Private networks only.', 'Windows Defender Firewall'],
  ['Tools', 'Status, backup, restore, update, uninstall scripts.', '<code>C:\\HRPayroll\\tools</code>'],
], ['30%', '42%'])}
<p>Both services run as the built-in <b>NETWORK SERVICE</b> account, not as an administrator. The settings folder (<code>C:\\HRPayroll\\config</code>) is readable only by Administrators, SYSTEM and the service.</p>

<h2>Requirements</h2>
${table(['Item', 'Minimum', 'Recommended'], [
  ['Windows', 'Windows Server 2019', 'Windows Server 2022 Standard, fully updated'],
  ['CPU / memory', '2 cores, 4 GB free RAM for HR &amp; Payroll', '4 cores, 8–16 GB total RAM (more if SQL Server shares the server)'],
  ['Disk', '5 GB free', 'SSD; data on a separate disk (e.g. <code>D:\\HRPayrollData</code>), 20 GB+ for 10 years of attendance and backups'],
  ['Rights', 'Local Administrator to install', '—'],
  ['Network', 'Static IP address', 'An internal DNS name, e.g. <code>hr.company.local</code> or <code>hr.company.com</code>'],
], ['20%', '34%'])}

<h2>Decisions before installing</h2>
${table(['Question', 'Options', 'Our advice'], [
  ['Address users open', '<code>http://SERVERNAME:8080</code> (works at once) · a DNS name such as <code>https://hr.company.com</code>', 'A DNS name with HTTPS. Browsers and the mobile app need HTTPS for camera, location and secure sign-in.'],
  ['HTTPS certificate', 'Free Let\'s Encrypt certificate for a domain you own (win-acme) · certificate from your company CA (PFX) · none (HTTP on the LAN only)', 'Let\'s Encrypt with a domain you own, pointed at the server\'s internal IP. See HTTPS.'],
  ['Who uses it from outside the office', 'Nobody (LAN only) · managers at home · mobile app on 4G', 'LAN + VPN for managers. Publish to the internet only with HTTPS and your firewall team.'],
  ['Backup copy', 'A network share or NAS', 'Yes: a copy off this server, e.g. <code>\\\\NAS01\\Backups\\HRPayroll</code>.'],
  ['Outgoing email', 'Your mail server / Microsoft 365 SMTP', 'Needed for payslip emails and password resets.'],
], ['22%', '44%'])}

<h2>Installing</h2>
${steps([
  'Copy <code>HRPayroll-Windows-Setup-&lt;version&gt;.zip</code> to the server and extract the <b>whole</b> zip, e.g. to <code>C:\\Setup\\HRPayroll</code>.',
  'Right-click <b>Setup.cmd</b> → <b>Run as administrator</b>.',
  'Answer the questions: company name, administrator email and name, edition (<b>full</b> with FBR/EOBI/PF/gratuity, or <b>lite</b> for a small business) and, if you have one, the address users will open.',
  'Choose the drives. Setup lists the server\'s disks with their free space and asks for the <b>program folder</b> (default <code>C:\\HRPayroll</code>, about 250 MB: application, database engine, settings) and the <b>data folder</b> (database, documents, backups, logs; it grows over time). For the data folder it suggests the non-system disk with the most free space, e.g. <code>D:\\HRPayrollData</code>. Press Enter to accept, type another folder, or type just a drive letter (e.g. <code>D</code>) to use the suggested folder name on that drive. Only local fixed disks are accepted (no network drives, USB sticks or drive roots).',
  'Setup shows a summary (company, administrator, program and data folders). Type <b>Y</b> to install or <b>N</b> to stop without changing anything.',
  'Setup checks the server (rights, free ports, disk), copies the files, creates the built-in database, the tables and the first administrator, starts both services, opens the firewall port, schedules the nightly backup and checks that the application answers. It takes about 5 minutes.',
  'At the end it shows the address, the administrator email and, if you did not choose one, a <b>generated password</b> (shown once). A summary without the password is saved in <code>C:\\HRPayroll\\config\\install-summary.txt</code>.',
])}
${note('Keep a copy of the settings file off the server', '<code>C:\\HRPayroll\\config\\.env</code> holds <b>BACKUP_ENCRYPTION_KEY</b>. Without it no backup can be restored. Copy the file to a safe place (password manager, encrypted USB stick in a safe) right after installation.', 'bad')}

<h2>Unattended installation</h2>
<p>For a repeatable install, copy <code>setup\\setup.config.example.psd1</code> to <code>setup.config.psd1</code>, fill it in and run (as Administrator) <code>Setup.cmd setup.config.psd1</code>. Delete the file afterwards: it may contain the administrator password.</p>
${table(['Setting', 'Default', 'Meaning'], [
  ['CompanyName, AdminName, AdminEmail, AdminPassword', '—', 'First administrator. Empty password = generated and shown once (minimum 12 characters).'],
  ['Edition', '<code>full</code>', '<code>full</code> or <code>lite</code>.'],
  ['EnableDataImport', '<code>$true</code>', 'Shows the Data Import screen for moving CyberAP data. Switch it off after go-live.'],
  ['InstallDir / DataDir', '<code>C:\\HRPayroll</code> / <code>C:\\HRPayrollData</code>', 'Program and data folders. Put the data on a separate disk if you can.'],
  ['PublicUrl', 'empty', 'The address users open, e.g. <code>https://hr.company.com</code>. Server name and IP addresses are always allowed too.'],
  ['AppPort / DbPort', '8080 / 5433', 'Application port (HTTP; with HTTPS it redirects) and the database port (localhost only).'],
  ['HttpsPfxPath + HttpsPfxPassphrase, or HttpsCertPath + HttpsKeyPath, HttpsPort', 'none / 443', 'Enables HTTPS (see HTTPS).'],
  ['BackupTime / BackupCopyTo', '01:30 / none', 'Nightly backup time and an optional folder or share for a copy.'],
  ['SmtpHost, SmtpPort, SmtpUser, SmtpPass, SmtpFrom', 'none', 'Outgoing email.'],
], ['34%', '22%'])}

<h2>First sign-in and next steps</h2>
${steps([
  'Open the address from the summary and sign in. <b>Change the password</b> (top right → profile) and switch on two-step verification.',
  'Company Setup: company details, branches, departments, designations, shifts and the attendance policy.',
  'Coming from CyberAP: menu <b>Data Import</b> → <b>Create package from SQL Server</b> (next sections and the <i>CyberAP Data Migration Guide</i>).',
  'Kiosks: install the attendance kiosk on each branch PC and register it with a <b>kiosk setup code</b> (Kiosk devices → Setup codes). The code contains this server\'s address.',
  'Mobile app: needs HTTPS and a reachable address. Employees enter your address (e.g. <code>hr.company.com</code>) on the app\'s first screen.',
])}

<h2>HTTPS</h2>
<p>The application serves HTTPS itself; no IIS or other web server is needed. A renewed certificate file is picked up automatically, without a restart.</p>
<h3>Option 1 — Free Let\'s Encrypt certificate (recommended)</h3>
<p>You need a domain you own (e.g. <code>company.com</code>). Create the name <code>hr.company.com</code> in your internal DNS pointing to the server\'s IP (and, only if you publish it, in public DNS too). Let\'s Encrypt checks ownership through a DNS record, so the server does not have to be reachable from the internet.</p>
${steps([
  'Download <b>win-acme</b> (wacs.exe, from win-acme.com) to <code>C:\\Tools\\win-acme</code>.',
  'Run, as Administrator, with your DNS provider\'s plug-in (Cloudflare, Azure DNS, Route 53…) or manual DNS validation:',
])}
${pre(`wacs.exe --source manual --host hr.company.com --validation cloudflare --cloudflareapitoken &lt;token&gt; ^
  --store pemfiles --pemfilespath C:\\HRPayroll\\certs`)}
${steps([
  'win-acme writes <code>hr.company.com-chain.pem</code> and <code>hr.company.com-key.pem</code> to <code>C:\\HRPayroll\\certs</code> and creates its own scheduled task that renews them every ~60 days.',
  'Grant the service read access: <code>icacls C:\\HRPayroll\\certs /grant "NT AUTHORITY\\NETWORK SERVICE":(OI)(CI)R</code>',
  'Add to <code>C:\\HRPayroll\\config\\.env</code> (or set them in the setup file before installing):',
])}
${pre(`HTTPS_CERT_PATH=C:\\HRPayroll\\certs\\hr.company.com-chain.pem
HTTPS_KEY_PATH=C:\\HRPayroll\\certs\\hr.company.com-key.pem
HTTPS_PORT=443
APP_URL=https://hr.company.com
ALLOWED_ORIGIN=https://hr.company.com`)}
${steps(['Allow port 443 in the firewall (<code>New-NetFirewallRule -DisplayName "HR Payroll HTTPS" -Group "HR Payroll" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Domain,Private</code>), then restart the <b>HR Payroll Application</b> service. Port 8080 now redirects to HTTPS.'])}
<h3>Option 2 — Certificate from your company CA</h3>
<p>Export it as a <code>.pfx</code> with its private key and set <code>HTTPS_PFX_PATH</code> (and <code>HTTPS_PFX_PASSPHRASE</code>). It is trusted on domain-joined PCs; phones need your CA certificate installed.</p>
<h3>Option 3 — No HTTPS (LAN only)</h3>
<p>Works for office PCs, but browsers mark the site "not secure", the kiosk camera may be refused in some browsers, and the mobile app cannot be used. Use only for a test.</p>

<h2>Network and access from outside</h2>
${bullets([
  'Setup opens only the application port, for <b>Domain and Private</b> networks. The database port is never opened: it listens on localhost.',
  'Kiosk PCs and office PCs reach the server on the LAN by its name or IP; all of them are allowed automatically.',
  '<b>From outside</b>: preferably over your VPN. If you publish it to the internet, publish only HTTPS (443) through your firewall, with a valid certificate, keep Windows updated and require two-step verification for administrators.',
])}

<h2>Running next to SQL Server and CyberAP</h2>
${table(['Topic', 'What to do'], [
  ['Memory', 'SQL Server takes almost all memory by default. In SSMS → server properties → Memory, set <b>Maximum server memory</b> so HR &amp; Payroll keeps about 3 GB (e.g. on 16 GB: SQL Server 10 GB).'],
  ['Ports', 'SQL Server 1433, HR &amp; Payroll database 5433 (localhost), application 8080/443: no conflicts.'],
  ['Antivirus', 'Exclude <code>C:\\HRPayrollData\\pgdata</code> from real-time scanning, as you do for SQL Server data files.'],
  ['CyberAP', 'In <b>Data Import</b> press <b>Create package from SQL Server</b> (next section): the server reads CyberAP itself, nothing to copy or upload. After go-live keep CyberAP read-only as an archive, then back it up to a <code>.bak</code> and retire it.'],
  ['Backups', 'Your SQL Server backup jobs do not include HR &amp; Payroll. Include <code>C:\\HRPayrollData\\backups</code> in your file backups, or set BackupCopyTo.'],
], ['18%'])}

<h2>Creating the CyberAP package from SQL Server</h2>
<p>Because HR &amp; Payroll runs on Windows, the Data Import page can read CyberAP straight from SQL Server: no script to run, no file to copy or upload. It only reads; CyberAP is never changed.</p>
${steps([
  'Sign in as an administrator (or a user with the <b>Data import</b> permission) and open <b>Data Import</b>. The page is visible while OneNet has data import switched on.',
  'Press <b>Create package from SQL Server</b>. The SQL Server instances on this machine are suggested (for example <code>.\\SQLEXPRESS</code>); another server can be typed as <code>SERVER\\INSTANCE</code> or <code>10.0.0.5,1433</code>.',
  'Choose <b>SQL login</b> and enter a login that can read CyberAP (see below), then press <b>Connect and list databases</b>. The database that contains CyberAP is marked with its number of employees.',
  'Optional: <b>Attendance from</b> a date (a top-up package after go-live) and <b>Skip employee photos</b> (smaller, faster test runs).',
  'Press <b>Create package</b>. Progress shows employees and attendance days as they are read; the full history takes several minutes and you may close the page. When it finishes, continue with <b>Analyse (no changes)</b> and <b>Import</b>.',
])}
<p>A <b>read-only SQL login</b> is the simplest choice. Run once in SQL Server Management Studio (SQL Server must allow <i>SQL Server and Windows Authentication mode</i>):</p>
<pre>CREATE LOGIN hr_import WITH PASSWORD = 'Choose-a-strong-password-1';
USE CyberAP;
CREATE USER hr_import FOR LOGIN hr_import;
ALTER ROLE db_datareader ADD MEMBER hr_import;</pre>
<p><b>Windows (service account)</b> sign-in connects as the account the application service runs as. When SQL Server is on the same machine that is <code>NT AUTHORITY\\NETWORK SERVICE</code>; give it read access once:</p>
<pre>CREATE LOGIN [NT AUTHORITY\\NETWORK SERVICE] FROM WINDOWS;
USE CyberAP;
CREATE USER [NT AUTHORITY\\NETWORK SERVICE] FOR LOGIN [NT AUTHORITY\\NETWORK SERVICE];
ALTER ROLE db_datareader ADD MEMBER [NT AUTHORITY\\NETWORK SERVICE];</pre>
<p class="muted">For a SQL Server on another machine use the computer account instead, e.g. <code>[DOMAIN\\HEADOFFICE$]</code>. The SQL password is used only for the export in progress; it is never saved or written to a log. Each package creation is recorded in the audit log (server, database and login name).</p>

<h2>Database maintenance and speed</h2>
<p>The embedded database looks after itself; nothing has to be done by hand.</p>
${table(['What', 'When and how'], [
  ['Memory', 'Setup and every update size the database memory to this server (about 10% of RAM as cache when SQL Server runs here too, 20% otherwise). An update restarts the database service once when the size changes.'],
  ['Quick optimisation', 'Every night after the backup: refreshes the statistics the database uses to plan queries and makes space from changed rows reusable. Safe while people work.'],
  ['Deep optimisation (shrink)', 'First Sunday of the month after the backup: rewrites every table compactly and gives disk space back. Each table is locked briefly (the attendance table can take a few minutes), which is why it runs at night.'],
  ['By hand', 'Data Backup &rarr; <b>Database health &amp; optimisation</b>: size, largest tables, unused space, memory, and <b>Quick optimise</b> / <b>Deep optimise (shrink)</b> (deep takes a backup first). Results are listed there and in <code>logs\\backup.log</code>.'],
], ['24%'])}

<h2>Daily administration</h2>
${table(['Task', 'How'], [
  ['See the state', '<code>powershell -ExecutionPolicy Bypass -File C:\\HRPayroll\\tools\\hrpayroll-status.ps1</code> — services, health, addresses, database size, last backup, free disk.'],
  ['Start / stop / restart', 'services.msc → <b>HR Payroll Application</b> (and <b>HR Payroll Database</b>). Stop the application before the database.'],
  ['Change a setting', 'Edit <code>C:\\HRPayroll\\config\\.env</code> as Administrator, then restart HR Payroll Application.'],
  ['Logs', '<code>C:\\HRPayrollData\\logs\\app</code> (application), <code>logs\\postgresql</code> (database, one file per weekday), <code>logs\\backup.log</code>.'],
  ['Disk space', 'Watch the data disk: the database grows with attendance; 14 backups are kept.'],
  ['Forgotten administrator password', 'As Administrator: <code>powershell -ExecutionPolicy Bypass -File C:\\HRPayroll\\tools\\Reset-AdminPassword.ps1 -Email it@company.com</code>. Type a new password, or press Enter to have one generated and shown once. The generated setup password is shown only on the final setup screen and is not stored anywhere.'],
  ['Reports and history', 'Daily screens load only current staff (plus recent leavers and those with an unpaid settlement, open loan or pending request) and the current and previous month of attendance; everything else is in <b>Reports</b> (Employee, Attendance, Payroll, Statutory, Leave, Devices, Audit, CyberAP Archive). <b>View reports</b> opens employee, attendance, leave and device reports for read-only managers (not salaries, audit or the archive). To change what browsers load, set <code>attendanceReadMonths</code> or <code>employeesIncludeFormer</code> in the <code>dataLimits</code> setting (not recommended with large history).'],
  ['Tools on another drive', 'All tools find the installation by themselves (through the HR Payroll Application service). If not, add <code>-InstallDir D:\\HRPayroll</code>.'],
], ['22%'])}

<h2>Backups</h2>
${bullets([
  'The task <b>HR Payroll Nightly Backup</b> runs every night (default 01:30) as SYSTEM and writes an encrypted <code>hr-payroll-&lt;time&gt;.dump.enc</code> plus a manifest to <code>C:\\HRPayrollData\\backups</code>; the newest 14 are kept.',
  'With <code>BackupCopyTo</code> the files are also copied to that folder or share. For a share, give the server\'s computer account (<code>DOMAIN\\SERVER01$</code>) write access.',
  'Run one by hand at any time: <code>powershell -ExecutionPolicy Bypass -File C:\\HRPayroll\\tools\\hrpayroll-backup.ps1</code>.',
  'The backups can only be restored with the BACKUP_ENCRYPTION_KEY from <code>config\\.env</code>: keep that copy off the server.',
  'Test a restore on a spare machine every few months.',
])}

<h2>Restoring a backup</h2>
${pre(`powershell -ExecutionPolicy Bypass -File C:\\HRPayroll\\tools\\hrpayroll-restore.ps1 ^
  -BackupFile C:\\HRPayrollData\\backups\\hr-payroll-2026-11-07T20-00-00-000Z.dump.enc`)}
<p>It asks you to type <b>RESTORE</b>, takes a safety backup of the current database, stops the application, replaces the database with the backup, brings an older backup up to the installed version and starts the application again. Everything entered after the backup is lost.</p>

<h2>Updating</h2>
${steps([
  'Extract the new package (same as for installing).',
  'As Administrator: <code>powershell -ExecutionPolicy Bypass -File C:\\Setup\\HRPayroll-new\\setup\\Update-HRPayroll.ps1</code>',
  'The update takes a safety backup, copies the new version beside the old one, applies the database changes, switches over, restarts and checks. If the new version does not answer, it <b>switches back automatically</b>.',
  'Old version folders in <code>C:\\HRPayroll\\app</code> can be deleted after a few weeks.',
])}

<h2>Licence and edition</h2>
<p>The edition (Full or Lite) and the licence are managed by OneNet through the vendor console on the sign-in screen. OneNet can also switch the Data Import screen on or off there. No customer data is visible in the vendor console.</p>

<h2>Security checklist</h2>
${checks(['Copy of <code>config\\.env</code> stored off the server.', 'HTTPS with a valid certificate before anyone uses the mobile app or works from outside.', 'Administrator password changed at first sign-in; two-step verification on for every administrator.', 'Nightly backup task enabled and a copy going to another machine; a test restore done.', 'Database port 5433 not opened in any firewall (it listens on localhost only).', 'Windows Update and antivirus active; exclusion for the database folder.', 'Data Import switched off after go-live (ask OneNet).'])}

<h2>Uninstalling</h2>
${pre(`powershell -ExecutionPolicy Bypass -File C:\\HRPayroll\\tools\\Uninstall-HRPayroll.ps1`)}
<p>Removes the services, the backup task, the firewall rule and <code>C:\\HRPayroll</code>, and keeps <code>C:\\HRPayrollData</code> (database, documents, backups). Add <code>-RemoveData</code> and type <b>DELETE ALL DATA</b> to delete the data too.</p>

<h2>Troubleshooting</h2>
${table(['Problem', 'Cause and fix'], [
  ['Setup: "Run setup as Administrator"', 'Right-click Setup.cmd → Run as administrator.'],
  ['Setup: "Port 8080 is already in use"', 'Another program uses it. Set AppPort to a free port (e.g. 8090) in the setup file.'],
  ['Setup: "The package is incomplete"', 'Extract the whole zip (not only Setup.cmd) and run it from the extracted folder.'],
  ['Browser: site cannot be reached', 'Check the status tool; check the firewall rule profile (Domain/Private) and that you use the right port.'],
  ['"Request origin is not allowed"', 'The address you typed is not in the allowed list. Add it to ALLOWED_ORIGINS in config\\.env and restart the application.'],
  ['HR Payroll Database does not start', 'See <code>C:\\HRPayrollData\\logs\\postgresql</code>. Common: disk full, or antivirus locking database files.'],
  ['HR Payroll Application stops again and again', 'See <code>C:\\HRPayrollData\\logs\\app</code>. Common: a typing error in .env, or a certificate path that does not exist.'],
  ['Backup failed (logs\\backup.log)', 'Disk full, or the share in BackupCopyTo not writable by the server\'s computer account.'],
  ['Browser on another PC: page stays blank, console shows ERR_SSL_PROTOCOL_ERROR', 'Fixed in 2026.11.08: plain <code>http://</code> addresses no longer tell browsers to switch to HTTPS. After updating, open the address in a private window once (or clear the site data) so the browser forgets the old instruction.'],
  ['Signed in, but "Access Denied … (No Role)"', 'Installations made before 2026.11.08 had no roles. Update: the server adds the standard roles when it starts.'],
  ['Create package from SQL Server: "Login failed"', 'Wrong login or password, or SQL Server allows Windows authentication only. Use the read-only login above, or the Windows (service account) option after granting access.'],
  ['Create package from SQL Server: database not marked CyberAP', 'The login cannot open it (give it db_datareader), or it is not a CyberAP database.'],
  ['HTTPS: browser warns about the certificate', 'Wrong name in the certificate, expired certificate (win-acme renewal task failed) or an internal CA not trusted on that device.'],
], ['34%'])}

<h2>Appendix — folders and settings</h2>
${table(['Path', 'Contents'], [
  ['<code>C:\\HRPayroll\\app\\&lt;version&gt;</code>', 'Application versions (read-only).'],
  ['<code>C:\\HRPayroll\\runtime</code>', 'Node.js, PostgreSQL engine, service wrapper.'],
  ['<code>C:\\HRPayroll\\config\\.env</code>', 'Settings and keys (Administrators only). <b>Keep a copy off the server.</b>'],
  ['<code>C:\\HRPayroll\\config\\database-admin.txt</code>', 'Password of the database superuser (support and restores only).'],
  ['<code>C:\\HRPayroll\\config\\release.json</code>', 'Which application version runs.'],
  ['<code>C:\\HRPayroll\\tools</code>', 'Status, backup, restore, update, uninstall.'],
  ['<code>C:\\HRPayrollData\\pgdata</code>', 'The database files (do not edit).'],
  ['<code>C:\\HRPayrollData\\documents</code>', 'Employee documents uploaded in the app.'],
  ['<code>C:\\HRPayrollData\\backups</code>', 'Encrypted nightly backups.'],
  ['<code>C:\\HRPayrollData\\logs</code>', 'Application, database and backup logs.'],
], ['42%'])}
`,
});
