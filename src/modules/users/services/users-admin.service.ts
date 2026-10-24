import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, IsNull, Repository } from 'typeorm';
import { CommonStatus } from '../../../common/enums/common-status.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { UserEntity } from '../entities/user.entity';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import {
  AssistanceRequestEntity,
  AssistanceRequestStatus,
} from '../../assistance/entities/assistance-request.entity';
import { ListUsersDto, UpdateUserDto, UpdateUserStatusDto } from '../dto/user-admin.dto';
import { UsersService, UserProfile } from './users.service';

@Injectable()
export class UsersAdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async listUsers(dto: ListUsersDto): Promise<{
    items: UserProfile[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.user_roles', 'user_role')
      .leftJoinAndSelect('user_role.role', 'role')
      .orderBy('user.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(user.full_name) LIKE :term')
            .orWhere('user.mobile_number LIKE :term')
            .orWhere('LOWER(user.email) LIKE :term');
        }),
      ).setParameter('term', term);
    }
    if (dto.status) {
      qb.andWhere('user.status = :status', { status: dto.status });
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((u) => this.usersService.toProfile(u)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getUser(id: string): Promise<UserProfile> {
    const profile = await this.usersService.getProfile(id);
    if (!profile) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
        details: null,
      });
    }
    return profile;
  }

  async updateUser(
    id: string,
    patch: UpdateUserDto,
    actingUserId: string,
  ): Promise<UserProfile> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
        details: null,
      });
    }
    // Account status is backend-authoritative — never patchable here.
    const updated = await this.usersService.updateProfile(user, {
      full_name: patch.full_name,
      email: patch.email,
      mobile_number: patch.mobile_number || patch.phone,
    });
    void actingUserId;
    return updated;
  }

  async updateUserStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actingUserId: string,
  ): Promise<UserProfile> {
    if (id === actingUserId) {
      throw new ForbiddenException({
        message: 'You cannot change your own account status',
        code: 'SELF_STATUS_CHANGE_FORBIDDEN',
        details: null,
      });
    }
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
        details: null,
      });
    }
    user.status = dto.status as CommonStatus;
    user.updated_by = actingUserId;
    const saved = await this.users.save(user);

    if (dto.status === CommonStatus.INACTIVE) {
      // 1. Revoke all active refresh tokens so existing sessions are terminated
      await this.dataSource.getRepository(RefreshTokenEntity).update(
        { user_id: id, revoked_at: IsNull() },
        { revoked_at: new Date() },
      );
      // 2. Sync associated membership status to SUSPENDED
      await this.dataSource.getRepository(MembershipEntity).update(
        { user_id: id, status: MembershipStatus.ACTIVE },
        { status: MembershipStatus.SUSPENDED, updated_by: actingUserId },
      );
    } else if (dto.status === CommonStatus.ACTIVE) {
      // Sync associated membership status back to ACTIVE
      await this.dataSource.getRepository(MembershipEntity).update(
        { user_id: id, status: MembershipStatus.SUSPENDED },
        { status: MembershipStatus.ACTIVE, updated_by: actingUserId },
      );
    }

    return this.usersService.toProfile(saved);
  }

  async approveSeeker(id: string, actingUserId: string): Promise<UserProfile> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'USER_NOT_FOUND',
        details: null,
      });
    }

    // 1. Upgrade user's role to DONATION_SEEKER in user_roles table
    await this.usersService.assignSeekerRole(id);

    // 2. Ensure user status is ACTIVE
    user.status = CommonStatus.ACTIVE;
    user.updated_by = actingUserId;
    await this.users.save(user);

    // 3. Mark any pending assistance requests for this user as APPROVED
    try {
      const assistanceRepo = this.dataSource.getRepository(AssistanceRequestEntity);
      const pendingRequests = await assistanceRepo.find({
        where: { user_id: id, status: AssistanceRequestStatus.PENDING },
      });
      for (const req of pendingRequests) {
        req.status = AssistanceRequestStatus.APPROVED;
        req.reviewed_by = actingUserId;
        req.reviewed_at = new Date();
        req.updated_by = actingUserId;
        await assistanceRepo.save(req);
      }
    } catch (aErr) {
      console.warn('Could not update assistance request status on seeker approval:', aErr);
    }

    const updatedProfile = await this.usersService.getProfile(id);
    return updatedProfile || this.usersService.toProfile(user);
  }
}
