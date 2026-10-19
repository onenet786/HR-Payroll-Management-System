-- Installation-wide settings that are not HR documents: today only the product edition
-- ("full" or "lite") chosen by the vendor from the edition console. A missing row means the full edition.
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
