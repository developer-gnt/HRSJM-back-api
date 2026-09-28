import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { UserEntity } from '../../users/entities/user.entity';

@Entity('donation_payments')
@Index('idx_donation_payments_donation_id', ['donation_id'])
@Index('idx_donation_payments_user_id', ['user_id'])
@Index('idx_donation_payments_status', ['payment_status'])
export class DonationPaymentEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  donation_id: string;

  @ManyToOne(() => DonationEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'donation_id' })
  donation?: DonationEntity;

  /** Nullable: donors are not required to have a user account. */
  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

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

  @Column({ type: 'varchar', length: 50, default: 'ONLINE' })
  payment_method: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: 'PENDING',
  })
  payment_status: PaymentStatus;

  @Column({ type: 'varchar', length: 150, nullable: true })
  gateway_order_id: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  gateway_payment_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gateway_signature: string | null;

  @Column({ type: 'jsonb', nullable: true })
  gateway_response: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  payment_date: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
