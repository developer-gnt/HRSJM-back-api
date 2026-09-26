import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource, In } from 'typeorm';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { RolePermissionEntity } from '../../modules/roles/entities/role-permission.entity';
import { UserRoleEntity } from '../../modules/users/entities/user-role.entity';
import { UserEntity } from '../../modules/users/entities/user.entity';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Declares the permissions an endpoint requires, in `module.action` format.
 * Applied together with JwtAuthGuard; the guard resolves permissions from the
 * database (role → role_permissions), never from the client token alone.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user?.sub) {
      throw new ForbiddenException({
        message: 'Not authenticated',
        code: 'FORBIDDEN',
        details: null,
      });
    }

    // Account status is authoritative on the backend (not the token claims).
    const account = await this.dataSource
      .getRepository(UserEntity)
      .findOne({ where: { id: user.sub }, select: ['id', 'status'] });
    if (!account || account.status !== 'ACTIVE') {
      throw new ForbiddenException({
        message: 'Account is disabled',
        code: 'ACCOUNT_DISABLED',
        details: null,
      });
    }

    // Resolve the user's role IDs, then the permissions those roles hold.
    const userRoleRows = await this.dataSource
      .getRepository(UserRoleEntity)
      .find({ where: { user_id: user.sub }, select: ['role_id'] });

    const held = new Set<string>();
    if (userRoleRows.length > 0) {
      const roleIds = userRoleRows.map((ur) => ur.role_id);
      const rolePermissions = await this.dataSource
        .getRepository(RolePermissionEntity)
        .find({
          where: { role_id: In(roleIds), permission: { name: In(required) } },
          relations: { permission: true },
        });
      for (const rp of rolePermissions) {
        if (rp.permission?.name) held.add(rp.permission.name);
      }
    }

    const missing = required.filter((p) => !held.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        message: 'Missing required permissions',
        code: 'PERMISSION_DENIED',
        details: { required, missing },
      });
    }
    return true;
  }
}
