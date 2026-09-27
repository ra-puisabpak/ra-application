# Regulatory Affairs & Thai FDA Registration — Functional Specification
## Modules 25–37 | Puisabpak RA Application

> Source of requirements: user-provided Requirement Modules 25–37.
> This document defines the functional baseline for implementation. It does not replace current Thai FDA/legal verification.

---

## 25. Regulatory Affairs & Thai FDA Registration

### Product lifecycle workflow

`PRODUCT_CONCEPT`
→ `REGULATORY_CLASSIFICATION`
→ `FORMULA_REVIEW`
→ `INGREDIENT_REVIEW`
→ `ADDITIVE_REVIEW`
→ `PRODUCT_NAME_REVIEW`
→ `PROCESS_REVIEW`
→ `PRODUCT_SPECIFICATION`
→ `LABEL_DRAFT`
→ `REGULATORY_GAP_REVIEW`
→ `SUBMISSION_PREPARATION`
→ `SUBMISSION`
→ `AUTHORITY_QUERY`
→ `REVISION_RESPONSE`
→ `APPROVAL`
→ `APPROVED_LABEL_CONTROL`
→ `COMMERCIAL_RELEASE`
→ `POST_APPROVAL_CHANGE_CONTROL`

Every product shall have its own Regulatory File.

---

## 26. Product Regulatory Master

Required fields:

- Product ID
- Product Code
- Brand
- Thai Product Name
- English Product Name
- Product Category
- Product Subcategory
- Regulatory Classification
- Product Condition: Raw / RTC / Par-cooked / RTE
- Storage Status: Chilled / Frozen / Other
- Registration Requirement
- Thai FDA Number
- Application Number
- Submission Date
- Approval Date
- Registration Status
- Manufacturing Site
- Formula Revision
- Process Revision
- Specification Revision
- Label Revision
- Regulatory Owner

Registration Status enum:

- CONCEPT
- CLASSIFICATION_REVIEW
- FORMULA_REVIEW
- LABEL_REVIEW
- DOCUMENT_PREPARATION
- READY_TO_SUBMIT
- SUBMITTED
- AUTHORITY_QUERY
- REVISION_REQUIRED
- APPROVED
- REJECTED
- CANCELLED
- POST_APPROVAL_CHANGE

---

## 27. Product Classification

Before submission, the system shall capture:

- Product characteristics
- Main ingredients
- Ingredient proportions
- Manufacturing process
- Heat treatment
- Raw / semi-cooked / cooked status
- Intended use
- Preparation before consumption
- Storage condition
- Shelf life
- Packaging format
- Target consumer group

Classification must not be determined from product name alone.

Classification assessment shall consider:

- Formula
- Process
- Intended Use
- Product Condition
- Regulatory Requirement

If information is insufficient, the system shall allow/require the statement:

> ต้องตรวจสอบข้อกำหนดปัจจุบันเพิ่มเติม

The system must not invent a food category or legal requirement.

---

## 28. Formula Control

Formula is Controlled Master Data.

Required fields:

- Formula ID
- Product
- Formula Revision
- Ingredient
- Ingredient Code
- Percentage
- Weight per Batch
- Function
- Supplier
- Regulatory Status
- Allergen Status
- Additive INS Number
- Maximum Permitted Level
- Actual Use Level
- Processing Aid Status

Validation / review checks:

- Total Formula = 100%
- Ingredient Name Consistency
- Allergen
- Food Additive
- Carry-over
- Processing Aid
- Customer Restriction
- Regulatory Restriction

Master Formula changes require Change Control.

---

## 29. Ingredient & Food Additive Compliance

Before a regulatory conclusion, capture/check:

- Product Category
- Applicable Regulation
- INS Number
- Functional Class
- Maximum Permitted Level
- GMP / QS Condition
- Actual Use Level
- Carry-over Principle
- Restriction
- Regulation Effective Date

INS number alone is not sufficient to conclude permissibility.

For legal/registration decisions the system shall capture:

- Current source/reference
- Verification date
- Mandatory requirement vs recommendation
- Evidence
- Decision / conclusion
- Reviewer

Outdated legal information shall not be used without current verification.

---

## 30. Product Name Control

Product name review shall be linked to:

- Formula
- Ingredients
- Process
- Raw / semi-cooked / cooked status
- Intended use
- Storage
- Product facts

Review fields:

- Thai Product Name
- English Product Name
- Brand
- Product Descriptor
- Frozen Declaration
- Ready-to-Cook Declaration
- Cooking Status

The system shall prevent unsupported/misleading naming decisions.

---

## 31. Label Compliance Management

Label checklist shall support at least:

- Food name
- Brand / trademark
- Thai FDA number when applicable
- Net quantity
- Ingredients
- Food additives
- Allergen information
- Manufacturer name/address
- Manufacturing date
- Expiry / Best Before
- Lot number
- Storage condition
- Preparation/cooking instruction
- Warning
- Nutrition information when applicable
- Barcode
- Customer requirements

Label workflow:

`DRAFT`
→ `REGULATORY_REVIEW`
→ `QA_REVIEW`
→ `APPROVED`
→ `EFFECTIVE`
→ `OBSOLETE`

Approved Artwork shall link to:

- Product
- Formula Revision
- Specification Revision
- Registration
- Packaging Material Code

