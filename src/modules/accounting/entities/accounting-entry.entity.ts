import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AccountEntity } from './account.entity';
import { AccountingEntryLineEntity } from './accounting-entry-line.entity';
import { EntryType, ReferenceType } from '../enums/accounting.enums';

@Entity('accounting_entries')
@Index('uq_accounting_entries_entry_number', ['entry_number'], { unique: true })
@Index('idx_accounting_entries_date', ['entry_date'])
@Index('idx_accounting_entries_reference', ['reference_type', 'reference_id'])
@Index('idx_accounting_entries_type', ['entry_type'])
@Index('idx_accounting_entries_reversal_of', ['reversal_of_entry_id'])
// One journal per source document (idempotent posting); reversals excluded.
@Index('uq_accounting_entries_reference_journal', ['reference_type', 'reference_id'], {
  unique: true,
  where: `"entry_type" = 'JOURNAL'`,
})
// A posted entry can be reversed at most once.
@Index('uq_accounting_entries_reversal', ['reversal_of_entry_id'], {
  unique: true,
  where: `"reversal_of_entry_id" IS NOT NULL`,
})
export class AccountingEntryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 30 })
  entry_number: string;

  @Column({ type: 'timestamptz' })
  entry_date: Date;

  @Column({ type: 'varchar', length: 20, default: EntryType.JOURNAL })
  entry_type: EntryType;

  @Column({ type: 'varchar', length: 30 })
  reference_type: ReferenceType;

  @Column({ type: 'uuid' })
  reference_id: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'uuid', nullable: true })
  reversal_of_entry_id: string | null;

  @ManyToOne(() => AccountingEntryEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reversal_of_entry_id' })
  reversal_of?: AccountingEntryEntity | null;

  @OneToMany(() => AccountingEntryLineEntity, (l) => l.entry)
  lines?: AccountingEntryLineEntity[];
}
