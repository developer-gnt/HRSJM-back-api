import {
  Column,
  Entity,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum EventStatus {
  UPCOMING = 'UPCOMING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  DRAFT = 'DRAFT',
}

@Entity('events')
@Index('idx_events_status', ['status'])
@Index('idx_events_category', ['category'])
@Index('idx_events_start_at', ['start_at'])
export class EventEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  short_information: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Seminar' })
  category: string;

  @Column({ type: 'varchar', length: 50, default: 'IN_PERSON' })
  event_type: string;

  @Column({ type: 'text', nullable: true })
  cover_image_url: string | null;

  @Column({ type: 'timestamptz' })
  start_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  end_at: Date | null;

  @Column({ type: 'boolean', default: false })
  all_day: boolean;

  @Column({ type: 'varchar', length: 255 })
  location: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  organized_by: string | null;

  @Column({ type: 'boolean', default: true })
  registration_required: boolean;

  @Column({ type: 'integer', default: 100 })
  capacity: number;

  @Column({ type: 'integer', default: 0 })
  registrations: number;

  @Column({ type: 'integer', default: 1 })
  per_person_limit: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  target_audience: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  language: string | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: EventStatus.UPCOMING,
  })
  status: EventStatus;
}
