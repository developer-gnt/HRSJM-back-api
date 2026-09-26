import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';

export interface AuditEvent {
  event: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly auditLogs: Repository<AuditLogEntity>,
  ) {}

  /**
   * Records an audit event. Audit failures must never break the main flow,
   * but they are surfaced in the application logs.
   */
  async record(input: AuditEvent): Promise<void> {
    try {
      await this.auditLogs.insert(
        this.auditLogs.create({
          event: input.event,
          actor_id: input.actorId ?? null,
          entity_type: input.entityType ?? null,
          entity_id: input.entityId ?? null,
          ip: input.ip ?? null,
          user_agent: input.userAgent ?? null,
          metadata: input.metadata ?? null,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to write audit event "${input.event}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
