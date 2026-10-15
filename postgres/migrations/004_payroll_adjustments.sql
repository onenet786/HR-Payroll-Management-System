CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240) NOT NULL,
  status VARCHAR(80) NOT NULL DEFAULT 'Pending',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee ON payroll_adjustments(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_status ON payroll_adjustments(status);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_period ON payroll_adjustments((data->>'periodYear'), (data->>'periodMonth'));
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_data_gin ON payroll_adjustments USING gin (data jsonb_path_ops);
