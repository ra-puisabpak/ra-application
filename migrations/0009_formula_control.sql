PRAGMA foreign_keys = ON;

CREATE TABLE formula_control (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  formula_code TEXT NOT NULL,
  formula_name TEXT NOT NULL,
  ingredients_json TEXT NOT NULL,
  validation_score INTEGER NOT NULL DEFAULT 0 CHECK (validation_score BETWEEN 0 AND 100),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('DRAFT', 'VALIDATED_100_PERCENT', 'REJECTED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, formula_code)
);

CREATE INDEX formula_control_product_idx ON formula_control(product_id, created_at DESC);
