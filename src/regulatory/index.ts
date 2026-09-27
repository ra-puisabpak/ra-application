export * from './model';

export const registrationStatuses = [
  'CONCEPT','CLASSIFICATION_REVIEW','FORMULA_REVIEW','LABEL_REVIEW',
  'DOCUMENT_PREPARATION','READY_TO_SUBMIT','SUBMITTED','AUTHORITY_QUERY',
  'REVISION_REQUIRED','APPROVED','REJECTED','CANCELLED','POST_APPROVAL_CHANGE'
] as const;

export const calculateFormulaTotal = (formula: { percentage: number }[]) =>
  formula.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0);

export const isFormulaComplete = (formula: { percentage: number }[]) =>
  Math.abs(calculateFormulaTotal(formula) - 100) < 0.0001;
