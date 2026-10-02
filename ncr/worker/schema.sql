-- Puisabpak NCR e-Form — database schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  username      TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('QA_MANAGER','FSTL','QC','SUPERVISOR','VIEWER')),
  pass_hash     TEXT NOT NULL,
  salt          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  locked_until  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  created_by    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ncr_records (
  ncr_id            TEXT PRIMARY KEY,
  issue_date        TEXT NOT NULL,
  lot_no            TEXT,
  product_lot_no    TEXT,
  found_date        TEXT,
  found_time        TEXT,
  reported_by       TEXT,
  process_ref       TEXT,
  source_type       TEXT CHECK(source_type IN ('RM_RECEIVING','IN_PROCESS','CCP','FINAL_QC','WAREHOUSE','COMPLAINT','AUDIT','MAINTENANCE','FOOD_DEFENSE','FOOD_FRAUD','OTHER')) DEFAULT 'IN_PROCESS',
  source_ref        TEXT,
  material_code     TEXT,
  material_name     TEXT,
  supplier_id       TEXT,
  supplier_name     TEXT,
  parameter_id      TEXT,
  parameter_name    TEXT,
  critical_limit    TEXT,
  actual_result     TEXT,
  visual_check      TEXT,
  nc_description    TEXT NOT NULL,
  severity          TEXT CHECK(severity IN ('Critical','Major','Minor')) DEFAULT 'Major',
  allergen          TEXT,
  immediate_action  TEXT,
  defect_qty        REAL,
  defect_unit       TEXT,
  hold_location     TEXT,
  shipped_status    TEXT CHECK(shipped_status IN ('NOT_SHIPPED','SHIPPED')) DEFAULT 'NOT_SHIPPED',
  shipped_qty       REAL,
  shipped_customer  TEXT,
  recall_required   INTEGER,
  disposition       TEXT CHECK(disposition IN ('RELEASE','REWORK','SORT','DOWNGRADE','RETURN_SUPPLIER','DESTROY','RECALL') OR disposition IS NULL),
  disposition_reason TEXT,
  dispositioned_by  TEXT,
  dispositioned_at  TEXT,
  root_cause        TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  assignee          TEXT,
  target_date       TEXT,
  reply_date        TEXT,
  supplier_reply_by TEXT,
  supplier_reply_at TEXT,
  verification_result TEXT CHECK(verification_result IN ('Pending','Effective','Not Effective')) DEFAULT 'Pending',
  verification_note TEXT,
  verified_by       TEXT,
  verified_at       TEXT,
  status            TEXT NOT NULL CHECK(status IN ('Open','In Investigation','Pending Verification','Closed','Cancelled')) DEFAULT 'Open',
  status_reason     TEXT,
  closed_date       TEXT,
  closed_by         TEXT,
  days_open         INTEGER,
  related_capa_id   TEXT,
  photo_urls        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_by        TEXT NOT NULL,
  updated_by        TEXT
);
CREATE INDEX IF NOT EXISTS idx_ncr_status ON ncr_records(status);
CREATE INDEX IF NOT EXISTS idx_ncr_issue ON ncr_records(issue_date);

CREATE TABLE IF NOT EXISTS capa_actions (
  capa_id       TEXT PRIMARY KEY,
  source        TEXT DEFAULT 'NCR',
  source_ref    TEXT,
  description   TEXT NOT NULL,
  detail        TEXT,
  priority      TEXT CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')) DEFAULT 'MEDIUM',
  severity_label TEXT DEFAULT 'Major',
  responsible_person TEXT,
  target_date   TEXT,
  actual_completion TEXT,
  why1 TEXT, why2 TEXT, why3 TEXT, why4 TEXT, why5 TEXT,
  root_cause_summary TEXT,
  root_cause_analysis TEXT,
  fishbone_man TEXT, fishbone_machine TEXT, fishbone_material TEXT,
  fishbone_method TEXT, fishbone_environment TEXT, fishbone_measurement TEXT,
  containment_action TEXT,
  corrective_action  TEXT,
  preventive_action  TEXT,
  effectiveness_criteria   TEXT,
  effectiveness_check_date TEXT,
  effectiveness_result TEXT CHECK(effectiveness_result IN ('Effective','Not Effective','Partially Effective','Pending') OR effectiveness_result IS NULL),
  verified_by TEXT, verified_date TEXT,
  approved_by TEXT, approved_date TEXT,
  closed_by   TEXT, closed_date   TEXT,
  supplier_reply_by TEXT, supplier_reply_at TEXT,
  status TEXT CHECK(status IN ('Draft','Open','Root Cause Analysis','Action Planning','Implementation','Verification','Effectiveness Check','Closed Effective','Closed Not Effective','Cancelled')) DEFAULT 'Open',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_capa_src ON capa_actions(source_ref);

-- Reply links sent to a supplier: one NCR or one CAPA each. Only the hash of the token is stored.
CREATE TABLE IF NOT EXISTS supplier_links (
  token_hash  TEXT PRIMARY KEY,
  entity      TEXT NOT NULL CHECK(entity IN ('ncr','capa')),
  entity_id   TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  revoked     INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sl_entity ON supplier_links(entity, entity_id);

-- Append-only history of every change. The API never updates or deletes rows here.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  actor       TEXT NOT NULL,
  actor_type  TEXT NOT NULL CHECK(actor_type IN ('user','supplier','system')),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT,
  changes     TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
