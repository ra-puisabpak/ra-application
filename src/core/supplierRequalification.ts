export type SupplierQualificationStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'QUALIFIED'
  | 'CONDITIONAL'
  | 'SUSPENDED'
  | 'DISQUALIFIED'
  | 'EXPIRED';

export type SupplierRegulatoryRequirement = {
  id: string;
  supplierId: string;
  ingredientIds: string[];
  requiredDocumentTypes: string[];
  receivedEvidenceIds: string[];
  checkedDate?: string;
  expiryDate?: string;
  status: SupplierQualificationStatus;
  ownerId?: string;
  nextReviewDate?: string;
};

export type SupplierRequalificationTrigger =
  | 'DOCUMENT_EXPIRY'
  | 'REGULATORY_CHANGE'
  | 'INGREDIENT_CHANGE'
  | 'SUPPLIER_CHANGE'
  | 'NONCONFORMITY'
  | 'AUDIT_FINDING'
  | 'PERIODIC_REVIEW';

export const supplierQualificationHasRequiredEvidence = (
  requirement: SupplierRegulatoryRequirement,
): boolean =>
  requirement.requiredDocumentTypes.length > 0 &&
  requirement.receivedEvidenceIds.length >= requirement.requiredDocumentTypes.length;

export const requiresSupplierRequalification = (
  trigger: SupplierRequalificationTrigger,
): boolean =>
  [
    'DOCUMENT_EXPIRY',
    'REGULATORY_CHANGE',
    'INGREDIENT_CHANGE',
    'SUPPLIER_CHANGE',
    'NONCONFORMITY',
    'AUDIT_FINDING',
    'PERIODIC_REVIEW',
  ].includes(trigger);
