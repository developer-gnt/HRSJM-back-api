import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { UserEntity } from '../../users/entities/user.entity';
import { RefreshTokenEntity } from '../../users/entities/refresh-token.entity';
import { PasswordResetTokenEntity } from '../../users/entities/password-reset-token.entity';
import { AdminResetPasswordDto } from '../dto/admin-reset-password.dto';
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
import { MailService } from '../../mail/mail.service';
import { resolveMembershipValidityDays } from '../utils/membership-validity.util';

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
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  async apply(
    dto: CreateMembershipDto,
    actingUserId?: string,
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

    if (actingUserId && !isAdmin) {
      targetUserId = actingUserId;
      if (dto.password && dto.password.trim().length >= 6) {
        const actingUser = await this.usersService.findById(actingUserId);
        if (actingUser) {
          const passwordHash = await bcrypt.hash(dto.password.trim(), 10);
          await this.usersService.updatePassword(actingUser, passwordHash);
        }
      }
    } else if (dto.mobile_number) {
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
        if (dto.password && dto.password.trim().length >= 6) {
          const passwordHash = await bcrypt.hash(dto.password.trim(), 10);
          await this.usersService.updatePassword(existingUser, passwordHash);
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

        // Create new user with provided password (or default '123456') and role 'MEMBER'
        const rawPassword = dto.password && dto.password.trim().length >= 6 ? dto.password.trim() : '123456';
        const passwordHash = await bcrypt.hash(rawPassword, 10);
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
      const resolved = isAdmin && dto.user_id ? dto.user_id : actingUserId;
      if (!resolved) {
        throw new BadRequestException({
          message: 'Applicant user identification or mobile number is required',
          code: 'APPLICANT_ID_REQUIRED',
        });
      }
      targetUserId = resolved;
    }

    // Check if applicant already has an active, approved, pending, or rejected membership
    const existingActiveOrPending = await this.memberships.findOne({
      where: {
        user_id: targetUserId,
        status: In([
          MembershipStatus.PENDING,
          MembershipStatus.UNDER_REVIEW,
          MembershipStatus.APPROVED,
          MembershipStatus.ACTIVE,
          MembershipStatus.REJECTED,
        ]),
      },
      order: { created_at: 'DESC' },
    });

    const policeStation =
      dto.police_station?.trim() ||
      (dto.personal_details as any)?.police_station?.trim() ||
      (dto.personal_details as any)?.nearby_police_station?.trim() ||
      (dto.application_data as any)?.police_station?.trim() ||
      (dto.application_data as any)?.nearby_police_station?.trim();

    const personalDetails = {
      ...(dto.personal_details ?? {}),
      ...(policeStation ? { police_station: policeStation } : {}),
    };

    // Merge personal_details and application_data
    const appData = {
      ...(dto.application_data ?? {}),
      ...(Object.keys(personalDetails).length > 0 ? { personal_details: personalDetails } : {}),
      ...(dto.full_name ? { full_name: dto.full_name } : {}),
      ...(dto.mobile_number ? { mobile_number: dto.mobile_number } : {}),
      ...(dto.email ? { email: dto.email } : {}),
      ...(policeStation ? { police_station: policeStation } : {}),
    };

    if (existingActiveOrPending) {
      if (!isAdmin) {
        if (
          existingActiveOrPending.status === MembershipStatus.ACTIVE ||
          existingActiveOrPending.status === MembershipStatus.APPROVED
        ) {
          throw new ConflictException({
            message: `An active membership already exists for this mobile number or email (${existingActiveOrPending.membership_number || 'ACTIVE'}). Please renew or manage your existing membership.`,
            code: 'ACTIVE_MEMBERSHIP_EXISTS',
            details: {
              membership_id: existingActiveOrPending.id,
              membership_number: existingActiveOrPending.membership_number,
              status: existingActiveOrPending.status,
            },
          });
        }
        if (
          existingActiveOrPending.status === MembershipStatus.PENDING ||
          existingActiveOrPending.status === MembershipStatus.UNDER_REVIEW
        ) {
          const isSameApplicant = actingUserId && existingActiveOrPending.user_id === actingUserId;
          if (!isSameApplicant) {
            throw new ConflictException({
              message: `A membership application is already submitted and currently under review for this mobile number / email (${existingActiveOrPending.membership_number || 'PENDING'}).`,
              code: 'PENDING_APPLICATION_EXISTS',
              details: {
                membership_id: existingActiveOrPending.id,
                membership_number: existingActiveOrPending.membership_number,
                status: existingActiveOrPending.status,
              },
            });
          }
        }
      }

      existingActiveOrPending.application_data = Object.keys(appData).length > 0 ? appData : null;
      existingActiveOrPending.category_id = category.id;
      existingActiveOrPending.status = MembershipStatus.PENDING;
      existingActiveOrPending.applied_at = new Date();
      existingActiveOrPending.created_at = new Date();
      existingActiveOrPending.updated_at = new Date();
      existingActiveOrPending.approval_date = null;
      existingActiveOrPending.rejection_reason = null;
      existingActiveOrPending.updated_by = actingUserId || targetUserId;
      const saved = await this.memberships.save(existingActiveOrPending);
      this.dispatchMembershipApplicationEmail(saved, category, dto, appData);
      return saved;
    }

    const membership = this.memberships.create({
      user_id: targetUserId,
      category_id: category.id,
      status: MembershipStatus.PENDING,
      application_data: Object.keys(appData).length > 0 ? appData : null,
      admin_notes: dto.admin_notes ?? null,
      created_by: actingUserId || targetUserId,
      updated_by: actingUserId || targetUserId,
    });

    const saved = await this.memberships.save(membership);

    await this.audit.record({
      event: 'membership.applied',
      actorId: actingUserId || targetUserId,
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
      actingUserId || targetUserId,
    );
    await this.notifications.sendToAdmins(
      'New Membership Application',
      `New membership application submitted by ${dto.full_name || 'Applicant'} (${dto.mobile_number || targetUserId}) for ${category.name}.`,
      actingUserId || targetUserId,
    );

    // Send confirmation email with payment and reference details
    this.dispatchMembershipApplicationEmail(saved, category, dto, appData);

    return saved;
  }

  private dispatchMembershipApplicationEmail(
    membership: MembershipEntity,
    category: MembershipCategoryEntity,
    dto: CreateMembershipDto,
    appData: Record<string, unknown>,
  ) {
    const appRef =
      membership.membership_number || `HRSJM-APP-${membership.id.slice(0, 8).toUpperCase()}`;
    const applicantEmail = dto.email || (appData.email as string);

    if (applicantEmail && applicantEmail.includes('@')) {
      const feeAmount = category.fee
        ? Number(category.fee)
        : appData.package_fee
          ? Number(String(appData.package_fee).replace(/[^0-9.]/g, ''))
          : 0;

      this.mailService
        .sendMembershipPaymentSuccessEmail({
          applicantName: dto.full_name || (appData.full_name as string) || 'Applicant',
          applicantEmail,
          applicantPhone: dto.mobile_number || (appData.mobile_number as string),
          applicationRef: appRef,
          categoryName: category.name || (appData.package_name as string) || 'Membership',
          amount: feeAmount,
          transactionId:
            (appData.payment_order_id as string) ||
            (appData.payment_reference as string) ||
            (appData.gateway_payment_id as string),
          paymentOrderRef:
            (appData.payment_order_id as string) || (appData.payment_reference as string),
          paymentMethod:
            (appData.payment_mode as string) || 'Online (Cashfree Payment Gateway)',
          paymentDate: new Date(),
          status: membership.status,
        })
        .catch((mailErr) => {
          console.error(
            `[MembershipsService] Failed to dispatch membership payment success email: ${mailErr.message}`,
          );
        });
    }
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
      .where('m.status IN (:...statuses)', {
        statuses: [MembershipStatus.PENDING, MembershipStatus.UNDER_REVIEW],
      });
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
      const appData = (membership.application_data || {}) as Record<string, any>;
      const validityInfo = resolveMembershipValidityDays(
        membership.category?.name,
        appData.membership_type,
        appData.validity,
        membership.category?.validity_days || 365,
      );
      if (!membership.expiry_date) {
        membership.expiry_date = new Date(
          membership.start_date.getTime() + validityInfo.validityDays * 24 * 60 * 60 * 1000,
        );
      }
      if (!membership.membership_number) {
        membership.membership_number = await this.generateMemberNumber();
      }
      membership.rejection_reason = null;

      // Reactivate user in users table if previously deactivated
      if (membership.user_id) {
        try {
          await this.dataSource.getRepository(UserEntity).update(
            { id: membership.user_id },
            { status: CommonStatus.ACTIVE, updated_by: actingUserId },
          );
        } catch (uErr) {
          console.warn('Could not reactivate user status:', uErr);
        }
      }

      // Convert applicant to appropriate role (MEMBER or DONATION_SEEKER)
      if (membership.user_id) {
        try {
          const isSeekerApp =
            membership.membership_number?.startsWith('HRSJM-SEK') ||
            (membership.application_data as any)?.type === 'DONATION_SEEKER' ||
            (membership.application_data as any)?.membership_type === 'Donation Seeker';

          if (isSeekerApp) {
            await this.usersService.assignSeekerRole(membership.user_id);
          } else {
            await this.usersService.assignMemberRole(membership.user_id);
          }
        } catch (roleErr) {
          console.warn('Could not assign role to applicant:', roleErr);
        }
      }
    } else if (
      dto.status === MembershipStatus.SUSPENDED ||
      dto.status === MembershipStatus.CANCELLED
    ) {
      // Deactivate user in users table and revoke all active refresh tokens so they cannot login
      if (membership.user_id) {
        try {
          await this.dataSource.getRepository(UserEntity).update(
            { id: membership.user_id },
            { status: CommonStatus.INACTIVE, updated_by: actingUserId },
          );
          await this.dataSource.getRepository(RefreshTokenEntity).update(
            { user_id: membership.user_id, revoked_at: IsNull() },
            { revoked_at: new Date() },
          );
        } catch (uErr) {
          console.warn('Could not suspend user account in database:', uErr);
        }
      }
    } else if (dto.status === MembershipStatus.REJECTED) {
      membership.rejection_reason = dto.rejection_reason ?? 'Application rejected by admin';
      // Deactivate user in users table and revoke active refresh tokens so applicant cannot login
      if (membership.user_id) {
        try {
          await this.dataSource.getRepository(UserEntity).update(
            { id: membership.user_id },
            { status: CommonStatus.INACTIVE, updated_by: actingUserId },
          );
          await this.dataSource.getRepository(RefreshTokenEntity).update(
            { user_id: membership.user_id, revoked_at: IsNull() },
            { revoked_at: new Date() },
          );
        } catch (uErr) {
          console.warn('Could not deactivate rejected user account:', uErr);
        }
      }
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
    } else if (saved.status === MembershipStatus.UNDER_REVIEW) {
      await this.notifications.sendToUser(
        saved.user_id,
        'Application Under Review ⏳',
        'Your membership application is currently under review by our administration team.',
        actingUserId,
      );
    } else if (saved.status === MembershipStatus.SUSPENDED) {
      await this.notifications.sendToUser(
        saved.user_id,
        'Account Suspended',
        'Your membership account has been suspended by an administrator. Please contact the HRSJM office.',
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

    // Dispatch official email notification on status change (Approved, Rejected, Under Review)
    try {
      const appData = (saved.application_data || {}) as Record<string, any>;
      const recipientEmail = saved.user?.email || appData.email;
      const recipientName = saved.user?.full_name || appData.full_name || 'Member';

      if (recipientEmail && recipientEmail.includes('@')) {
        this.mailService
          .sendMembershipStatusUpdateEmail({
            memberName: recipientName,
            memberEmail: recipientEmail,
            membershipNumber: saved.membership_number || `APP-${saved.id.slice(0, 8).toUpperCase()}`,
            categoryName: saved.category?.name || appData.package_name,
            status: saved.status as any,
            validFrom: saved.start_date || undefined,
            validUntil: saved.expiry_date || undefined,
            rejectionReason: saved.rejection_reason || undefined,
            notes: saved.admin_notes || undefined,
          })
          .catch((mailErr) => {
            console.error(`[MembershipsService] Failed to send status update email: ${mailErr.message}`);
          });
      }
    } catch (mailErr) {
      console.warn('Error initiating membership status update email:', mailErr);
    }

    if (saved.user) {
      delete (saved.user as { password_hash?: string }).password_hash;
    }

    return saved;
  }

  async adminResetPassword(
    id: string,
    dto: AdminResetPasswordDto,
    actingUserId: string,
  ): Promise<{ success: boolean; message: string; reset_token?: string; user_id: string; member_name: string }> {
    const membership = await this.memberships.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!membership || !membership.user) {
      throw new NotFoundException({
        message: 'Membership or linked user account not found',
        code: 'MEMBER_NOT_FOUND',
        details: { id },
      });
    }

    const user = membership.user;

    if (dto?.new_password) {
      const password_hash = await bcrypt.hash(dto.new_password, 10);
      await this.dataSource.getRepository(UserEntity).update(
        { id: user.id },
        { password_hash, updated_by: actingUserId },
      );

      // Invalidate existing sessions
      await this.dataSource.getRepository(RefreshTokenEntity).update(
        { user_id: user.id, revoked_at: IsNull() },
        { revoked_at: new Date() },
      );

      await this.audit.record({
        event: 'membership.password_reset_by_admin',
        actorId: actingUserId,
        entityType: 'memberships',
        entityId: membership.id,
        metadata: {
          user_id: user.id,
          method: 'direct_password_set',
          membershipNumber: membership.membership_number,
        },
      });

      await this.notifications.sendToUser(
        user.id,
        'Password Updated',
        'Your account password was updated by an administrator. Please log in with your new password.',
        actingUserId,
      );

      if (user.email && user.email.includes('@')) {
        this.mailService
          .sendAdminPasswordResetEmail({
            recipientName: user.full_name || 'Member',
            recipientEmail: user.email,
            temporaryPassword: dto.new_password,
            resetDate: new Date(),
          })
          .catch((mailErr) => {
            console.error(`[MembershipsService] Failed to send temporary password email: ${mailErr.message}`);
          });
      }

      return {
        success: true,
        message: `Password has been reset successfully in the database for ${user.full_name || 'member'}.`,
        user_id: user.id,
        member_name: user.full_name || 'Member',
      };
    }

    // Generate secure password reset token in database
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    await this.dataSource.getRepository(PasswordResetTokenEntity).insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    });

    await this.audit.record({
      event: 'membership.password_reset_requested_by_admin',
      actorId: actingUserId,
      entityType: 'memberships',
      entityId: membership.id,
      metadata: {
        user_id: user.id,
        method: 'reset_token',
        membershipNumber: membership.membership_number,
      },
    });

    await this.notifications.sendToUser(
      user.id,
      'Password Reset Initiated',
      'A secure password reset request was initiated by an administrator.',
      actingUserId,
    );

    return {
      success: true,
      message: `Password reset token generated and saved in database for ${user.full_name || 'member'}.`,
      reset_token: rawToken,
      user_id: user.id,
      member_name: user.full_name || 'Member',
    };
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

  async checkDuplicate(email?: string, phone?: string): Promise<{
    isDuplicate: boolean;
    field?: 'email' | 'phone' | 'both';
    message?: string;
    existingStatus?: string;
    membershipNumber?: string;
  }> {
    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : '';
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    let userByPhone: UserEntity | null = null;
    let userByEmail: UserEntity | null = null;

    if (cleanPhone && cleanPhone.length === 10) {
      userByPhone = await this.usersService.findByLoginIdentifier(cleanPhone);
    }
    if (cleanEmail && cleanEmail.includes('@')) {
      userByEmail = await this.usersService.findByLoginIdentifier(cleanEmail);
    }

    const targetUserIds = new Set<string>();
    if (userByPhone) targetUserIds.add(userByPhone.id);
    if (userByEmail) targetUserIds.add(userByEmail.id);

    if (targetUserIds.size > 0) {
      const activeOrPending = await this.memberships.findOne({
        where: {
          user_id: In([...targetUserIds]),
          status: In([
            MembershipStatus.PENDING,
            MembershipStatus.UNDER_REVIEW,
            MembershipStatus.APPROVED,
            MembershipStatus.ACTIVE,
          ]),
        },
        order: { created_at: 'DESC' },
      });

      if (activeOrPending) {
        const isBoth = Boolean(userByPhone && userByEmail && userByPhone.id === userByEmail.id);
        const field = isBoth ? 'both' : (userByPhone ? 'phone' : 'email');
        const isApproved =
          activeOrPending.status === MembershipStatus.ACTIVE ||
          activeOrPending.status === MembershipStatus.APPROVED;
        const msg = isApproved
          ? `An active membership already exists with this ${field === 'both' ? 'mobile number and email' : (field === 'phone' ? 'mobile number' : 'email')} (Membership No: ${activeOrPending.membership_number || 'Active'}).`
          : `A membership application with this ${field === 'both' ? 'mobile number and email' : (field === 'phone' ? 'mobile number' : 'email')} has already been submitted and is currently pending review (${activeOrPending.membership_number || 'Under Review'}).`;

        return {
          isDuplicate: true,
          field,
          message: msg,
          existingStatus: activeOrPending.status,
          membershipNumber: activeOrPending.membership_number || undefined,
        };
      }

      if (userByPhone && userByEmail && userByPhone.id !== userByEmail.id) {
        return {
          isDuplicate: true,
          field: 'email',
          message: 'This email is already registered to another account. Please use your own email address.',
        };
      }

      // Check if user account already exists with phone or email
      if (userByPhone || userByEmail) {
        const isBoth = Boolean(userByPhone && userByEmail);
        const field = isBoth ? 'both' : (userByPhone ? 'phone' : 'email');
        return {
          isDuplicate: true,
          field,
          message: `An account is already registered with this ${field === 'both' ? 'mobile number and email' : (field === 'phone' ? 'mobile number' : 'email')}.`,
        };
      }
    }

    return { isDuplicate: false };
  }
}
