import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipEntity } from '../entities/membership.entity';
import { MembershipCategoryEntity } from '../../membership-categories/entities/membership-category.entity';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import { UsersService } from '../../users/services/users.service';
import { CreateMembershipDto } from '../dto/create-membership.dto';
import { UpdateMembershipDto } from '../dto/update-membership.dto';
import { ListMembershipsDto } from '../dto/list-memberships.dto';
import { UpdateMembershipStatusDto } from '../dto/update-membership-status.dto';
import { CommonStatus } from '../../../common/enums/common-status.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { AuditService } from '../../audit/services/audit.service';
import { DocumentsService } from '../../documents/services/documents.service';
import { RelatedEntityType } from '../../documents/entities/document.entity';

import { RenewalRequestEntity } from '../../renewals/entities/renewal-request.entity';
import { NotificationsService } from '../../notifications/services/notifications.service';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(MembershipCategoryEntity)
    private readonly categories: Repository<MembershipCategoryEntity>,
    @InjectRepository(MembershipPaymentEntity)
    private readonly payments: Repository<MembershipPaymentEntity>,
    @InjectRepository(RenewalRequestEntity)
    private readonly renewals: Repository<RenewalRequestEntity>,
    private readonly audit: AuditService,
    private readonly documentsService: DocumentsService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
  ) {}

  async apply(
    dto: CreateMembershipDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<MembershipEntity> {
    const category = await this.categories.findOne({
      where: { id: dto.category_id },
    });

    if (!category) {
      throw new NotFoundException({
        message: 'Membership category not found',
        code: 'MEMBERSHIP_CATEGORY_NOT_FOUND',
        details: { category_id: dto.category_id },
      });
    }

    if (category.status !== CommonStatus.ACTIVE) {
      throw new BadRequestException({
        message: 'Cannot apply for an inactive membership category',
        code: 'INACTIVE_CATEGORY_SELECTION_BLOCKED',
        details: { category_id: dto.category_id, status: category.status },
      });
    }

    let targetUserId: string;

    if (dto.mobile_number) {
      // Validate mobile number and optional email for applicant
      const existingUser = await this.usersService.findByLoginIdentifier(dto.mobile_number);
      if (existingUser) {
        if (dto.email) {
          const emailUser = await this.usersService.findByLoginIdentifier(dto.email);
          if (emailUser && emailUser.id !== existingUser.id) {
            throw new ConflictException({
              message: 'Email is already registered by another account',
              code: 'EMAIL_TAKEN',
              details: { email: dto.email },
            });
          }
        }
        targetUserId = existingUser.id;
      } else {
        // Check email duplicate if email provided
        if (dto.email) {
          const emailUser = await this.usersService.findByLoginIdentifier(dto.email);
          if (emailUser) {
            throw new ConflictException({
              message: 'Email is already registered by another account',
              code: 'EMAIL_TAKEN',
              details: { email: dto.email },
            });
          }
        }

        // Create new user with default password '123456' and role 'MEMBER'
        const passwordHash = await bcrypt.hash('123456', 10);
        const newUser = await this.usersService.createUserWithRole({
          full_name: dto.full_name || 'Applicant',
          mobile_number: dto.mobile_number,
          email: dto.email ? dto.email.toLowerCase() : null,
          password_hash: passwordHash,
          roleName: 'MEMBER',
        });
        targetUserId = newUser.id;
      }
    } else {
      targetUserId = isAdmin && dto.user_id ? dto.user_id : actingUserId;
    }

    // Check if applicant already has an active, approved, or pending membership
    const existingActiveOrPending = await this.memberships.findOne({
      where: {
        user_id: targetUserId,
        status: In([
          MembershipStatus.PENDING,
          MembershipStatus.APPROVED,
          MembershipStatus.ACTIVE,
        ]),
      },
    });

    if (existingActiveOrPending) {
      throw new ConflictException({
        message: 'An active or pending membership application already exists for this applicant',
        code: 'DUPLICATE_MEMBERSHIP_APPLICATION',
        details: {
          existing_membership_id: existingActiveOrPending.id,
          status: existingActiveOrPending.status,
          user_id: targetUserId,
        },
      });
    }

    // Merge personal_details and application_data
    const appData = {
      ...(dto.application_data ?? {}),
      ...(dto.personal_details ? { personal_details: dto.personal_details } : {}),
      ...(dto.full_name ? { full_name: dto.full_name } : {}),
      ...(dto.mobile_number ? { mobile_number: dto.mobile_number } : {}),
      ...(dto.email ? { email: dto.email } : {}),
    };

    const membership = this.memberships.create({
      user_id: targetUserId,
      category_id: category.id,
      status: MembershipStatus.PENDING,
      application_data: Object.keys(appData).length > 0 ? appData : null,
      admin_notes: dto.admin_notes ?? null,
      created_by: actingUserId,
      updated_by: actingUserId,
    });

    const saved = await this.memberships.save(membership);

    await this.audit.record({
      event: 'membership.applied',
      actorId: actingUserId,
      entityType: 'memberships',
      entityId: saved.id,
      metadata: {
        userId: targetUserId,
        categoryId: category.id,
        categoryName: category.name,
        fee: category.fee,
      },
    });

    // Send real-time notification to applicant and administrators
    await this.notifications.sendToUser(
      targetUserId,
      'Membership Application Received',
      `Your application for ${category.name} has been received and is pending verification.`,
      actingUserId,
    );
    await this.notifications.sendToAdmins(
      'New Membership Application',
      `New membership application submitted by ${dto.full_name || 'Applicant'} (${dto.mobile_number || targetUserId}) for ${category.name}.`,
      actingUserId,
    );

    return saved;
  }

  async list(dto: ListMembershipsDto): Promise<{
    items: MembershipEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.memberships
      .createQueryBuilder('membership')
      .leftJoinAndSelect('membership.category', 'category')
      .leftJoinAndSelect('membership.user', 'user')
      .orderBy('membership.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.status) {
      qb.andWhere('membership.status = :status', { status: dto.status });
    }
    if (dto.category_id) {
      qb.andWhere('membership.category_id = :categoryId', {
        categoryId: dto.category_id,
      });
    }
    if (dto.user_id) {
      qb.andWhere('membership.user_id = :userId', { userId: dto.user_id });
    }

    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(membership.membership_number) LIKE :term')
            .orWhere('LOWER(user.full_name) LIKE :term')
            .orWhere('user.mobile_number LIKE :term')
            .orWhere('LOWER(user.email) LIKE :term');
        }),
      ).setParameter('term', term);
    }

    const [rawItems, total] = await qb.getManyAndCount();

    // Sanitize user entity password hash
    const items = rawItems.map((m) => {
      if (m.user) {
        delete (m.user as { password_hash?: string }).password_hash;
      }
      return m;
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getStats(
    search?: string,
    categoryId?: string,
  ): Promise<{
    total: number;
    active: number;
    expiringSoon: number;
    inactive: number;
    pending: number;
  }> {
    const applyFilters = (qb: any) => {
      qb.leftJoin('m.user', 'u');
      if (categoryId) {
        qb.andWhere('m.category_id = :categoryId', { categoryId });
      }
      if (search && search.trim()) {
        const term = `%${search.trim().toLowerCase()}%`;
        qb.andWhere(
          new Brackets((w) => {
            w.where('LOWER(m.membership_number) LIKE :term')
              .orWhere('LOWER(u.full_name) LIKE :term')
              .orWhere('u.mobile_number LIKE :term')
              .orWhere('LOWER(u.email) LIKE :term');
          }),
        ).setParameter('term', term);
      }
      return qb;
    };

    const totalQb = this.memberships.createQueryBuilder('m');
    applyFilters(totalQb);
    const total = await totalQb.getCount();

    const activeQb = this.memberships
      .createQueryBuilder('m')
      .where('m.status = :status', { status: MembershipStatus.ACTIVE });
    applyFilters(activeQb);
    const active = await activeQb.getCount();

    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const expiringSoonQb = this.memberships
      .createQueryBuilder('m')
      .where('m.status = :status', { status: MembershipStatus.ACTIVE })
      .andWhere('m.expiry_date >= :now', { now })
      .andWhere('m.expiry_date <= :in30Days', { in30Days });
    applyFilters(expiringSoonQb);
    const expiringSoon = await expiringSoonQb.getCount();

    const inactiveQb = this.memberships
      .createQueryBuilder('m')
      .where('m.status IN (:...statuses)', {
        statuses: [
          MembershipStatus.EXPIRED,
          MembershipStatus.CANCELLED,
          MembershipStatus.REJECTED,
        ],
      });
    applyFilters(inactiveQb);
    const inactive = await inactiveQb.getCount();

    const pendingQb = this.memberships
      .createQueryBuilder('m')
      .where('m.status = :status', { status: MembershipStatus.PENDING });
    applyFilters(pendingQb);
    const pending = await pendingQb.getCount();

    return {
      total,
      active,
      expiringSoon,
      inactive,
      pending,
    };
  }

  async getById(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<MembershipEntity> {
    const membership = await this.memberships.findOne({
      where: { id },
      relations: ['category', 'user'],
    });

    if (!membership) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'MEMBERSHIP_NOT_FOUND',
        details: { id },
      });
    }

    if (!isAdmin && membership.user_id !== actingUserId) {
      throw new ForbiddenException({
        message: 'You are not authorized to view this membership',
        code: 'MEMBERSHIP_ACCESS_DENIED',
        details: null,
      });
    }

    if (membership.user) {
      delete (membership.user as { password_hash?: string }).password_hash;
    }

    return membership;
  }

  async getMyMembership(userId: string): Promise<MembershipEntity | null> {
    const membership = await this.memberships.findOne({
      where: { user_id: userId },
      relations: ['category', 'user'],
      order: { created_at: 'DESC' },
    });

    if (membership && membership.user) {
      delete (membership.user as { password_hash?: string }).password_hash;
    }

    return membership;
  }

  async update(
    id: string,
    dto: UpdateMembershipDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<MembershipEntity> {
    const membership = await this.getById(id, actingUserId, isAdmin);

    if (!isAdmin && membership.status !== MembershipStatus.PENDING) {
      throw new BadRequestException({
        message: 'Only pending membership applications can be modified',
        code: 'APPLICATION_NOT_PENDING',
        details: { currentStatus: membership.status },
      });
    }

    if (dto.category_id && dto.category_id !== membership.category_id) {
      const category = await this.categories.findOne({
        where: { id: dto.category_id },
      });
      if (!category) {
        throw new NotFoundException({
          message: 'Membership category not found',
          code: 'MEMBERSHIP_CATEGORY_NOT_FOUND',
          details: { category_id: dto.category_id },
        });
      }
      if (category.status !== CommonStatus.ACTIVE) {
        throw new BadRequestException({
          message: 'Cannot switch to an inactive membership category',
          code: 'INACTIVE_CATEGORY_SELECTION_BLOCKED',
          details: { category_id: dto.category_id },
        });
      }
      membership.category_id = category.id;
    }

    if (dto.application_data !== undefined) {
      membership.application_data = dto.application_data;

      // Sync user profile fields if admin updated personal identity in application_data
      if (membership.user_id && typeof dto.application_data === 'object' && dto.application_data !== null) {
        try {
          const userRepo = this.memberships.manager.getRepository(UserEntity);
          const user = await userRepo.findOne({ where: { id: membership.user_id } });
          if (user) {
            const appData = dto.application_data as Record<string, any>;
            if (typeof appData.full_name === 'string' && appData.full_name.trim()) {
              user.full_name = appData.full_name.trim();
            }
            if (typeof appData.mobile_number === 'string' && appData.mobile_number.trim()) {
              user.mobile_number = appData.mobile_number.trim();
            }
            if (typeof appData.email === 'string') {
              user.email = appData.email.trim() || null;
            }
            await userRepo.save(user);
            membership.user = user;
          }
        } catch (err) {
          console.warn('Could not sync user details on membership update:', err);
        }
      }
    }
    if (dto.admin_notes !== undefined) {
      membership.admin_notes = dto.admin_notes;
    }

    membership.updated_by = actingUserId;
    const saved = await this.memberships.save(membership);

    await this.audit.record({
      event: 'membership.updated',
      actorId: actingUserId,
      entityType: 'memberships',
      entityId: saved.id,
      metadata: { changes: dto },
    });

    return saved;
  }

  async updateStatus(
    id: string,
    dto: UpdateMembershipStatusDto,
    actingUserId: string,
  ): Promise<MembershipEntity> {
    const membership = await this.memberships.findOne({
      where: { id },
      relations: ['category', 'user'],
    });

    if (!membership) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'MEMBERSHIP_NOT_FOUND',
        details: { id },
      });
    }

    membership.status = dto.status;
    membership.updated_by = actingUserId;

    if (dto.admin_notes !== undefined) {
      membership.admin_notes = dto.admin_notes;
    }

    if (dto.status === MembershipStatus.APPROVED || dto.status === MembershipStatus.ACTIVE) {
      const now = new Date();
      membership.approval_date = now;
      if (!membership.start_date) {
        membership.start_date = now;
      }
      const validityDays = membership.category?.validity_days || 365;
      if (!membership.expiry_date) {
        membership.expiry_date = new Date(
          now.getTime() + validityDays * 24 * 60 * 60 * 1000,
        );
      }
      if (!membership.membership_number) {
        membership.membership_number = await this.generateMemberNumber();
      }
      membership.rejection_reason = null;
    } else if (dto.status === MembershipStatus.REJECTED) {
      membership.rejection_reason = dto.rejection_reason ?? 'Application rejected by admin';
    }

    const saved = await this.memberships.save(membership);

    await this.audit.record({
      event: 'membership.status_updated',
      actorId: actingUserId,
      entityType: 'memberships',
      entityId: saved.id,
      metadata: {
        status: saved.status,
        membershipNumber: saved.membership_number,
        rejectionReason: saved.rejection_reason,
      },
    });

    // Real-time notification on status change
    if (saved.status === MembershipStatus.APPROVED || saved.status === MembershipStatus.ACTIVE) {
      await this.notifications.sendToUser(
        saved.user_id,
        'Membership Approved! 🎉',
        `Congratulations! Your membership #${saved.membership_number} has been approved and is now active.`,
        actingUserId,
      );
    } else if (saved.status === MembershipStatus.REJECTED) {
      await this.notifications.sendToUser(
        saved.user_id,
        'Membership Application Update',
        `Your membership application was not approved. Reason: ${saved.rejection_reason || 'Incomplete details'}.`,
        actingUserId,
      );
    }

    if (saved.user) {
      delete (saved.user as { password_hash?: string }).password_hash;
    }

    return saved;
  }

  async getDocuments(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{ membership_id: string; documents: unknown[] }> {
    await this.getById(id, actingUserId, isAdmin);
    const docs = await this.documentsService.findByRelatedEntity(
      RelatedEntityType.MEMBERSHIP,
      id,
    );
    return {
      membership_id: id,
      documents: docs,
    };
  }

  async getPaymentHistory(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{ membership_id: string; payments: unknown[] }> {
    await this.getById(id, actingUserId, isAdmin);
    const history = await this.payments.find({
      where: { membership_id: id },
      relations: ['receipt'],
      order: { created_at: 'DESC' },
    });
    return {
      membership_id: id,
      payments: history,
    };
  }

  async getDigitalId(membershipNumber: string): Promise<Record<string, unknown>> {
    const membership = await this.findByMembershipNumber(membershipNumber);
    return {
      membershipNumber: membership.membership_number,
      category: membership.category ? { id: membership.category.id, name: membership.category.name, code: membership.category.code } : null,
      status: membership.status,
      startDate: membership.start_date,
      expiryDate: membership.expiry_date,
      memberName: membership.user?.full_name || 'Member',
      mobileNumber: membership.user?.mobile_number,
      email: membership.user?.email,
      personalDetails: (membership.application_data as Record<string, unknown>)?.personal_details || null,
    };
  }

  async validateMembership(membershipNumber: string): Promise<Record<string, unknown>> {
    const membership = await this.findByMembershipNumber(membershipNumber);
    const valid = this.isCurrentlyValid(membership);
    return {
      valid,
      status: membership.status,
      category: membership.category?.name || 'Standard',
      expiryDate: membership.expiry_date,
      memberName: membership.user?.full_name || 'Member',
      checkedAt: new Date().toISOString(),
    };
  }

  async findByMembershipNumber(membershipNumber: string): Promise<MembershipEntity> {
    const membership = await this.memberships.findOne({
      where: { membership_number: membershipNumber },
      relations: ['category', 'user'],
    });
    if (!membership) {
      throw new NotFoundException({
        message: `Membership ${membershipNumber} not found`,
        code: 'MEMBERSHIP_NOT_FOUND',
        details: { membership_number: membershipNumber },
      });
    }
    return membership;
  }

  private isCurrentlyValid(membership: MembershipEntity): boolean {
    if (membership.status !== MembershipStatus.ACTIVE) {
      return false;
    }
    if (!membership.expiry_date) {
      return true; // Lifetime
    }
    return new Date(membership.expiry_date) >= new Date();
  }

  private async generateMemberNumber(): Promise<string> {
    try {
      const count = typeof this.memberships?.count === 'function' ? await this.memberships.count() : 0;
      const nextNum = count + 1;
      return `HRSJM-${String(nextNum).padStart(5, '0')}`;
    } catch {
      return 'HRSJM-00001';
    }
  }

  async getRenewalHistory(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{ membership_id: string; renewals: RenewalRequestEntity[] }> {
    await this.getById(id, actingUserId, isAdmin);
    const history = await this.renewals.find({
      where: { membership_id: id },
      order: { created_at: 'DESC' },
    });
    return {
      membership_id: id,
      renewals: history,
    };
  }
}
