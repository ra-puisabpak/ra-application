export type RegulatoryFindingType =
  | 'NONCOMPLIANCE'
  | 'REGULATORY_GAP'
  | 'AUTHORITY_QUERY'
  | 'AUDIT_FINDING'
  | 'COMPLAINT'
  | 'INCIDENT';

export type RegulatoryFinding = {
  id: string;
  type: RegulatoryFindingType;
  sourceRecordId: string;
  productId?: string;
  description: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedDate: string;
  ownerId?: string;
  capaId?: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'CONTAINED' | 'CAPA_OPEN' | 'CLOSED';
};

export type RegulatoryCapaLink = {
  findingId: string;
  capaId: string;
  containmentRequired: boolean;
  correctiveActionRequired: boolean;
  preventiveActionRequired: boolean;
  effectivenessCheckRequired: boolean;
  evidenceIds: string[];
};

export const requiresRegulatoryCapa = (
  finding: RegulatoryFinding,
): boolean =>
  ['NONCOMPLIANCE', 'REGULATORY_GAP', 'AUTHORITY_QUERY'].includes(finding.type);

export const canCloseRegulatoryFinding = (
  finding: RegulatoryFinding,
  link?: RegulatoryCapaLink,
): boolean =>
  finding.status === 'CLOSED' &&
  !!link &&
  (!link.effectivenessCheckRequired || link.evidenceIds.length > 0);
