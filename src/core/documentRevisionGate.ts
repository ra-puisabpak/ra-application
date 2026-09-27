export type ControlledDocumentState =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EFFECTIVE'
  | 'OBSOLETE'
  | 'REJECTED'
  | 'RETURNED';

export type DocumentRevisionGateContext = {
  state: ControlledDocumentState;
  revision: string;
  requiredRevision: string;
  approvalEvidenceVerified: boolean;
  trainingRequired: boolean;
  trainingCompleted: boolean;
  changeControlResolved: boolean;
  effectiveDate?: string;
  actorId?: string;
};

export type DocumentRevisionGateResult = {
  ok: boolean;
  blockers: string[];
};

export const validateDocumentRevisionGate = (
  context: DocumentRevisionGateContext,
): DocumentRevisionGateResult => {
  const blockers: string[] = [];

  if (!context.actorId) blockers.push('ACTOR_REQUIRED');
  if (context.revision !== context.requiredRevision) blockers.push('REVISION_MISMATCH');
  if (!context.approvalEvidenceVerified) blockers.push('APPROVAL_EVIDENCE_NOT_VERIFIED');
  if (!context.changeControlResolved) blockers.push('CHANGE_CONTROL_NOT_RESOLVED');

  if (context.trainingRequired && !context.trainingCompleted) {
    blockers.push('TRAINING_NOT_COMPLETED');
  }

  if (context.state === 'EFFECTIVE' && !context.effectiveDate) {
    blockers.push('EFFECTIVE_DATE_REQUIRED');
  }

  if (!['APPROVED', 'EFFECTIVE'].includes(context.state)) {
    blockers.push('INVALID_EFFECTIVE_STATE');
  }

  return { ok: blockers.length === 0, blockers };
};
