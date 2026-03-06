-- Connessioni ai pod salvate dall'utente
CREATE TABLE connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  mode          TEXT NOT NULL CHECK (mode IN ('auto', 'manual')),
  pod_url       TEXT NOT NULL,
  api_token     TEXT NOT NULL,
  runpod_api_key TEXT,
  pod_id        TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT false,
  last_health   JSONB,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un solo record con is_active = true
CREATE UNIQUE INDEX idx_connections_active ON connections (is_active) WHERE is_active = true;

-- Job di upscaling
CREATE TABLE jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_job_id        TEXT NOT NULL UNIQUE,
  connection_id        UUID NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued', 'processing', 'completed', 'error')),
  progress             INTEGER NOT NULL DEFAULT 0,
  current_node         TEXT,
  elapsed_seconds      INTEGER NOT NULL DEFAULT 0,
  message              TEXT,
  video_filename       TEXT NOT NULL,
  target_height        INTEGER NOT NULL,
  interpolate          BOOLEAN NOT NULL DEFAULT false,
  fps_multiplier       INTEGER NOT NULL DEFAULT 2,
  output_filename      TEXT,
  source_width         INTEGER,
  source_height        INTEGER,
  source_fps           REAL,
  source_duration      REAL,
  source_total_frames  INTEGER,
  source_codec         TEXT,
  source_file_size     BIGINT,
  output_remote_filename TEXT,
  output_downloaded_path TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at         TIMESTAMPTZ
);

CREATE INDEX idx_jobs_connection ON jobs(connection_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);

-- Preferenze utente
CREATE TABLE preferences (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_connections_updated
  BEFORE UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_jobs_updated
  BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_preferences_updated
  BEFORE UPDATE ON preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at();
