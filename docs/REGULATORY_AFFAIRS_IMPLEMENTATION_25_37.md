# Regulatory Affairs Implementation 25–37

## Scope
This layer extends the existing Puisabpak RA mobile prototype with controlled Regulatory Affairs data structures.

## Core relationship
Product Regulatory Master → Formula → Process Flow → HACCP → Product Specification → Label → FDA Registration → Approved Artwork → Commercial Production.

External Regulation → Regulatory Impact Assessment → Change Control → DAR → Document Revision → Training → Effective Implementation.

## Controls
- Every product has a Regulatory File.
- Formula total is validated against 100%.
- Formula, Process, Specification and Label carry explicit revision fields.
- Registration uses the controlled lifecycle from Requirement 26.
- Authority queries retain response/evidence fields and status history.
- Post-approval changes require Regulatory Impact Assessment.
- Regulatory decisions require evidence/reference fields.
- INS number alone is not treated as proof of permissibility.
- Current legal requirements must be verified before a legal/registration conclusion.
- The system does not guarantee Thai FDA approval.

## Next UI layer
Dashboard, Product Regulatory Master, Regulatory File, Classification Review, Formula Review, Label Review, FDA Submission Checklist, Authority Query, Post-Approval Change Control and Audit Trail.
