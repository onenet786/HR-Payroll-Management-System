-- Reports (server/reports.cjs): the audit log is read by date range, newest first.
CREATE INDEX IF NOT EXISTS idx_hr_audit_log_created ON hr_audit_log (created_at DESC);
-- The CyberAP archive viewer lists one kind (old table) at a time, by date.
CREATE INDEX IF NOT EXISTS idx_legacy_records_kind_date ON legacy_records (kind, record_date);
