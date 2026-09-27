import type { AppRole, Permission, PermissionRule, ApprovalStep } from './production';

export type AuthSession = { userId: string; username: string; roles: AppRole[]; issuedAt: string; expiresAt: string; };

export type Permission = 'VIEW' | 'CREATE' | 'EDIT' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'UPLOAD_EVIDENCE' | 'OBSOLETE';

export const hasPermission = (rules: PermissionRule[], roles: AppRole[], module: string, permission: Permission): boolean =>
  rules.some(r => r.module === module && roles.includes(r.role) && r.permissions.includes(permission));

export const canApprove = (steps: ApprovalStep[], userId: string, roles: AppRole[], recordType: string, recordId: string): boolean =>
  steps.some(s => s.recordType === recordType && s.recordId === recordId && s.status === 'PENDING' && roles.includes(s.requiredRole) && userId.length > 0);
