CREATE TABLE IF NOT EXISTS document_approval_steps (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  revision TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  required_role TEXT NOT NULL CHECK (required_role IN ('RA','QA','QC','DCC','R&D','MANAGEMENT')),
  status TEXT NOT NULL CHECK (status IN ('WAITING','PENDING','APPROVED','REJECTED','RETURNED')),
  approver_id TEXT REFERENCES users(id),
  decided_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, revision, sequence)
);
CREATE INDEX IF NOT EXISTS document_approval_pending_idx
  ON document_approval_steps(document_id, revision, status, sequence);
