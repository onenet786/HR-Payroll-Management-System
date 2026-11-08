-- OneNet Provider Console: its own database (not a client database). Clients' HR data never lives here.
CREATE TABLE IF NOT EXISTS provider_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'operator', 'viewer')),
  password_hash TEXT NOT NULL,
  totp_secret_cipher TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS provider_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES provider_users(id) ON DELETE CASCADE,
  mfa_ok BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_provider_sessions_user ON provider_sessions(user_id);

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{1,30}[a-z0-9]$'),
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning', 'active', 'suspended', 'archived', 'failed')),
  db_name TEXT NOT NULL UNIQUE,
  db_role TEXT NOT NULL UNIQUE,
  port INT NOT NULL UNIQUE,
  release TEXT NOT NULL DEFAULT '',
  edition JSONB NOT NULL DEFAULT '{"id":"full"}'::jsonb,
  licence JSONB NOT NULL DEFAULT '{}'::jsonb,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_domains (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('platform', 'subdomain', 'apex', 'nameservers')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending_dns' CHECK (status IN ('pending_dns', 'verified', 'attached', 'active', 'error', 'removed')),
  dns_ok BOOLEAN NOT NULL DEFAULT false,
  dns_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ssl_expires_at TIMESTAMPTZ,
  ssl_issuer TEXT,
  domain_expires_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_domains_client ON client_domains(client_id);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running', 'waiting', 'done', 'failed')),
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  file TEXT,
  bytes BIGINT,
  status TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  detail TEXT NOT NULL DEFAULT '',
  trigger TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_backups_client ON backups(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS health_checks (
  client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  api_ok BOOLEAN NOT NULL DEFAULT false,
  api_ms INT,
  db_bytes BIGINT,
  active_employees INT,
  attendance_today INT,
  kiosks_total INT,
  kiosks_seen_24h INT,
  last_kiosk_seen TIMESTAMPTZ,
  licence_state TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS provider_audit (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  client_id UUID,
  target TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_provider_audit_at ON provider_audit(at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_audit_client ON provider_audit(client_id, at DESC);

CREATE TABLE IF NOT EXISTS provider_settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
