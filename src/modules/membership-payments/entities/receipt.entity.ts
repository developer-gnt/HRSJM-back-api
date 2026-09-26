import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipPaymentEntity } from './membership-payment.entity';

@Entity('receipts')
@Index('uq_receipts_receipt_number', ['receipt_number'], { unique: true })
@Index('idx_receipts_user_id', ['user_id'])
@Index('idx_receipts_membership_payment_id', ['membership_payment_id'])
export class ReceiptEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 50 })
  receipt_number: string;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  receipt_date: Date;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'uuid', nullable: true })
  membership_payment_id: string | null;

  @OneToOne(() => MembershipPaymentEntity, (p) => p.receipt, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'membership_payment_id' })
  membership_payment?: MembershipPaymentEntity | null;

  @Column({ type: 'uuid', nullable: true })
  donation_payment_id: string | null;

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

  @Column({ type: 'varchar', length: 50, default: 'MEMBERSHIP' })
  receipt_type: string;

  @Column({ type: 'varchar', length: 255 })
  issued_to: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  accounting_entry_id: string | null;
}
