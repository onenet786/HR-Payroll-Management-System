CREATE TABLE IF NOT EXISTS mfa_email_enrollments (
  id UUID PRIMARY KEY,
  user_id VARCHAR(240) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_email_enrollments_user_expiry ON mfa_email_enrollments(user_id, expires_at);
