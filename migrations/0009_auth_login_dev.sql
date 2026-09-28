-- Add password_hash column to support dev login
-- This is a temporary migration for development purposes
-- Production should use Cloudflare Access instead

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE INDEX users_email_active_idx ON users(email, active);
