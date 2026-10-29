import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { UserEntity } from '../../users/entities/user.entity';

/**
 * Authoritative donations entity. Stores donation intent and details,
 * linked to the donating user (when authenticated) and donation payments.
 */
@Entity('donations')
@Index('idx_donations_status', ['status'])
@Index('idx_donations_donor_mobile', ['donor_mobile'])
@Index('idx_donations_user_id', ['user_id'])
export class DonationEntity extends BaseEntity {
  @Column({ type: 'uuid', nullable: true })
  user_id: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity | null;

  @Column({ type: 'varchar', length: 150 })
  donor_name: string;

  @Column({ type: 'varchar', length: 15 })
  donor_mobile: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  donor_email: string | null;

  @Column({ type: 'varchar', length: 255 })
  cause: string;

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

  @Column({ type: 'varchar', length: 30, default: 'PENDING' })
  status: string;

  @Column({ type: 'text', nullable: true })
  remark: string | null;

  @Column({ type: 'varchar', length: 50, default: 'Website', nullable: true })
  source: string | null;
}
