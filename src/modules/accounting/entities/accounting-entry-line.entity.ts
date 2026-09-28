import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AccountEntity } from './account.entity';
import { AccountingEntryEntity } from './accounting-entry.entity';

@Entity('accounting_entry_lines')
@Index('idx_accounting_entry_lines_entry_id', ['accounting_entry_id'])
@Index('idx_accounting_entry_lines_account_id', ['account_id'])
export class AccountingEntryLineEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  accounting_entry_id: string;

  @ManyToOne(() => AccountingEntryEntity, (e) => e.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'accounting_entry_id' })
  entry?: AccountingEntryEntity;

  @Column({ type: 'uuid' })
  account_id: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: AccountEntity;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: string | null) => (v !== null && v !== undefined ? parseFloat(v) : 0),
    },
  })
  debit_amount: number;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number | string | null) => v,
      from: (v: string | null) => (v !== null && v !== undefined ? parseFloat(v) : 0),
    },
  })
  credit_amount: number;

  @Column({ type: 'text', nullable: true })
  line_description: string | null;

  @Column({ type: 'int', default: 1 })
  line_number: number;
}
