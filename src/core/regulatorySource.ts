export type RegulatoryDecisionStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'SUPERSEDED'
  | 'REJECTED';

export type RegulatorySourceType =
  | 'LAW'
  | 'MINISTERIAL_NOTIFICATION'
  | 'THAI_FDA'
  | 'OFFICIAL_GUIDANCE'
  | 'CUSTOMER_REQUIREMENT'
  | 'INTERNAL_STANDARD'
  | 'OTHER';

export type RegulatorySource = {
  id: string;
  title: string;
  sourceType: RegulatorySourceType;
  referenceNumber?: string;
  sourceUrl?: string;
  effectiveDate?: string;
  checkedDate: string;
  status: 'CURRENT' | 'SUPERSEDED' | 'UNDER_REVIEW' | 'UNKNOWN';
  evidenceId?: string;
};

export type RegulatoryDecision = {
  id: string;
  productId?: string;
  ingredientId?: string;
  subject: string;
  conclusion: string;
  status: RegulatoryDecisionStatus;
  sourceIds: string[];
  evidenceIds: string[];
  checkedDate: string;
  decidedBy?: string;
  supersedesDecisionId?: string;
};

export const hasDecisionSupport = (decision: RegulatoryDecision): boolean =>
  decision.sourceIds.length > 0 &&
  decision.evidenceIds.length > 0 &&
  decision.checkedDate.length > 0;

export const isCurrentSourceUsable = (source: RegulatorySource): boolean =>
  source.status === 'CURRENT' && source.checkedDate.length > 0;
