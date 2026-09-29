-- QA/CAPA management: NC and CAPA lifecycle
CREATE TABLE IF NOT EXISTS nonconformities (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_record_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  owner_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','CONVERTED_TO_CAPA','CLOSED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS nonconformities_status_idx ON nonconformities(status);
CREATE INDEX IF NOT EXISTS nonconformities_owner_idx ON nonconformities(owner_id);

CREATE TABLE IF NOT EXISTS capas (
  id TEXT PRIMARY KEY,
  nonconformity_id TEXT NOT NULL REFERENCES nonconformities(id),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ROOT_CAUSE_ANALYSIS','ACTION_PLANNING','IMPLEMENTATION','EFFECTIVENESS_CHECK','CLOSED','REJECTED')),
  owner_id TEXT NOT NULL,
  root_cause_method TEXT,
  root_cause TEXT,
  containment TEXT,
  effectiveness_criteria TEXT,
  verified_by TEXT,
  verified_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS capas_status_idx ON capas(status);
CREATE INDEX IF NOT EXISTS capas_nc_idx ON capas(nonconformity_id);

CREATE TABLE IF NOT EXISTS capa_actions (
  id TEXT PRIMARY KEY,
  capa_id TEXT NOT NULL REFERENCES capas(id),
  type TEXT NOT NULL CHECK (type IN ('CORRECTION','CORRECTIVE_ACTION','PREVENTIVE_ACTION')),
  description TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  due_date TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','COMPLETED','OVERDUE')),
  evidence_ids_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS capa_actions_capa_idx ON capa_actions(capa_id);
