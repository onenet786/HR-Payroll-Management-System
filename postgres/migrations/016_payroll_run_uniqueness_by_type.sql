-- One active regular payroll per period. Cancelled runs stay for audit, and supplementary or
-- final-settlement runs may share a period with the regular run.
DROP INDEX IF EXISTS uq_payroll_runs_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_regular_period
  ON payroll_runs ((data->>'periodYear'), (data->>'periodMonth'))
  WHERE data ? 'periodYear' AND data ? 'periodMonth'
    AND COALESCE(data->>'runType', 'Regular') = 'Regular'
    AND COALESCE(data->>'status', status) <> 'Cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_runs_settlement
  ON payroll_runs ((data->>'settlementId'))
  WHERE data ? 'settlementId' AND COALESCE(data->>'status', status) <> 'Cancelled';
