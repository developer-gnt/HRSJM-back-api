import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
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
        const year = now.getFullYear();
        const rand = Math.floor(10000 + Math.random() * 90000);
        membership.membership_number = `HRSJM-MEM-${year}-${rand}`;
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
