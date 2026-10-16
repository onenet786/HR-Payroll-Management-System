CREATE TABLE IF NOT EXISTS mfa_recovery_requests (
  id UUID PRIMARY KEY,
  user_id VARCHAR(240) NOT NULL,
  requested_by_id VARCHAR(240) NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  status VARCHAR(20) NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_id VARCHAR(240),
  resolution_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_status ON mfa_recovery_requests(status, requested_at);
-- Enforces the one-open-request rule even if two requests arrive concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mfa_recovery_one_pending_per_user
  ON mfa_recovery_requests(user_id)
  WHERE status = 'Pending';
