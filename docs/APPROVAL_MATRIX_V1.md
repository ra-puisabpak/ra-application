# Approval Matrix v1

| Module | Submit | Required approval | Effective gate |
|---|---|---|---|
| Product Regulatory Master | RA | RA + Management where designated | Registration/product record aligned |
| Formula | R&D/RA | QA + RA | Formula validated and evidence linked |
| Label | RA | RA + QA | Approved artwork + current references |
| FDA Submission | RA | RA | Checklist complete + evidence |
| Authority Query | RA | RA | Response evidence + submission record |
| Change Control | Change owner | Impacted roles as applicable | Impact assessment closed + required revisions/training |
| Controlled Document | DCC owner | Document approver(s) per document class | Effective date set; prior revision obsolete |

## Enforcement
- UI may hide actions the role cannot perform, but API must enforce the same permission.
- Approval must reference the exact record revision.
- Rejected/returned records are not approved.
- Material revision requires re-approval.
