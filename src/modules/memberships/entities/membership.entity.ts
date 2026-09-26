import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipCategoryEntity } from '../../membership-categories/entities/membership-category.entity';

@Entity('memberships')
export class MembershipEntity extends BaseEntity {
  @Index('idx_memberships_user_id')
  @Column({ type: 'uuid' })
  user_id: string;

  @Index('idx_memberships_category_id')
  @Column({ type: 'uuid' })
  category_id: string;

  @Index('uq_memberships_membership_number', { unique: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  membership_number: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: MembershipStatus.PENDING,
  })
  status: MembershipStatus;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  applied_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  start_date: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiry_date: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  approval_date: Date | null;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string | null;

  @Column({ type: 'text', nullable: true })
  admin_notes: string | null;

  @Column({ type: 'jsonb', nullable: true })
  application_data: Record<string, unknown> | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToOne(() => MembershipCategoryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category?: MembershipCategoryEntity;
}
