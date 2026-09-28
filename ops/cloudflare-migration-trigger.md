# Cloudflare D1 migration deployment trigger

This file is intentionally non-runtime. Its purpose is to trigger the configured Cloudflare Workers Build on `main` so the deployment command `npm run deploy` can apply migrations 0001-0008 to the remote D1 database before deploying the Worker.

Do not run migrations manually from a local terminal for this deployment path.
