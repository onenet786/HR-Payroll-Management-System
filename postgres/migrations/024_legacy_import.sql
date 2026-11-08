-- Legacy system import (CyberAP). legacy_records keeps every legacy row that has no live table here: payroll history
-- 2015-2018, monthly summaries, salary heads, old users (without passwords), settings, archived photos and
-- fingerprint templates. legacy_import_runs logs each import. See server/legacy-import/cyberap.cjs.
CREATE TABLE IF NOT EXISTS legacy_records (
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  legacy_id TEXT NOT NULL,
  employee_id VARCHAR(240),
  record_date DATE,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source, kind, legacy_id)
);
CREATE INDEX IF NOT EXISTS idx_legacy_records_employee ON legacy_records(employee_id, kind);

CREATE TABLE IF NOT EXISTS legacy_import_runs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  actor TEXT,
  options JSONB NOT NULL DEFAULT '{}'::jsonb,
  report JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- One employee's attendance is read by the employee_id column only (index idx_attendances_emp_date); fill it for
-- rows written before every writer set it.
UPDATE attendances SET employee_id = data->>'employeeId' WHERE employee_id IS NULL AND data ? 'employeeId';

-- Attendance is read newest first and, after a large import, by date window (server/data-limits.cjs).
CREATE INDEX IF NOT EXISTS idx_attendances_date ON attendances(date);
