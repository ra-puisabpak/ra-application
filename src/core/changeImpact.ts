export type ChangeTrigger =
  | 'PRODUCT_NAME'
  | 'BRAND'
  | 'FORMULA'
  | 'INGREDIENT'
  | 'SUPPLIER'
  | 'ADDITIVE'
  | 'PROCESS'
  | 'EQUIPMENT'
  | 'SITE'
  | 'PACKAGING'
  | 'LABEL'
  | 'NET_WEIGHT'
  | 'SHELF_LIFE'
  | 'STORAGE';

export type ImpactArea =
  | 'REGISTRATION'
  | 'LABEL'
  | 'FORMULA'
  | 'SPECIFICATION'
  | 'HACCP'
  | 'SHELF_LIFE'
  | 'ALLERGEN'
  | 'CUSTOMER_APPROVAL'
  | 'SOP'
  | 'WI'
  | 'FM'
  | 'TRAINING'
  | 'SUPPLIER'
  | 'PROCESS_FLOW'
  | 'VALIDATION';

export type ImpactDecision = 'REVIEW_REQUIRED' | 'NOT_APPLICABLE' | 'COMPLETED';

export type ChangeImpact = {
  area: ImpactArea;
  decision: ImpactDecision;
  rationale?: string;
  requiredRecordIds?: string[];
  ownerRole?: 'RA' | 'QA' | 'QC' | 'DCC' | 'R&D' | 'MANAGEMENT';
};

export type ChangeControlAssessment = {
  changeControlId: string;
  trigger: ChangeTrigger;
  impacts: ChangeImpact[];
};

export const hasUnresolvedMandatoryImpacts = (
  assessment: ChangeControlAssessment,
): boolean =>
  assessment.impacts.some((impact) =>
    impact.decision === 'REVIEW_REQUIRED' &&
    !!impact.requiredRecordIds?.length,
  );

export const requiredImpactAreasFor = (trigger: ChangeTrigger): ImpactArea[] => {
  switch (trigger) {
    case 'FORMULA':
    case 'INGREDIENT':
    case 'ADDITIVE':
      return ['FORMULA', 'ALLERGEN', 'SPECIFICATION', 'LABEL', 'HACCP', 'REGISTRATION'];
    case 'PROCESS':
    case 'EQUIPMENT':
      return ['PROCESS_FLOW', 'HACCP', 'VALIDATION', 'SOP', 'WI', 'FM', 'SPECIFICATION', 'REGISTRATION'];
    case 'LABEL':
    case 'PRODUCT_NAME':
    case 'BRAND':
      return ['LABEL', 'REGISTRATION', 'FORMULA', 'PACKAGING'];
    case 'SHELF_LIFE':
    case 'STORAGE':
      return ['SHELF_LIFE', 'SPECIFICATION', 'LABEL', 'REGISTRATION', 'VALIDATION'];
    case 'SUPPLIER':
      return ['SUPPLIER', 'FORMULA', 'SPECIFICATION', 'ALLERGEN', 'REGISTRATION'];
    case 'PACKAGING':
      return ['PACKAGING', 'LABEL', 'SPECIFICATION', 'REGISTRATION'];
    case 'NET_WEIGHT':
      return ['LABEL', 'SPECIFICATION', 'REGISTRATION'];
    case 'SITE':
      return ['REGISTRATION', 'HACCP', 'PROCESS_FLOW', 'SPECIFICATION', 'LABEL'];
    default:
      return [];
  }
};
