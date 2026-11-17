import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../common/entities/base.entity';

export type SubscriptionStatus =
  | 'INITIALIZED'
  | 'BANK_APPROVAL_PENDING'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED';

@Entity('subscriptions')
@Index('idx_subscriptions_subscription_id', ['subscription_id'], { unique: true })
@Index('idx_subscriptions_user_id', ['user_id'])
@Index('idx_subscriptions_status', ['status'])
@Index('idx_subscriptions_purpose', ['purpose'])
export class SubscriptionEntity extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @Column({ type: 'varchar', length: 100, unique: true })
  subscription_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subscription_session_id: string | null;

  @Column({ type: 'varchar', length: 30, default: 'DONATION' })
  purpose: 'DONATION' | 'MEMBERSHIP';

  @Column({ type: 'varchar', length: 150, nullable: true })
  reference_id: string | null;

  @Column({ type: 'varchar', length: 100 })
  customer_name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  customer_email: string | null;

  @Column({ type: 'varchar', length: 20 })
  customer_phone: string;

  @Column({ type: 'varchar', length: 100 })
  plan_name: string;

  @Column({ type: 'varchar', length: 30, default: 'PERIODIC' })
  plan_type: 'PERIODIC' | 'ON_DEMAND';

  @Column({ type: 'varchar', length: 20, default: 'MONTHLY' })
  frequency: 'MONTHLY' | 'YEARLY';

  @Column({ type: 'varchar', length: 10, default: 'INR' })
  currency: string;

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

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 5000,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: string | null) => (v !== null && v !== undefined ? parseFloat(v) : 5000),
    },
  })
  max_amount: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 1,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: string | null) => (v !== null && v !== undefined ? parseFloat(v) : 1),
    },
  })
  auth_amount: number;

  @Column({ type: 'varchar', length: 30, default: 'INITIALIZED' })
  status: SubscriptionStatus;

  @Column({ type: 'jsonb', nullable: true })
  payment_methods: string[] | null;

  @Column({ type: 'timestamptz', nullable: true })
  next_charge_date: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_charged_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiry_time: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  raw_details: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;
}
