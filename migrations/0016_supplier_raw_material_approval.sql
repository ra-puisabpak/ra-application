-- Supplier / Raw Material approval control. Criteria remain data-driven; no unsupported approval thresholds are invented.
CREATE TABLE IF NOT EXISTS supplier_master (
  supplier_id TEXT PRIMARY KEY,
  supplier_code TEXT NOT NULL UNIQUE,
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','SUSPENDED')),
  owner_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS supplier_raw_material_links (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES supplier_master(supplier_id),
  material_code TEXT NOT NULL REFERENCES ra_raw_material_master(material_code),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED')),
  evidence_status TEXT NOT NULL DEFAULT 'NOT_REVIEWED' CHECK(evidence_status IN ('NOT_REVIEWED','INCOMPLETE','COMPLETE')),
  reviewer_id TEXT,
  review_comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supplier_id, material_code)
);
CREATE TABLE IF NOT EXISTS supplier_approval_evidence (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES supplier_master(supplier_id),
  material_code TEXT,
  evidence_type TEXT NOT NULL,
  evidence_ref TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','REJECTED')),
  verified_by TEXT,
  verified_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS supplier_review_events (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES supplier_master(supplier_id),
  material_code TEXT,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  actor_id TEXT,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS supplier_status_idx ON supplier_master(status);
CREATE INDEX IF NOT EXISTS supplier_rm_status_idx ON supplier_raw_material_links(material_code,status);
CREATE INDEX IF NOT EXISTS supplier_evidence_idx ON supplier_approval_evidence(supplier_id,material_code,status);
