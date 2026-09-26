import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { MembershipPaymentEntity } from './membership-payment.entity';

@Entity('payment_transactions')
@Index('idx_payment_transactions_membership_payment_id', ['membership_payment_id'])
@Index('idx_payment_transactions_order_id', ['gateway_order_id'])
export class PaymentTransactionEntity extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  membership_payment_id: string | null;

  @ManyToOne(() => MembershipPaymentEntity, (p) => p.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'membership_payment_id' })
  membership_payment?: MembershipPaymentEntity | null;

  @Column({ type: 'uuid', nullable: true })
  donation_payment_id: string | null;

  @Column({ type: 'varchar', length: 50, default: 'RAZORPAY' })
  gateway_name: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  gateway_order_id: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  gateway_payment_id: string | null;

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

  @Column({ type: 'varchar', length: 30, default: 'INITIATED' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  raw_payload: Record<string, unknown> | null;
}
