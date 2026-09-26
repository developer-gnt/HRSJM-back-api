import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { RoleEntity } from '../../roles/entities/role.entity';

export interface UserProfile {
  id: string;
  full_name: string;
  mobile_number: string;
  email: string | null;
  status: string;
  roles: string[];
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
    return this.users.findOne({ where: { id } });
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
      status: user.status,
      roles: (user.user_roles ?? [])
        .map((userRole) => userRole.role?.name)
        .filter((name): name is string => Boolean(name)),
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  async createUserWithRole(input: {
    full_name: string;
    mobile_number: string;
    email: string | null;
    password_hash: string;
    roleName?: string;
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

      const role = await manager
        .getRepository(RoleEntity)
        .findOne({ where: { name: input.roleName ?? 'MEMBER' } });
      if (!role) {
        throw new InternalServerErrorException({
          message: 'Baseline role is missing',
          code: 'ROLE_NOT_FOUND',
          details: null,
        });
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
    patch: { full_name?: string; email?: string },
  ): Promise<UserProfile> {
    if (patch.full_name !== undefined) user.full_name = patch.full_name;
    if (patch.email !== undefined && patch.email !== user.email) {
      const emailOwner = await this.users.findOne({
        where: { email: patch.email.toLowerCase() },
        select: ['id'],
      });
      if (emailOwner && emailOwner.id !== user.id) {
        throw new ConflictException({
          message: 'Email already registered',
          code: 'EMAIL_TAKEN',
          details: null,
        });
      }
      user.email = patch.email.toLowerCase();
    }
    user.updated_by = user.id;
    const saved = await this.users.save(user);
    return this.toProfile(saved);
  }
}
