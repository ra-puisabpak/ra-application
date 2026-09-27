export type AppRole = 'RA' | 'QA' | 'QC' | 'DCC' | 'R&D' | 'MANAGEMENT';
export type RecordState = 'DRAFT' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'EFFECTIVE' | 'OBSOLETE' | 'REJECTED' | 'RETURNED';

export type User = { id: string; username: string; displayName: string; active: boolean; };
export type UserRole = { userId: string; role: AppRole; siteId?: string; canApprove: boolean; };
export type ApprovalStep = { id: string; recordType: string; recordId: string; sequence: number; requiredRole: AppRole; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RETURNED'; approverId?: string; decidedAt?: string; comment?: string; };
export type Evidence = { id: string; recordType: string; recordId: string; title: string; revision: string; storageKey: string; checksum: string; uploadedBy: string; uploadedAt: string; verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED'; };
export type AuditEvent = { id: string; actorId: string; actorRole: AppRole; at: string; action: string; module: string; recordType: string; recordId: string; previousState?: string; newState?: string; reason?: string; };

export type Permission = 'VIEW' | 'CREATE' | 'EDIT' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'UPLOAD_EVIDENCE' | 'OBSOLETE';
export type PermissionRule = { role: AppRole; module: string; permissions: Permission[]; };

export type IntegrityIssue = { code: string; severity: 'BLOCKER' | 'WARNING'; module: string; recordId: string; message: string; };
