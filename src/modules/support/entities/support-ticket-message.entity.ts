import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { SupportTicketEntity } from './support-ticket.entity';

@Entity('support_ticket_messages')
@Index('idx_support_ticket_messages_ticket_id', ['ticket_id'])
export class SupportTicketMessageEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  ticket_id: string;

  @ManyToOne(() => SupportTicketEntity, (t) => t.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ticket_id' })
  ticket?: SupportTicketEntity;

  @Column({ type: 'uuid' })
  author_id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'author_id' })
  author?: UserEntity;

  @Column({ type: 'text' })
  body: string;
}
