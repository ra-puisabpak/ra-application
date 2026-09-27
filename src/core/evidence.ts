export type EvidenceStatus = 'UPLOADED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED' | 'OBSOLETE';

export type EvidenceType =
  | 'REGULATORY_SOURCE'
  | 'FDA_SUBMISSION'
  | 'FDA_APPROVAL'
  | 'FORMULA'
  | 'PROCESS_FLOW'
  | 'HACCP'
  | 'SPECIFICATION'
  | 'LABEL_ARTWORK'
  | 'TEST_REPORT'
  | 'SUPPLIER_DOCUMENT'
  | 'CHANGE_CONTROL'
  | 'CAPA'
  | 'OTHER';

export type EvidenceRecord = {
  id: string;
  recordType: string;
  recordId: string;
  revision?: string;
  type: EvidenceType;
  fileName: string;
  storageKey: string;
  checksum: string;
  uploadedBy: string;
  uploadedAt: string;
  status: EvidenceStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  verificationNote?: string;
  effectiveDate?: string;
  obsoleteDate?: string;
};

export const canUseEvidenceForApproval = (evidence: EvidenceRecord): boolean =>
  evidence.status === 'VERIFIED' && !!evidence.checksum && !!evidence.uploadedBy;
