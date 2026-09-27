import type { AppRole } from './production';

export type ApiResult<T> = { data: T; requestId: string } | { error: { code: string; message: string; details?: unknown }; requestId: string };

export type MutationContext = {
  requestId: string;
  actorId: string;
  roles: AppRole[];
  module: string;
};

export type ApprovalDecision = {
  recordType: string;
  recordId: string;
  revision: string;
  decision: 'APPROVE' | 'REJECT' | 'RETURN';
  comment?: string;
  evidenceIds?: string[];
};

export type FileUploadSession = {
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
  checksumRequired: boolean;
};

export type AuditQuery = {
  recordType?: string;
  recordId?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
};
