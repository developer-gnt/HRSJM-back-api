import {
  Column,
  Entity,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum BlogStatus {
  PUBLISHED = 'PUBLISHED',
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED',
}

@Entity('blogs')
@Index('idx_blogs_status', ['status'])
@Index('idx_blogs_category', ['category'])
@Index('idx_blogs_published_at', ['published_at'])
@Index('idx_blogs_slug', ['slug'])
export class BlogEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ type: 'text' })
  excerpt: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ type: 'varchar', length: 100, default: 'General' })
  category: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: BlogStatus.PUBLISHED,
  })
  status: BlogStatus;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  published_at: Date;

  @Column({ type: 'integer', default: 0 })
  views: number;

  @Column({ type: 'text', nullable: true })
  thumbnail_url: string | null;

  @Column({ type: 'varchar', length: 100, default: 'HRSJM Admin' })
  author: string;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @Column({ type: 'boolean', default: false })
  featured: boolean;

  @Column({ type: 'boolean', default: true })
  allow_comments: boolean;
}
