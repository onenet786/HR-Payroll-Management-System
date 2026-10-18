CREATE TABLE IF NOT EXISTS mfa_email_login_codes (
  challenge_hash CHAR(64) PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 1 CHECK (send_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_email_login_codes_expiry ON mfa_email_login_codes(expires_at);
