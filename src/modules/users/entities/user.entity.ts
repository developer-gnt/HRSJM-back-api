import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { CommonStatus } from '../../../common/enums/common-status.enum';
import { UserRoleEntity } from './user-role.entity';

@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Index('uq_users_mobile_number', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  mobile_number: string;

  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255 })
  password_hash: string;

  @Column({ type: 'text', nullable: true })
  avatar?: string | null;

  @Column({ type: 'enum', enum: CommonStatus, default: CommonStatus.ACTIVE })
  status: CommonStatus;

  @OneToMany(() => UserRoleEntity, (userRole) => userRole.user)
  user_roles?: UserRoleEntity[];
}
