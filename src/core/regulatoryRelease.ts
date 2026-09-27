export type RegulatoryReleaseState =
  | 'NOT_READY'
  | 'READY_FOR_RELEASE'
  | 'RELEASED'
  | 'BLOCKED'
  | 'WITHDRAWN';

export type RegulatoryReleaseContext = {
  productId: string;
  registrationApproved: boolean;
  formulaRevision: string;
  approvedFormulaRevision?: string;
  processRevision: string;
  approvedProcessRevision?: string;
  specificationRevision: string;
  approvedSpecificationRevision?: string;
  labelEffective: boolean;
  artworkApproved: boolean;
  unresolvedChangeControl: boolean;
  blockingIntegrityIssues: number;
  approvalEvidenceVerified: boolean;
  requiredTrainingComplete: boolean;
};

export type RegulatoryReleaseResult = {
  state: RegulatoryReleaseState;
  blockers: string[];
};

export const validateRegulatoryRelease = (
  context: RegulatoryReleaseContext,
): RegulatoryReleaseResult => {
  const blockers: string[] = [];

  if (!context.productId) blockers.push('PRODUCT_REQUIRED');
  if (!context.registrationApproved) blockers.push('REGISTRATION_NOT_APPROVED');
  if (!context.approvedFormulaRevision) blockers.push('FORMULA_NOT_APPROVED');
  if (context.formulaRevision !== context.approvedFormulaRevision) blockers.push('FORMULA_REVISION_MISMATCH');
  if (!context.approvedProcessRevision) blockers.push('PROCESS_NOT_APPROVED');
  if (context.processRevision !== context.approvedProcessRevision) blockers.push('PROCESS_REVISION_MISMATCH');
  if (!context.approvedSpecificationRevision) blockers.push('SPECIFICATION_NOT_APPROVED');
  if (context.specificationRevision !== context.approvedSpecificationRevision) blockers.push('SPECIFICATION_REVISION_MISMATCH');
  if (!context.labelEffective) blockers.push('LABEL_NOT_EFFECTIVE');
  if (!context.artworkApproved) blockers.push('ARTWORK_NOT_APPROVED');
  if (context.unresolvedChangeControl) blockers.push('CHANGE_CONTROL_UNRESOLVED');
  if (context.blockingIntegrityIssues > 0) blockers.push('DATA_INTEGRITY_BLOCKER');
  if (!context.approvalEvidenceVerified) blockers.push('APPROVAL_EVIDENCE_NOT_VERIFIED');
  if (!context.requiredTrainingComplete) blockers.push('REQUIRED_TRAINING_INCOMPLETE');

  return {
    state: blockers.length === 0 ? 'READY_FOR_RELEASE' : 'BLOCKED',
    blockers,
  };
};
