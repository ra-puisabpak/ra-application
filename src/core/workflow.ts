import type { ApprovalStep, AuditEvent, RecordState } from './production';

export type WorkflowResult = { ok: true } | { ok: false; code: string; message: string };

export function validateApproval(input: { state: RecordState; revision: string; requiredRevision: string; evidenceVerified: boolean; approvalStepPending: boolean }): WorkflowResult {
  if (!input.revision || input.revision !== input.requiredRevision) return { ok: false, code: 'REVISION_MISMATCH', message: 'Approval must reference the current revision.' };
  if (!input.evidenceVerified) return { ok: false, code: 'EVIDENCE_NOT_VERIFIED', message: 'Required evidence is not verified.' };
  if (!input.approvalStepPending) return { ok: false, code: 'NO_PENDING_APPROVAL', message: 'No pending approval step exists.' };
  if (input.state !== 'PENDING_APPROVAL' && input.state !== 'IN_REVIEW') return { ok: false, code: 'INVALID_STATE', message: 'Record is not in an approvable state.' };
  return { ok: true };
}

export function createAuditEvent(event: AuditEvent): AuditEvent { return { ...event, id: event.id || crypto.randomUUID() }; }
