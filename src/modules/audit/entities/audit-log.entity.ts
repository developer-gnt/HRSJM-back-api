import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('audit_logs')
export class AuditLogEntity extends BaseEntity {
  @Index('ix_audit_logs_actor_id')
  @Column({ type: 'uuid', nullable: true })
  actor_id: string | null;

  @Index('ix_audit_logs_event')
  @Column({ type: 'varchar', length: 100 })
  event: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entity_type: string | null;

  @Column({ type: 'uuid', nullable: true })
  entity_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;
}
