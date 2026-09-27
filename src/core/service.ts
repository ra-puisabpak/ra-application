import type { Repository, ServiceContext, ServiceResult } from './repository';

export type ControlledRecord = {
  id: string;
  revision: string;
  state: 'DRAFT' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED' | 'EFFECTIVE' | 'OBSOLETE' | 'REJECTED' | 'RETURNED';
};

export type IntegrityValidator<T> = (record: T) => string[];

export class ControlledRecordService<T extends ControlledRecord> {
  constructor(
    private readonly repository: Repository<T>,
    private readonly validate: IntegrityValidator<T>,
  ) {}

  async get(ctx: ServiceContext, id: string): Promise<ServiceResult<T>> {
    const found = await this.repository.getById(id);
    if (!found) return { ok: false, error: { code: 'NOT_FOUND', message: 'Record not found' }, requestId: ctx.requestId };
    return { ok: true, data: found.value, requestId: ctx.requestId };
  }

  async create(ctx: ServiceContext, record: T): Promise<ServiceResult<T>> {
    const issues = this.validate(record);
    if (issues.length) return { ok: false, error: { code: 'INTEGRITY_ERROR', message: 'Record failed integrity validation', details: issues }, requestId: ctx.requestId };
    const saved = await this.repository.create(record, ctx.actorId);
    return { ok: true, data: saved.value, requestId: ctx.requestId };
  }

  async update(ctx: ServiceContext, record: T, expectedVersion: number): Promise<ServiceResult<T>> {
    const issues = this.validate(record);
    if (issues.length) return { ok: false, error: { code: 'INTEGRITY_ERROR', message: 'Record failed integrity validation', details: issues }, requestId: ctx.requestId };
    try {
      const saved = await this.repository.update(record.id, expectedVersion, record, ctx.actorId);
      return { ok: true, data: saved.value, requestId: ctx.requestId };
    } catch (error) {
      return { ok: false, error: { code: 'CONFLICT', message: 'Record version conflict', details: error }, requestId: ctx.requestId };
    }
  }
}
