# Audit & Evidence Contract v1

## Audit
Every controlled mutation produces an append-only audit transaction containing actor, role, request ID, action, module, record identity, revision, state transition, reason and linked evidence.

Audit records cannot be edited or hard-deleted through the application.

## Evidence
Evidence is stored as a controlled object with record/revision linkage, evidence type, storage key, checksum, uploader, timestamp, verification status and optional effective/obsolete dates.

Only VERIFIED evidence may satisfy an approval evidence gate. A checksum is mandatory for approval-use evidence.

## Traceability
A regulatory decision must be traceable to its source evidence. Approval of a controlled revision must retain the evidence IDs used for that decision.

## Retention
Obsolete evidence remains traceable; it is not silently removed from the audit history.
