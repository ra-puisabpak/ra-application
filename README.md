# Puisabpak RA Application

Cloudflare foundation for the controlled Regulatory Affairs / QMS application.

## Services

- **Workers**: API, workflow enforcement, authorization boundary and audit writing.
- **D1**: controlled transactional metadata (products, users, evidence and audit events).
- **R2**: non-public evidence object storage; D1 stores the controlled metadata only.
- **Cloudflare Access**: identity boundary. The Worker uses the authenticated email header, then resolves active users and roles from D1; client-provided role headers are never trusted.

## Local setup

1. Install dependencies: `npm install`
2. Create a local D1 schema: `npm run db:migrate:local`
3. Check the project: `npm run typecheck && npm test`
4. Run the Worker locally: `npm run dev`

Before remote deployment, create the D1 database and R2 bucket, then replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`. Do not deploy that placeholder configuration.

After migrating, provision approved users from the D1 console or a protected administration workflow. Cloudflare Access supplies the email identity, while D1 remains the source of truth for account activation and application roles:

```sql
INSERT INTO users (id, email, display_name) VALUES ('<uuid>', 'ra@example.com', 'RA Reviewer');
INSERT INTO user_roles (user_id, role, can_approve) VALUES ('<uuid>', 'RA', 1);
```

## Initial routes

- `GET /health` (public)
- `GET /auth/me`
- `GET /products`
- `POST /products` (RA or R&D)
- `GET/PATCH /products/:productId` (RA or R&D for updates)
- `POST /products/:productId/submit` (RA or R&D; verified evidence required)
- `POST /evidence`
- `PUT /files/upload/:evidenceId`
- `PATCH /evidence/:evidenceId/verify` (RA or QA)
- `POST /approvals/PRODUCT/:productId/{approve|reject|return}`

Every protected request needs an active Cloudflare Access identity mapped to a D1 user. Evidence uploads remain private in R2; the Worker validates the evidence record, restricts upload to its creator, and writes an audit event after each controlled action.

Product submission creates ordered RA and Management approval steps for the current revision. Each decision requires an application role with `can_approve = 1`; rejected and returned decisions require a comment.

## Safety boundary

The service enforces application workflow and record controls. Regulatory classifications and legal conclusions must still be confirmed by the responsible RA reviewer using current official sources.
