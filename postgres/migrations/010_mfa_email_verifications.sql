CREATE TABLE IF NOT EXISTS mfa_email_verifications (
  enrollment_id UUID PRIMARY KEY REFERENCES mfa_enrollments(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_email_verifications_expiry ON mfa_email_verifications(expires_at);
