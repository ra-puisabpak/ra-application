# Puisabpak RA Application

Cloudflare foundation for the controlled Regulatory Affairs / QMS application.

## Services

- **Workers**: API, workflow enforcement, authorization boundary and audit writing.
- **D1**: controlled transactional metadata (products, users, evidence and audit events).
- **R2**: non-public evidence object storage; D1 stores the controlled metadata only.
- **Cloudflare Access**: identity boundary. The Worker requires `CF-Access-Authenticated-User-Email` and `CF-Access-Roles` headers on protected routes. Configure Access to inject roles before production deployment.

## Local setup

1. Install dependencies: `npm install`
2. Create a local D1 schema: `npm run db:migrate:local`
3. Check the project: `npm run typecheck && npm test`
4. Run the Worker locally: `npm run dev`

Before remote deployment, create the D1 database and R2 bucket, then replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`. Do not deploy that placeholder configuration.

## Initial routes

- `GET /health` (public)
- `GET /auth/me`
- `GET /products`
- `POST /products` (RA or R&D)
- `PUT /files/upload/:evidenceId`

Every protected request needs Cloudflare Access identity headers. Evidence uploads remain private in R2; the Worker validates the evidence record and writes an audit event after upload.

## Safety boundary

The service enforces application workflow and record controls. Regulatory classifications and legal conclusions must still be confirmed by the responsible RA reviewer using current official sources.