Only the current approved artwork may be used commercially.

---

## 32. Thai FDA Submission Checklist

Checklist shall be configurable by:

- Product Type
- Regulatory Classification
- Application Type
- Manufacturing Site
- Current Requirement

Possible checklist items:

- Product Information
- Formula
- Ingredient Details
- Manufacturing Process
- Process Flow
- Product Specification
- Raw Material Specification
- Packaging Information
- Label Artwork
- Manufacturing Site Information
- Supporting Certificate
- Test Report
- Shelf-Life Evidence
- Regulatory Declaration

The system must not assume one checklist applies to every product.

---

## 33. Authority Query Management

Required fields:

- Query Number
- Product
- Application
- Query Date
- Authority Comment
- Responsible Person
- Required Action
- Due Date
- Response
- Evidence
- Submission Date
- Status

Status enum:

- OPEN
- UNDER_REVIEW
- RESPONSE_PREPARATION
- RESPONDED
- ACCEPTED
- REJECTED
- CLOSED

All query/response history shall be retained.

---

## 34. Post-Approval Change Control

Regulatory Impact Assessment shall be triggered by changes to:

- Product Name
- Brand
- Formula
- Ingredient
- Supplier
- Food Additive
- Process
- Equipment affecting process
- Manufacturing Site
- Packaging
- Label
- Net Weight
- Shelf Life
- Storage Condition

Mandatory impact questions:

1. Does it affect the registration number?
2. Does an amendment/submission become necessary?
3. Does it affect the label?
4. Does it affect HACCP?
5. Does it affect Product Specification?
6. Does it affect Shelf Life?
7. Does it affect Allergen declaration?
8. Does it affect Customer Approval?
9. Are SOP/WI/FM revisions required?
10. Is employee training required?

New commercial Formula / Process / Label revision shall not be used before the required Change Control is approved.

---

## 35. Regulatory Dashboard

Dashboard metrics:

- Products Under Development
- Products Under Formula Review
- Products Under Label Review
- Ready to Submit
- Submitted Applications
- Authority Queries
- Approved Products
- Registration Gaps
- Label Revision Mismatch
- Formula Revision Mismatch
- Pending Change Control
- Overdue Regulatory Actions

Management KPIs:

- Registration Completion Rate
- Average Submission Lead Time
- Authority Query Count
- First-Time Submission Acceptance Rate
- Label Compliance Rate
- Regulatory Action Overdue
- Approved Product Compliance Rate

---

## 36. DCC & Regulatory Integration

Core relationship:

Product Master
→ Formula
→ Process Flow
→ HACCP
→ Product Specification
→ Label
→ Thai FDA Registration
→ Approved Artwork
→ Commercial Production

Regulatory change relationship:

External Regulation
→ Regulatory Impact Assessment
→ Change Control
→ DAR
→ Document Revision
→ Training
→ Effective Implementation

Formula change impact assessment:

- Ingredient Compliance
- Additive Compliance
- Allergen
- Product Name
- Label
- Specification
- HACCP
- Shelf Life
- Registration

Process change impact assessment:

- Process Flow
- Hazard Analysis
- CCP
- Validation
- WI
- Product Specification
- Registration

Label change impact assessment:

- Regulatory Compliance
- Approved Registration Data
- Allergen Declaration
- Product Name
- Formula
- Packaging Material
- Customer Requirement

---

## 37. DCC & Regulatory Control Rules

System control rules:

1. No duplicate document code.
2. No duplicate revision.
3. Approved documents cannot be edited directly.
4. Obsolete documents cannot be used as current versions.
5. Master Document List must reconcile with actual controlled files.
6. Only Approved Formula may be used.
7. Only Approved Label may be used.
8. Legal conclusions must use current verified information where requirements may change.
9. Do not invent regulation numbers, legal requirements, or registration requirements.
10. Do not guarantee Thai FDA approval.
11. INS number alone cannot establish additive permissibility.
12. Registration data must remain linked to Formula, Process and Label.
13. Every Regulatory Decision requires Evidence.
14. Every post-approval change requires Impact Assessment.
15. Every controlled record requires an Audit Trail.

---

## Minimum Data Relationship Model

```
Product
 ├── Regulatory Classification
 ├── Formula (Revision Controlled)
 │    ├── Ingredients
 │    ├── Additives
 │    └── Allergens
 ├── Process Flow (Revision Controlled)
 ├── HACCP / Hazard Analysis
 ├── Product Specification
 ├── Label / Artwork (Revision Controlled)
 ├── FDA Registration / Application
 ├── Submission Checklist
 ├── Authority Queries
 ├── Regulatory Evidence
 ├── Change Control / Impact Assessment
 └── Commercial Release
```

---

## Audit Trail Requirements

For every controlled Regulatory record, retain:

- Record ID
- Action
- Previous Value / Revision
- New Value / Revision
- User
- Date/Time
- Reason
- Approval status
- Evidence/reference
- Related Change Control
- Related Product

---

## Implementation Note

This specification is the functional baseline for Modules 25–37.

It is intentionally written without inventing Thai FDA legal classifications, additive permissions, registration numbers, or current legal conclusions. Those decisions require verification against the current applicable official requirements at the time of each regulatory review.
