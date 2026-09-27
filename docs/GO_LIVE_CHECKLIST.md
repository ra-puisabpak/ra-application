# Production Go-Live Checklist

## Confirmed in repository

- Cloudflare account ID configured.
- Production D1 database ID configured.
- R2 evidence bucket configured.
- Worker + UI Static Assets configured.
- D1 migrations 0002–0008 are versioned.
- Audit events are append-only at database level.
- Evidence records can carry SHA-256 checksum.
- Product, Task, Evidence and Approval API routes exist.
- My Tasks and Dashboard consume API data.

## Required in Cloudflare before first production login

1. Apply remote D1 migrations:
   `npm run db:migrate`
2. Confirm migration history has completed successfully.
3. Configure the R2 bucket `ra-application-evidence` and keep it private.
4. Configure Cloudflare Access for the Worker hostname.
5. Configure Access to provide the authenticated email and role context.
6. Replace the six bootstrap placeholder emails with the real approved user emails using the identity mapping migration.
7. Review `user_roles.can_approve` against the approved authorization matrix.
8. Confirm the D1 database ID and R2 bucket name are the intended production resources.
9. Deploy:
   `npm run deploy`
10. Smoke test after Access login.

## Smoke test

- `GET /health` returns healthy.
- `GET /auth/me` resolves the logged-in user and role.
- Dashboard loads D1 data.
- My Tasks loads only tasks owned by the logged-in user.
- Product creation is allowed only to authorized roles.
- Product edit respects version conflict control.
- Evidence upload reaches private R2 and stores checksum.
- Evidence verification is controlled by the backend.
- Approval actions are restricted by role and workflow state.
- Audit events are written and cannot be updated/deleted.
- An unknown Access email receives an authorization error.

## Do not mark Go-Live complete until

- Remote migration output has been reviewed.
- Cloudflare Access login has been tested with each production role.
- R2 upload/download behavior has been tested.
- At least one end-to-end Product → Evidence → Approval test has completed.
- No placeholder bootstrap email remains active.
- Production secrets/tokens are not committed to Git.
