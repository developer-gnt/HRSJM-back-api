import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RenewalPaymentStatus,
  RenewalRequestEntity,
  RenewalStatus,
} from '../entities/renewal-request.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { AuditService } from '../../audit/services/audit.service';
import {
  CreateRenewalDto,
  ListRenewalsDto,
  ReviewRenewalDto,
  UpdateRenewalPaymentDto,
} from '../dto/renewal.dto';

@Injectable()
export class RenewalsService {
  constructor(
    @InjectRepository(RenewalRequestEntity)
    private readonly renewalsRepo: Repository<RenewalRequestEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepo: Repository<MembershipEntity>,
    private readonly audit: AuditService,
  ) {}

  async apply(dto: CreateRenewalDto, requestedBy: string): Promise<RenewalRequestEntity> {
    const membership = await this.membershipsRepo.findOne({
      where: { id: dto.membership_id },
      relations: ['category', 'user'],
    });

    if (!membership) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'MEMBERSHIP_NOT_FOUND',
        details: { membership_id: dto.membership_id },
      });
    }

    // Must be active or expired to renew
    const eligibleStatuses: string[] = [
      MembershipStatus.ACTIVE,
      MembershipStatus.EXPIRED,
      MembershipStatus.APPROVED,
    ];
    if (!eligibleStatuses.includes(membership.status)) {
      throw new BadRequestException({
        message: `Membership in status ${membership.status} is not eligible for renewal`,
        code: 'MEMBERSHIP_NOT_ELIGIBLE_FOR_RENEWAL',
        details: { status: membership.status },
      });
    }

    const periodYears = dto.period_years ?? 1;
    const baseFee = membership.category?.fee ? Number(membership.category.fee) : 500;
    const amount = dto.amount ?? baseFee * periodYears;

    const renewal = this.renewalsRepo.create({
      membership_id: dto.membership_id,
      requested_by: requestedBy,
      period_years: periodYears,
      amount,
      payment_method: dto.payment_method || 'CASH',
      transaction_id: dto.transaction_id || null,
      payment_status: RenewalPaymentStatus.PENDING,
      status: RenewalStatus.PENDING,
      member_note: dto.member_note || null,
      previous_expiry: membership.expiry_date,
      created_by: requestedBy,
      updated_by: requestedBy,
    });

    const saved = await this.renewalsRepo.save(renewal);

    await this.audit.record({
      event: 'renewal.applied',
      actorId: requestedBy,
      entityType: 'membership_renewals',
      entityId: saved.id,
      metadata: {
        membershipId: membership.id,
        amount,
        periodYears,
      },
    });

    return saved;
  }

  async list(dto: ListRenewalsDto): Promise<{
    items: RenewalRequestEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.renewalsRepo
      .createQueryBuilder('renewal')
      .leftJoinAndSelect('renewal.membership', 'membership')
      .leftJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('renewal.requested_by_user', 'requested_by_user')
      .orderBy('renewal.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.status) {
      qb.andWhere('renewal.status = :status', { status: dto.status });
    }
    if (dto.payment_status) {
      qb.andWhere('renewal.payment_status = :paymentStatus', {
        paymentStatus: dto.payment_status,
      });
    }
    if (dto.membership_id) {
      qb.andWhere('renewal.membership_id = :membershipId', {
        membershipId: dto.membership_id,
      });
    }

    const [items, total] = await qb.getManyAndCount();

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

  async listMyRenewals(userId: string): Promise<RenewalRequestEntity[]> {
    return this.renewalsRepo.find({
      where: { requested_by: userId },
      relations: ['membership'],
      order: { created_at: 'DESC' },
    });
  }

  async listForMembership(membershipNumber: string): Promise<RenewalRequestEntity[]> {
    const membership = await this.membershipsRepo.findOne({
      where: { membership_number: membershipNumber },
    });

    if (!membership) {
      throw new NotFoundException({
        message: `Membership ${membershipNumber} not found`,
        code: 'MEMBERSHIP_NOT_FOUND',
      });
    }

    return this.renewalsRepo.find({
      where: { membership_id: membership.id },
      relations: ['membership'],
      order: { created_at: 'DESC' },
    });
  }

  async getById(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<RenewalRequestEntity> {
    const renewal = await this.renewalsRepo.findOne({
      where: { id },
      relations: ['membership', 'membership.user', 'requested_by_user'],
    });

    if (!renewal) {
      throw new NotFoundException({
        message: 'Renewal request not found',
        code: 'RENEWAL_NOT_FOUND',
        details: { id },
      });
    }

    if (!isAdmin && renewal.requested_by !== actingUserId && renewal.membership?.user_id !== actingUserId) {
      throw new ForbiddenException({
        message: 'You are not authorized to view this renewal request',
        code: 'ACCESS_DENIED',
      });
    }

    return renewal;
  }

  async approve(
    id: string,
    dto: ReviewRenewalDto,
    actingUserId: string,
  ): Promise<RenewalRequestEntity> {
    const renewal = await this.renewalsRepo.findOne({ where: { id } });
    if (!renewal) {
      throw new NotFoundException({
        message: 'Renewal request not found',
        code: 'RENEWAL_NOT_FOUND',
      });
    }

    if (renewal.status !== RenewalStatus.PENDING) {
      throw new BadRequestException({
        message: `Cannot approve renewal with status ${renewal.status}`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    renewal.status = RenewalStatus.APPROVED;
    renewal.admin_remark = dto.admin_remark ?? renewal.admin_remark;
    renewal.reviewed_by = actingUserId;
    renewal.reviewed_at = new Date();
    renewal.updated_by = actingUserId;

    return this.renewalsRepo.save(renewal);
  }

  async reject(
    id: string,
    dto: ReviewRenewalDto,
    actingUserId: string,
  ): Promise<RenewalRequestEntity> {
    const renewal = await this.renewalsRepo.findOne({ where: { id } });
    if (!renewal) {
      throw new NotFoundException({
        message: 'Renewal request not found',
        code: 'RENEWAL_NOT_FOUND',
      });
    }

    if (renewal.status !== RenewalStatus.PENDING) {
      throw new BadRequestException({
        message: `Cannot reject renewal with status ${renewal.status}`,
        code: 'INVALID_STATUS_TRANSITION',
      });
    }

    renewal.status = RenewalStatus.REJECTED;
    renewal.admin_remark = dto.admin_remark ?? renewal.admin_remark;
    renewal.reviewed_by = actingUserId;
    renewal.reviewed_at = new Date();
    renewal.updated_by = actingUserId;

    return this.renewalsRepo.save(renewal);
  }

  async updatePayment(
    id: string,
    dto: UpdateRenewalPaymentDto,
    actingUserId: string,
  ): Promise<RenewalRequestEntity> {
    const renewal = await this.renewalsRepo.findOne({ where: { id } });
    if (!renewal) {
      throw new NotFoundException({
        message: 'Renewal request not found',
        code: 'RENEWAL_NOT_FOUND',
      });
    }

    renewal.payment_status = dto.payment_status;
    if (dto.transaction_id) {
      renewal.transaction_id = dto.transaction_id;
    }
    renewal.updated_by = actingUserId;

    return this.renewalsRepo.save(renewal);
  }

  async activate(id: string, actingUserId: string): Promise<RenewalRequestEntity> {
    const renewal = await this.renewalsRepo.findOne({
      where: { id },
      relations: ['membership'],
    });

    if (!renewal) {
      throw new NotFoundException({
        message: 'Renewal request not found',
        code: 'RENEWAL_NOT_FOUND',
      });
    }

    if (renewal.payment_status !== RenewalPaymentStatus.SUCCESS && renewal.status !== RenewalStatus.APPROVED) {
      throw new BadRequestException({
        message: 'Renewal must be approved or payment confirmed before activation',
        code: 'RENEWAL_NOT_READY_FOR_ACTIVATION',
      });
    }

    const membership = await this.membershipsRepo.findOne({
      where: { id: renewal.membership_id },
    });

    if (!membership) {
      throw new NotFoundException({
        message: 'Membership not found',
        code: 'MEMBERSHIP_NOT_FOUND',
      });
    }

    const now = new Date();
    const currentExpiry = membership.expiry_date ? new Date(membership.expiry_date) : now;
    const baseDate = currentExpiry > now ? currentExpiry : now;

    const newExpiry = new Date(baseDate.getTime() + renewal.period_years * 365 * 24 * 60 * 60 * 1000);
    membership.expiry_date = newExpiry;
    membership.status = MembershipStatus.ACTIVE;
    membership.updated_by = actingUserId;
    await this.membershipsRepo.save(membership);

    const year = now.getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    renewal.status = RenewalStatus.ACTIVE;
    renewal.payment_status = RenewalPaymentStatus.SUCCESS;
    renewal.previous_expiry = currentExpiry;
    renewal.new_expiry = newExpiry;
    renewal.receipt_number = `RCV-${year}-${rand}`;
    renewal.reviewed_by = actingUserId;
    renewal.reviewed_at = now;
    renewal.updated_by = actingUserId;

    return this.renewalsRepo.save(renewal);
  }

  async getRenewalsByMembershipId(membershipId: string): Promise<RenewalRequestEntity[]> {
    return this.renewalsRepo.find({
      where: { membership_id: membershipId },
      order: { created_at: 'DESC' },
    });
  }
}
