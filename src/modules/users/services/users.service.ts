import { BadRequestException, ConflictException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { RoleEntity } from '../../roles/entities/role.entity';
import { RolePermissionEntity } from '../../roles/entities/role-permission.entity';

export interface UserRoleInfo {
  id: string;
  name: string;
}

export interface UserProfile {
  id: string;
  full_name: string;
  mobile_number: string;
  email: string | null;
  dob?: string | null;
  avatar?: string | null;
  status: string;
  roles: UserRoleInfo[];
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findByLoginIdentifier(identifier: string): Promise<UserEntity | null> {
    return this.users.findOne({
      where: [
        { mobile_number: identifier },
        { email: identifier.toLowerCase() },
      ],
    });
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({
      where: { id },
      relations: ['user_roles', 'user_roles.role'],
    });
  }

  async getProfile(id: string): Promise<UserProfile | null> {
    const user = await this.users.findOne({
      where: { id },
      relations: ['user_roles', 'user_roles.role'],
    });
    if (!user) return null;
    return this.toProfile(user);
  }

  toProfile(user: UserEntity & { user_roles?: UserRoleEntity[] }): UserProfile {
    return {
      id: user.id,
      full_name: user.full_name,
      mobile_number: user.mobile_number,
      email: user.email,
      dob: user.dob ?? null,
      avatar: user.avatar ?? null,
      status: user.status,
      roles: (user.user_roles ?? [])
        .map((userRole) => userRole.role)
        .filter((role): role is NonNullable<typeof role> => Boolean(role))
        .map((role) => ({
          id: role.id,
          name: role.name,
        })),
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  /**
   * Aggregates the effective permission keys granted to a user through all of
   * their roles (user_roles → role_permissions → permissions). Mirrors the
   * resolution inside PermissionsGuard so clients can drive dynamic RBAC UI
   * without needing role.read.
   */
  async getEffectivePermissionNames(userId: string): Promise<string[]> {
    const userRoles = await this.dataSource
      .getRepository(UserRoleEntity)
      .find({ where: { user_id: userId } });

    if (userRoles.length === 0) {
      return [];
    }

    const rolePermissions = await this.dataSource
      .getRepository(RolePermissionEntity)
      .find({
        where: { role_id: In(userRoles.map((userRole) => userRole.role_id)) },
        relations: { permission: true },
      });

    return [
      ...new Set(
        rolePermissions
          .map((rp) => rp.permission?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ].sort();
  }

  async createUserWithRole(input: {
    full_name: string;
    mobile_number: string;
    email: string | null;
    password_hash: string;
    roleName?: string;
    roleId?: string;
  }): Promise<UserEntity> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager
        .getRepository(UserEntity)
        .save(
          manager.getRepository(UserEntity).create({
            full_name: input.full_name,
            mobile_number: input.mobile_number,
            email: input.email,
            password_hash: input.password_hash,
          }),
        );

      let role: RoleEntity | null = null;
      if (input.roleId) {
        role = await manager
          .getRepository(RoleEntity)
          .findOne({ where: { id: input.roleId } });
        if (!role) {
          throw new BadRequestException({
            message: 'Specified role does not exist',
            code: 'ROLE_NOT_FOUND',
            details: null,
          });
        }
      } else {
        role = await manager
          .getRepository(RoleEntity)
          .findOne({ where: { name: input.roleName ?? 'USER' } });
        if (!role) {
          throw new InternalServerErrorException({
            message: 'Default role is missing',
            code: 'ROLE_NOT_FOUND',
            details: null,
          });
        }
      }

      await manager
        .getRepository(UserRoleEntity)
        .save(
          manager.getRepository(UserRoleEntity).create({
            user_id: user.id,
            role_id: role.id,
          }),
        );

      return user;
    });
  }

  /**
   * Upgrades a user account to the MEMBER role upon membership approval.
   * Replaces the base USER role with MEMBER so the account gets full member privileges.
   */
  async assignMemberRole(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const roleRepo = manager.getRepository(RoleEntity);
      const userRoleRepo = manager.getRepository(UserRoleEntity);

      const memberRole = await roleRepo.findOne({ where: { name: 'MEMBER' } });
      const userRole = await roleRepo.findOne({ where: { name: 'USER' } });

      if (!memberRole) {
        return;
      }

      // Check if user already has MEMBER role
      const existingMember = await userRoleRepo.findOne({
        where: { user_id: userId, role_id: memberRole.id },
      });

      // Remove standard USER role so user is now exclusively a MEMBER
      if (userRole) {
        await userRoleRepo.delete({
          user_id: userId,
          role_id: userRole.id,
        });
      }

      if (!existingMember) {
        // Add MEMBER role
        await userRoleRepo.save(
          userRoleRepo.create({
            user_id: userId,
            role_id: memberRole.id,
          }),
        );
      }
    });
  }

  async assertNoDuplicates(mobile: string, email?: string | null): Promise<void> {
    const clash = await this.users.findOne({
      where: [
        { mobile_number: mobile },
        ...(email ? [{ email: email.toLowerCase() }] : []),
      ],
      select: ['id', 'mobile_number', 'email'],
    });
    if (!clash) return;
    if (clash.mobile_number === mobile) {
      throw new ConflictException({
        message: 'Mobile number already registered',
        code: 'MOBILE_NUMBER_TAKEN',
        details: null,
      });
    }
    throw new ConflictException({
      message: 'Email already registered',
      code: 'EMAIL_TAKEN',
      details: null,
    });
  }

  async updateProfile(
    user: UserEntity,
    patch: { full_name?: string; email?: string | null; mobile_number?: string; avatar?: string | null; dob?: string | null },
  ): Promise<UserProfile> {
    if (patch.full_name !== undefined) user.full_name = patch.full_name.trim();
    if (patch.avatar !== undefined) user.avatar = patch.avatar;
    if (patch.dob !== undefined) user.dob = patch.dob ? patch.dob.trim() : null;
    if (patch.email !== undefined) {
      const cleanEmail = patch.email ? patch.email.trim().toLowerCase() : null;
      const currentEmail = user.email ? user.email.trim().toLowerCase() : null;
      if (cleanEmail !== currentEmail) {
        if (cleanEmail) {
          const emailOwner = await this.users.findOne({
            where: { email: cleanEmail },
            select: ['id'],
          });
          if (emailOwner && emailOwner.id !== user.id) {
            throw new ConflictException({
              message: 'Email already registered',
              code: 'EMAIL_TAKEN',
              details: null,
            });
          }
        }
        user.email = cleanEmail;
      }
    }
    if (patch.mobile_number !== undefined) {
      const cleanMobile = patch.mobile_number ? patch.mobile_number.replace(/\D/g, '').slice(-10) : '';
      if (cleanMobile && cleanMobile.length !== 10) {
        throw new BadRequestException({
          message: 'Phone number must be exactly 10 digits',
          code: 'INVALID_PHONE_NUMBER',
          details: null,
        });
      }
      if (cleanMobile !== user.mobile_number) {
        if (cleanMobile) {
          const mobileOwner = await this.users.findOne({
            where: { mobile_number: cleanMobile },
            select: ['id'],
          });
          if (mobileOwner && mobileOwner.id !== user.id) {
            throw new ConflictException({
              message: 'Mobile number already registered',
              code: 'MOBILE_TAKEN',
              details: null,
            });
          }
        }
        user.mobile_number = cleanMobile;
      }
    }
    user.updated_by = user.id;
    await this.users.save(user);
    const fullProfile = await this.getProfile(user.id);
    return fullProfile || this.toProfile(user);
  }

  async updatePassword(user: UserEntity, newPasswordHash: string): Promise<void> {
    user.password_hash = newPasswordHash;
    user.updated_by = user.id;
    await this.users.save(user);
  }
}
