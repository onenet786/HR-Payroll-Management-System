-- Maker-checker proposals for statutory rates and employee lifecycle changes.

CREATE TABLE IF NOT EXISTS statutory_change_requests (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240),
  status VARCHAR(80) NOT NULL DEFAULT 'Pending',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_statutory_change_status ON statutory_change_requests(status);
-- At most one open proposal at a time keeps reviewers from approving stale, overlapping edits.
CREATE UNIQUE INDEX IF NOT EXISTS idx_statutory_change_single_pending ON statutory_change_requests((status)) WHERE status = 'Pending';

CREATE TABLE IF NOT EXISTS lifecycle_requests (
  id VARCHAR(240) PRIMARY KEY,
  employee_id VARCHAR(240),
  status VARCHAR(80) NOT NULL DEFAULT 'Pending',
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lifecycle_requests_employee ON lifecycle_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_lifecycle_requests_status ON lifecycle_requests(status);
