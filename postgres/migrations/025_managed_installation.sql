-- Settings a hosting provider (the OneNet Provider Console) or the vendor console manages for an installation:
-- licence, extra domains, client data import switch (all stored in app_settings), plus one-time kiosk setup codes.
-- A kiosk setup code registers a terminal without typing an account password at the branch; only the token's
-- SHA-256 is stored. See server/installation.cjs.
CREATE TABLE IF NOT EXISTS kiosk_setup_tokens (
  id UUID PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_id VARCHAR(240) NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INT NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  uses INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kiosk_setup_tokens_active ON kiosk_setup_tokens(expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
