# Data Integrity Engine v1

Central validation rules for controlled RA/QMS records before Submit, Approve and Effective transitions.

## Blocking rules
- Formula total must equal 100%.
- APPROVED products require a Regulatory File.
- APPROVED products require an EFFECTIVE label.
- READY_TO_SUBMIT requires required evidence.
- APPROVED products require Formula, Process, Specification and Label revisions.
- Obsolete documents cannot remain current.
- Approved controlled documents require an Effective Date.

The engine returns structured integrity issues with a stable code, message and severity. `ERROR` issues block controlled transitions; warnings may be surfaced without blocking unless a higher-level policy makes them mandatory.

The engine is intentionally independent of UI and persistence so the API/service layer can invoke the same rules consistently.
