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
  ExpensePaymentMethod,
  ExpenseStatus,
} from '../enums/expense-entry.enums';

@Entity('expense_entries')
@Index('uq_expense_entries_voucher_number', ['voucher_number'], { unique: true })
@Index('idx_expense_entries_date', ['expense_date'])
@Index('idx_expense_entries_expense_account', ['expense_account_id'])
@Index('idx_expense_entries_paid_from_account', ['paid_from_account_id'])
@Index('idx_expense_entries_status', ['status'])
export class ExpenseEntryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  voucher_number: string;

  @Column({ type: 'timestamptz' })
  expense_date: Date;

  @Column({ type: 'varchar', length: 150 })
  paid_to: string;

  @Column({ type: 'uuid' })
  expense_account_id: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'expense_account_id' })
  expense_account?: AccountEntity;

  @Column({ type: 'uuid' })
  paid_from_account_id: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'paid_from_account_id' })
  paid_from_account?: AccountEntity;

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
    default: ExpensePaymentMethod.BANK_TRANSFER,
  })
  payment_method: ExpensePaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference_number: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  attachment_url: string | null;

  @Column({ type: 'varchar', length: 20, default: ExpenseStatus.POSTED })
  status: ExpenseStatus;

  @Column({ type: 'uuid', nullable: true })
  accounting_entry_id: string | null;

  @ManyToOne(() => AccountingEntryEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'accounting_entry_id' })
  accounting_entry?: AccountingEntryEntity | null;
}
