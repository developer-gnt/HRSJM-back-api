import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { AccountType } from '../enums/accounting.enums';

@Entity('accounts')
@Index('uq_accounts_account_name', ['account_name'], { unique: true })
@Index('uq_accounts_account_code', ['account_code'], { unique: true })
@Index('idx_accounts_type', ['account_type'])
@Index('idx_accounts_parent', ['parent_account_id'])
export class AccountEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 20, nullable: true })
  account_code: string | null;

  @Column({ type: 'varchar', length: 100 })
  account_name: string;

  @Column({ type: 'varchar', length: 20 })
  account_type: AccountType;

  @Column({ type: 'uuid', nullable: true })
  parent_account_id: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_account_id' })
  parent?: AccountEntity | null;

  @OneToMany(() => AccountEntity, (a) => a.parent)
  children?: AccountEntity[];

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;
}
