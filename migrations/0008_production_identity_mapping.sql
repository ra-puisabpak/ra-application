-- Production identity mapping.
-- Replace the placeholder emails below with the exact emails emitted by Cloudflare Access.
-- No passwords or access tokens are stored in D1.
-- Run only after reviewing the approved user/role matrix.

-- Example pattern:
-- UPDATE users SET email = 'real-ra@example.com' WHERE id = 'bootstrap-ra';
-- UPDATE users SET email = 'real-qa@example.com' WHERE id = 'bootstrap-qa';
-- UPDATE users SET email = 'real-qc@example.com' WHERE id = 'bootstrap-qc';
-- UPDATE users SET email = 'real-dcc@example.com' WHERE id = 'bootstrap-dcc';
-- UPDATE users SET email = 'real-rnd@example.com' WHERE id = 'bootstrap-rnd';
-- UPDATE users SET email = 'real-management@example.com' WHERE id = 'bootstrap-management';

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email);
