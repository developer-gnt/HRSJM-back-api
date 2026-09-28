import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';

export enum RenewalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ACTIVE = 'ACTIVE',
}

export enum RenewalPaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export enum RenewalPaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MOBILE_WALLET = 'MOBILE_WALLET',
  CARD = 'CARD',
  ONLINE = 'ONLINE',
}

@Entity('membership_renewals')
@Index('idx_membership_renewals_membership_id', ['membership_id'])
@Index('idx_membership_renewals_status', ['status'])
@Index('idx_membership_renewals_requested_by', ['requested_by'])
export class RenewalRequestEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  membership_id: string;

  @ManyToOne(() => MembershipEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'membership_id' })
  membership?: MembershipEntity;

  @Column({ type: 'uuid' })
  requested_by: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'requested_by' })
  requested_by_user?: UserEntity;

  @Column({ type: 'integer', default: 1 })
  period_years: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: string | null) => (v !== null && v !== undefined ? parseFloat(v) : 0),
    },
  })
  amount: number;

  @Column({ type: 'varchar', length: 50, default: RenewalPaymentMethod.CASH })
  payment_method: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transaction_id: string | null;

  @Column({ type: 'varchar', length: 30, default: RenewalPaymentStatus.PENDING })
  payment_status: string;

  @Column({ type: 'varchar', length: 30, default: RenewalStatus.PENDING })
  status: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  receipt_number: string | null;

  @Column({ type: 'date', nullable: true })
  previous_expiry: Date | string | null;

  @Column({ type: 'date', nullable: true })
  new_expiry: Date | string | null;

  @Column({ type: 'text', nullable: true })
  admin_remark: string | null;

  @Column({ type: 'text', nullable: true })
  member_note: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewed_by: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by' })
  reviewed_by_user?: UserEntity | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewed_at: Date | null;
}
