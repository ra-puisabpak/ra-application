# Production Deployment Runbook

This repository is prepared for a Cloudflare Workers + D1 + R2 deployment.

## 1. Cloudflare resources

Create:

- Worker: `puisabpak-regulatory`
- D1 database: `ra-application`
- R2 bucket: `ra-application-evidence`
- Cloudflare Access application protecting the Worker hostname

The Worker must use the D1 database ID in `wrangler.jsonc`. Replace the placeholder value before deployment.

## 2. Bootstrap identities

Migration `0004_seed_bootstrap_roles.sql` creates six placeholder identities and roles. **Do not use the placeholder `@puisabpak.local` emails in production.**

Before production:

1. Apply migrations to a controlled database.
2. Replace each placeholder email with the real email that Cloudflare Access sends in `cf-access-authenticated-user-email`.
3. Keep only active users who are authorized to use the system.
4. Review `can_approve` for each role according to the approved authorization matrix.

The application does not store passwords. Cloudflare Access is the authentication boundary; the Worker resolves the authenticated email to the D1 user and role records.

## 3. Apply migrations

Local:

```bash
npm install
npm run db:migrate:local
```

Remote:

```bash
npm run db:migrate
```

Review the migration result before using the remote database.

## 4. Validate the code

```bash
npm run typecheck
npm test
```

## 5. Deploy

After `database_id`, D1, R2 and Access are configured:

```bash
npm run deploy
```

Cloudflare Workers Static Assets packages the `ui/` directory with the Worker. API routes are handled by the Worker and the connected entry page reads `/auth/me` and `/products`.

## 6. Cloudflare Access

Configure the Access application so authorized users can reach the Worker hostname.

The Worker expects:

- `CF-Access-Authenticated-User-Email`
- a D1 user whose email matches the authenticated email
- one or more D1 role records

Do not rely on a client-side role selector for authorization. The Worker remains the source of truth for protected actions.

## 7. First smoke test

After Access login:

1. Open the Worker URL.
2. Confirm the entry page loads.
3. Confirm the signed-in email and roles are shown.
4. Confirm Product count is returned from D1.
5. Open Products and confirm records come from `GET /products`.
6. Confirm an unauthorized role receives `403` for protected mutation/approval routes.
7. Confirm an unknown Access email cannot enter the application.

## 8. Production safety

- Never commit API tokens, Cloudflare credentials or secrets.
- Never deploy with `REPLACE_WITH_D1_DATABASE_ID`.
- Do not treat placeholder seed identities as production users.
- Keep R2 evidence private.
- Keep audit events append-only.
- Regulatory decisions must continue to use current official sources and verified evidence.
