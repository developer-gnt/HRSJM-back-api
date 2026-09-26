import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PermissionEntity } from '../../permissions/entities/permission.entity';
import { RoleEntity } from './role.entity';

@Entity('role_permissions')
@Unique('uq_role_permissions_role_id_permission_id', ['role_id', 'permission_id'])
export class RolePermissionEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  role_id: string;

  @ManyToOne(() => RoleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role?: RoleEntity;

  @Column({ type: 'uuid' })
  permission_id: string;

  @ManyToOne(() => PermissionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission?: PermissionEntity;
}
