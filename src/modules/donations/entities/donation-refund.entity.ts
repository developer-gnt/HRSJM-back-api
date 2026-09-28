import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DonationPaymentEntity } from '../../donation-payments/entities/donation-payment.entity';

/**
 * One row per refund. Refund policy (full refund via mirrored accounting
 * reversal only) is implemented; partial refunds remain TBC (BRD §54 #21).
 */
@Entity('donation_refunds')
@Index('idx_donation_refunds_payment_id', ['donation_payment_id'])
export class DonationRefundEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  donation_payment_id: string;

  @ManyToOne(() => DonationPaymentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'donation_payment_id' })
  payment?: DonationPaymentEntity;

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

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'uuid', nullable: true })
  reversed_entry_id: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  refunded_at: Date;
}
