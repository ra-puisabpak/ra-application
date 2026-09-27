# Master & Reference Data Control v1

## Purpose
Provide controlled shared identifiers and code lists for production RA/QMS modules.

## Master data domains
- Product
- Ingredient
- Supplier
- Controlled Document
- Regulation
- Code Lists

## Control rules
- Codes are unique within their entity type.
- Only ACTIVE master data should be selectable for new controlled transactions.
- Effective/obsolete dates are retained for traceability.
- Reference data sets are versioned and have an effective date.
- Existing historical records retain their original references; changing master data must not rewrite historical audit records.

## Integration
Master data is referenced by Formula, Process, Specification, Label, Registration, Supplier Control, Document Control, CAPA, Change Control and KPI aggregation.

## Important boundary
This contract defines data-control structure only. It does not establish legal/regulatory values or determine whether an ingredient, additive, product category or regulation is legally permitted. Those decisions require controlled regulatory evidence.
