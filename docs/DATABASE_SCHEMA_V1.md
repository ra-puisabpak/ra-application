# Database Schema v1 — Controlled RA/QMS Records

## Identity
- users
- roles
- user_roles

## Product and regulatory master
- products
- regulatory_files
- registrations

## Formula and process
- formulas
- formula_ingredients
- process_flows
- haccp_references
- specifications

## Label and artwork
- labels
- files

## Regulatory actions
- authority_queries
- change_controls

## Workflow / evidence / audit
- approval_steps
- evidence
- audit_events
- notifications

## Core constraints
1. Product code is unique.
2. Controlled revisions are unique within their product/document context.
3. Formula total must equal 100 before READY_TO_SUBMIT/APPROVED.
4. APPROVED/EFFECTIVE records retain approval evidence and audit history.
5. Audit events are append-only.
6. Obsolete files/documents cannot be selected as current references.
7. Change controls cannot be implemented while mandatory impact decisions remain unresolved.
