export type RegulatoryChangeStatus =
  | 'NEW'
  | 'SCREENING'
  | 'IMPACT_ASSESSMENT'
  | 'ACTION_REQUIRED'
  | 'IMPLEMENTING'
  | 'IMPLEMENTED'
  | 'NOT_APPLICABLE'
  | 'CLOSED';

export type RegulatoryChange = {
  id: string;
  sourceId: string;
  publishedDate?: string;
  effectiveDate?: string;
  detectedDate: string;
  subject: string;
  status: RegulatoryChangeStatus;
  ownerId?: string;
  dueDate?: string;
  impactAssessmentId?: string;
};

export type RegulatoryImpactAssessment = {
  id: string;
  regulatoryChangeId: string;
  affectedProductIds: string[];
  affectedDocumentIds: string[];
  affectedAreas: string[];
  impactFound: boolean;
  rationale: string;
  assessedBy?: string;
  assessedDate?: string;
  changeControlIds: string[];
  status: 'OPEN' | 'COMPLETED' | 'REQUIRES_CHANGE_CONTROL';
};

export const requiresChangeControl = (
  assessment: RegulatoryImpactAssessment,
): boolean => assessment.impactFound && assessment.changeControlIds.length === 0;

export const isRegulatoryChangeOverdue = (
  change: RegulatoryChange,
  today: string,
): boolean =>
  !!change.dueDate &&
  change.dueDate < today &&
  !['IMPLEMENTED', 'NOT_APPLICABLE', 'CLOSED'].includes(change.status);
