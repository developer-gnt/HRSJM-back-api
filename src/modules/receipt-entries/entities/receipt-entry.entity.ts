import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../../accounting/entities/accounting-entry.entity';
import {
  ReceiptPaymentMethod,
  ReceiptStatus,
} from '../enums/receipt-entry.enums';

@Entity('receipt_entries')
@Index('uq_receipt_entries_voucher_number', ['voucher_number'], { unique: true })
@Index('idx_receipt_entries_date', ['receipt_date'])
@Index('idx_receipt_entries_income_account', ['income_account_id'])
@Index('idx_receipt_entries_received_in_account', ['received_in_account_id'])
@Index('idx_receipt_entries_status', ['status'])
export class ReceiptEntryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  voucher_number: string;

  @Column({ type: 'timestamptz' })
  receipt_date: Date;

  @Column({ type: 'varchar', length: 150 })
  received_from: string;

  @Column({ type: 'uuid' })
  income_account_id: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'income_account_id' })
  income_account?: AccountEntity;

  @Column({ type: 'uuid' })
  received_in_account_id: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'received_in_account_id' })
  received_in_account?: AccountEntity;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: string | null) =>
        v !== null && v !== undefined ? parseFloat(v) : 0,
    },
  })
  amount: number;

  @Column({
    type: 'varchar',
    length: 50,
    default: ReceiptPaymentMethod.BANK_TRANSFER,
  })
  payment_method: ReceiptPaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference_number: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  attachment_url: string | null;

  @Column({ type: 'varchar', length: 20, default: ReceiptStatus.POSTED })
  status: ReceiptStatus;

  @Column({ type: 'uuid', nullable: true })
  accounting_entry_id: string | null;

  @ManyToOne(() => AccountingEntryEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'accounting_entry_id' })
  accounting_entry?: AccountingEntryEntity | null;
}
