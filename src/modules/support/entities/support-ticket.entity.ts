import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SupportTicketMessageEntity } from './support-ticket-message.entity';


export enum TicketStatus {
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

@Entity('support_tickets')
@Index('idx_support_tickets_user_id', ['user_id'])
@Index('idx_support_tickets_status', ['status'])
export class SupportTicketEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: TicketStatus.SUBMITTED,
  })
  status: TicketStatus;

  @Column({ type: 'uuid', nullable: true })
  resolved_by: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by' })
  resolved_by_user?: UserEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;

  @OneToMany(() => SupportTicketMessageEntity, (msg) => msg.ticket)
  messages?: SupportTicketMessageEntity[];
}
