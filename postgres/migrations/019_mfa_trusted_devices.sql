-- Devices that may skip the MFA code for a limited time after a successful verified sign-in.
CREATE TABLE IF NOT EXISTS mfa_trusted_devices (
  id UUID PRIMARY KEY,
  user_id VARCHAR(240) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_agent_hash CHAR(64) NOT NULL,
  credential_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mfa_trusted_devices_user ON mfa_trusted_devices(user_id) WHERE revoked_at IS NULL;
