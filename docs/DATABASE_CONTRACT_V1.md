# Database Contract v1

The database is the system of record for controlled RA/QMS transactions.

## Identity
- users
- roles
- user_roles

## Product / Regulatory
- products
- regulatory_files
- registrations
- authority_queries

## Product technical control
- formulas
- formula_ingredients
- process_flows
- haccp_references
- specifications
- labels
- artworks

## Change / Quality
- change_controls
- capas
- suppliers
- supplier_documents

## Controlled documentation
- documents
- document_revisions
- evidence

## Workflow / traceability
- approval_steps
- audit_events
- notifications

## Required relationships
products 1—1 regulatory_files
products 1—N formulas
formulas 1—N formula_ingredients
products 1—N process_flows
products 1—N specifications
products 1—N labels
products 1—N registrations
registrations 1—N authority_queries
products 1—N change_controls
controlled records 1—N evidence
controlled records 1—N approval_steps
all mutable controlled records 1—N audit_events

## Integrity constraints
1. Product code is unique.
2. Revision identifiers are unique within their record family.
3. Formula total must equal 100% before READY_TO_SUBMIT or APPROVED.
4. APPROVED/EFFECTIVE records retain approval evidence and audit history.
5. OBSOLETE documents cannot be selected as current documents.
6. A registration cannot reference a non-approved formula/process/spec/label revision.
7. A change control cannot reach IMPLEMENTED while mandatory impact items remain unresolved.
8. Audit events are append-only.
9. Deleting controlled records is prohibited; use OBSOLETE/CANCELLED where applicable.
10. Every regulatory decision stores evidence reference and checked-source date.

## Migration principles
- Preserve legacy IDs where available.
- Never overwrite legacy source data during migration.
- Import into staging first.
- Validate relationships and formula totals before activation.
- Record migration batch, source, actor, timestamp and validation result.
- Reconciliation must be completed before migrated data becomes authoritative.
