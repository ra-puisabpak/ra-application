import type { AppRole } from './production';

export type AuditAction =
  | 'CREATE' | 'UPDATE' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'RETURN'
  | 'EFFECTIVE' | 'OBSOLETE' | 'UPLOAD_EVIDENCE' | 'VERIFY_EVIDENCE'
  | 'CHANGE_CONTROL' | 'LOGIN' | 'LOGOUT';

export type AuditTransaction = {
  id: string;
  requestId: string;
  actorId: string;
  actorRole: AppRole;
  action: AuditAction;
  module: string;
  recordType: string;
  recordId: string;
  revision?: string;
  previousState?: string;
  newState?: string;
  reason?: string;
  evidenceIds?: string[];
  occurredAt: string;
};

export interface AuditRepository {
  append(event: AuditTransaction): Promise<void>;
  list(recordType: string, recordId: string): Promise<AuditTransaction[]>;
}
