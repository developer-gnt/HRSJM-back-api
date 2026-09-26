import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { RoleEntity } from '../entities/role.entity';
import { RolePermissionEntity } from '../entities/role-permission.entity';
import { PermissionEntity } from '../../permissions/entities/permission.entity';
import { UserRoleEntity } from '../../users/entities/user-role.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { PROTECTED_ROLE_NAMES } from '../roles.constants';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissions: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissions: Repository<RolePermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async listRoles() {
    const rows = await this.roles.find({ order: { name: 'ASC' } });
    const mappings = await this.rolePermissions.find({
      relations: { permission: true },
    });
    const byRole = new Map<string, string[]>();
    for (const rp of mappings) {
      const list = byRole.get(rp.role_id) ?? [];
      if (rp.permission) list.push(rp.permission.name);
      byRole.set(rp.role_id, list);
    }
    return rows.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      is_protected: PROTECTED_ROLE_NAMES.includes(role.name),
      permissions: (byRole.get(role.id) ?? []).sort(),
      created_at: role.created_at,
      updated_at: role.updated_at,
    }));
  }

  async getRole(id: string) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException({
        message: 'Role not found',
        code: 'ROLE_NOT_FOUND',
        details: null,
      });
    }
    const mappings = await this.rolePermissions.find({
      where: { role_id: id },
      relations: { permission: true },
    });
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      is_protected: PROTECTED_ROLE_NAMES.includes(role.name),
      permissions: mappings
        .map((rp) => rp.permission?.name)
        .filter((n): n is string => Boolean(n))
        .sort(),
      created_at: role.created_at,
      updated_at: role.updated_at,
    };
  }

  async createRole(input: { name: string; description?: string }) {
    const name = input.name.toUpperCase().replace(/\s+/g, '_');
    const existing = await this.roles.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException({
        message: 'Role already exists',
        code: 'ROLE_ALREADY_EXISTS',
        details: null,
      });
    }
    const saved = await this.roles.save(
      this.roles.create({ name, description: input.description ?? null }),
    );
    return this.getRole(saved.id);
  }

  async updateRole(id: string, patch: { name?: string; description?: string }) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException({
        message: 'Role not found',
        code: 'ROLE_NOT_FOUND',
        details: null,
      });
    }
    if (
      PROTECTED_ROLE_NAMES.includes(role.name) &&
      patch.name &&
      patch.name.toUpperCase() !== role.name
    ) {
      throw new ForbiddenException({
        message: 'Baseline roles cannot be renamed',
        code: 'ROLE_PROTECTED',
        details: null,
      });
    }
    if (patch.name !== undefined) {
      role.name = patch.name.toUpperCase().replace(/\s+/g, '_');
    }
    if (patch.description !== undefined) {
      role.description = patch.description;
    }
    await this.roles.save(role);
    return this.getRole(id);
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException({
        message: 'Role not found',
        code: 'ROLE_NOT_FOUND',
        details: null,
      });
    }
    if (PROTECTED_ROLE_NAMES.includes(role.name)) {
      throw new ForbiddenException({
        message: 'Baseline roles cannot be deleted',
        code: 'ROLE_PROTECTED',
        details: null,
      });
    }
    const inUse = await this.userRoles.count({ where: { role_id: id } });
    if (inUse > 0) {
      throw new ConflictException({
        message: 'Role is assigned to users and cannot be deleted',
        code: 'ROLE_IN_USE',
        details: { assigned_users: inUse },
      });
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(RolePermissionEntity).delete({ role_id: id });
      await manager.getRepository(RoleEntity).delete(id);
    });
  }

  async setRolePermissions(roleId: string, permissionIds: string[]) {
    const role = await this.roles.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException({
        message: 'Role not found',
        code: 'ROLE_NOT_FOUND',
        details: null,
      });
    }
    const found = await this.permissions.find({
      where: { id: In(permissionIds) },
    });
    if (found.length !== new Set(permissionIds).size) {
      throw new NotFoundException({
        message: 'One or more permissions not found',
        code: 'PERMISSION_NOT_FOUND',
        details: null,
      });
    }
    await this.rolePermissions.save(
      permissionIds.map((permission_id) =>
        this.rolePermissions.create({ role_id: roleId, permission_id }),
      ),
    );
    return this.getRole(roleId);
  }

  async removeRolePermission(roleId: string, permissionId: string) {
    const mapping = await this.rolePermissions.findOne({
      where: { role_id: roleId, permission_id: permissionId },
    });
    if (!mapping) {
      throw new NotFoundException({
        message: 'Permission is not assigned to this role',
        code: 'ROLE_PERMISSION_NOT_FOUND',
        details: null,
      });
    }
    await this.rolePermissions.delete(mapping.id);
    return this.getRole(roleId);
  }

  async listUserRoles(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
        details: null,
      });
    }
    const rows = await this.userRoles.find({
      where: { user_id: userId },
      relations: { role: true },
    });
    return {
      user_id: userId,
      roles: rows.map((ur) => ({
        id: ur.role?.id,
        name: ur.role?.name,
        description: ur.role?.description,
      })),
    };
  }

  async assignUserRole(userId: string, roleId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
        details: null,
      });
    }
    const role = await this.roles.findOne({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException({
        message: 'Role not found',
        code: 'ROLE_NOT_FOUND',
        details: null,
      });
    }
    const existing = await this.userRoles.findOne({
      where: { user_id: userId, role_id: roleId },
    });
    if (!existing) {
      await this.userRoles.save(
        this.userRoles.create({ user_id: userId, role_id: roleId }),
      );
    }
    return this.listUserRoles(userId);
  }

  async removeUserRole(userId: string, roleId: string) {
    const mapping = await this.userRoles.findOne({
      where: { user_id: userId, role_id: roleId },
    });
    if (!mapping) {
      throw new NotFoundException({
        message: 'Role is not assigned to this user',
        code: 'USER_ROLE_NOT_FOUND',
        details: null,
      });
    }
    await this.userRoles.delete(mapping.id);
    return this.listUserRoles(userId);
  }
}
