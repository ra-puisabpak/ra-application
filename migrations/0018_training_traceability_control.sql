-- Training, competency and traceability/recall control
CREATE TABLE IF NOT EXISTS training_requirements (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('DOCUMENT_REVISION','REGULATORY_CHANGE','PROCESS_CHANGE','ROLE_COMPETENCY','CAPA')),
  source_record_id TEXT NOT NULL,
  document_revision TEXT,
  role_ids_json TEXT NOT NULL,
  required_by TEXT,
  status TEXT NOT NULL DEFAULT 'REQUIRED' CHECK (status IN ('REQUIRED','ASSIGNED','IN_PROGRESS','COMPLETED','WAIVED','OVERDUE','CANCELLED')),
  completion_evidence_ids_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS training_requirements_status_idx ON training_requirements(status);

CREATE TABLE IF NOT EXISTS competency_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  competency_code TEXT NOT NULL,
  assessed_date TEXT NOT NULL,
  assessor_id TEXT NOT NULL,
  valid_until TEXT,
  evidence_ids_json TEXT,
  status TEXT NOT NULL DEFAULT 'UNDER_REVIEW' CHECK (status IN ('VALID','EXPIRED','UNDER_REVIEW')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS competency_user_idx ON competency_records(user_id);

CREATE TABLE IF NOT EXISTS traceability_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('RECEIPT','PRODUCTION','PACKING','RELEASE','DISTRIBUTION','HOLD','WITHDRAWAL','RECALL')),
  from_type TEXT,
  from_id TEXT,
  to_type TEXT,
  to_id TEXT,
  event_date TEXT NOT NULL,
  evidence_ids_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS traceability_from_idx ON traceability_events(from_id);
CREATE INDEX IF NOT EXISTS traceability_to_idx ON traceability_events(to_id);
CREATE INDEX IF NOT EXISTS traceability_event_idx ON traceability_events(event_type);

CREATE TABLE IF NOT EXISTS recall_cases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ASSESSMENT','ACTION','VERIFICATION','CLOSED')),
  linked_nonconformity_id TEXT,
  linked_capa_id TEXT,
  evidence_ids_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS recall_status_idx ON recall_cases(status);

CREATE TABLE IF NOT EXISTS recall_affected_lots (
  id TEXT PRIMARY KEY,
  recall_id TEXT NOT NULL REFERENCES recall_cases(id),
  batch_lot TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS recall_lots_case_idx ON recall_affected_lots(recall_id);
