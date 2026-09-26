import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { ReceiptEntity } from './receipt.entity';
import { PaymentTransactionEntity } from './payment-transaction.entity';

@Entity('membership_payments')
@Index('idx_membership_payments_membership_id', ['membership_id'])
@Index('idx_membership_payments_user_id', ['user_id'])
@Index('idx_membership_payments_status', ['payment_status'])
export class MembershipPaymentEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  membership_id: string;

  @ManyToOne(() => MembershipEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'membership_id' })
  membership?: MembershipEntity;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

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
    default: PaymentStatus.PENDING,
  })
  payment_status: PaymentStatus;

  @Column({ type: 'varchar', length: 150, nullable: true })
  transaction_id: string | null;

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

  @OneToOne(() => ReceiptEntity, (r) => r.membership_payment)
  receipt?: ReceiptEntity;

  @OneToMany(() => PaymentTransactionEntity, (t) => t.membership_payment)
  transactions?: PaymentTransactionEntity[];
}
