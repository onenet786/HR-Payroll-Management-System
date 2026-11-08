#!/usr/bin/env node
// Renders docs/HR-Payroll-Database-Commands.pdf (database command reference for the Windows Server installation)
// and docs/HR-Payroll-Database-Queries.sql (the same queries, ready to paste into pgAdmin or psql).
//   node deploy/windows/build-database-commands-guide.mjs     (or: npm run docs:database-commands)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, note, pre, renderGuide, steps, table, today } from '../installer/guide-kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const code = text => pre(esc(text.trim()));

// Read-only queries. Records keep their fields in the JSON column "data" (e.g. data->>'fullName'), as the app's
// own reports do; the plain columns (full_name, employee_code ...) are not always filled.
const QUERIES = [
  ['People', [
    ['Record count of every table', `SELECT relname AS table_name, n_live_tup AS records
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;`],
    ['Employee list (first 100 by code)', `SELECT id, data->>'employeeCode' AS code, data->>'fullName' AS name, data->>'cnic' AS cnic,
       COALESCE(data->>'status', 'Active') AS status, data->>'dateOfJoining' AS joined
FROM employees
ORDER BY data->>'employeeCode'
LIMIT 100;`],
    ['Find an employee by name, code or CNIC (change the text)', `SELECT id, data->>'employeeCode' AS code, data->>'fullName' AS name, data->>'cnic' AS cnic, COALESCE(data->>'status', 'Active') AS status
FROM employees
WHERE data->>'fullName' ILIKE '%ahmed%'
   OR data->>'employeeCode' = '1001'
   OR data->>'cnic' = '35202-1234567-1';`],
    ['Staff count by status', `SELECT COALESCE(data->>'status', 'Active') AS status, count(*) AS staff
FROM employees
GROUP BY 1
ORDER BY 2 DESC;`],
    ['Current staff by department', `SELECT COALESCE(d.data->>'name', '(no department)') AS department, count(*) AS staff
FROM employees e
LEFT JOIN departments d ON d.id = e.data->>'departmentId'
WHERE COALESCE(e.data->>'status', 'Active') <> 'Terminated'
GROUP BY 1
ORDER BY 2 DESC;`],
    ['Duplicate employee codes', `SELECT data->>'employeeCode' AS code, count(*) AS times
FROM employees
WHERE COALESCE(data->>'employeeCode', '') <> ''
GROUP BY 1 HAVING count(*) > 1;`],
    ['Duplicate CNICs', `SELECT data->>'cnic' AS cnic, count(*) AS times
FROM employees
WHERE COALESCE(data->>'cnic', '') <> ''
GROUP BY 1 HAVING count(*) > 1;`],
  ]],
  ['Attendance', [
    ['Attendance of one day (change the date)', `SELECT e.data->>'employeeCode' AS code, e.data->>'fullName' AS name,
       COALESCE(a.status, a.data->>'status') AS status, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out
FROM attendances a
JOIN employees e ON e.id = a.employee_id
WHERE a.date = '2026-11-08'
ORDER BY 1;`],
    ['Totals by status for today', `SELECT COALESCE(status, data->>'status') AS status, count(*) AS records
FROM attendances
WHERE date = current_date
GROUP BY 1
ORDER BY 2 DESC;`],
    ['One employee, this month (change the code)', `SELECT a.date, COALESCE(a.status, a.data->>'status') AS status, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out
FROM attendances a
JOIN employees e ON e.id = a.employee_id
WHERE e.data->>'employeeCode' = '1001'
  AND a.date >= date_trunc('month', current_date)
ORDER BY a.date;`],
    ['Punched in yesterday but no punch out', `SELECT e.data->>'employeeCode' AS code, e.data->>'fullName' AS name, a.data->>'punchIn' AS punch_in
FROM attendances a
JOIN employees e ON e.id = a.employee_id
WHERE a.date = current_date - 1
  AND COALESCE(a.data->>'punchIn', '') <> ''
  AND COALESCE(a.data->>'punchOut', '') = '';`],
    ['Attendance records per month', `SELECT to_char(date, 'YYYY-MM') AS month, count(*) AS records
FROM attendances
GROUP BY 1
ORDER BY 1 DESC;`],
  ]],
  ['Users, payroll, history', [
    ['Login users and their roles', `SELECT u.data->>'username' AS username, u.data->>'email' AS email,
       COALESCE(r.data->>'name', r.name, u.data->>'roleId') AS role, COALESCE(u.status, u.data->>'status') AS status
FROM users u
LEFT JOIN roles r ON r.id = COALESCE(u.role_id, u.data->>'roleId')
ORDER BY 2;`],
    ['Roles', `SELECT id, COALESCE(data->>'name', name) AS name, status
FROM roles
ORDER BY id;`],
    ['Latest payslips', `SELECT r.data->>'title' AS payroll_run, p.data->>'employeeCode' AS code, p.data->>'employeeName' AS name,
       p.data->>'grossSalary' AS gross, p.data->>'totalDeductions' AS deductions, p.data->>'netSalary' AS net
FROM payroll_payslips p
JOIN payroll_runs r ON r.id = p.payroll_run_id
ORDER BY p.created_at DESC
LIMIT 50;`],
    ['Imported CyberAP history, by kind', `SELECT kind, count(*) AS records, min(record_date) AS first_date, max(record_date) AS last_date
FROM legacy_records
GROUP BY kind
ORDER BY kind;`],
    ['Last 50 actions in the audit log', `SELECT created_at, actor_uid, action, collection_name, document_id
FROM hr_audit_log
ORDER BY created_at DESC
LIMIT 50;`],
    ['Saved settings', `SELECT key, updated_at
FROM app_settings
ORDER BY key;`],
  ]],
  ['Health and performance', [
    ['Database size', `SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;`],
    ['Largest tables and unused rows', `SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       n_live_tup AS records, n_dead_tup AS unused_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 15;`],
    ['Who is connected right now', `SELECT pid, usename, client_addr, state, now() - query_start AS running_for, left(query, 80) AS query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start;`],
    ['Queries running for more than a minute', `SELECT pid, now() - query_start AS running_for, left(query, 120) AS query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '1 minute';`],
    ['When tables were last cleaned and analysed', `SELECT relname AS table_name, GREATEST(last_vacuum, last_autovacuum) AS last_cleaned,
       GREATEST(last_analyze, last_autoanalyze) AS last_analysed
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;`],
    ['Memory settings', `SELECT name, setting, unit
FROM pg_settings
WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem', 'max_connections', 'port');`],
    ['PostgreSQL version', `SELECT version();`],
  ]],
];

