-- Repairs installations where migrations 011/012 were recorded without their
-- Email MFA tables. All statements are idempotent and preserve existing data.
CREATE TABLE IF NOT EXISTS mfa_email_login_codes (
  challenge_hash CHAR(64) PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 1 CHECK (send_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_email_login_codes_expiry ON mfa_email_login_codes(expires_at);

CREATE TABLE IF NOT EXISTS mfa_email_enrollments (
  id UUID PRIMARY KEY,
  user_id VARCHAR(240) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_email_enrollments_user_expiry ON mfa_email_enrollments(user_id, expires_at);
