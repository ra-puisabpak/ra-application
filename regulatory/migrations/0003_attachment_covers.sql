CREATE TABLE IF NOT EXISTS reg_attachment_covers ( id INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL, record_id TEXT NOT NULL, attachment_id INTEGER NOT NULL REFERENCES reg_attachments(id), set_by TEXT NOT NULL REFERENCES users(id), set_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE INDEX IF NOT EXISTS reg_attachment_covers_record_idx ON reg_attachment_covers(collection, record_id, id);
CREATE TRIGGER IF NOT EXISTS reg_attachment_covers_no_update BEFORE UPDATE ON reg_attachment_covers BEGIN SELECT RAISE(ABORT, 'LOCKED: cover history is append-only'); END;
CREATE TRIGGER IF NOT EXISTS reg_attachment_covers_no_delete BEFORE DELETE ON reg_attachment_covers BEGIN SELECT RAISE(ABORT, 'LOCKED: cover history is append-only'); END;
