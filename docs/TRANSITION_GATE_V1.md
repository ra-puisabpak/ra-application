# Controlled Transition Gate v1

The transition gate is the common business-rule boundary before a controlled record changes lifecycle state.

## Gate checks
1. Authenticated actor is present.
2. Data Integrity Engine has no blocking errors.
3. The approved/requested revision matches the current revision when a revision is required.
4. SUBMITTED, APPROVED and EFFECTIVE require verified evidence.
5. APPROVED requires a pending approval step.
6. APPROVED requires the actor to be authorized for that approval step.

The gate returns stable blocker codes and does not mutate data. The service/API layer should execute the gate before the controlled transaction and persist the state change plus audit event atomically where the database supports transactions.
