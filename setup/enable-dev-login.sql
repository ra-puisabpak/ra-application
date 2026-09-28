-- DEV LOGIN ONLY
-- Run this once in Cloudflare D1 Studio after migration 0010 is applied.
-- Login: ra@puisabpak.local
-- Password: admin123
-- Change/remove this password before any production use.

UPDATE users
SET password_hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
WHERE email = 'ra@puisabpak.local' AND active = 1;
