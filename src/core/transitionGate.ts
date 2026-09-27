import type { AppRole, RecordState, IntegrityIssue } from './production';
import { hasBlockingIntegrityIssues } from './dataIntegrity';

export type TransitionTarget =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'EFFECTIVE'
  | 'OBSOLETE'
  | 'RETURNED'
  | 'REJECTED';

export type TransitionContext = {
  actorId: string;
  actorRoles: AppRole[];
  currentState: RecordState;
  target: TransitionTarget;
  requiredRevision?: string;
  currentRevision?: string;
  integrityIssues: IntegrityIssue[];
  evidenceVerified: boolean;
  approvalPending: boolean;
  approvalAllowed: boolean;
};

export type TransitionResult = {
  allowed: boolean;
  blockers: string[];
};

export const validateTransition = (c: TransitionContext): TransitionResult => {
  const blockers: string[] = [];

  if (!c.actorId) blockers.push('ACTOR_REQUIRED');
  if (hasBlockingIntegrityIssues(c.integrityIssues))
    blockers.push('INTEGRITY_BLOCKING_ISSUES');

  if (c.requiredRevision && c.currentRevision !== c.requiredRevision)
    blockers.push('REVISION_MISMATCH');

  if ((c.target === 'SUBMITTED' || c.target === 'APPROVED' || c.target === 'EFFECTIVE') &&
      !c.evidenceVerified)
    blockers.push('VERIFIED_EVIDENCE_REQUIRED');

  if (c.target === 'APPROVED' && !c.approvalPending)
    blockers.push('APPROVAL_STEP_REQUIRED');

  if (c.target === 'APPROVED' && !c.approvalAllowed)
    blockers.push('APPROVER_NOT_AUTHORIZED');

  return { allowed: blockers.length === 0, blockers };
};
