import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('system_settings')
export class SystemSettingEntity {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'jsonb', default: {} })
  value: Record<string, any>;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
