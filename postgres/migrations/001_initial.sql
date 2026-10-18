BEGIN;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto extension unavailable, proceeding with native PostgreSQL features';
END $$;


CREATE TABLE IF NOT EXISTS hr_documents (
  collection_name text NOT NULL,
  document_id text NOT NULL,
  employee_id text,
  status text,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_name, document_id),
  CHECK (length(collection_name) BETWEEN 1 AND 80),
  CHECK (length(document_id) BETWEEN 1 AND 240)
);

CREATE INDEX IF NOT EXISTS hr_documents_collection_employee_idx
  ON hr_documents (collection_name, employee_id);
CREATE INDEX IF NOT EXISTS hr_documents_collection_status_idx
  ON hr_documents (collection_name, status);
CREATE INDEX IF NOT EXISTS hr_documents_updated_idx
  ON hr_documents (updated_at, collection_name);
CREATE INDEX IF NOT EXISTS hr_documents_data_gin_idx
  ON hr_documents USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS hr_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_uid text NOT NULL,
  actor_role_id text,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'import')),
  collection_name text NOT NULL,
  document_id text NOT NULL,
  previous_version bigint,
  new_version bigint,
  previous_data jsonb,
  new_data jsonb,
  correlation_id uuid,
  source_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_audit_target_idx
  ON hr_audit_log (collection_name, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hr_audit_actor_idx
  ON hr_audit_log (actor_uid, created_at DESC);

CREATE TABLE IF NOT EXISTS migration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'rolled_back')),
  collection_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_checksums jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_checksums jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text
);

COMMIT;
