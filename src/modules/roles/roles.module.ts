import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity } from './entities/role.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { PermissionEntity } from '../permissions/entities/permission.entity';
import { UserRoleEntity } from '../users/entities/user-role.entity';
import { UserEntity } from '../users/entities/user.entity';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesService } from './services/roles.service';
import { RolesController } from './controllers/roles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      RolePermissionEntity,
      PermissionEntity,
      UserRoleEntity,
      UserEntity,
    ]),
    PermissionsModule,
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
