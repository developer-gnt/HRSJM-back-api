import {
  Column,
  Entity,
  Index,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { NotificationRecipientEntity } from './notification-recipient.entity';

export enum NotificationAudience {
  ALL_USERS = 'ALL_USERS',
  MEMBERS = 'MEMBERS',
  DONORS = 'DONORS',
  DONATION_SEEKERS = 'DONATION_SEEKERS',
  SPECIFIC_USER = 'SPECIFIC_USER',
}

export enum NotificationStatus {
  SCHEDULED = 'SCHEDULED',
  SENT = 'SENT',
}

@Entity('notifications')
export class NotificationEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Index('idx_notifications_target_audience')
  @Column({
    type: 'varchar',
    length: 50,
    default: NotificationAudience.ALL_USERS,
  })
  target_audience: NotificationAudience;

  @Index('idx_notifications_status')
  @Column({
    type: 'varchar',
    length: 30,
    default: NotificationStatus.SCHEDULED,
  })
  status: NotificationStatus;

  @Index('idx_notifications_scheduled_at')
  @Column({ type: 'timestamptz', nullable: true })
  scheduled_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  sent_at: Date | null;

  @OneToMany(
    () => NotificationRecipientEntity,
    (recipient) => recipient.notification,
  )
  recipients?: NotificationRecipientEntity[];
}
