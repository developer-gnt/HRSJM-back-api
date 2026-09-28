import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Minimal donations scaffold — full donation/donor/cause CRUD belongs to
 * Arshad (junior backend). This table exists so Phase 9's payment flow has
 * an authoritative donation record; Arshad extends it with his own module.
 * The final donation-status enum and approved-cause catalogue are TBC
 * (BRD §54 items 17/18/19) — status is a plain varchar until confirmed.
 */
@Entity('donations')
@Index('idx_donations_status', ['status'])
@Index('idx_donations_donor_mobile', ['donor_mobile'])
export class DonationEntity extends BaseEntity {
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
}
