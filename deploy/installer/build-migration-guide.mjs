#!/usr/bin/env node
// Renders the "CyberAP data migration" guide to PDF with headless Chrome/Edge.
//
//   node deploy/installer/build-migration-guide.mjs        (or: npm run docs:migration-guide)
//
// Writes docs/CyberAP-Data-Migration-Guide.pdf (+ .html) and copies the PDF and the Windows exporter into
// deploy/installer/dist/. Figures of the trial migration come from docs/assets/cyberap-trial-run.json when present.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const require = createRequire(import.meta.url);
const { WIPE_TABLES } = require(path.join(root, 'server', 'legacy-import', 'cyberap.cjs'));

const branding = Object.fromEntries(fs.readFileSync(path.join(here, 'branding.conf'), 'utf8').split(/\r?\n/)
  .map(l => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
const PRODUCT = branding.PRODUCT_NAME || 'HR & Payroll Suite';
const VENDOR = branding.VENDOR_NAME || 'OneNet Solutions';
const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cssText = s => String(s ?? '').replace(/["\\]/g, ch => `\\${ch}`); // for CSS content: strings (no HTML escaping)
const n = v => (typeof v === 'number' ? v.toLocaleString('en-US') : esc(v ?? '—'));

const trialPath = path.join(root, 'docs', 'assets', 'cyberap-trial-run.json');
const trial = fs.existsSync(trialPath) ? JSON.parse(fs.readFileSync(trialPath, 'utf8')) : null;
const KEPT = ['companies', 'users', 'roles', 'auth sessions and MFA', 'wage_types', 'tax_slabs', 'stat_config', 'statutory_change_requests', 'kiosk_devices', 'app_settings (edition)', 'hr_audit_log', 'schema_migrations'];

const trialSection = trial ? `
<section class="page">
  <h1>Appendix B — Trial migration figures</h1>
  <p>The full CyberAP database (${esc(trial.source)}) was exported and imported into a test installation on ${esc(trial.date)}. Use these figures to judge the time and size of a real migration.</p>
  <div class="two">
    <div class="card"><h3>Export (Windows PC)</h3><table>
      <tr><td>Source size</td><td>${esc(trial.sourceSize)}</td></tr>
      <tr><td>Export time</td><td>${esc(trial.exportTime)}</td></tr>
      <tr><td>Package size</td><td>${esc(trial.packageSize)}</td></tr>
      <tr><td>Attendance days in package</td><td>${n(trial.report.attendance.packageDays)}</td></tr>
      <tr><td>Upload (Data Import screen)</td><td>${esc(trial.uploadTime)}</td></tr>
      <tr><td>Analysis time</td><td>${esc(trial.analysisTime)}</td></tr>
      <tr><td>Import time (with wipe)</td><td>${esc(trial.importTime)}</td></tr>
      <tr><td>Database size after import</td><td>${esc(trial.databaseSize)}</td></tr>
    </table></div>
    <div class="card"><h3>Imported</h3><table>
      <tr><td>Employees (active / left)</td><td>${n(trial.report.employees.total)} (${n(trial.report.employees.active)} / ${n(trial.report.employees.inactive)})</td></tr>
      <tr><td>Branches / departments / designations / holidays</td><td>${n(trial.report.masters.branches)} / ${n(trial.report.masters.departments)} / ${n(trial.report.masters.designations)} / ${n(trial.report.masters.holidays)}</td></tr>
      <tr><td>Attendance days</td><td>${n(trial.report.attendance.imported)}</td></tr>
      <tr><td>Period</td><td>${esc(trial.report.attendance.first)} → ${esc(trial.report.attendance.last)}</td></tr>
      ${Object.entries(trial.report.attendance.byStatus).map(([k, v]) => `<tr><td>&nbsp;&nbsp;${esc(k)}</td><td>${n(v)}</td></tr>`).join('')}
      <tr><td>Absent days corrected from punches</td><td>${n(trial.report.attendance.correctedFromAbsent)}</td></tr>
      <tr><td>Absences after leaving (dropped)</td><td>${n(trial.report.attendance.droppedTrailingAbsences)}</td></tr>
      <tr><td>Archived legacy rows</td><td>${n(trial.report.archive.rows)}</td></tr>
    </table></div>
  </div>
  <h3>Warnings raised for this database</h3>
  <ul>${trial.report.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
</section>` : '';

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(PRODUCT)} — CyberAP Data Migration Guide</title>
<style>
  @page { size: A4; margin: 16mm 15mm 18mm 15mm;
    @bottom-left { content: "${cssText(PRODUCT)} · CyberAP data migration"; font: 7.5pt system-ui, sans-serif; color: #94a3b8; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7.5pt system-ui, sans-serif; color: #94a3b8; } }
  @page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
  :root { --ink:#1e293b; --muted:#64748b; --line:#e2e8f0; --brand:#047857; --brand-dk:#064e3b; --soft:#ecfdf5; --warn:#b45309; --warnbg:#fffbeb; --bad:#b91c1c; --badbg:#fef2f2; --code:#0f172a; }
  * { box-sizing: border-box; }
  body { margin:0; font: 10pt/1.5 "Segoe UI", system-ui, -apple-system, sans-serif; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 19pt; margin: 0 0 4mm; color: var(--brand-dk); letter-spacing: -.01em; }
  h2 { font-size: 13pt; margin: 7mm 0 2.5mm; color: var(--brand-dk); padding-bottom: 1.5mm; border-bottom: 1.5px solid var(--line); break-after: avoid; }
  h3 { font-size: 10.5pt; margin: 5mm 0 1.5mm; break-after: avoid; }
  p { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5.5mm; } li { margin-bottom: 1mm; }
  code, .mono { font-family: "Cascadia Mono", Consolas, monospace; font-size: 8.8pt; }
  code { background: #f1f5f9; padding: .2mm 1.2mm; border-radius: 1mm; }
  pre { background: var(--code); color: #e2e8f0; padding: 3mm 4mm; border-radius: 2mm; font-size: 8.4pt; line-height: 1.55; white-space: pre-wrap; margin: 0 0 3.5mm; break-inside: avoid; }
  pre .c { color: #6ee7b7; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9pt; }
  th { text-align: left; background: #f8fafc; color: var(--muted); font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  th, td { padding: 1.6mm 2.5mm; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr { break-inside: avoid; }
  .muted { color: var(--muted); font-size: 8.5pt; }
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
  .check { padding-left: 6mm; } .check li { list-style: none; position: relative; }
  .check li::before { content: ""; position: absolute; left: -6mm; top: .9mm; width: 3.2mm; height: 3.2mm; border: 1.3px solid var(--muted); border-radius: .6mm; }
  .toc { columns: 2; column-gap: 10mm; } .toc li { margin-bottom: 1.2mm; break-inside: avoid; }
  .cover { height: 297mm; padding: 26mm 22mm; color: #fff; background: linear-gradient(140deg, #064e3b 0%, #065f46 38%, #0f172a 100%); display: flex; flex-direction: column; }
  .cover .tag { display: inline-block; align-self: flex-start; background: #10b981; color: #fff; font-weight: 700; font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; padding: 1.2mm 3mm; border-radius: 1mm; }
  .cover h1 { color: #fff; font-size: 32pt; line-height: 1.12; margin: 12mm 0 5mm; }
  .cover .sub { font-size: 12.5pt; color: #a7f3d0; max-width: 150mm; }
  .cover .meta { margin-top: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; border-top: 1px solid rgba(255,255,255,.18); padding-top: 6mm; font-size: 9pt; color: #cbd5e1; }
  .cover .meta b { display: block; color: #fff; font-size: 10.5pt; }
  .cover .flow div { background: rgba(255,255,255,.07); border-color: rgba(255,255,255,.16); color: #e2e8f0; }
  .cover .flow b { color: #6ee7b7; }
  figure { margin: 2mm 0 5mm; break-inside: avoid; } figure img { width: 100%; border: 1px solid var(--line); border-radius: 2mm; box-shadow: 0 1mm 3mm rgba(15,23,42,.08); }
  figcaption { font-size: 8.5pt; color: var(--muted); margin-top: 1.2mm; text-align: center; }
</style></head>
<body>

<section class="cover">
  <span class="tag">${esc(VENDOR)} · Migration guide</span>
  <h1>${esc(PRODUCT)}<br>Data Migration from CyberAP</h1>
  <p class="sub">For your IT administrator: move employees, 12+ years of attendance and the payroll history from your old CyberAP (SQL Server) system into your new ${esc(PRODUCT)} yourself, without OneNet having to touch your data.</p>
  <div class="flow" style="margin-top:16mm">
    <div><b>1 · Prepare</b>Backup, permission, cut-over date</div>
    <div><b>2 · Export</b>PowerShell on the SQL Server PC</div>
    <div><b>3 · Import</b>Your HR system → Data Import</div>
    <div><b>4 · Go live</b>Checks, HR clean-up, gap import</div>
  </div>
  <div class="meta">
    <div><b>Source</b>CyberAP on SQL Server 2008–2022</div>
    <div><b>Target</b>PostgreSQL, Full or Lite edition</div>
    <div><b>Issued</b>${esc(today)}</div>
  </div>
</section>

<section class="page">
  <h1>Contents</h1>
  <ol class="toc">
    <li>What is migrated, archived and left behind</li>
    <li>Before you start</li>
    <li>Step 1 — Restore the CyberAP backup (if needed)</li>
    <li>Step 2 — Export CyberAP on Windows</li>
    <li>Step 3 — Open Data Import in your HR system</li>
    <li>Step 4 — Upload and analyse</li>
    <li>Step 5 — Import (keep or remove current data)</li>
    <li>For your service provider — server import</li>
    <li>Step 6 — Check the result</li>
    <li>Step 7 — HR clean-up before the first payroll</li>
    <li>Step 8 — Cut-over day: the gap import</li>
    <li>How imported history is shown</li>
    <li>Troubleshooting</li>
    <li>Rollback</li>
    <li>Appendix A — Field and status mapping</li>
    ${trial ? '<li>Appendix B — Trial migration figures</li>' : ''}
  </ol>

  <h2>What is migrated, archived and left behind</h2>
  <table>
    <tr><th style="width:30%">CyberAP</th><th style="width:30%">New system</th><th>Notes</th></tr>
    <tr><td>branch, shift</td><td>Branches; shift on each employee</td><td>Province is set to Punjab and city is blank: correct them in Company Setup.</td></tr>
    <tr><td>employee_group</td><td>Departments</td><td>Sub-group is kept on the employee (legacy details).</td></tr>
    <tr><td>designation, holiday</td><td>Designations, Holidays</td><td>Branch off days are archived.</td></tr>
    <tr><td>employee (all, active and former)</td><td>Employees</td><td>Code, name, father's name, CNIC, phones, addresses, dates, gender, marital status, branch, department, designation, shift, photo. Former staff become <i>Terminated</i>.</td></tr>
    <tr><td>salary (basic salary)</td><td>Basic salary</td><td>Only when it is a real figure; CyberAP's placeholder 1.0 becomes 0.</td></tr>
    <tr><td>attendance, processed_attendance, employee_over_time, employee_tracking, employee_time_out_reason</td><td>Attendance (one record per employee per day)</td><td>Status, duty in/out, every break with its reason (Prayer, Lunch, Personal …), overtime, branch, personal-out minutes. CyberAP codes are kept on the record.</td></tr>
    <tr><td>Payroll 2015–2018, monthly summaries, salary heads, advances, users, settings, screens</td><td>Archive table <code>legacy_records</code></td><td>Kept for reference and audits; not shown in payroll screens.</td></tr>
    <tr><td>Fingerprint templates, original photos</td><td>Archive table <code>legacy_records</code></td><td>Fingerprints are DigitalPersona One Touch templates; the kiosk needs U.are.U ANSI templates, so staff are enrolled again.</td></tr>
    <tr><td>User passwords, branch connection strings, sa passwords</td><td><b>Never copied</b></td><td>Removed by the exporter itself.</td></tr>
  </table>
</section>

<section>
  <h2>Before you start</h2>
  <ul class="check">
    <li><b>CyberAP backup:</b> a fresh <code>.bak</code> of the CyberAP database from the head-office server, or access to that server.</li>
    <li><b>Branch databases:</b> confirm that every branch (<code>CyberAP-AT</code>) has synced its punches to head office. The export reads head office only.</li>
    <li><b>Windows PC</b> with SQL Server (Express is enough) and Windows PowerShell 5.1. Nothing else needs to be installed.</li>
    <li><b>Data Import switched on</b> for your installation by your service provider (OneNet). When it is on, Super Admins see <b>Data Import</b> in the menu under SYSTEM.</li>
    <li><b>Permission:</b> a Super Admin, or a user whose role has the <b>Data import</b> permission (User Management → Roles).</li>
    <li><b>Your password at hand:</b> removing current data asks for it again.</li>
    <li><b>Large package?</b> Packages of a few hundred MB upload fine but take time on a slow line; your service provider can also import from the server (see that section).</li>
    <li><b>Cut-over date</b> agreed with HR: the day the kiosks replace CyberAP.</li>
  </ul>
  <div class="warn"><b>Analyse first, then import</b>Analysis reads the whole package and shows what would happen without changing anything. Review its report with HR before importing. An import can be re-run safely: nothing is duplicated.</div>

  <h2>Step 1 — Restore the CyberAP backup (if needed)</h2>
  <p>Skip this step when you export directly from the head-office SQL Server. Otherwise restore the <code>.bak</code> on the Windows PC with SQL Server Management Studio (Databases → Restore Database → Device) or with:</p>
  <pre>sqlcmd -S .\\SQLEXPRESS -E -Q "RESTORE FILELISTONLY FROM DISK='D:\\CyberAP.bak'"
sqlcmd -S .\\SQLEXPRESS -E -Q "RESTORE DATABASE CyberAP FROM DISK='D:\\CyberAP.bak' WITH MOVE 'CyberAP' TO 'D:\\SQL\\CyberAP.mdf', MOVE 'CyberAP_log' TO 'D:\\SQL\\CyberAP_log.ldf', RECOVERY"</pre>
  <p class="muted">Use the logical names that RESTORE FILELISTONLY prints. The export only reads the database; it never changes it.</p>

  <h2>Step 2 — Export CyberAP on Windows</h2>
  <div class="warn"><b>HR &amp; Payroll installed on Windows Server? Skip the script.</b>On a Windows Server installation the Data Import page has <b>Create package from SQL Server</b>: enter the SQL Server instance (it is suggested), sign in with a SQL login, press <b>Connect and list databases</b>, pick the database marked <i>CyberAP</i> and press <b>Create package</b>. The server runs this same exporter itself and the package is ready for Analyse when it finishes; nothing has to be copied or uploaded. The SQL password is used only for that export and is never stored. See the <i>Windows Server Guide</i> for a read-only SQL login.</div>
  <p>Copy <code>Export-CyberAP.ps1</code> (in the repository under <code>tools\\cyberap-export\\</code>, and next to this PDF in <code>deploy\\installer\\dist\\</code>) to the PC and run it in PowerShell:</p>
  <pre><span class="c"># local SQL Server, signed in with your Windows account</span>
powershell -ExecutionPolicy Bypass -File .\\Export-CyberAP.ps1

<span class="c"># another server or a SQL login</span>
powershell -ExecutionPolicy Bypass -File .\\Export-CyberAP.ps1 -Server 192.168.86.83 -Database cyberap -SqlUser sa -SqlPassword "…" -OutFile D:\\cyberap.cyberap.gz</pre>
  <table>
    <tr><th>Parameter</th><th>Default</th><th>Meaning</th></tr>
    <tr><td><code>-Server</code></td><td><code>.\\SQLEXPRESS</code></td><td>SQL Server instance.</td></tr>
    <tr><td><code>-Database</code></td><td><code>CyberAP</code></td><td>Database name.</td></tr>
    <tr><td><code>-SqlUser / -SqlPassword</code></td><td>Windows login</td><td>Use a SQL login instead of Windows authentication.</td></tr>
    <tr><td><code>-OutFile</code></td><td><code>CyberAP-&lt;date&gt;.cyberap.gz</code></td><td>Package file to write.</td></tr>
    <tr><td><code>-FromDate YYYY-MM-DD</code></td><td>all history</td><td>Attendance from this date only (employees and masters are always included). Used for the gap import on cut-over day.</td></tr>
    <tr><td><code>-NoPhotos</code></td><td>off</td><td>Skip photos (smaller and faster; for test runs).</td></tr>
    <tr><td><code>-ThumbSize / -PhotoSize</code></td><td>160 / 480</td><td>Pixel size of the profile thumbnail and of the archived photo. Originals (up to 36 MB each) are never copied.</td></tr>
  </table>
  <p>The script prints its progress (tables, employees, attendance days every 100,000) and ends with the package path and size. Keep the window open until it says <b>Package written</b>; a cut-off package is rejected by the import.</p>
</section>

<section>
  <h2>Step 3 — Open Data Import in your HR system</h2>
  <ol class="steps">
    <li>Sign in to your HR system as a Super Admin (or a user with the <b>Data import</b> permission).</li>
    <li>Menu → SYSTEM → <b>Data Import</b>. If the item is missing, ask your service provider to switch data import on.</li>
  </ol>
  <figure><img src="assets/provider/client-data-import.png" alt="Data Import screen"><figcaption>Data Import in your HR system: upload the package, analyse, then import. Every step is recorded in the audit log.</figcaption></figure>

  <h2>Step 4 — Upload and analyse</h2>
  <ol class="steps">
    <li><b>Choose package (.cyberap.gz)</b> and select the file. A progress bar shows the upload; a broken connection is retried and resumes where it stopped.</li>
    <li>When the upload ends the package is checked and shown with its source server, database and export time.</li>
    <li>Press <b>Analyse (no changes)</b>. The whole package is read and a report appears: employees, attendance per status and period, masters, archive rows and a <b>package check</b> (row counts against the export). Nothing is written.</li>
    <li>Read the warnings with HR (see Step 7). Typical ones: active staff with no recent attendance, missing CNICs, placeholder salaries, fingerprints to enrol again.</li>
  </ol>

  <h2>Step 5 — Import (keep or remove current data)</h2>
  <div class="two">
    <div class="card"><h3>Keep current data</h3><p>Leave <i>Remove all current data first</i> unticked and press <b>Import (keep current data)</b>. Legacy employees whose code already exists are linked to the existing employee instead of being created twice, and an attendance day is never written over a day the new system already recorded.</p></div>
    <div class="card"><h3>Remove current data (new setup)</h3><p>Tick <b>Remove all current data first</b>, type <code>DELETE ALL DATA</code>, enter <b>your password</b> and press <b>Back up, remove current data and import</b>. Use this only when the system holds test or demo data.</p></div>
  </div>
  <figure><img src="assets/provider/client-data-import-wipe.png" alt="Remove current data"><figcaption>Removing current data needs the typed confirmation and your password. A full backup is taken automatically first.</figcaption></figure>
  <table>
    <tr><th style="width:34%">Safety rail</th><th>What it does</th></tr>
    <tr><td>Automatic safety backup</td><td>Before anything is deleted, the system takes a full encrypted backup of its database. If the backup cannot be made, nothing is deleted. Your service provider can restore it.</td></tr>
    <tr><td>Password and confirmation</td><td>The person importing re-enters their password and types <code>DELETE ALL DATA</code>.</td></tr>
    <tr><td>Locked after go-live</td><td>Once salaries have been paid or an attendance month has been locked, removing data is refused for good; only "keep current data" imports remain possible.</td></tr>
    <tr><td>Audit</td><td>Who imported what, and when, is written to the audit log.</td></tr>
  </table>
  <table>
    <tr><th style="width:50%">Removed by "Remove all current data"</th><th>Always kept</th></tr>
    <tr><td class="mono" style="font-size:8pt">${WIPE_TABLES.map(esc).join(', ')}</td><td>${KEPT.map(esc).join(', ')}. Users stay and can still sign in; their link to a deleted employee is cleared.</td></tr>
  </table>
  <p>The import runs on the server in the background. The screen shows the phase (safety backup, removing data, archiving, employees, attendance history, finishing) and a progress bar. Closing the browser does not stop it; open Data Import again to see progress. <b>Cancel</b> stops after the current batch; what was written stays and a re-run continues.</p>
  <div class="bad"><b>Removing data cannot be undone by you</b>Only your service provider can restore the automatic safety backup. Use "Remove all current data" only for a new setup.</div>
</section>

<section>
  <h2>For your service provider — server import</h2>
  <p>For very large packages or slow connections, the provider can copy the package to the server (aaPanel → Files → Upload, or <code>scp</code>) and run the importer in the app folder (aaPanel → Terminal). It reads <code>DATABASE_URL</code> from the app's <code>.env</code>:</p>
  <pre>cd /www/wwwroot/&lt;hr-app&gt;
node scripts/cyberap-import.cjs --package /root/cyberap.cyberap.gz --analyze
node scripts/cyberap-import.cjs --package /root/cyberap.cyberap.gz
node scripts/cyberap-import.cjs --package /root/cyberap.cyberap.gz --wipe --confirm "DELETE ALL DATA" --company-name "Client name"</pre>
  <p>Progress is printed every few seconds and the full report at the end. Restart the app afterwards in aaPanel's Node manager so the new attendance window is picked up immediately (it is otherwise read within 30 seconds).</p>

  <h2>Step 6 — Check the result</h2>
  <ul class="check">
    <li>Data Import says <b>Import · finished</b> and the package check is <b>ok</b>.</li>
    <li>Sign in as the Super Admin. Employees shows the active staff with photos; former staff appear as Terminated.</li>
    <li>Attendance shows the current and previous month with in/out times and breaks; an employee's profile shows their full history.</li>
    <li>Company Setup lists the CyberAP branches, departments and designations.</li>
    <li>Optional, for your service provider: SQL check of the database:</li>
  </ul>
  <pre>SELECT status, count(*) FROM employees GROUP BY status;
SELECT date_trunc('year', date) AS year, count(*) FROM attendances GROUP BY 1 ORDER BY 1;
SELECT kind, count(*) FROM legacy_records GROUP BY kind ORDER BY 2 DESC;
SELECT id, status, started_at, finished_at FROM legacy_import_runs ORDER BY started_at DESC;</pre>

  <h2>Step 7 — HR clean-up before the first payroll</h2>
  <table>
    <tr><th style="width:34%">Item</th><th>What to do</th></tr>
    <tr><td>Basic salary</td><td>CyberAP holds 1.0 for most staff. Enter each active employee's real salary (Employees → edit, or Salary Revisions). Payroll refuses or underpays a 0 salary.</td></tr>
    <tr><td>Active staff with no recent attendance</td><td>The report lists employees who are active in CyberAP but have not worked for 30+ days. Mark those who left as Terminated with their separation date.</td></tr>
    <tr><td>CNIC</td><td>Placeholders such as "................." are imported as blank; the original text is kept in the legacy details. Enter real CNICs (Full edition: required for EOBI/FBR).</td></tr>
    <tr><td>Fingerprints</td><td>Enrol each active employee again at the kiosk (U.are.U reader). Face recognition can be enrolled at the same time.</td></tr>
    <tr><td>Bank, EOBI, NTN, email</td><td>Not in CyberAP. Full edition: complete them before the first payroll. Lite edition: optional.</td></tr>
    <tr><td>Branches</td><td>Set city, province, address and geofence for each branch.</td></tr>
    <tr><td>Attendance policy</td><td>CyberAP used: shift 11:00–23:30, 15 minutes grace, date change at 06:00, minimum overtime 10 minutes, "Duty Off" allowance 90 minutes, holiday sandwich rule on. Set the matching options in the attendance policy.</td></tr>
    <tr><td>Holidays</td><td>CyberAP's holiday list ends in 2015. Add the current year's holidays.</td></tr>
  </table>
</section>

<section>
  <h2>Step 8 — Cut-over day: the gap import</h2>
  <p>CyberAP keeps recording punches until the kiosks take over. On cut-over day bring over the days since the main export:</p>
  <ol class="steps">
    <li>Stop using CyberAP terminals (or note the time).</li>
    <li>Export only the recent days: <code>.\\Export-CyberAP.ps1 -FromDate 2026-11-01 -NoPhotos</code> (use the first day not fully covered by the main package).</li>
    <li>Upload and import it <b>without</b> removing data. Existing employees and edited records are left as they are; new employees are added; days already recorded by the kiosk are kept.</li>
    <li>Switch the branches to the kiosks.</li>
  </ol>

  <h2>How imported history is shown</h2>
  <p>Browsers load attendance as one list. After an import of more than 10,000 days the server turns on an attendance window (setting <code>dataLimits</code>): manager screens receive the <b>current and previous month</b>, newest first, and an employee's own history is not limited. The whole history stays in the database. To show more months:</p>
  <pre>UPDATE app_settings SET data = data || '{"attendanceReadMonths": 3}' WHERE key = 'dataLimits';</pre>
  <div class="warn"><b>Large staff numbers</b>With 500+ active employees, every manager browser reloads the current month's attendance every few seconds. Keep the window at 1 month, enable gzip for JSON in nginx (aaPanel → Website → Config, <code>gzip_types application/json</code>) and give the server enough bandwidth.</div>

  <h2>Troubleshooting</h2>
  <table>
    <tr><th style="width:36%">Message</th><th>Cause and fix</th></tr>
    <tr><td>Cannot connect to … (export)</td><td>Wrong <code>-Server</code> name, SQL Server service stopped, or the Windows account has no access. Try <code>sqlcmd -S .\\SQLEXPRESS -E -Q "SELECT 1"</code>.</td></tr>
    <tr><td>This file is not a CyberAP export package</td><td>Upload the <code>.cyberap.gz</code> made by Export-CyberAP.ps1, not a <code>.bak</code> or a renamed file.</td></tr>
    <tr><td>Package check: failed / no end marker</td><td>The export was interrupted or the file was cut off in transfer. Export again and re-upload.</td></tr>
    <tr><td>Data Import is not in the menu / "switched off for this installation"</td><td>Ask your service provider to switch client data import on.</td></tr>
    <tr><td>"You need the Data import permission"</td><td>A Super Admin adds the Data import permission to your role (User Management).</td></tr>
    <tr><td>"Backups are not configured … cannot be removed safely"</td><td>The server has no backup key. Ask your service provider; meanwhile you can import with "keep current data".</td></tr>
    <tr><td>"This installation is live … can no longer be removed"</td><td>Payroll was paid or a month locked. Import with "keep current data" (cut-over gap imports work this way).</td></tr>
    <tr><td>"Your password is not correct"</td><td>Enter the password of the account you are signed in with.</td></tr>
    <tr><td>HTTP 413 during upload</td><td>The server's upload limit is below 8 MB. Ask your service provider to raise nginx <code>client_max_body_size</code>.</td></tr>
    <tr><td>Import failed: no space left on device</td><td>Ask your service provider to free disk space, then upload again.</td></tr>
    <tr><td>Server restarted during import</td><td>The status shows the last saved phase. Run the import again (without removing data): it continues and skips what is already there.</td></tr>
    <tr><td>Kiosk says enrolled templates are from another reader</td><td>A legacy One Touch template was entered manually. Delete it and enrol the employee again on the kiosk.</td></tr>
  </table>

  <h2>Rollback</h2>
  <p>Ask your service provider to restore the automatic safety backup taken just before the import (its time is shown on the Data Import screen). This is the only complete rollback; there is no "undo import" button, because an import that removed data cannot bring it back.</p>
</section>

<section class="page">
  <h1>Appendix A — Field and status mapping</h1>
  <h3>Day status</h3>
  <table>
    <tr><th>CyberAP processed day (remarks1 / remarks2 / remarks4)</th><th>New status</th></tr>
    <tr><td>A, or "-"</td><td>Absent — <b>unless the employee punched Duty In</b>: CyberAP pre-fills days as A until they are processed, so such days become Present or Late from the punches (marked <i>correctedFromAbsent</i>).</td></tr>
    <tr><td>H (holiday), BD (branch off day)</td><td>Holiday</td></tr>
    <tr><td>P with remarks4 = HD</td><td>Half Day</td></tr>
    <tr><td>P with remarks2 = LI (late in)</td><td>Late</td></tr>
    <tr><td>P otherwise, ED (extra day)</td><td>Present</td></tr>
    <tr><td>No processed row yet (e.g. today)</td><td>Present or Late from the first Duty In and the shift start + grace</td></tr>
  </table>
  <p>Absent days after the last working day of a former employee are dropped (CyberAP keeps generating them). The original codes, worked/out minutes, overtime approvals and per-reason out minutes are kept on each record under <code>legacy</code>.</p>
  <h3>Punches</h3>
  <table>
    <tr><th>CyberAP punch</th><th>New record</th></tr>
    <tr><td>In · Duty (first)</td><td>Punch in</td></tr>
    <tr><td>Out · Duty Off (last)</td><td>Punch out</td></tr>
    <tr><td>Out · Prayer / Lunch / Personal / Tea/Smoking / Office Work / Other, then In</td><td>A break with reason, out time and return time. An out without a return is an open break.</td></tr>
    <tr><td>employee_tracking branch</td><td>Terminal branch; "cross branch" when it differs from the employee's branch</td></tr>
    <tr><td>employee_over_time.total_over_time</td><td>Overtime minutes</td></tr>
  </table>
  <h3>Employees</h3>
  <table>
    <tr><th>CyberAP</th><th>New field</th></tr>
    <tr><td>employee_code, employee_name</td><td>Employee code, full name</td></tr>
    <tr><td>is_active = 1 and employment_status = Employed</td><td>Status Active; otherwise Terminated with separation date = leaving date</td></tr>
    <tr><td>employee_cnic_number</td><td>CNIC as 12345-1234567-1 (blank when not 13 digits)</td></tr>
    <tr><td>mobile, else telephone</td><td>Contact number</td></tr>
    <tr><td>branch, sub-group → group, designation, shift</td><td>Branch, department, designation, shift</td></tr>
    <tr><td>employee_image</td><td>160 px profile photo (active staff); 480 px copy archived for everyone</td></tr>
    <tr><td>father name, bar code, addresses, blood group, religion, notes, salary heads</td><td>Legacy details on the employee record</td></tr>
  </table>
</section>
${trialSection}
</body></html>`;

const docsDir = path.join(root, 'docs');
const htmlPath = path.join(docsDir, 'CyberAP-Data-Migration-Guide.html');
const pdfPath = path.join(docsDir, 'CyberAP-Data-Migration-Guide.pdf');
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
fs.copyFileSync(pdfPath, path.join(distDir, 'CyberAP-Data-Migration-Guide.pdf'));
fs.copyFileSync(path.join(root, 'tools', 'cyberap-export', 'Export-CyberAP.ps1'), path.join(distDir, 'Export-CyberAP.ps1'));
console.log(`✔ ${path.relative(root, pdfPath)} (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB) — PDF and Export-CyberAP.ps1 copied to deploy/installer/dist/`);
