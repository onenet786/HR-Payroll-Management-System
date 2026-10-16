-- The original check only allowed create/update/delete/import, which made every domain audit event
-- (document vault uploads, payslip email/alert batches, MFA recovery decisions) fail at insert time.
-- Keep a structural guard instead of an ever-growing allow-list.
ALTER TABLE hr_audit_log DROP CONSTRAINT IF EXISTS hr_audit_log_action_check;
ALTER TABLE hr_audit_log ADD CONSTRAINT hr_audit_log_action_check CHECK (action ~ '^[a-z][a-z_]{1,63}$');
