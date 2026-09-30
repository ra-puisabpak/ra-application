-- Production & QC control: batch, process checks, QC records and hold/release decision
CREATE TABLE IF NOT EXISTS production_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  batch_lot TEXT NOT NULL UNIQUE,
  production_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROCESS','QC_PENDING','HOLD','READY_FOR_RELEASE','RELEASED','CLOSED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS production_batches_status_idx ON production_batches(status);
CREATE INDEX IF NOT EXISTS production_batches_product_idx ON production_batches(product_id);

CREATE TABLE IF NOT EXISTS production_process_records (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES production_batches(id),
  step_name TEXT NOT NULL,
  observed_value TEXT,
  unit TEXT,
  operator_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evidence_ids_json TEXT
);
CREATE INDEX IF NOT EXISTS production_process_records_batch_idx ON production_process_records(batch_id);

CREATE TABLE IF NOT EXISTS qc_checks (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES production_batches(id),
  check_type TEXT NOT NULL CHECK (check_type IN ('INCOMING','IN_PROCESS','FINISHED_PRODUCT')),
  parameter TEXT NOT NULL,
  specification TEXT,
  result_value TEXT,
  unit TEXT,
  result_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (result_status IN ('PENDING','PASS','FAIL','N_A','HOLD')),
  checked_by TEXT NOT NULL,
  checked_at TEXT,
  evidence_ids_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS qc_checks_batch_idx ON qc_checks(batch_id);
CREATE INDEX IF NOT EXISTS qc_checks_status_idx ON qc_checks(result_status);

CREATE TABLE IF NOT EXISTS product_release_decisions (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES production_batches(id),
  decision TEXT NOT NULL CHECK (decision IN ('HOLD','RELEASE','REJECT')),
  reason TEXT,
  decided_by TEXT NOT NULL,
  decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS product_release_batch_idx ON product_release_decisions(batch_id);
