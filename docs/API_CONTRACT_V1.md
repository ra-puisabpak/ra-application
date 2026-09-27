# API Contract v1

## Authentication
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- GET /auth/me

## Products
- GET /products
- GET /products/:productId
- POST /products
- PATCH /products/:productId

## Regulatory File
- GET /products/:productId/regulatory-file
- PATCH /products/:productId/regulatory-file

## Formula
- GET /products/:productId/formulas
- POST /products/:productId/formulas
- PATCH /formulas/:formulaId
- POST /formulas/:formulaId/submit

## Label
- GET /products/:productId/labels
- POST /products/:productId/labels
- PATCH /labels/:labelId
- POST /labels/:labelId/submit

## Registration / Authority Query
- GET /products/:productId/registrations
- POST /products/:productId/registrations
- GET /registrations/:registrationId/queries
- POST /registrations/:registrationId/queries

## Change Control
- GET /change-controls
- POST /change-controls
- PATCH /change-controls/:changeControlId
- POST /change-controls/:changeControlId/submit

## Approval
- GET /approvals/:recordType/:recordId
- POST /approvals/:recordType/:recordId/approve
- POST /approvals/:recordType/:recordId/reject
- POST /approvals/:recordType/:recordId/return

## Evidence / Files
- POST /files/presign
- POST /files/complete
- GET /files/:fileId
- POST /evidence
- PATCH /evidence/:evidenceId/verify

## Audit
- GET /audit-events
- GET /audit-events/:recordType/:recordId

## API enforcement
Every mutation must:
1. Authenticate the actor.
2. Check role/permission.
3. Load the current record revision/state.
4. Validate business rules.
5. Write the controlled record and audit event in one transaction where supported.
6. Return the resulting revision/state.
