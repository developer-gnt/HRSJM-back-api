import {
  Column,
  Entity,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum NewsStatus {
  PUBLISHED = 'PUBLISHED',
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED',
}

@Entity('news')
@Index('idx_news_status', ['status'])
@Index('idx_news_category', ['category'])
@Index('idx_news_published_at', ['published_at'])
@Index('idx_news_slug', ['slug'])
export class NewsEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'text', nullable: true })
  summary_detailed: string | null;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 100, default: 'General' })
  category: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: NewsStatus.PUBLISHED,
  })
  status: NewsStatus;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  published_at: Date;

  @Column({ type: 'integer', default: 0 })
  views: number;

  @Column({ type: 'text', nullable: true })
  thumbnail_url: string | null;

  @Column({ type: 'varchar', length: 100, default: 'HRSJM Team' })
  author: string;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  highlights: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  gallery: string[] | null;

  @Column({ type: 'boolean', default: true })
  allow_comments: boolean;
}
