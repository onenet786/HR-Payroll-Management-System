-- SMS / WhatsApp payslip alerts: one row per payslip and channel so re-sends are idempotent and auditable.
CREATE TABLE IF NOT EXISTS payslip_alert_deliveries (
  id VARCHAR(300) PRIMARY KEY,
  payroll_run_id VARCHAR(240) NOT NULL,
  payslip_id VARCHAR(240) NOT NULL,
  employee_id VARCHAR(240) NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  recipient VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Sending', 'Sent', 'Failed')),
  provider_message_id VARCHAR(200),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  requested_by VARCHAR(240) NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payslip_alert_deliveries_run ON payslip_alert_deliveries(payroll_run_id);
