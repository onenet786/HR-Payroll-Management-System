CREATE TABLE IF NOT EXISTS payslip_deliveries (
  id VARCHAR(240) PRIMARY KEY,
  payroll_run_id VARCHAR(240) NOT NULL,
  payslip_id VARCHAR(240) NOT NULL,
  employee_id VARCHAR(240) NOT NULL,
  recipient_email TEXT NOT NULL,
  status VARCHAR(40) NOT NULL CHECK (status IN ('Sending', 'Sent', 'Failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  requested_by VARCHAR(240) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payroll_run_id, payslip_id)
);
CREATE INDEX IF NOT EXISTS idx_payslip_deliveries_run ON payslip_deliveries(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslip_deliveries_status ON payslip_deliveries(status);
