export type MigrationStatus = 'STAGED' | 'VALIDATED' | 'RECONCILED' | 'ACTIVATED' | 'REJECTED';

export type MigrationBatch = {
  id: string;
  source: string;
  sourceVersion?: string;
  startedAt: string;
  completedAt?: string;
  status: MigrationStatus;
  actorId: string;
  recordCount: number;
  validationErrors: number;
};

export type MigrationResult = {
  batchId: string;
  entity: string;
  sourceId: string;
  targetId?: string;
  status: 'IMPORTED' | 'SKIPPED' | 'REJECTED';
  issues: string[];
};

export const canActivateMigration = (batch: MigrationBatch, results: MigrationResult[]): boolean =>
  batch.status === 'RECONCILED' &&
  batch.validationErrors === 0 &&
  results.every(r => r.status !== 'REJECTED');
