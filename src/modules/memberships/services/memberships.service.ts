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
import { KitFulfillmentDto } from '../dto/kit-fulfillment.dto';
import { ListMembershipsDto } from '../dto/list-memberships.dto';
import { UpdateMembershipStatusDto } from '../dto/update-membership-status.dto';
import { CommonStatus } from '../../../common/enums/common-status.enum';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { AuditService } from '../../audit/services/audit.service';
import { DocumentsService } from '../../documents/services/documents.service';
import { DocumentType, RelatedEntityType } from '../../documents/entities/document.entity';

import {
  RenewalPaymentStatus,
  RenewalRequestEntity,
  RenewalStatus,
} from '../../renewals/entities/renewal-request.entity';
import { MembershipReferralEntity, ReferralStatus } from '../entities/membership-referral.entity';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { addYearsSafe } from '../../renewals/services/renewal-calculation.service';
import { getReferralRewardYears, OFFICIAL_REFERRAL_TIERS } from '../utils/referral-reward.util';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { MailService } from '../../mail/mail.service';
import { validateAgeEligibility } from '../../../common/utils/age.util';
import { resolveMembershipValidityDays } from '../utils/membership-validity.util';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(MembershipReferralEntity)
    private readonly referralsRepo: Repository<MembershipReferralEntity>,
    @InjectRepository(MembershipCategoryEntity)
    private readonly categories: Repository<MembershipCategoryEntity>,
    @InjectRepository(MembershipPaymentEntity)
    private readonly payments: Repository<MembershipPaymentEntity>,
    @InjectRepository(RenewalRequestEntity)
    private readonly renewals: Repository<RenewalRequestEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receiptsRepo: Repository<ReceiptEntity>,
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

    // 18+ Age Eligibility Enforcement for Members
    let rawDob =
      (dto.personal_details as any)?.dob ||
      (dto.personal_details as any)?.dateOfBirth ||
      (dto.personal_details as any)?.date_of_birth ||
      (dto as any).dob ||
      (dto as any).date_of_birth;

    if (!rawDob && actingUserId) {
      try {
        const actingUser = await this.usersService.findById(actingUserId);
        rawDob = actingUser?.dob;
      } catch {}
    }
    const ageCheck = validateAgeEligibility(rawDob);
    if (!ageCheck.isValid) {
      throw new BadRequestException({
        message: ageCheck.error || 'Date of birth is required for membership registration',
        code: ageCheck.errorCode || 'INVALID_DOB',
        details: null,
      });
    }
    if (!ageCheck.isEligible) {
      throw new BadRequestException({
        message: 'You must be at least 18 years old to register with HRSJM',
        code: 'AGE_NOT_ELIGIBLE',
        details: {
          minimum_age: 18,
          calculated_age: ageCheck.age,
        },
      });
    }

    const inputPersonal = (dto.personal_details as any) || {};
    const inputAppData = (dto.application_data as any) || {};
    const isPaidInitial = inputAppData.payment_status === 'SUCCESS' || inputAppData.payment_completed === true;
    let shouldBeActive = Boolean(isAdmin && isPaidInitial);
    const rawDocs = (inputAppData.documents as any[]) || [];
    const photoDoc = Array.isArray(rawDocs)
      ? rawDocs.find((d: any) =>
          ['photograph', 'photo', 'profile'].some((k) =>
            (d.type || d.title || d.fileName || d.name || '').toLowerCase().includes(k),
          ),
        )
      : undefined;

    const resolvedAvatar =
      dto.avatar ||
      inputPersonal.avatar ||
      inputPersonal.avatar_url ||
      inputPersonal.profilePhotoUri ||
      inputPersonal.profile_photo_uri ||
      inputAppData.avatar ||
      inputAppData.avatar_url ||
      photoDoc?.uri ||
      photoDoc?.url ||
      null;

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
      if (resolvedAvatar) {
        await this.dataSource.getRepository(UserEntity).update(actingUserId, { avatar: resolvedAvatar });
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
        if (resolvedAvatar) {
          await this.dataSource.getRepository(UserEntity).update(existingUser.id, { avatar: resolvedAvatar });
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
          roleName: shouldBeActive ? 'MEMBER' : 'USER',
          dob: rawDob,
          gender: inputPersonal.gender ?? null,
          avatar: resolvedAvatar,
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
    const extraData = appData as Record<string, any>;

    // Validate optional referral code from introducing member
    let referrerMembership: MembershipEntity | null = null;
    let cleanedReferralCode: string | null = null;
    const rawRefCode = dto.referral_code || (appData as any).referral_code;

    if (rawRefCode) {
      cleanedReferralCode = String(rawRefCode).trim().toUpperCase();
      referrerMembership = await this.memberships.findOne({
        where: [
          { referral_code: cleanedReferralCode },
          { membership_number: cleanedReferralCode },
        ],
        relations: ['user', 'category'],
      });

      if (!referrerMembership) {
        throw new BadRequestException({
          message: `Referral code "${rawRefCode}" is invalid or does not exist.`,
          code: 'INVALID_REFERRAL_CODE',
          details: { referral_code: rawRefCode },
        });
      }

      if (referrerMembership.user_id === targetUserId) {
        throw new BadRequestException({
          message: 'You cannot use your own referral code.',
          code: 'SELF_REFERRAL_NOT_ALLOWED',
        });
      }

      const activeStatuses: MembershipStatus[] = [MembershipStatus.ACTIVE, MembershipStatus.APPROVED];
      if (!activeStatuses.includes(referrerMembership.status)) {
        throw new BadRequestException({
          message: 'The referring member is not currently active or approved.',
          code: 'REFERRER_NOT_ACTIVE',
          details: { status: referrerMembership.status },
        });
      }
    }

    if (existingActiveOrPending) {
      if (!isAdmin) {
        if (
          existingActiveOrPending.status === MembershipStatus.ACTIVE ||
          existingActiveOrPending.status === MembershipStatus.APPROVED
        ) {
          throw new ConflictException({
            message: 'An active membership already exists for this mobile number or email. Please renew or manage your existing membership.',
            code: 'ACTIVE_MEMBERSHIP_EXISTS',
            details: {
              membership_id: existingActiveOrPending.id,
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
              message: 'A membership application is already submitted and currently under review for this mobile number or email.',
              code: 'PENDING_APPLICATION_EXISTS',
              details: {
                membership_id: existingActiveOrPending.id,
                status: existingActiveOrPending.status,
              },
            });
          }
        }
      }

      const isPaid = extraData.payment_status === 'SUCCESS' || extraData.payment_completed === true;
      // shouldBeActive resolved above

      existingActiveOrPending.application_data = Object.keys(appData).length > 0 ? appData : null;
      existingActiveOrPending.category_id = category.id;
      existingActiveOrPending.status = shouldBeActive ? MembershipStatus.ACTIVE : MembershipStatus.PENDING;
      existingActiveOrPending.applied_at = new Date();
      existingActiveOrPending.created_at = new Date();
      existingActiveOrPending.updated_at = new Date();
      if (!existingActiveOrPending.membership_number) {
        existingActiveOrPending.membership_number = await this.generateMemberNumber();
      }
      if (appData) {
        (appData as any).application_id = existingActiveOrPending.membership_number;
        (appData as any).membership_number = existingActiveOrPending.membership_number;
        existingActiveOrPending.application_data = appData;
      }
      if (shouldBeActive) {
        existingActiveOrPending.start_date = new Date();
        existingActiveOrPending.approval_date = new Date();
        const validityDays = category.validity_days || 365;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + validityDays);
        existingActiveOrPending.expiry_date = expiry;
        try {
          await this.usersService.assignMemberRole(targetUserId);
        } catch {}
      } else {
        existingActiveOrPending.approval_date = null;
      }
      if (referrerMembership && !existingActiveOrPending.referred_by_id) {
        existingActiveOrPending.referred_by_id = referrerMembership.id;
        existingActiveOrPending.referred_by_code = referrerMembership.referral_code || cleanedReferralCode;
      }
      if (shouldBeActive && !existingActiveOrPending.referral_code) {
        existingActiveOrPending.referral_code = await this.generateUniqueReferralCode();
      }
      existingActiveOrPending.rejection_reason = null;
      existingActiveOrPending.updated_by = actingUserId || targetUserId;
      const saved = await this.memberships.save(existingActiveOrPending);

      if (referrerMembership) {
        try {
          const rewardInfo = getReferralRewardYears(category.name, category.code);
          const referral = this.referralsRepo.create({
            referrer_membership_id: referrerMembership.id,
            referrer_user_id: referrerMembership.user_id,
            referred_membership_id: saved.id,
            referral_code: referrerMembership.referral_code || cleanedReferralCode!,
            category_name: category.name,
            reward_years: rewardInfo.rewardYears,
            status: shouldBeActive ? ReferralStatus.APPROVED : ReferralStatus.PENDING,
            free_renewal_applied: false,
          });
          await this.referralsRepo.save(referral);

          if (shouldBeActive) {
            await this.applyFreeRenewalForReferral(saved, actingUserId || targetUserId);
          }
        } catch (rErr) {
          console.warn('[MembershipsService] Could not process referral tracking on existing application:', rErr);
        }
      }

      this.dispatchMembershipApplicationEmail(saved, category, dto, appData);
      return saved;
    }

    // reuse extraData from above
    const isPaid = extraData.payment_status === 'SUCCESS' || extraData.payment_completed === true;
    shouldBeActive = Boolean(isAdmin && isPaid);
    let initialStatus = shouldBeActive ? MembershipStatus.ACTIVE : MembershipStatus.PENDING;
    let initialNumber: string = await this.generateMemberNumber();
    let initialStartDate: Date | null = null;
    let initialExpiryDate: Date | null = null;
    let initialApprovalDate: Date | null = null;

    if (appData) {
      (appData as any).application_id = initialNumber;
      (appData as any).membership_number = initialNumber;
    }

    if (shouldBeActive) {
      initialStartDate = new Date();
      initialApprovalDate = new Date();
      const validityDays = category.validity_days || 365;
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + validityDays);
      initialExpiryDate = expiry;
    }

    const membership = this.memberships.create({
      user_id: targetUserId,
      category_id: category.id,
      status: initialStatus,
      membership_number: initialNumber,
      referral_code: shouldBeActive ? await this.generateUniqueReferralCode() : null,
      referred_by_id: referrerMembership ? referrerMembership.id : null,
      referred_by_code: referrerMembership ? (referrerMembership.referral_code || cleanedReferralCode) : null,
      start_date: initialStartDate,
      expiry_date: initialExpiryDate,
      approval_date: initialApprovalDate,
      application_data: Object.keys(appData).length > 0 ? appData : null,
      admin_notes: dto.admin_notes ?? null,
      created_by: actingUserId || targetUserId,
      updated_by: actingUserId || targetUserId,
    });

    const saved = await this.memberships.save(membership);

    // Save all application documents and avatar into the dedicated application folder
    const userNumber = 'USER' + (targetUserId.replace(/\D/g, '').slice(-4) || targetUserId.slice(0, 8).toUpperCase());
    const appNumber = saved.membership_number || initialNumber;

    const avatarCandidate = dto.avatar || (dto.personal_details as any)?.avatar;
    if (avatarCandidate && typeof avatarCandidate === 'string' && avatarCandidate.startsWith('data:')) {
      try {
        const savedAvatar = await this.documentsService.saveDocumentToApplicationFolder({
          userId: targetUserId,
          applicationNumber: appNumber,
          userNumber,
          documentName: 'Applicant Photograph (Profile Photo)',
          documentType: DocumentType.MEMBERSHIP_DOCUMENT,
          relatedEntityType: RelatedEntityType.MEMBERSHIP,
          relatedEntityId: saved.id,
          fileName: 'applicant_photograph.jpg',
          dataUriOrBuffer: avatarCandidate,
          actingUserId: actingUserId || targetUserId,
        });
        if (savedAvatar) {
          if (saved.application_data) { (saved.application_data as any).avatar = `/${savedAvatar.storage_path.replace(/\\/g, '/')}`; }
        }
      } catch (avErr: any) {
        console.warn(`[MembershipsService] Could not save avatar file: ${avErr?.message}`);
      }
    }

    if (Array.isArray((appData as any)?.documents)) {
      for (const doc of (appData as any).documents) {
        const docUri = doc.uri || doc.fileUri;
        if (docUri && typeof docUri === 'string' && docUri.startsWith('data:')) {
          try {
            const savedDoc = await this.documentsService.saveDocumentToApplicationFolder({
              userId: targetUserId,
              applicationNumber: appNumber,
              userNumber,
              documentName: doc.title || doc.name || 'Membership Document',
              documentType: DocumentType.MEMBERSHIP_DOCUMENT,
              relatedEntityType: RelatedEntityType.MEMBERSHIP,
              relatedEntityId: saved.id,
              fileName: doc.fileName || `${doc.id || 'doc'}.jpg`,
              dataUriOrBuffer: docUri,
              actingUserId: actingUserId || targetUserId,
            });
            if (savedDoc) {
              doc.uri = `/${savedDoc.storage_path.replace(/\\/g, '/')}`;
              doc.storage_path = savedDoc.storage_path;
            }
          } catch (docErr: any) {
            console.warn(`[MembershipsService] Could not save document ${doc.title}: ${docErr?.message}`);
          }
        }
      }
      saved.application_data = appData;
      await this.memberships.save(saved);
    }

    if (shouldBeActive) {
      try {
        await this.usersService.assignMemberRole(targetUserId);
      } catch (err: any) {
        console.warn(`[MembershipsService] Could not assign member role: ${err?.message}`);
      }
    }

    // Record initial membership payment if category has fee
    const feeAmount = category.fee
      ? Number(category.fee)
      : extraData.package_fee
        ? Number(String(extraData.package_fee).replace(/[^0-9.]/g, ''))
        : 0;

    if (feeAmount > 0) {
      try {
        const existingPayment = await this.payments.findOne({
          where: { membership_id: saved.id },
        });
        if (!existingPayment) {
          const newPayment = this.payments.create({
            membership_id: saved.id,
            user_id: targetUserId,
            amount: feeAmount,
            payment_method: (extraData.payment_mode as string) || 'ONLINE',
            payment_status: 'SUCCESS',
            gateway_payment_id:
              (extraData.payment_order_id as string) ||
              (extraData.payment_reference as string) ||
              (extraData.gateway_payment_id as string) ||
              `PAY-${Date.now()}`,
            payment_date: new Date(),
            created_by: actingUserId || targetUserId,
            updated_by: actingUserId || targetUserId,
          });
          await this.payments.save(newPayment);
        }
      } catch (payErr: any) {
        console.warn(`[MembershipsService] Could not persist payment record: ${payErr?.message}`);
      }
    }

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

    // Record referral link and reward tracking
    if (referrerMembership) {
      try {
        const rewardInfo = getReferralRewardYears(category.name, category.code);
        const referral = this.referralsRepo.create({
          referrer_membership_id: referrerMembership.id,
          referrer_user_id: referrerMembership.user_id,
          referred_membership_id: saved.id,
          referral_code: referrerMembership.referral_code || cleanedReferralCode!,
          category_name: category.name,
          reward_years: rewardInfo.rewardYears,
          status: shouldBeActive ? ReferralStatus.APPROVED : ReferralStatus.PENDING,
          free_renewal_applied: false,
        });
        await this.referralsRepo.save(referral);

        if (shouldBeActive) {
          await this.applyFreeRenewalForReferral(saved, actingUserId || targetUserId);
        } else {
          await this.notifications.sendToUser(
            referrerMembership.user_id,
            'New Referral Registered! 🤝',
            `${dto.full_name || 'A new applicant'} has applied for ${category.name} using your referral code (${referral.referral_code}). Your free renewal (${rewardInfo.rewardYears} year(s)) will be activated once their application is approved!`,
            actingUserId || targetUserId,
          );
        }
      } catch (refErr) {
        console.warn('[MembershipsService] Could not process referral tracking:', refErr);
      }
    }

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
    const extraData = appData as Record<string, any>;
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
            (extraData.payment_order_id as string) ||
            (extraData.payment_reference as string) ||
            (extraData.gateway_payment_id as string),
          paymentOrderRef:
            (extraData.payment_order_id as string) || (extraData.payment_reference as string),
          paymentMethod:
            (extraData.payment_mode as string) || 'Online (Cashfree Payment Gateway)',
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
      if (dto.status === 'ACTIVE') {
        qb.andWhere(
          '(membership.status IN (:...activeStatuses) OR (user.status = :userActiveStatus AND membership.status NOT IN (:...excludeStatuses)))',
          {
            activeStatuses: [MembershipStatus.ACTIVE, MembershipStatus.APPROVED],
            userActiveStatus: 'ACTIVE',
            excludeStatuses: [
              MembershipStatus.EXPIRED,
              MembershipStatus.CANCELLED,
              MembershipStatus.REJECTED,
              MembershipStatus.SUSPENDED,
            ],
          },
        );
      } else if ((dto.status as string) === 'INACTIVE' || dto.status === MembershipStatus.SUSPENDED) {
        qb.andWhere(
          '(membership.status IN (:...inactiveStatuses) OR user.status IN (:...userInactiveStatuses))',
          {
            inactiveStatuses: [
              MembershipStatus.EXPIRED,
              MembershipStatus.CANCELLED,
              MembershipStatus.REJECTED,
              MembershipStatus.SUSPENDED,
            ],
            userInactiveStatuses: [CommonStatus.INACTIVE],
          },
        );
      } else {
        qb.andWhere('membership.status = :status', { status: dto.status });
      }
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

    const membershipIds = rawItems.map((m) => m.id);
    const userIds = rawItems.map((m) => m.user_id).filter(Boolean);
    const paymentMap = new Map<string, MembershipPaymentEntity>();

    if (membershipIds.length > 0) {
      const paymentList = await this.payments.find({
        where: [
          { membership_id: In(membershipIds) },
          ...(userIds.length > 0 ? [{ user_id: In(userIds) }] : []),
        ],
        order: { created_at: 'DESC' },
      });
      for (const p of paymentList) {
        if (p.membership_id && !paymentMap.has(p.membership_id)) {
          paymentMap.set(p.membership_id, p);
        }
        if (p.user_id && !paymentMap.has(p.user_id)) {
          paymentMap.set(p.user_id, p);
        }
      }
    }

    // Sanitize user entity password hash and enrich with payment and category fee details
    const items = rawItems.map((m) => {
      if (m.user) {
        delete (m.user as { password_hash?: string }).password_hash;
      }
      return this.enrichMembershipPaymentDetails(m, paymentMap.get(m.id) || paymentMap.get(m.user_id));
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

  private enrichMembershipPaymentDetails(
    membership: MembershipEntity,
    payment?: MembershipPaymentEntity | null,
  ): MembershipEntity {
    const categoryFee =
      membership.category?.fee !== undefined && membership.category?.fee !== null
        ? Number(membership.category.fee)
        : 0;
    const appData = (membership.application_data || {}) as Record<string, unknown>;
    const appAmount =
      appData.payment_amount ?? appData.amount ?? appData.package_fee;
    const resolvedAmount =
      payment?.amount !== undefined && payment?.amount !== null
        ? Number(payment.amount)
        : categoryFee > 0
          ? categoryFee
          : appAmount
            ? Number(String(appAmount).replace(/[^0-9.]/g, '')) || 0
            : 0;

    const isSeeker =
      (appData.type as string) === 'DONATION_SEEKER' ||
      (appData.membership_type as string) === 'Donation Seeker' ||
      (membership.category?.name as string) === 'Donation Seeker';

    const resolvedPaymentStatus =
      payment?.payment_status ||
      (appData.payment_status as string) ||
      (isSeeker
        ? 'EXEMPT'
        : 'SUCCESS');

    membership.payment = payment || null;
    membership.payment_amount = resolvedAmount;
    membership.amount = resolvedAmount;
    membership.payment_status = resolvedPaymentStatus;

    const personal = (appData.personal_details || {}) as Record<string, any>;
    const existingKit = appData.kit_fulfillment || null;

    (membership as any).kit_fulfillment = existingKit || {
      status: membership.status === MembershipStatus.ACTIVE ? 'PROCESSING' : 'PENDING',
      courier_name: 'India Post Speed Post',
      tracking_number: membership.membership_number ? `SP-${membership.membership_number.replace(/[^a-zA-Z0-9]/g, '')}` : '',
      dispatch_date: membership.approval_date || membership.start_date || null,
      delivery_address: [personal.address, personal.city, personal.state, personal.pincode].filter(Boolean).join(', ') || 'Registered Address',
      items: [
        'Official Appointment Letter',
        'Membership Certificate',
        'Physical ID Card & Lanyard',
        'Car / Bike Sticker',
        'HRSJM Official T-Shirt',
      ],
      notes: 'Welcome kit prepared upon membership verification',
    };

    return membership;
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

    // Total = only real members (approved/active/expired/blocked); excludes pending applicants
    const totalQb = this.memberships
      .createQueryBuilder('m')
      .where('m.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [MembershipStatus.PENDING, MembershipStatus.UNDER_REVIEW],
      });
    applyFilters(totalQb);
    const total = await totalQb.getCount();

    const activeQb = this.memberships.createQueryBuilder('m');
    applyFilters(activeQb);
    activeQb.andWhere(
      '(m.status IN (:...activeStatuses) OR (u.status = :userActiveStatus AND m.status NOT IN (:...excludeStatuses)))',
      {
        activeStatuses: [MembershipStatus.ACTIVE, MembershipStatus.APPROVED],
        userActiveStatus: 'ACTIVE',
        excludeStatuses: [
          MembershipStatus.EXPIRED,
          MembershipStatus.CANCELLED,
          MembershipStatus.REJECTED,
          MembershipStatus.SUSPENDED,
        ],
      },
    );
    const active = await activeQb.getCount();

    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const expiringSoonQb = this.memberships
      .createQueryBuilder('m')
      .where('m.status IN (:...expStatuses)', {
        expStatuses: [MembershipStatus.ACTIVE, MembershipStatus.APPROVED],
      })
      .andWhere('m.expiry_date >= :now', { now })
      .andWhere('m.expiry_date <= :in30Days', { in30Days });
    applyFilters(expiringSoonQb);
    const expiringSoon = await expiringSoonQb.getCount();

    const inactiveQb = this.memberships.createQueryBuilder('m');
    applyFilters(inactiveQb);
    inactiveQb.andWhere(
      '(m.status IN (:...statuses) OR u.status IN (:...userInactiveStatuses))',
      {
        statuses: [
          MembershipStatus.EXPIRED,
          MembershipStatus.SUSPENDED,
          MembershipStatus.CANCELLED,
          MembershipStatus.REJECTED,
          MembershipStatus.SUSPENDED,
        ],
        userInactiveStatuses: [CommonStatus.INACTIVE],
      },
    );
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

    const payment = (this.payments && typeof this.payments.findOne === 'function')
      ? await this.payments.findOne({
          where: [{ membership_id: id }, ...(membership.user_id ? [{ user_id: membership.user_id }] : [])],
          order: { created_at: 'DESC' },
        })
      : null;

    const enriched = this.enrichMembershipPaymentDetails(membership, payment);
    try {
      const docs = await this.documentsService.findByRelatedEntity(
        RelatedEntityType.MEMBERSHIP,
        id,
      );
      if (membership.user_id) {
        const userDocs = await this.documentsService.findByUser(membership.user_id);
        const map = new Map<string, any>();
        docs.forEach((d) => map.set(d.id, d));
        userDocs.forEach((d) => map.set(d.id, d));
        (enriched as any).documents = Array.from(map.values());
      } else {
        (enriched as any).documents = docs;
      }
    } catch {
      (enriched as any).documents = [];
    }
    return enriched;
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

    if (
      membership &&
      (membership.status === MembershipStatus.ACTIVE || membership.status === MembershipStatus.APPROVED) &&
      !membership.referral_code
    ) {
      try {
        membership.referral_code = await this.generateUniqueReferralCode();
        await this.memberships.save(membership);
      } catch (refErr) {
        console.warn('Could not lazily generate referral code in getMyMembership:', refErr);
      }
    }

    if (membership) {
      const payment = await this.payments.findOne({
        where: { membership_id: membership.id },
        order: { created_at: 'DESC' },
      });
      return this.enrichMembershipPaymentDetails(membership, payment);
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

    if (dto.kit_fulfillment !== undefined) {
      const appData = (membership.application_data || {}) as Record<string, any>;
      membership.application_data = {
        ...appData,
        kit_fulfillment: {
          ...(appData.kit_fulfillment || {}),
          ...dto.kit_fulfillment,
          updated_at: new Date().toISOString(),
        },
      };
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

    return this.enrichMembershipPaymentDetails(saved, saved.payment);
  }

  async updateKitFulfillment(
    id: string,
    dto: KitFulfillmentDto,
    actingUserId: string,
  ): Promise<MembershipEntity> {
    const membership = await this.getById(id, actingUserId, true);

    const appData = (membership.application_data || {}) as Record<string, any>;
    const personal = (appData.personal_details || {}) as Record<string, any>;
    const currentKit = (appData.kit_fulfillment || {}) as Record<string, any>;

    const defaultItems = [
      'Official Appointment Letter',
      'Membership Certificate',
      'Physical ID Card & Lanyard',
      'Car / Bike Sticker',
      'HRSJM Official T-Shirt',
    ];

    const updatedKit = {
      ...currentKit,
      ...dto,
      items: dto.items && dto.items.length > 0 ? dto.items : currentKit.items || defaultItems,
      delivery_address:
        dto.delivery_address ||
        currentKit.delivery_address ||
        [personal.address, personal.city, personal.state, personal.pincode].filter(Boolean).join(', ') ||
        'Registered Address',
      updated_at: new Date().toISOString(),
    };

    membership.application_data = {
      ...appData,
      kit_fulfillment: updatedKit,
    };
    membership.updated_by = actingUserId;

    const saved = await this.memberships.save(membership);

    await this.audit.record({
      event: 'membership.kit_fulfillment_updated',
      actorId: actingUserId,
      entityType: 'memberships',
      entityId: saved.id,
      metadata: { kit_fulfillment: updatedKit },
    });

    return this.enrichMembershipPaymentDetails(saved, saved.payment);
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
      if (!membership.referral_code) {
        membership.referral_code = await this.generateUniqueReferralCode();
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
      try {
        const pendingRef = await this.referralsRepo.findOne({
          where: { referred_membership_id: membership.id, status: ReferralStatus.PENDING },
        });
        if (pendingRef) {
          pendingRef.status = ReferralStatus.REJECTED;
          await this.referralsRepo.save(pendingRef);
        }
      } catch (rErr) {
        console.warn('Could not update referral rejection status:', rErr);
      }
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

    // Apply free renewal if this membership was referred by another member
    if (saved.status === MembershipStatus.APPROVED || saved.status === MembershipStatus.ACTIVE) {
      await this.applyFreeRenewalForReferral(saved, actingUserId);
    }

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
      const allMembers = await this.memberships
        .createQueryBuilder('m')
        .select(['m.id', 'm.membership_number', 'm.application_data'])
        .getRawMany();

      let maxNum = 0;
      for (const row of allMembers) {
        const val = row.m_membership_number || row.membership_number;
        if (val && typeof val === 'string' && val.startsWith('HRSJM-') && !val.startsWith('HRSJM-SEK')) {
          const num = parseInt(val.replace('HRSJM-', ''), 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
        let appData = row.m_application_data || row.application_data;
        if (typeof appData === 'string') {
          try {
            appData = JSON.parse(appData);
          } catch {}
        }
        const appVal = appData?.application_id || appData?.applicationId || appData?.membership_number;
        if (appVal && typeof appVal === 'string' && appVal.startsWith('HRSJM-') && !appVal.startsWith('HRSJM-SEK')) {
          const num = parseInt(appVal.replace('HRSJM-', ''), 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }

      // If user already had/saw HRSJM-00003 and there are existing membership records, ensure next number is at least 4
      if (maxNum < 3 && allMembers.length >= 2) {
        maxNum = Math.max(maxNum, 3);
      }

      let nextNum = maxNum + 1;
      let candidate = `HRSJM-${String(nextNum).padStart(5, '0')}`;
      while (await this.memberships.findOne({ where: { membership_number: candidate } })) {
        nextNum++;
        candidate = `HRSJM-${String(nextNum).padStart(5, '0')}`;
      }
      return candidate;
    } catch {
      return `HRSJM-${String(Date.now()).slice(-5)}`;
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
          ? `An active membership already exists with this ${field === 'both' ? 'mobile number and email' : (field === 'phone' ? 'mobile number' : 'email')}.`
          : `A membership application with this ${field === 'both' ? 'mobile number and email' : (field === 'phone' ? 'mobile number' : 'email')} has already been submitted and is currently pending review.`;

        return {
          isDuplicate: true,
          field,
          message: msg,
          existingStatus: activeOrPending.status,
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

  /**
   * Generates a unique 6-digit numeric referral code (e.g. 100000 to 999999).
   */
  async generateUniqueReferralCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await this.memberships.findOne({
        where: { referral_code: code },
      });
      if (!existing) {
        return code;
      }
    }
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /**
   * Returns official referral reward tiers and rules.
   */
  getReferralTiers() {
    return {
      title: 'Free Renewal by Referral Scheme',
      description: 'Introduce new members into official units and council posts to earn up to 5 years of free membership renewal.',
      tiers: OFFICIAL_REFERRAL_TIERS,
      rules: [
        'There is no need to wait for the renewal period to arrive. Renewal can be processed anytime.',
        'When you introduce a new member, your unique 6-digit Referral Code is submitted with their application.',
        'Once their application is approved by HRSJM administration, your membership validity is extended automatically.',
        'If you introduce new members multiple times within a year, you receive a free renewal each time, and an updated ID card will be issued every time.',
      ],
    };
  }

  /**
   * Verifies a 6-digit referral code or membership number before application submission.
   */
  async verifyReferralCode(code: string): Promise<{
    valid: boolean;
    referral_code: string;
    referrer_name?: string;
    membership_number?: string;
    message: string;
  }> {
    if (!code || !code.trim()) {
      return {
        valid: false,
        referral_code: code,
        message: 'Referral code cannot be empty.',
      };
    }

    const cleanCode = code.trim().toUpperCase();
    const referrer = await this.memberships.findOne({
      where: [
        { referral_code: cleanCode },
        { membership_number: cleanCode },
      ],
      relations: ['user', 'category'],
    });

    if (!referrer) {
      return {
        valid: false,
        referral_code: cleanCode,
        message: 'Invalid referral code. Member not found.',
      };
    }

    const activeStatuses: MembershipStatus[] = [MembershipStatus.ACTIVE, MembershipStatus.APPROVED];
    if (!activeStatuses.includes(referrer.status)) {
      return {
        valid: false,
        referral_code: cleanCode,
        message: 'Referral code belongs to an inactive or unapproved membership.',
      };
    }

    const memberName = referrer.user?.full_name || 'Registered Member';
    return {
      valid: true,
      referral_code: referrer.referral_code || cleanCode,
      referrer_name: memberName,
      membership_number: referrer.membership_number || undefined,
      message: `Verified: Referred by ${memberName} (${referrer.membership_number || cleanCode})`,
    };
  }

  /**
   * Public status lookup for member renewal verification (by membership number, registered phone, or referral code).
   */
  async verifyMemberStatusForRenewal(query: string): Promise<{
    found: boolean;
    membership_id?: string;
    membership_number?: string | null;
    member_name?: string;
    category_name?: string;
    status?: string;
    start_date?: string | null;
    expiry_date?: string | null;
    is_valid?: boolean;
    is_expired?: boolean;
    days_remaining?: number;
    days_overdue?: number;
    referral_code?: string | null;
    renewal_fee?: number;
    renewal_sequence?: number;
    eligible_for_free_renewal?: boolean;
    message: string;
  }> {
    if (!query || !query.trim()) {
      return {
        found: false,
        message: 'Please enter a valid Membership ID or registered mobile number.',
      };
    }

    const clean = query.trim();
    const cleanUpper = clean.toUpperCase();
    const digitsOnly = clean.replace(/\D/g, '');

    const qb = this.memberships
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.user', 'u')
      .leftJoinAndSelect('m.category', 'c')
      .where('m.membership_number ILIKE :q', { q: cleanUpper })
      .orWhere('m.referral_code = :qExact', { qExact: cleanUpper });

    if (digitsOnly.length >= 10) {
      qb.orWhere('u.mobile_number LIKE :phone', { phone: `%${digitsOnly.slice(-10)}%` });
    }
    if (/^\d{1,6}$/.test(clean)) {
      qb.orWhere('m.membership_number ILIKE :padded', {
        padded: `HRSJM-${clean.padStart(5, '0')}`,
      });
    }

    const membership = await qb.orderBy('m.created_at', 'DESC').getOne();

    if (!membership) {
      return {
        found: false,
        message: `No active or registered membership found matching "${query}". Please check your ID/phone number or contact the administration desk.`,
      };
    }

    const now = new Date();
    const expiry = membership.expiry_date ? new Date(membership.expiry_date) : null;
    const isExpired = expiry ? expiry.getTime() < now.getTime() : false;
    const isValid = membership.status === MembershipStatus.ACTIVE && !isExpired;

    const daysRemaining =
      expiry && !isExpired ? Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const daysOverdue =
      expiry && isExpired ? Math.ceil((now.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24)) : 0;

    let pastRenewalsCount = 0;
    try {
      pastRenewalsCount = await this.renewals.count({
        where: {
          membership_id: membership.id,
          payment_status: RenewalPaymentStatus.SUCCESS,
        },
      });
    } catch {}

    const renewalSequence = pastRenewalsCount + 1;
    const renewalFee = renewalSequence === 1 ? 500 : renewalSequence === 2 ? 400 : 300;

    if (
      !membership.referral_code &&
      (membership.status === MembershipStatus.ACTIVE || membership.status === MembershipStatus.APPROVED)
    ) {
      try {
        membership.referral_code = await this.generateUniqueReferralCode();
        await this.memberships.save(membership);
      } catch {}
    }

    const memberName = membership.user?.full_name || 'Registered Member';
    const catName = membership.category?.name || 'General Membership';

    let statusMsg = '';
    if (membership.status === MembershipStatus.ACTIVE) {
      statusMsg = isExpired
        ? `Membership expired on ${expiry?.toLocaleDateString('en-IN')}. Renewal is due.`
        : `Active membership. Valid until ${expiry?.toLocaleDateString('en-IN')} (${daysRemaining} days remaining).`;
    } else if (
      membership.status === MembershipStatus.PENDING ||
      membership.status === MembershipStatus.UNDER_REVIEW
    ) {
      statusMsg = 'Application is currently under review by HRSJM administration.';
    } else {
      statusMsg = `Current status: ${membership.status}.`;
    }

    return {
      found: true,
      membership_id: membership.id,
      membership_number: membership.membership_number,
      member_name: memberName,
      category_name: catName,
      status: membership.status,
      start_date: membership.start_date ? new Date(membership.start_date).toISOString() : null,
      expiry_date: expiry ? expiry.toISOString() : null,
      is_valid: isValid,
      is_expired: isExpired,
      days_remaining: daysRemaining,
      days_overdue: daysOverdue,
      referral_code: membership.referral_code,
      renewal_fee: renewalFee,
      renewal_sequence: renewalSequence,
      eligible_for_free_renewal: true,
      message: statusMsg,
    };
  }

  /**
   * Gets referral stats and list of referred applicants for the logged-in member.
   */
  async getMyReferralStats(userId: string): Promise<{
    referral_code: string | null;
    membership_number: string | null;
    current_expiry: Date | null;
    total_referrals: number;
    approved_referrals: number;
    pending_referrals: number;
    total_free_years_earned: number;
    referrals: any[];
  }> {
    const membership = await this.memberships.findOne({
      where: { user_id: userId },
      relations: ['user', 'category'],
      order: { created_at: 'DESC' },
    });

    if (!membership) {
      throw new NotFoundException({
        message: 'No membership record found for this user.',
        code: 'MEMBERSHIP_NOT_FOUND',
      });
    }

    // Ensure 6-digit referral code exists for active/approved member
    if (
      !membership.referral_code &&
      (membership.status === MembershipStatus.ACTIVE || membership.status === MembershipStatus.APPROVED)
    ) {
      membership.referral_code = await this.generateUniqueReferralCode();
      await this.memberships.save(membership);
    }

    const referrals = await this.referralsRepo.find({
      where: { referrer_membership_id: membership.id },
      relations: ['referred_membership', 'referred_membership.user', 'renewal'],
      order: { created_at: 'DESC' },
    });

    let approvedCount = 0;
    let pendingCount = 0;
    let freeYearsEarned = 0;

    const formattedReferrals = referrals.map((r) => {
      if (r.status === ReferralStatus.APPROVED) {
        approvedCount++;
        freeYearsEarned += r.reward_years || 0;
      } else if (r.status === ReferralStatus.PENDING) {
        pendingCount++;
      }

      return {
        id: r.id,
        referred_name: r.referred_membership?.user?.full_name || 'Applicant',
        category_name: r.category_name,
        reward_years: r.reward_years,
        status: r.status,
        free_renewal_applied: r.free_renewal_applied,
        applied_at: r.created_at,
        reward_applied_at: r.reward_applied_at,
      };
    });

    return {
      referral_code: membership.referral_code,
      membership_number: membership.membership_number,
      current_expiry: membership.expiry_date,
      total_referrals: referrals.length,
      approved_referrals: approvedCount,
      pending_referrals: pendingCount,
      total_free_years_earned: freeYearsEarned,
      referrals: formattedReferrals,
    };
  }

  /**
   * Applies the free renewal benefit to the referring member when the referred applicant's membership is approved.
   */
  private async applyFreeRenewalForReferral(
    membership: MembershipEntity,
    actingUserId: string,
  ): Promise<void> {
    try {
      const pendingReferral = await this.referralsRepo.findOne({
        where: {
          referred_membership_id: membership.id,
          status: ReferralStatus.PENDING,
        },
        relations: ['referrer_membership', 'referrer_membership.user'],
      });

      if (!pendingReferral) {
        return;
      }

      let referrer: MembershipEntity | null = pendingReferral.referrer_membership || null;
      if (!referrer) {
        referrer = await this.memberships.findOne({
          where: { id: pendingReferral.referrer_membership_id },
          relations: ['user', 'category'],
        });
      }

      if (!referrer) {
        return;
      }

      let cat: MembershipCategoryEntity | null = membership.category || null;
      if (!cat && membership.category_id) {
        cat = await this.categories.findOne({ where: { id: membership.category_id } });
      }
      const categoryName = cat?.name || pendingReferral.category_name;
      const categoryCode = cat?.code;
      const rewardInfo = getReferralRewardYears(categoryName, categoryCode);
      const rewardYears = rewardInfo.rewardYears || pendingReferral.reward_years || 1;

      const now = new Date();
      const currentExpiry = referrer.expiry_date ? new Date(referrer.expiry_date) : now;
      const baseDate = currentExpiry > now ? currentExpiry : now;
      const newExpiry = addYearsSafe(baseDate, rewardYears);

      referrer.expiry_date = newExpiry;
      if (referrer.status === MembershipStatus.EXPIRED) {
        referrer.status = MembershipStatus.ACTIVE;
      }
      referrer.updated_by = actingUserId;
      await this.memberships.save(referrer);

      const year = now.getFullYear();
      const rand = Math.floor(10000 + Math.random() * 90000);
      const receiptNumber = `HRSJM-REF-REC-${year}-${rand}`;

      const renewal = this.renewals.create({
        membership_id: referrer.id,
        requested_by: referrer.user_id,
        user_id: referrer.user_id,
        period_years: rewardYears,
        amount: 0,
        payment_method: 'REFERRAL_FREE_RENEWAL',
        payment_status: RenewalPaymentStatus.SUCCESS,
        status: RenewalStatus.ACTIVE,
        receipt_number: receiptNumber,
        previous_expiry: currentExpiry,
        new_expiry: newExpiry,
        admin_remark: `Free renewal policy awarded for introducing member #${membership.membership_number || 'new'} into ${categoryName} (${rewardInfo.tierName}).`,
        member_note: `Earned ${rewardYears} Year(s) Free Renewal via Referral Scheme.`,
        reviewed_by: actingUserId,
        reviewed_at: now,
        created_by: actingUserId,
        updated_by: actingUserId,
      });
      const savedRenewal = await this.renewals.save(renewal);

      try {
        const receipt = this.receiptsRepo.create({
          receipt_number: receiptNumber,
          receipt_date: now,
          user_id: referrer.user_id,
          amount: 0,
          payment_method: 'REFERRAL_REWARD',
          receipt_type: 'RENEWAL',
          issued_to: referrer.user?.full_name ?? 'Member',
          notes: `Free Membership Renewal (${rewardYears} Year Extension) via Referral Reward Scheme`,
          created_by: actingUserId,
        });
        await this.receiptsRepo.save(receipt);
      } catch (recErr) {
        console.warn('Could not persist receipt for free referral renewal:', recErr);
      }

      pendingReferral.status = ReferralStatus.APPROVED;
      pendingReferral.free_renewal_applied = true;
      pendingReferral.reward_years = rewardYears;
      pendingReferral.renewal_id = savedRenewal.id;
      pendingReferral.reward_applied_at = now;
      await this.referralsRepo.save(pendingReferral);

      try {
        const referredUserName =
          (membership.user as any)?.full_name ||
          (membership.application_data as any)?.full_name ||
          'Member';
        await this.notifications.sendToUser(
          referrer.user_id,
          'Free Renewal Activated! 🎉',
          `Congratulations! Your referral for ${referredUserName} (${categoryName}) was approved. You received ${rewardYears} year(s) of free membership renewal! Your new validity is until ${newExpiry.toISOString().slice(0, 10)}.`,
          actingUserId,
        );
      } catch (nErr) {
        console.warn('Could not send referral approval notification:', nErr);
      }

      try {
        if (referrer.user?.email && referrer.user.email.includes('@')) {
          this.mailService
            .sendMembershipStatusUpdateEmail({
              memberName: referrer.user.full_name || 'Member',
              memberEmail: referrer.user.email,
              membershipNumber: referrer.membership_number || '',
              categoryName: referrer.category?.name || 'Member',
              status: 'ACTIVE' as any,
              validFrom: referrer.start_date || undefined,
              validUntil: newExpiry,
              notes: `Free Renewal Benefit Applied: +${rewardYears} Year(s) for introducing approved member.`,
            })
            .catch((mailErr) => {
              console.warn('Could not send referral free renewal email:', mailErr.message);
            });
        }
      } catch (mErr) {
        console.warn('Error initiating free renewal email:', mErr);
      }

      await this.audit.record({
        event: 'referral.free_renewal_awarded',
        actorId: actingUserId,
        entityType: 'membership_referrals',
        entityId: pendingReferral.id,
        metadata: {
          referrerMembershipId: referrer.id,
          referredMembershipId: membership.id,
          rewardYears,
          newExpiry,
        },
      });
    } catch (err) {
      console.error('Failed to apply free renewal for referral:', err);
    }
  }
}
