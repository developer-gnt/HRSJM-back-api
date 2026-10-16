import {
  Column,
  Entity,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum RightStatus {
  PUBLISHED = 'PUBLISHED',
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED',
}

@Entity('rights')
@Index('idx_rights_status', ['status'])
@Index('idx_rights_category', ['category'])
@Index('idx_rights_published_at', ['published_at'])
@Index('idx_rights_slug', ['slug'])
export class RightEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 100, default: 'Constitutional' })
  category: string;

  @Column({ type: 'varchar', length: 100, default: 'Constitutional', nullable: true })
  category_label: string | null;

  @Column({ type: 'varchar', length: 255, default: 'Constitution of India', nullable: true })
  legal_reference: string | null;

  @Column({ type: 'text', nullable: true })
  highlights: string | null;

  @Column({ type: 'varchar', length: 50, default: 'scale', nullable: true })
  icon: string | null;

  @Column({ type: 'varchar', length: 50, default: '#FFF8E8', nullable: true })
  color: string | null;

  @Column({ type: 'varchar', length: 50, default: '#1D4ED8', nullable: true })
  icon_color: string | null;

  @Column({ type: 'varchar', length: 50, default: '#DBEAFE', nullable: true })
  badge_bg: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: RightStatus.PUBLISHED,
  })
  status: RightStatus;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  published_at: Date;

  @Column({ type: 'integer', default: 0 })
  views: number;

  @Column({ type: 'text', nullable: true })
  thumbnail_url: string | null;

  @Column({ type: 'varchar', length: 100, default: 'HRSJM Legal Cell' })
  author: string;

  @Column({ type: 'varchar', length: 100, default: 'Legal Advisor', nullable: true })
  author_role: string | null;

  @Column({ type: 'varchar', length: 100, default: 'HRSJM', nullable: true })
  organization: string | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @Column({ type: 'boolean', default: false })
  featured: boolean;

  @Column({ type: 'boolean', default: true })
  allow_comments: boolean;
}
