ALTER TABLE evidence ADD COLUMN checksum TEXT;

CREATE INDEX evidence_checksum_idx ON evidence(checksum);
