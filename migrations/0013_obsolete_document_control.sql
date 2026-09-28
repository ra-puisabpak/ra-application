ALTER TABLE documents ADD COLUMN superseded_by TEXT REFERENCES documents(id);
CREATE INDEX IF NOT EXISTS documents_superseded_idx ON documents(superseded_by);

CREATE TABLE IF NOT EXISTS document_obsolete_events (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  reason TEXT NOT NULL,
  obsolete_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  obsolete_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS document_obsolete_events_idx ON document_obsolete_events(document_id, obsolete_at DESC);