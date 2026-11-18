import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MembershipEntity } from './membership.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { RenewalRequestEntity } from '../../renewals/entities/renewal-request.entity';

export enum ReferralStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('membership_referrals')
@Index('idx_referrals_referrer_membership_id', ['referrer_membership_id'])
@Index('idx_referrals_referrer_user_id', ['referrer_user_id'])
@Index('idx_referrals_referred_membership_id', ['referred_membership_id'])
@Index('idx_referrals_referral_code', ['referral_code'])
export class MembershipReferralEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  referrer_membership_id: string;

  @ManyToOne(() => MembershipEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_membership_id' })
  referrer_membership?: MembershipEntity;

  @Column({ type: 'uuid' })
  referrer_user_id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referrer_user_id' })
  referrer_user?: UserEntity;

  @Column({ type: 'uuid' })
  referred_membership_id: string;

  @ManyToOne(() => MembershipEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'referred_membership_id' })
  referred_membership?: MembershipEntity;

  @Column({ type: 'varchar', length: 10 })
  referral_code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category_name?: string | null;

  @Column({ type: 'integer', default: 1 })
  reward_years: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ type: 'boolean', default: false })
  free_renewal_applied: boolean;

  @Column({ type: 'uuid', nullable: true })
  renewal_id?: string | null;

  @ManyToOne(() => RenewalRequestEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'renewal_id' })
  renewal?: RenewalRequestEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  reward_applied_at?: Date | null;
}

