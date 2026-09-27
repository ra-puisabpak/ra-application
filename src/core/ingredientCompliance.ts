export type RegulatoryEvidenceStatus = 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'REJECTED';

export type SupplierRegulatoryDocumentType =
  | 'SPECIFICATION'
  | 'COA'
  | 'ALLERGEN_DECLARATION'
  | 'GMO_DECLARATION'
  | 'PROCESSING_AID_DECLARATION'
  | 'ADDITIVE_DECLARATION'
  | 'REGULATORY_CERTIFICATE'
  | 'OTHER';

export type SupplierRegulatoryEvidence = {
  id: string;
  supplierId: string;
  ingredientId: string;
  type: SupplierRegulatoryDocumentType;
  documentNo?: string;
  revision?: string;
  issuedDate?: string;
  expiryDate?: string;
  status: RegulatoryEvidenceStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  storageEvidenceId: string;
};

export type IngredientComplianceProfile = {
  ingredientId: string;
  supplierId: string;
  ingredientCode: string;
  allergenDeclared?: boolean;
  allergenEvidenceId?: string;
  additiveInsNumber?: string;
  functionalClass?: string;
  maximumPermittedLevel?: string;
  actualUseLevel?: string;
  processingAid?: boolean;
  carryOverRelevant?: boolean;
  regulatoryEvidenceIds: string[];
  complianceStatus: 'PENDING_REVIEW' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED';
  checkedSourceDate?: string;
};

export const canUseIngredientForRegulatoryApproval = (
  profile: IngredientComplianceProfile,
  evidence: SupplierRegulatoryEvidence[],
): boolean => {
  if (profile.complianceStatus !== 'VERIFIED') return false;
  if (!profile.checkedSourceDate) return false;
  const linked = evidence.filter((e) => profile.regulatoryEvidenceIds.includes(e.id));
  return linked.length > 0 && linked.every((e) => e.status === 'VERIFIED');
};
