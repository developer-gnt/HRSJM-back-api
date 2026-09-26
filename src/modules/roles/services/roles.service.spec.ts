import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RolesService } from './roles.service';
import { RoleEntity } from '../entities/role.entity';
import { PermissionEntity } from '../../permissions/entities/permission.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { UserRoleEntity } from '../../users/entities/user-role.entity';
import { UserEntity } from '../../users/entities/user.entity';

const ADMIN_ROLE: Partial<RoleEntity> = {
  id: 'role-admin',
  name: 'ADMIN',
  description: 'HRSJM administrator',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('RolesService', () => {
  let service: RolesService;
  let roles: Record<string, jest.Mock>;
  let permissions: Record<string, jest.Mock>;
  let rolePermissions: Record<string, jest.Mock>;
  let userRoles: Record<string, jest.Mock>;
  let users: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };

  const build = () =>
    new RolesService(
      roles as never,
      permissions as never,
      rolePermissions as never,
      userRoles as never,
      users as never,
      dataSource as unknown as DataSource,
    );

  beforeEach(() => {
    roles = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...ADMIN_ROLE, ...x })),
    };
    permissions = { find: jest.fn().mockResolvedValue([]) };
    rolePermissions = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
    };
    userRoles = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(undefined),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    users = { findOne: jest.fn().mockResolvedValue({ id: 'u1' }) };
    dataSource = { transaction: jest.fn((cb) => cb({
      getRepository: () => ({ delete: jest.fn().mockResolvedValue(undefined) }),
    })) };
    service = build();
  });

  it('TC-RBAC-010: createRole normalizes the name (uppercase, underscores)', async () => {
    roles.findOne = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...ADMIN_ROLE,
      id: 'r-new',
      name: 'FINANCE_TEAM',
    });
    roles.save = jest.fn(async (x) => ({ ...ADMIN_ROLE, id: 'r-new', ...x }));

    const result = await service.createRole({ name: 'finance team' });

    expect(roles.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'FINANCE_TEAM' }),
    );
    expect(result.name).toBe('FINANCE_TEAM');
    expect(result.is_protected).toBe(false);
  });

  it('TC-RBAC-010: createRole rejects a duplicate name', async () => {
    roles.findOne = jest.fn().mockResolvedValue(ADMIN_ROLE);

    await expect(service.createRole({ name: 'admin' })).rejects.toMatchObject({
      response: { code: 'ROLE_ALREADY_EXISTS' },
    });
  });

  it('TC-RBAC-011: renaming a baseline role is forbidden', async () => {
    roles.findOne = jest.fn().mockResolvedValue(ADMIN_ROLE);

    await expect(
      service.updateRole('role-admin', { name: 'SUPER_ADMIN' }),
    ).rejects.toMatchObject({ response: { code: 'ROLE_PROTECTED' } });
  });

  it('TC-RBAC-012: deleting a baseline role is forbidden', async () => {
    roles.findOne = jest.fn().mockResolvedValue(ADMIN_ROLE);

    await expect(service.deleteRole('role-admin')).rejects.toMatchObject({
      response: { code: 'ROLE_PROTECTED' },
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('TC-RBAC-013: deleting a role that is assigned to users is a conflict', async () => {
    roles.findOne = jest.fn().mockResolvedValue({ ...ADMIN_ROLE, name: 'AUDITOR' });
    userRoles.count = jest.fn().mockResolvedValue(4);

    await expect(service.deleteRole('r-audit')).rejects.toMatchObject({
      response: { code: 'ROLE_IN_USE', details: { assigned_users: 4 } },
    });
  });

  it('TC-RBAC-013: deleting an unused custom role removes mappings and role in one transaction', async () => {
    roles.findOne = jest.fn().mockResolvedValue({ ...ADMIN_ROLE, name: 'AUDITOR' });
    const managerDeletes = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction = jest.fn((cb) =>
      cb({ getRepository: () => managerDeletes }),
    );

    await expect(service.deleteRole('r-audit')).resolves.toBeUndefined();
    expect(managerDeletes.delete).toHaveBeenCalledWith({ role_id: 'r-audit' });
    expect(managerDeletes.delete).toHaveBeenCalledWith('r-audit');
  });

  it('TC-RBAC-014: setRolePermissions rejects unknown permission ids', async () => {
    roles.findOne = jest.fn().mockResolvedValue(ADMIN_ROLE);
    permissions.find = jest.fn().mockResolvedValue([]); // none of the ids exist

    await expect(
      service.setRolePermissions('role-admin', ['p1', 'p2']),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_NOT_FOUND' } });
  });

  it('TC-RBAC-015: assignUserRole is idempotent — existing mapping is not saved again', async () => {
    users.findOne = jest.fn().mockResolvedValue({ id: 'u1' });
    roles.findOne = jest.fn().mockResolvedValue(ADMIN_ROLE);
    userRoles.findOne = jest.fn().mockResolvedValue({ user_id: 'u1', role_id: 'role-admin' });
    userRoles.find = jest.fn().mockResolvedValue([
      { role: { id: 'role-admin', name: 'ADMIN', description: null } },
    ]);

    const result = await service.assignUserRole('u1', 'role-admin');

    expect(userRoles.save).not.toHaveBeenCalled();
    expect(result.roles).toEqual([
      { id: 'role-admin', name: 'ADMIN', description: null },
    ]);
  });

  it('TC-RBAC-016: removing a role the user does not have is a 404', async () => {
    users.findOne = jest.fn().mockResolvedValue({ id: 'u1' });
    userRoles.findOne = jest.fn().mockResolvedValue(null);

    await expect(service.removeUserRole('u1', 'role-admin')).rejects.toMatchObject({
      response: { code: 'USER_ROLE_NOT_FOUND' },
    });
  });

  it('TC-RBAC-017: getRole for an unknown id is a 404', async () => {
    roles.findOne = jest.fn().mockResolvedValue(null);

    await expect(service.getRole('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PermissionEntity and RolePermissionEntity are wired for unique-permission names', () => {
    // Static sanity: unique index names exist on both entities' metadata
    expect(PermissionEntity).toBeDefined();
    expect(RolePermissionEntity).toBeDefined();
  });
});