const queryHtml = QUERIES.map(([group, items]) => `<h3>${group}</h3>` + items.map(([title, sql]) => `<p><b>${title}</b></p>${code(sql)}`).join('')).join('');

const I = 'D:\\HRPayroll';
const D = 'D:\\HRPayrollData';
const T = `${I}\\tools`;
const PS = 'powershell -ExecutionPolicy Bypass -File';

renderGuide(root, {
  file: 'HR-Payroll-Database-Commands',
  title: 'HR & Payroll — Database Commands Reference',
  footer: 'HR & Payroll · Database commands',
  tag: 'OneNet · Windows Server · Database administration',
  coverTitle: 'HR &amp; Payroll<br>Database Commands',
  subtitle: 'Every command your IT administrator needs to look after the HR &amp; Payroll database on Windows Server: status, services, backups, restore, optimisation, connecting with pgAdmin or psql, ready-made queries, exports, logs and fixes.',
  flow: [['Check', 'Status, services, logs'], ['Protect', 'Backup and restore'], ['Tune', 'Optimise and monitor'], ['Look', 'pgAdmin, psql, queries']],
  meta: [['Database', 'PostgreSQL 16 (built in)'], ['Port', '5433, this server only'], ['Issued', today]],
  toc: ['Before you start', 'Where everything is', 'Status and services', 'Backups', 'Restoring a backup', 'Optimising the database', 'Connecting with pgAdmin 4', 'Connecting with psql', 'Ready-made queries', 'Exporting data', 'A separate copy for testing', 'Logs', 'Passwords and sign-in', 'Updating', 'Problems and fixes', 'Rules to keep the data safe'],
  body: `
<h2>Before you start</h2>
${steps([
  'Sign in to the server (HEADOFFICE) with an administrator account, directly or by Remote Desktop.',
  'Open <b>Windows PowerShell as Administrator</b>: Start &rarr; type <i>PowerShell</i> &rarr; right-click &rarr; <b>Run as administrator</b>. Every command below is typed there.',
  `This guide uses the HEADOFFICE folders <code>${I}</code> and <code>${D}</code>. If HR &amp; Payroll was installed somewhere else (the default is <code>C:\\HRPayroll</code> and <code>C:\\HRPayrollData</code>), change the drive letter in each command.`,
])}
${note('Copying commands', 'Type or paste one block at a time and press Enter. Lines starting with <code>#</code> are explanations and are ignored by PowerShell. In SQL, lines starting with <code>--</code> are explanations.')}

<h2>Where everything is</h2>
${table(['What', 'Where / value'], [
  ['Program folder', `<code>${I}</code> (application in <code>app\\&lt;version&gt;</code>)`],
  ['Data folder', `<code>${D}</code> (database in <code>pgdata</code>, uploads in <code>documents</code>)`],
  ['Tools (status, backup, restore, update, password reset)', `<code>${T}</code>`],
  ['Database programs (psql, pg_dump, pg_restore)', `<code>${I}\\runtime\\pgsql\\bin</code>`],
  ['Database server', 'host <code>localhost</code>, port <b>5433</b>, database <b>hr_payroll</b>. Accepts connections from this server only.'],
  ['Database administrator', `user <code>postgres</code>; password in <code>${I}\\config\\database-admin.txt</code>`],
  ['Application database user', `user <code>hr_app</code>; password inside <code>DATABASE_URL</code> in <code>${I}\\config\\.env</code> (between <code>hr_app:</code> and <code>@</code>)`],
  ['Windows services', '<code>HRPayrollDB</code> (database) and <code>HRPayrollApp</code> (application; depends on the database)'],
  ['Nightly backup task', '<code>HR Payroll Nightly Backup</code> (Task Scheduler)'],
  ['Backups', `<code>${D}\\backups</code>, files <code>hr-payroll-&lt;date&gt;.dump.enc</code> (encrypted, newest 14 kept)`],
  ['Logs', `<code>${D}\\logs</code>: <code>app</code>, <code>postgresql</code>, <code>backup.log</code>`],
], ['34%'])}
${note('The config folder is locked', `Only Administrators can open <code>${I}\\config</code>. To read a password file, open Notepad with <b>Run as administrator</b>, or in the administrator PowerShell: <code>notepad ${I}\\config\\database-admin.txt</code>`, 'warn')}

<h2>Status and services</h2>
<p><b>Overall status</b> (services, health, addresses, database size, last backup, free disk):</p>
${code(`${PS} ${T}\\hrpayroll-status.ps1`)}
<p><b>See the two services:</b></p>
${code('Get-Service HRPayrollDB, HRPayrollApp')}
<p><b>Restart the application</b> (most problems; the database keeps running):</p>
${code('Restart-Service HRPayrollApp')}
<p><b>Restart everything</b>, in the right order (stop the application first, start the database first):</p>
${code(`Stop-Service HRPayrollApp
Stop-Service HRPayrollDB
Start-Service HRPayrollDB
Start-Service HRPayrollApp`)}
<p><b>Is the application answering?</b> (change the port if yours is not 8080):</p>
${code('Invoke-WebRequest http://localhost:8080/api/health -UseBasicParsing | Select-Object StatusCode, Content')}
<p><b>Is the database listening?</b></p>
${code(`& "${I}\\runtime\\pgsql\\bin\\pg_isready.exe" -h localhost -p 5433`)}

<h2>Backups</h2>
<p>A backup runs automatically every night. Run one by hand before any risky change:</p>
${code(`${PS} ${T}\\hrpayroll-backup.ps1`)}
<p><b>List the backups</b>, newest first:</p>
${code(`Get-ChildItem ${D}\\backups\\hr-payroll-*.dump.enc | Sort-Object LastWriteTime -Descending | Select-Object Name, LastWriteTime, @{n='MB';e={[math]::Round($_.Length/1MB,1)}}`)}
<p><b>Did last night's backup run?</b></p>
${code(`Get-ScheduledTaskInfo -TaskName 'HR Payroll Nightly Backup' | Select-Object LastRunTime, LastTaskResult, NextRunTime
Get-Content ${D}\\logs\\backup.log -Tail 20`)}
<p><code>LastTaskResult</code> 0 means success. <b>Run the nightly task now:</b></p>
${code(`Start-ScheduledTask -TaskName 'HR Payroll Nightly Backup'`)}
<p><b>Copy backups to another disk or a network share</b> (do this regularly; a backup on the same disk does not survive a disk failure):</p>
${code(`robocopy ${D}\\backups \\\\FILESERVER\\Backups\\HRPayroll hr-payroll-*.dump.enc /XO`)}
${note('Keep the backup key', `Backups are encrypted with <code>BACKUP_ENCRYPTION_KEY</code> in <code>${I}\\config\\.env</code>. Keep a copy of that key somewhere safe outside the server: without it no backup can be restored.`, 'warn')}

<h2>Restoring a backup</h2>
<p>A restore <b>replaces the whole database</b> with the backup: everything entered after that backup is lost. The tool takes a safety backup of the current database first, stops the application, restores, and starts it again.</p>
${code(`${PS} ${T}\\hrpayroll-restore.ps1 -BackupFile ${D}\\backups\\hr-payroll-2026-11-07T20-00-00-000Z.dump.enc`)}
<p>Type <b>RESTORE</b> when asked. Use the real file name from the backup list above.</p>

<h2>Optimising the database</h2>
<p>Normally nothing has to be done: every night after the backup a <b>quick</b> optimisation runs, and on the first Sunday of the month a <b>deep</b> one (shrink). The easiest way to run them by hand is in the application: <b>Data Backup &rarr; Database health &amp; optimisation</b>.</p>
<p><b>Quick optimisation now</b> (also takes a backup first; safe while people work):</p>
${code(`${PS} ${T}\\hrpayroll-backup.ps1`)}
<p><b>Deep optimisation (shrink) now</b>: run outside working hours, each table is locked while it is rewritten:</p>
${code(`$env:HR_DEEP_OPTIMIZE = '1'
${PS} ${T}\\hrpayroll-backup.ps1
Remove-Item Env:HR_DEEP_OPTIMIZE`)}
<p>The result is written to <code>${D}\\logs\\backup.log</code>. The same in SQL, for one table (in pgAdmin or psql, connected to <b>hr_payroll</b>):</p>
${code(`-- quick: refresh statistics, make space reusable (no lock)
VACUUM (ANALYZE) attendances;
-- deep: rewrite and shrink (locks the table while it runs)
VACUUM (FULL, ANALYZE) attendances;`)}

<h2>Connecting with pgAdmin 4</h2>
<p>Run pgAdmin on the server itself (the database does not accept connections from other computers).</p>
${steps([
  'In pgAdmin: right-click <b>Servers</b> &rarr; <b>Register</b> &rarr; <b>Server…</b>',
  '<b>General</b> tab: Name <code>HR Payroll (embedded)</code>.',
  '<b>Connection</b> tab: Host <code>localhost</code>, Port <b>5433</b>, Maintenance database <code>hr_payroll</code>, Username <code>postgres</code> (or <code>hr_app</code>), Password from the files above. Tick <i>Save password</i> if you wish. <b>Save</b>.',
  'Open the tree with the small arrows: <b>Servers &rarr; HR Payroll (embedded) &rarr; Databases &rarr; hr_payroll &rarr; Schemas &rarr; public &rarr; Tables</b>.',
  'Right-click a table &rarr; <b>View/Edit Data &rarr; First 100 Rows</b>. To type a query: select <b>hr_payroll</b>, then <b>Tools &rarr; Query Tool</b>, paste the query and press <b>F5</b>.',
])}
${table(['SQL Server (SSMS)', 'pgAdmin 4'], [
  ['Server', 'Servers &rarr; HR Payroll (embedded)'],
  ['Database', 'Databases &rarr; hr_payroll'],
  ['Schema dbo', 'Schemas &rarr; public'],
  ['New Query', 'Tools &rarr; Query Tool (F5 runs)'],
  ['TOP 100', '<code>LIMIT 100</code> at the end of the query'],
])}
${note('Where the data is', 'Each kind of record has its own table: <code>employees</code>, <code>attendances</code>, <code>users</code>, <code>roles</code>, <code>departments</code>, <code>leaves</code>, <code>payroll_runs</code>, <code>payroll_payslips</code>, <code>legacy_records</code> (imported CyberAP history), <code>hr_audit_log</code>, <code>app_settings</code>. The details of each record (name, code, CNIC, punch times …) are in its <b>data</b> column, read like <code>data-&gt;&gt;\'fullName\'</code>. The table <code>hr_documents</code> is from an older version and is not used.')}

<h2>Connecting with psql</h2>
<p>psql is the command-line client included with the database. Start it (it asks for the password from <code>database-admin.txt</code>):</p>
${code(`& "${I}\\runtime\\pgsql\\bin\\psql.exe" -h localhost -p 5433 -U postgres -d hr_payroll`)}
<p>Run one query without opening psql:</p>
${code(`& "${I}\\runtime\\pgsql\\bin\\psql.exe" -h localhost -p 5433 -U postgres -d hr_payroll -c "SELECT count(*) FROM employees;"`)}
${table(['Inside psql', 'Does'], [
  ['<code>\\dt</code>', 'list tables'],
  ['<code>\\d employees</code>', 'columns of a table'],
  ['<code>\\l</code>', 'list databases'],
  ['<code>\\x</code>', 'switch to one-field-per-line display (good for the data column)'],
  ['<code>\\timing</code>', 'show how long each query takes'],
  ['<code>\\i D:\\file.sql</code>', 'run the queries in a file'],
  ['<code>\\q</code>', 'quit'],
], ['30%'])}
<p>End every SQL statement with a semicolon <code>;</code>.</p>

<h2>Ready-made queries</h2>
<p>All of these only <b>read</b> data; they change nothing. They are also in <code>HR-Payroll-Database-Queries.sql</code> next to this PDF, ready to paste.</p>
${queryHtml}

<h2>Exporting data</h2>
<p><b>Easiest:</b> the application's <b>Reports</b> menu exports every report to CSV (Excel) and PDF. For anything else, export a query to a CSV file with psql (one line):</p>
${code(`& "${I}\\runtime\\pgsql\\bin\\psql.exe" -h localhost -p 5433 -U postgres -d hr_payroll -c "\\copy (SELECT data->>'employeeCode' AS code, data->>'fullName' AS name, data->>'cnic' AS cnic FROM employees ORDER BY 1) TO 'D:\\employees.csv' WITH (FORMAT csv, HEADER)"`)}
<p>In pgAdmin: run the query, then use the <b>Save results to file</b> button (download icon) above the results.</p>

<h2>A separate copy for testing</h2>
<p>To try something risky, make an <b>unencrypted</b> copy and load it into a separate database, so the live one is never touched. Delete the dump file afterwards: it contains salaries and CNICs in readable form.</p>
${code(`$pg = "${I}\\runtime\\pgsql\\bin"
# 1. dump the live database (asks for the postgres password)
& "$pg\\pg_dump.exe" -h localhost -p 5433 -U postgres -Fc -f D:\\hr_copy.dump hr_payroll
# 2. create an empty test database and load the copy into it
& "$pg\\createdb.exe" -h localhost -p 5433 -U postgres hr_payroll_copy
& "$pg\\pg_restore.exe" -h localhost -p 5433 -U postgres -d hr_payroll_copy --no-owner D:\\hr_copy.dump
# 3. when finished: remove the test database and the dump
& "$pg\\dropdb.exe" -h localhost -p 5433 -U postgres hr_payroll_copy
Remove-Item D:\\hr_copy.dump`)}
${note('Never', 'Never restore into or drop <code>hr_payroll</code> with these commands. For a real restore use <code>hrpayroll-restore.ps1</code> (above).', 'warn')}

<h2>Logs</h2>
${code(`# application (newest file, last 50 lines)
Get-ChildItem ${D}\\logs\\app | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content -Tail 50
# database
Get-ChildItem ${D}\\logs\\postgresql | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content -Tail 50
# backups and optimisation
Get-Content ${D}\\logs\\backup.log -Tail 30
# follow a log live (Ctrl+C stops)
Get-Content ${D}\\logs\\backup.log -Tail 10 -Wait`)}

<h2>Passwords and sign-in</h2>
<p><b>Forgotten application administrator password:</b></p>
${code(`${PS} ${T}\\Reset-AdminPassword.ps1 -Email onenetpk@gmail.com -Generate`)}
<p>It prints a new password once; sign in with it and change it. Leave out <code>-Generate</code> to type your own.</p>
<p><b>Database passwords</b> (<code>postgres</code>, <code>hr_app</code>): read them from the files in "Where everything is". Do not change them in pgAdmin: the application would no longer be able to connect.</p>

<h2>Updating</h2>
<p>Unzip the new package, then (change the version in the folder name):</p>
${code(`cd D:\\HRPayroll-Windows-Setup-2026.11.08-0.0.15\\setup
${PS} .\\Update-HRPayroll.ps1 -InstallDir ${I}`)}
<p>The update backs up the database first and rolls back by itself if the new version does not start. Afterwards press <b>Ctrl+F5</b> in each browser.</p>

<h2>Problems and fixes</h2>
${table(['Problem', 'Try'], [
  ['The site does not open', '<code>Get-Service HRPayrollDB, HRPayrollApp</code>; if one is stopped, start the database first, then the application. Then read the application log.'],
  ['Very slow', 'Run the "Queries running for more than a minute" and "Largest tables" queries. A high <i>unused_rows</i> count: run a deep optimisation at night.'],
  ['A query is stuck', `Find its <code>pid</code> with "Who is connected", then in SQL: <code>SELECT pg_cancel_backend(12345);</code> (stops the query) or <code>SELECT pg_terminate_backend(12345);</code> (closes that connection).`],
  ['pgAdmin cannot connect', 'Use port <b>5433</b> (not 5432), host <code>localhost</code>, and run pgAdmin on the server itself. Check the database service is running.'],
  ['"password authentication failed"', 'Copy the password again from the file (no spaces). <code>postgres</code> and <code>hr_app</code> have different passwords.'],
  ['Disk filling up', `Check free space with the status tool; old backups beyond 14 are removed automatically. Run a deep optimisation. Move old copies from <code>${D}\\backups</code> to another disk.`],
  ['Backup failed', `Read <code>${D}\\logs\\backup.log</code>. Usually: disk full, or the database service stopped.`],
], ['26%'])}

<h2>Rules to keep the data safe</h2>
${table(['Do', 'Do not'], [
  ['Use the application (screens, Reports) for daily work and changes.', 'Change records with <code>UPDATE</code> / <code>DELETE</code> in pgAdmin: it bypasses the application\'s checks and the audit log.'],
  ['Take a backup before anything unusual.', 'Stop the database service while the application is running.'],
  ['Keep copies of backups and of the backup key off the server.', 'Edit files in <code>pgdata</code> or the PostgreSQL settings by hand.'],
  ['Sign in to pgAdmin as <code>hr_app</code> when you only want to look.', 'Share the <code>postgres</code> password or open port 5433 to the network.'],
])}
`,
});

// Companion SQL file with the same queries.
const sql = ['-- HR & Payroll: ready-made read-only queries (PostgreSQL). Run in pgAdmin (Query Tool, F5) or psql, database hr_payroll.',
  '-- Records keep their details in the JSON column "data". Change the example values (dates, codes, names) before running.', '']
  .concat(QUERIES.flatMap(([group, items]) => [`-- ===== ${group} =====`, ...items.flatMap(([title, text]) => [`-- ${title}`, text, ''])]))
  .join('\r\n');
fs.writeFileSync(path.join(root, 'docs', 'HR-Payroll-Database-Queries.sql'), sql);
console.log('✔ docs/HR-Payroll-Database-Queries.sql');
