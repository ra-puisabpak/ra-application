CREATE TABLE approval_steps (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL CHECK (record_type = 'PRODUCT'),
  record_id TEXT NOT NULL REFERENCES products(id),
  revision TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  required_role TEXT NOT NULL CHECK (required_role IN ('RA', 'QA', 'QC', 'DCC', 'R&D', 'MANAGEMENT')),
  status TEXT NOT NULL CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED')),
  approver_id TEXT REFERENCES users(id),
  decided_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (record_type, record_id, revision, sequence)
);

CREATE INDEX approval_steps_pending_idx ON approval_steps(record_type, record_id, revision, status, sequence);
