# Notification & Overdue Engine v1

## Scope
Controlled deadline monitoring for FDA Query, CAPA, Change Control, Approval, Document Review and RA Task records.

## Status calculation
- UPCOMING: deadline is in the future and not completed.
- DUE_TODAY: deadline falls on the current calendar date.
- OVERDUE: deadline has passed and the record is not completed.
- COMPLETED: completion timestamp exists.
- CANCELLED: explicitly cancelled by the owning workflow.

## Notification
Notifications are addressed to the record owner and carry a priority. The engine only calculates and emits reminders; it does not approve, close, reject or otherwise mutate the controlled record.

## Auditability
Notification creation/read state should be auditable where required, while the source record remains the system of record for completion and status.
