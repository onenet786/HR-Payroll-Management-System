CREATE TABLE IF NOT EXISTS mfa_login_challenges (
  id UUID PRIMARY KEY,
  challenge_hash CHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(240) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_login_challenges_expiry ON mfa_login_challenges(expires_at);

CREATE TABLE IF NOT EXISTS mfa_enrollments (
  id UUID PRIMARY KEY,
  user_id VARCHAR(240) NOT NULL,
  secret_cipher TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_enrollments_expiry ON mfa_enrollments(expires_at);
