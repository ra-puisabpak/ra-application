# Puisabpak Regulatory (Worker `puisabpak-regulatory`)

Single-file Cloudflare Worker: `worker.js` holds the API and the embedded web page.
It shares the D1 database `ra-application` (binding `DB`).

- **Deploy:** push to the branch `deploy/puisabpak-regulatory`; GitHub Actions runs `wrangler deploy`.
- **Database:** tables are created by hand from `migrations/` (already applied to production).
- `src/` keeps the KPI and photo-attachment parts as separate files for reading; `worker.js` is what runs.
