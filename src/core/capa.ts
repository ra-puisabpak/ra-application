import type { AppRole } from './production';

export type NonconformitySource =
  | 'INTERNAL_AUDIT'
  | 'REGULATORY_AUDIT'
  | 'FDA_QUERY'
  | 'CUSTOMER_COMPLAINT'
  | 'SUPPLIER'
  | 'DATA_INTEGRITY'
  | 'LABEL_REVIEW'
  | 'PROCESS'
  | 'PRODUCT'
  | 'OTHER';

export type CapaStatus =
  | 'OPEN'
  | 'ROOT_CAUSE_ANALYSIS'
  | 'ACTION_PLANNING'
  | 'IMPLEMENTATION'
  | 'EFFECTIVENESS_CHECK'
  | 'CLOSED'
  | 'REJECTED';

export type CapaActionType = 'CORRECTION' | 'CORRECTIVE_ACTION' | 'PREVENTIVE_ACTION';

export type Nonconformity = {
  id: string;
  source: NonconformitySource;
  sourceRecordId?: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ownerId: string;
  dueDate: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'CONVERTED_TO_CAPA' | 'CLOSED';
  createdAt: string;
};

export type Capa = {
  id: string;
  nonconformityId: string;
  status: CapaStatus;
  ownerId: string;
  rootCauseMethod?: '5WHY' | 'FISHBONE' | 'FTA' | 'OTHER';
  rootCause?: string;
  containment?: string;
  actions: CapaAction[];
  effectivenessCriteria?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  closedAt?: string;
};

export type CapaAction = {
  id: string;
  type: CapaActionType;
  description: string;
  ownerId: string;
  dueDate: string;
  completedAt?: string;
  evidenceIds?: string[];
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
};

export const canCloseCapa = (capa: Capa): boolean =>
  capa.status === 'EFFECTIVENESS_CHECK' &&
  !!capa.rootCause &&
  !!capa.effectivenessCriteria &&
  !!capa.verifiedBy &&
  !!capa.verifiedAt &&
  capa.actions.length > 0 &&
  capa.actions.every((a) => a.status === 'COMPLETED');
