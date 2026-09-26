import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../common/enums/common-status.enum';

@Entity('membership_categories')
export class MembershipCategoryEntity extends BaseEntity {
  @Index('uq_membership_categories_name', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Index('uq_membership_categories_code', { unique: true })
  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: {
      to: (value: number | string | null) => value,
      from: (value: string | null) => (value !== null && value !== undefined ? parseFloat(value) : 0),
    },
  })
  fee: number;

  @Column({ type: 'int', default: 365 })
  validity_days: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: CommonStatus.ACTIVE,
  })
  status: CommonStatus;
}
