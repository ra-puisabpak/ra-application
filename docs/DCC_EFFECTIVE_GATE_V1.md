# DCC Controlled Document Revision & Effective Gate v1

## Purpose
Control the transition of a controlled document revision from approval to effective implementation.

## Controlled chain
Regulatory Update → Impact Assessment → Change Control → Document Revision → Review → Approval → Training → Effective Implementation → Audit Trail.

## Gate requirements
Before a revision becomes effective, the system validates:
- actor identity is present;
- current revision matches the required revision;
- approval evidence is verified;
- applicable Change Control is resolved;
- required training is completed;
- an Effective Date exists when the target state is EFFECTIVE.

## Obsolete control
An obsolete revision must not remain the current controlled revision. Historical revisions remain traceable for audit purposes.

## Boundary
This gate controls workflow integrity. It does not determine whether a regulatory change is legally applicable; that determination remains a Regulatory decision supported by the Regulatory Source Register and evidence.
