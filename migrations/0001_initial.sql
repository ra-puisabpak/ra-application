PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('RA','QA','QC','DCC','R&D','MANAGEMENT')),
  can_approve INTEGER NOT NULL DEFAULT 0 CHECK (can_approve IN (0,1)),
  site_id TEXT,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  product_code TEXT NOT NULL UNIQUE,
  thai_name TEXT NOT NULL,
  english_name TEXT,
  site_id TEXT NOT NULL,
  revision TEXT NOT NULL DEFAULT 'Rev.00',
  state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (state IN ('DRAFT','IN_REVIEW','PENDING_APPROVAL','APPROVED','EFFECTIVE','OBSOLETE','REJECTED','RETURNED')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  title TEXT NOT NULL,
  revision TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verification_status TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (verification_status IN ('UPLOADED','PENDING_VERIFICATION','VERIFIED','REJECTED')),
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT
);

CREATE INDEX evidence_record_idx ON evidence(record_type, record_id, revision, verification_status);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT,
  reason TEXT,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX audit_events_record_idx ON audit_events(record_type, record_id, created_at);
CREATE INDEX audit_events_actor_idx ON audit_events(actor_id, created_at);
