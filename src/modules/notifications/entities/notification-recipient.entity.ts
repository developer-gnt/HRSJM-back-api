import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { NotificationEntity } from './notification.entity';

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

@Entity('notification_recipients')
export class NotificationRecipientEntity extends BaseEntity {
  @Index('idx_notification_recipients_notification_id')
  @Column({ type: 'uuid' })
  notification_id: string;

  @ManyToOne(() => NotificationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification?: NotificationEntity;

  @Index('idx_notification_recipients_user_id')
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({
    type: 'varchar',
    length: 30,
    default: DeliveryStatus.SENT,
  })
  delivery_status: DeliveryStatus;

  @Index('idx_notification_recipients_read_at')
  @Column({ type: 'timestamptz', nullable: true })
  read_at: Date | null;
}
