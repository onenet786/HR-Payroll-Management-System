-- HR & Payroll: ready-made read-only queries (PostgreSQL). Run in pgAdmin (Query Tool, F5) or psql, database hr_payroll.
-- Records keep their details in the JSON column "data". Change the example values (dates, codes, names) before running.

-- ===== People =====
-- Record count of every table
SELECT relname AS table_name, n_live_tup AS records
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Employee list (first 100 by code)
SELECT id, data->>'employeeCode' AS code, data->>'fullName' AS name, data->>'cnic' AS cnic,
       COALESCE(data->>'status', 'Active') AS status, data->>'dateOfJoining' AS joined
FROM employees
ORDER BY data->>'employeeCode'
LIMIT 100;

-- Find an employee by name, code or CNIC (change the text)
SELECT id, data->>'employeeCode' AS code, data->>'fullName' AS name, data->>'cnic' AS cnic, COALESCE(data->>'status', 'Active') AS status
FROM employees
WHERE data->>'fullName' ILIKE '%ahmed%'
   OR data->>'employeeCode' = '1001'
   OR data->>'cnic' = '35202-1234567-1';

-- Staff count by status
SELECT COALESCE(data->>'status', 'Active') AS status, count(*) AS staff
FROM employees
GROUP BY 1
ORDER BY 2 DESC;

-- Current staff by department
SELECT COALESCE(d.data->>'name', '(no department)') AS department, count(*) AS staff
FROM employees e
LEFT JOIN departments d ON d.id = e.data->>'departmentId'
WHERE COALESCE(e.data->>'status', 'Active') <> 'Terminated'
GROUP BY 1
ORDER BY 2 DESC;

-- Duplicate employee codes
SELECT data->>'employeeCode' AS code, count(*) AS times
FROM employees
WHERE COALESCE(data->>'employeeCode', '') <> ''
GROUP BY 1 HAVING count(*) > 1;

-- Duplicate CNICs
SELECT data->>'cnic' AS cnic, count(*) AS times
FROM employees
WHERE COALESCE(data->>'cnic', '') <> ''
GROUP BY 1 HAVING count(*) > 1;

-- ===== Attendance =====
-- Attendance of one day (change the date)
SELECT e.data->>'employeeCode' AS code, e.data->>'fullName' AS name,
       COALESCE(a.status, a.data->>'status') AS status, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out
FROM attendances a
JOIN employees e ON e.id = a.employee_id
WHERE a.date = '2026-11-08'
ORDER BY 1;

-- Totals by status for today
SELECT COALESCE(status, data->>'status') AS status, count(*) AS records
FROM attendances
WHERE date = current_date
GROUP BY 1
ORDER BY 2 DESC;

-- One employee, this month (change the code)
SELECT a.date, COALESCE(a.status, a.data->>'status') AS status, a.data->>'punchIn' AS punch_in, a.data->>'punchOut' AS punch_out
FROM attendances a
JOIN employees e ON e.id = a.employee_id
WHERE e.data->>'employeeCode' = '1001'
  AND a.date >= date_trunc('month', current_date)
ORDER BY a.date;

-- Punched in yesterday but no punch out
SELECT e.data->>'employeeCode' AS code, e.data->>'fullName' AS name, a.data->>'punchIn' AS punch_in
FROM attendances a
JOIN employees e ON e.id = a.employee_id
WHERE a.date = current_date - 1
  AND COALESCE(a.data->>'punchIn', '') <> ''
  AND COALESCE(a.data->>'punchOut', '') = '';

-- Attendance records per month
SELECT to_char(date, 'YYYY-MM') AS month, count(*) AS records
FROM attendances
GROUP BY 1
ORDER BY 1 DESC;

-- ===== Users, payroll, history =====
-- Login users and their roles
SELECT u.data->>'username' AS username, u.data->>'email' AS email,
       COALESCE(r.data->>'name', r.name, u.data->>'roleId') AS role, COALESCE(u.status, u.data->>'status') AS status
FROM users u
LEFT JOIN roles r ON r.id = COALESCE(u.role_id, u.data->>'roleId')
ORDER BY 2;

-- Roles
SELECT id, COALESCE(data->>'name', name) AS name, status
FROM roles
ORDER BY id;

-- Latest payslips
SELECT r.data->>'title' AS payroll_run, p.data->>'employeeCode' AS code, p.data->>'employeeName' AS name,
       p.data->>'grossSalary' AS gross, p.data->>'totalDeductions' AS deductions, p.data->>'netSalary' AS net
FROM payroll_payslips p
JOIN payroll_runs r ON r.id = p.payroll_run_id
ORDER BY p.created_at DESC
LIMIT 50;

-- Imported CyberAP history, by kind
SELECT kind, count(*) AS records, min(record_date) AS first_date, max(record_date) AS last_date
FROM legacy_records
GROUP BY kind
ORDER BY kind;

-- Last 50 actions in the audit log
SELECT created_at, actor_uid, action, collection_name, document_id
FROM hr_audit_log
ORDER BY created_at DESC
LIMIT 50;

-- Saved settings
SELECT key, updated_at
FROM app_settings
ORDER BY key;

-- ===== Health and performance =====
-- Database size
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

-- Largest tables and unused rows
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       n_live_tup AS records, n_dead_tup AS unused_rows
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 15;

-- Who is connected right now
SELECT pid, usename, client_addr, state, now() - query_start AS running_for, left(query, 80) AS query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start;

-- Queries running for more than a minute
SELECT pid, now() - query_start AS running_for, left(query, 120) AS query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '1 minute';

-- When tables were last cleaned and analysed
SELECT relname AS table_name, GREATEST(last_vacuum, last_autovacuum) AS last_cleaned,
       GREATEST(last_analyze, last_autoanalyze) AS last_analysed
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;

-- Memory settings
SELECT name, setting, unit
FROM pg_settings
WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem', 'maintenance_work_mem', 'max_connections', 'port');

-- PostgreSQL version
SELECT version();
