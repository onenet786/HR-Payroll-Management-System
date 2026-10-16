-- Certified monthly attendance registers used as immutable payroll inputs.
-- Kept as a separate migration because 002 may already be recorded in production.

CREATE TABLE IF NOT EXISTS attendance_periods (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240),
  status VARCHAR(80) NOT NULL DEFAULT 'Locked',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_periods_status
  ON attendance_periods(status);

CREATE INDEX IF NOT EXISTS idx_attendance_periods_data_gin
  ON attendance_periods USING gin (data jsonb_path_ops);
