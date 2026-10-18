CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_period
  ON payroll_runs ((data->>'periodYear'), (data->>'periodMonth'))
  WHERE data ? 'periodYear' AND data ? 'periodMonth';
