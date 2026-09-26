import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import {
  PermissionsGuard,
  PERMISSIONS_KEY,
} from './permissions.guard';
import { RolePermissionEntity } from '../../modules/roles/entities/role-permission.entity';
import { UserRoleEntity } from '../../modules/users/entities/user-role.entity';
import { UserEntity } from '../../modules/users/entities/user.entity';

type RepoMock = Record<string, jest.Mock>;

function makeGuard(heldPermissions: string[], account?: { status: string } | null) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(['user.read']),
  } as unknown as Reflector;

  const usersRepo: RepoMock = {
    findOne: jest.fn().mockResolvedValue(account ?? { id: 'u1', status: 'ACTIVE' }),
  };
  const userRolesRepo: RepoMock = {
    find: jest.fn().mockResolvedValue([{ role_id: 'role-admin' }]),
  };
  const rolePermissionsRepo: RepoMock = {
    find: jest.fn().mockResolvedValue(
      heldPermissions.map((name) => ({ permission: { name } })),
    ),
  };

  const repoFor = jest.fn((entity: unknown) => {
    if (entity === UserEntity) return usersRepo;
    if (entity === UserRoleEntity) return userRolesRepo;
    if (entity === RolePermissionEntity) return rolePermissionsRepo;
    throw new Error('Unexpected entity');
  });
  const dataSource = { getRepository: repoFor } as unknown as DataSource;

  const guard = new PermissionsGuard(reflector, dataSource);

  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'u1', roles: ['ADMIN'] } }),
    }),
    getHandler: () => 'handler',
    getClass: () => 'class',
  } as unknown as ExecutionContext;

  return { guard, context, reflector, repoFor, usersRepo, userRolesRepo, rolePermissionsRepo };
}

describe('PermissionsGuard', () => {
  it('TC-RBAC-005/006: allows when the endpoint declares no permissions', async () => {
    const { guard, context, reflector } = makeGuard([]);
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(PERMISSIONS_KEY, [
      'handler',
      'class',
    ]);
  });

  it('TC-RBAC-001: allows a user whose roles hold every required permission', async () => {
    const { guard, context } = makeGuard(['user.read']);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('TC-RBAC-003: denies a user missing one of the required permissions with details', async () => {
    const { guard, context } = makeGuard([]); // holds nothing
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: {
        code: 'PERMISSION_DENIED',
        details: { required: ['user.read'], missing: ['user.read'] },
      },
    });
  });

  it('TC-RBAC-007: denies when the user holds only some of the required permissions', async () => {
    const { guard, context } = makeGuard(['user.read']); // missing user.update
    const reflectorAll = { getAllAndOverride: jest.fn().mockReturnValue(['user.read', 'user.update']) };
    (guard as unknown as { reflector: Reflector }).reflector = reflectorAll as unknown as Reflector;
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED', details: { missing: ['user.update'] } },
    });
  });

  it('TC-RBAC-008: denies a disabled account before checking permissions', async () => {
    const { guard, context, rolePermissionsRepo } = makeGuard(['user.read'], { status: 'INACTIVE' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'ACCOUNT_DISABLED' },
    });
    expect(rolePermissionsRepo.find).not.toHaveBeenCalled();
  });

  it('TC-RBAC-009: denies when the account no longer exists', async () => {
    const { guard, context, usersRepo } = makeGuard(['user.read'], null);
    usersRepo.findOne = jest.fn().mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resolves permissions from the database via user_roles → role_permissions (never the token)', async () => {
    const { guard, context, repoFor, userRolesRepo } = makeGuard(['user.read']);
    await guard.canActivate(context);
    expect(repoFor).toHaveBeenCalledWith(UserEntity);
    expect(repoFor).toHaveBeenCalledWith(UserRoleEntity);
    expect(repoFor).toHaveBeenCalledWith(RolePermissionEntity);
    expect(userRolesRepo.find).toHaveBeenCalledWith({
      where: { user_id: 'u1' },
      select: ['role_id'],
    });
  });
});
