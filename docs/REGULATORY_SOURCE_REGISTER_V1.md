# Regulatory Decision & Source Register v1

## Purpose
Maintain an auditable record of regulatory sources and decisions used by the RA workflow.

## Source register
Each source records its type, title, reference where applicable, source URL where available, effective date, checked date, current/superseded status, and supporting evidence reference.

## Decision register
Each regulatory decision records its subject, applicable product or ingredient where relevant, conclusion, status, source references, evidence references, checked date, decision owner, and superseded decision where applicable.

## Control rules
- A regulatory decision must retain at least one source reference and one evidence reference.
- The checked date is mandatory; the system must not silently treat an undated source as current verification.
- A source marked SUPERSEDED or UNKNOWN is not treated as a current authoritative source.
- Historical decisions remain traceable; they are not overwritten when a source changes.
- The register supports, but does not itself make, a legal conclusion.
- INS number alone is not sufficient evidence of additive permission.

## Traceability
Regulatory Decision → Source Register → Evidence → Product/Ingredient → Formula/Label/Registration/Change Control.
