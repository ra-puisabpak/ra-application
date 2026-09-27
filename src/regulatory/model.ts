export type RegistrationStatus =
  | 'CONCEPT' | 'CLASSIFICATION_REVIEW' | 'FORMULA_REVIEW' | 'LABEL_REVIEW'
  | 'DOCUMENT_PREPARATION' | 'READY_TO_SUBMIT' | 'SUBMITTED' | 'AUTHORITY_QUERY'
  | 'REVISION_REQUIRED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'POST_APPROVAL_CHANGE';

export type AuthorityQueryStatus =
  | 'OPEN' | 'UNDER_REVIEW' | 'RESPONSE_PREPARATION' | 'RESPONDED' | 'ACCEPTED' | 'REJECTED' | 'CLOSED';

export type ProductRegulatoryMaster = {
  productId: string;
  productCode: string;
  brand: string;
  thaiProductName: string;
  englishProductName: string;
  productCategory: string;
  productSubcategory: string;
  regulatoryClassification: string;
  productCondition: 'RAW' | 'RTC' | 'PAR_COOKED' | 'RTE' | '';
  storageCondition: 'CHILLED' | 'FROZEN' | 'AMBIENT' | '';
  registrationRequirement: string;
  thaiFdaNumber: string;
  applicationNumber: string;
  submissionDate: string;
  approvalDate: string;
  registrationStatus: RegistrationStatus;
  manufacturingSite: string;
  formulaRevision: string;
  processRevision: string;
  specificationRevision: string;
  labelRevision: string;
  regulatoryOwner: string;
};

export type RegulatoryFile = {
  id: string;
  productId: string;
  classificationEvidence: string[];
  formulaId: string;
  processReference: string;
  specificationReference: string;
  labelReference: string;
  registrationApplication: string;
  approvedArtworkReference: string;
  evidence: string[];
  lastReviewed: string;
};

export type FormulaIngredient = {
  ingredientCode: string;
  ingredient: string;
  percentage: number;
  weightPerBatch: string;
  function: string;
  supplier: string;
  regulatoryStatus: string;
  allergenStatus: string;
  additiveINS: string;
  maximumPermittedLevel: string;
  actualUseLevel: string;
  processingAidStatus: string;
};

export type FormulaControl = {
  formulaId: string;
  productId: string;
  formulaRevision: string;
  totalFormula: number;
  ingredients: FormulaIngredient[];
  changeControlId: string;
};

export type AuthorityQuery = {
  queryNumber: string;
  productId: string;
  applicationNumber: string;
  queryDate: string;
  authorityComment: string;
  responsiblePerson: string;
  requiredAction: string;
  dueDate: string;
  response: string;
  evidence: string[];
  submissionDate: string;
  status: AuthorityQueryStatus;
};

export type RegulatoryChangeControl = {
  id: string;
  productId: string;
  changeType: string;
  changeDescription: string;
  impactRegistration: string;
  amendmentRequired: string;
  labelImpact: string;
  haccpImpact: string;
  specificationImpact: string;
  shelfLifeImpact: string;
  allergenImpact: string;
  customerApprovalImpact: string;
  documentRevisionImpact: string;
  trainingImpact: string;
  status: 'OPEN' | 'IMPACT_REVIEW' | 'APPROVAL_REQUIRED' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
  evidence: string[];
};
