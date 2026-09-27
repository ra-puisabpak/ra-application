export type TrainingRequirementType =
  | 'DOCUMENT_REVISION'
  | 'REGULATORY_CHANGE'
  | 'PROCESS_CHANGE'
  | 'ROLE_COMPETENCY'
  | 'CAPA';

export type TrainingStatus =
  | 'REQUIRED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'WAIVED'
  | 'OVERDUE'
  | 'CANCELLED';

export type TrainingRequirement = {
  id: string;
  type: TrainingRequirementType;
  sourceRecordId: string;
  documentRevision?: string;
  roleIds: string[];
  requiredBy?: string;
  status: TrainingStatus;
  completionEvidenceIds: string[];
};

export type CompetencyRecord = {
  id: string;
  userId: string;
  competencyCode: string;
  assessedDate: string;
  assessorId: string;
  validUntil?: string;
  evidenceIds: string[];
  status: 'VALID' | 'EXPIRED' | 'UNDER_REVIEW';
};

export const isTrainingComplete = (requirement: TrainingRequirement): boolean =>
  ['COMPLETED', 'WAIVED'].includes(requirement.status) &&
  requirement.completionEvidenceIds.length > 0;

export const hasValidCompetency = (
  record: CompetencyRecord,
  today: string,
): boolean =>
  record.status === 'VALID' &&
  record.evidenceIds.length > 0 &&
  (!record.validUntil || record.validUntil >= today);
