import type { IntegrityIssue } from './production';

export type IntegrityContext = {
  formulaTotal?: number;
  formulaRevision?: string;
  processRevision?: string;
  specificationRevision?: string;
  labelRevision?: string;
  registrationStatus?: string;
  hasRegulatoryFile?: boolean;
  labelStatus?: string;
  hasRequiredEvidence?: boolean;
  currentDocumentIsObsolete?: boolean;
  approvedDocumentMissingEffectiveDate?: boolean;
};

export const validateDataIntegrity = (c: IntegrityContext): IntegrityIssue[] => {
  const issues: IntegrityIssue[] = [];
  const add = (code: string, message: string, severity: 'ERROR' | 'WARNING' = 'ERROR') =>
    issues.push({ code, message, severity });

  if (c.formulaTotal !== undefined && Math.abs(c.formulaTotal - 100) > 0.0001)
    add('FORMULA_TOTAL_NOT_100', 'Formula total must equal 100%.');

  if (c.registrationStatus === 'APPROVED' && c.hasRegulatoryFile === false)
    add('MISSING_REGULATORY_FILE', 'Approved product must have a Regulatory File.');

  if (c.registrationStatus === 'APPROVED' && c.labelStatus !== 'EFFECTIVE')
    add('APPROVED_LABEL_NOT_EFFECTIVE', 'Approved product must reference an EFFECTIVE label.');

  if (c.registrationStatus === 'READY_TO_SUBMIT' && c.hasRequiredEvidence === false)
    add('READY_TO_SUBMIT_MISSING_EVIDENCE', 'READY_TO_SUBMIT requires required evidence.');

  if (c.registrationStatus === 'APPROVED') {
    if (!c.formulaRevision) add('APPROVED_MISSING_FORMULA', 'Approved product is missing Formula revision.');
    if (!c.processRevision) add('APPROVED_MISSING_PROCESS', 'Approved product is missing Process revision.');
    if (!c.specificationRevision) add('APPROVED_MISSING_SPEC', 'Approved product is missing Specification revision.');
    if (!c.labelRevision) add('APPROVED_MISSING_LABEL', 'Approved product is missing Label revision.');
  }

  if (c.currentDocumentIsObsolete)
    add('OBSOLETE_DOCUMENT_CURRENT', 'Obsolete document cannot be the current controlled document.');

  if (c.approvedDocumentMissingEffectiveDate)
    add('APPROVED_DOCUMENT_NO_EFFECTIVE_DATE', 'Approved controlled document requires an Effective Date.');

  return issues;
};

export const hasBlockingIntegrityIssues = (issues: IntegrityIssue[]): boolean =>
  issues.some((issue) => issue.severity === 'ERROR');
