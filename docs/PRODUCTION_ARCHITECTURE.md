# Production Architecture — Puisabpak RA / QMS

## Purpose
Move the current mobile prototype toward a controlled production system without replacing the existing RA/QMS rules.

## Core principle
The mobile client is a user interface, not the system of record. Controlled records must be stored in a server-side database with authenticated identity, role-based access, approval history, file metadata, audit trail, and revision control.

## Logical layers
1. Mobile/Web UI — dashboard, product regulatory master, formula, label, FDA submission, authority query, change control, DCC/QMS, KPI.
2. Application/API — validation, workflow rules, permission gates, impact assessment, transaction boundaries.
3. Identity & Authorization — authenticated user, role, permission, site scope, approval authority.
4. Database — controlled master data and transaction history.
5. File/Evidence Storage — immutable evidence references and approved artwork/document versions.
6. Audit & Notification — audit events, overdue actions, approval requests, authority-query deadlines.

## Minimum production entities
- users
- roles
- user_roles
- products
- regulatory_files
- formulas
- formula_ingredients
- process_flows
- haccp_references
- specifications
- labels
- registrations
- authority_queries
- change_controls
- approvals
- approval_steps
- documents
- document_revisions
- evidence
- suppliers
- supplier_documents
- capas
- audit_events
- notifications

## Controlled relationship
Product → Formula → Process Flow → HACCP → Product Specification → Label → FDA Registration → Approved Artwork → Commercial Release → Change Control → Audit Trail.

## Approval rule
A record cannot become EFFECTIVE/APPROVED solely because the client changes a status field. The API must verify the user's authenticated role, required approval step, current revision, and evidence before committing the approval transaction.

## File rule
Files are evidence objects, not free-text fields. Store file metadata separately: id, document/evidence type, record id, revision, storage key, checksum, uploaded by, uploaded at, verification status, effective/obsolete dates.

## Audit rule
Every create/update/submit/approve/reject/return/effective/obsolete/change-control action must create an append-only audit event containing actor, role, timestamp, module, record, previous state, new state, and reason/comment where applicable.

## Data integrity rules
- Formula total must be validated before submission/approval.
- READY_TO_SUBMIT requires Formula, Process, Specification and Label references.
- APPROVED product requires current Formula/Label/Specification revisions.
- EFFECTIVE label must point to the approved registration/product revision where applicable.
- Obsolete documents cannot be selected as current controlled references.
- Regulatory conclusions require evidence and a checked-source date.
- Post-approval changes require impact assessment before implementation.
- No current legal requirement is inferred from model memory; current official requirements must be verified during regulatory review.

## Security baseline
- Passwords are never stored by the application database in plain text.
- Sessions/tokens are server-managed.
- Least-privilege role permissions.
- Approval authority is separate from edit permission where required.
- Production attachments are access-controlled and auditable.
- Backup/restore procedures must be tested.

## Migration approach
Phase 1: keep the v6 prototype usable and define production contracts.
Phase 2: introduce API/database adapters while retaining the current UI.
Phase 3: move master data and transactions to the server database.
Phase 4: enable authenticated approvals, evidence storage, notifications and audit trail.
Phase 5: retire local-only controlled storage after reconciliation and acceptance testing.

## Important limitation
This architecture does not select a legal database, Thai FDA classification, or regulatory conclusion. Those require current official-source verification for each actual product/application.
