-- Bootstrap identities for first deployment.
-- Replace these placeholder emails with the real Cloudflare Access emails before production use.
INSERT OR IGNORE INTO users (id, email, display_name) VALUES
  ('bootstrap-ra', 'ra@puisabpak.local', 'Puisabpak RA'),
  ('bootstrap-qa', 'qa@puisabpak.local', 'Puisabpak QA'),
  ('bootstrap-qc', 'qc@puisabpak.local', 'Puisabpak QC'),
  ('bootstrap-dcc', 'dcc@puisabpak.local', 'Puisabpak DCC'),
  ('bootstrap-rnd', 'rnd@puisabpak.local', 'Puisabpak R&D'),
  ('bootstrap-management', 'management@puisabpak.local', 'Puisabpak Management');

INSERT OR IGNORE INTO user_roles (user_id, role, can_approve) VALUES
  ('bootstrap-ra', 'RA', 1),
  ('bootstrap-qa', 'QA', 1),
  ('bootstrap-qc', 'QC', 0),
  ('bootstrap-dcc', 'DCC', 0),
  ('bootstrap-rnd', 'R&D', 0),
  ('bootstrap-management', 'MANAGEMENT', 1);
