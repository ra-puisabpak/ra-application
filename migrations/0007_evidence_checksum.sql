-- checksum is created in 0001_foundation.sql.
-- Keep this migration versioned as a no-op to preserve the established sequence.
CREATE INDEX IF NOT EXISTS evidence_checksum_idx ON evidence(checksum);
