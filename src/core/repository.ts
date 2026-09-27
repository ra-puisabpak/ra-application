import type { AppRole, RecordState } from './production';

export type EntityId = string;
export type Revision = string;

export type QueryOptions = {
  state?: RecordState;
  revision?: Revision;
  limit?: number;
  cursor?: string;
};

export type RepositoryResult<T> = {
  value: T;
  version: number;
};

export interface Repository<T extends { id: EntityId }> {
  getById(id: EntityId): Promise<RepositoryResult<T> | null>;
  list(options?: QueryOptions): Promise<RepositoryResult<T>[]>;
  create(entity: T, actorId: string): Promise<RepositoryResult<T>>;
  update(id: EntityId, expectedVersion: number, entity: T, actorId: string): Promise<RepositoryResult<T>>;
}

export type ServiceContext = {
  requestId: string;
  actorId: string;
  roles: AppRole[];
};

export type ServiceErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'INTEGRITY_ERROR'
  | 'INVALID_STATE';

export type ServiceError = {
  code: ServiceErrorCode;
  message: string;
  details?: unknown;
};

export type ServiceResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: ServiceError; requestId: string };
