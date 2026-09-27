# Regulatory Traceability Matrix v1

## Controlled chain
Product → Regulatory File → Formula → Process → HACCP → Specification → Label → FDA Registration → Approved Artwork → Change Control → CAPA → Audit → Evidence.

The graph model stores explicit links between controlled records and the relationship type. Revision may be recorded on each link where the relationship is revision-sensitive.

## Traceability checks
The service layer can validate that required links exist before controlled lifecycle transitions. Missing links are returned as structured findings rather than silently inferred.

## Evidence principle
Regulatory decisions and approvals should retain links to supporting Evidence records. Historical links remain traceable even when a record becomes obsolete.

## Boundary
This contract defines traceability structure. It does not create missing records or infer that a relationship exists when the source system has not recorded it.
