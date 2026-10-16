-- Registered kiosk terminals. Each terminal signs in once with a Kiosk Terminal account and then uses a
-- device key (only its hash is stored) for every sync and punch. Revoking a row disconnects that terminal.
CREATE TABLE IF NOT EXISTS kiosk_devices (
  id UUID PRIMARY KEY,
  user_id VARCHAR(240) NOT NULL,
  name VARCHAR(120) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_ip TEXT,
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kiosk_devices_user ON kiosk_devices(user_id);
