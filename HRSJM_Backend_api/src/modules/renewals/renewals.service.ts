import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { ApiConfigService } from "../../shared/helpers/api-config.service";
import { AuthenticatedUser } from "../../shared/decorators/current-user.decorator";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { UserRole } from "../users/entities/user.entity";
import { Membership, MembershipStatus } from "../memberships/entities/membership.entity";
import {
  RenewalPaymentStatus,
  RenewalRequest,
  RenewalStatus,
} from "./entities/renewal-request.entity";
import {
  CreateRenewalDto,
  ListRenewalsQueryDto,
  ReviewRenewalDto,
  UpdateRenewalPaymentDto,
} from "./dto/renewal.dto";

const ALLOWED_TRANSITIONS: Record<RenewalStatus, RenewalStatus[]> = {
  [RenewalStatus.PENDING]: [RenewalStatus.APPROVED, RenewalStatus.REJECTED],
  [RenewalStatus.APPROVED]: [RenewalStatus.ACTIVE],
  [RenewalStatus.REJECTED]: [],
  [RenewalStatus.ACTIVE]: [],
};

@Injectable()
export class RenewalsService {
  constructor(
    @InjectRepository(RenewalRequest)
    private readonly renewalsRepo: Repository<RenewalRequest>,
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    private readonly configService: ApiConfigService,
  ) {}

  /**
   * Renewal flow (BRD): validate membership -> eligibility -> period -> amount
   * (policy-driven, not hard-coded until HRSJM confirms) -> submit as PENDING.
   */
  async submit(actor: AuthenticatedUser, dto: CreateRenewalDto) {
    if (!this.configService.renewalAllowedPeriods.includes(dto.periodYears)) {
      throw new BadRequestException(
        `Invalid renewal period. Allowed periods (years): ${this.configService.renewalAllowedPeriods.join(", ")}`,
      );
    }

    const membership = await this.membershipRepo.findOne({
      where: { id: dto.membershipId },
      relations: { user: true },
    });
    if (!membership) {
      throw new NotFoundException("Membership not found");
    }
    // Member can renew only their own membership; admins may renew on behalf
    if (actor.role !== UserRole.ADMIN && membership.userId !== actor.id) {
      throw new ForbiddenException("You can only renew your own membership");
    }
    this.assertEligible(membership);

    const openRenewal = await this.renewalsRepo.findOne({
      where: { membershipId: membership.id, status: RenewalStatus.PENDING },
    });
    if (openRenewal) {
      throw new ConflictException("A renewal request is already pending for this membership");
    }

    const amount = this.amountForYears(dto.periodYears);
    const renewal = this.renewalsRepo.create({
      membershipId: membership.id,
      requestedBy: actor.id,
      periodYears: dto.periodYears,
      amount,
      paymentMethod: dto.paymentMethod,
      transactionId: dto.transactionId ?? null,
      memberNote: dto.note ?? null,
      status: RenewalStatus.PENDING,
      paymentStatus: RenewalPaymentStatus.PENDING,
    });
    await this.renewalsRepo.save(renewal);
    return { message: "Renewal request submitted", data: this.toSafeRenewal(renewal) };
  }

  async listMine(actor: AuthenticatedUser, query: ListRenewalsQueryDto) {
    const qb = this.renewalsRepo
      .createQueryBuilder("renewal")
      .innerJoin(Membership, "membership", "membership.id = renewal.membershipId")
      .where("membership.userId = :userId", { userId: actor.id })
      .orderBy("renewal.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    this.applyFilters(qb, query);

    const [renewals, total] = await qb.getManyAndCount();
    return {
      message: "Your renewal requests fetched",
      data: {
        items: renewals.map((r) => this.toSafeRenewal(r)),
        meta: buildPaginationMeta(total, query.page, query.limit),
      },
    };
  }

  async listAll(query: ListRenewalsQueryDto) {
    const qb = this.renewalsRepo
      .createQueryBuilder("renewal")
      .orderBy("renewal.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    this.applyFilters(qb, query);

    const [renewals, total] = await qb.getManyAndCount();
    return {
      message: "Renewal requests fetched",
      data: {
        items: renewals.map((r) => this.toSafeRenewal(r, true)),
        meta: buildPaginationMeta(total, query.page, query.limit),
      },
    };
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const renewal = await this.getForActor(actor, id);
    return {
      message: "Renewal request fetched",
      data: this.toSafeRenewal(renewal, actor.role === UserRole.ADMIN),
    };
  }

  async approve(actor: AuthenticatedUser, id: string, dto: ReviewRenewalDto) {
    const renewal = await this.renewalsRepo.findOne({ where: { id } });
    if (!renewal) {
      throw new NotFoundException("Renewal request not found");
    }
    if (!ALLOWED_TRANSITIONS[renewal.status].includes(RenewalStatus.APPROVED)) {
      throw new BadRequestException(`Invalid status transition: ${renewal.status} -> APPROVED`);
    }
    renewal.status = RenewalStatus.APPROVED;
    renewal.adminRemark = dto.adminRemark ?? renewal.adminRemark;
    renewal.reviewedBy = actor.id;
    renewal.reviewedAt = new Date();
    await this.renewalsRepo.save(renewal);
    return { message: "Renewal approved", data: this.toSafeRenewal(renewal, true) };
  }

  async reject(actor: AuthenticatedUser, id: string, dto: ReviewRenewalDto) {
    const renewal = await this.renewalsRepo.findOne({ where: { id } });
    if (!renewal) {
      throw new NotFoundException("Renewal request not found");
    }
    if (!ALLOWED_TRANSITIONS[renewal.status].includes(RenewalStatus.REJECTED)) {
      throw new BadRequestException(`Invalid status transition: ${renewal.status} -> REJECTED`);
    }
    renewal.status = RenewalStatus.REJECTED;
    renewal.adminRemark = dto.adminRemark ?? renewal.adminRemark;
    renewal.reviewedBy = actor.id;
    renewal.reviewedAt = new Date();
    await this.renewalsRepo.save(renewal);
    return { message: "Renewal rejected", data: this.toSafeRenewal(renewal, true) };
  }

  async markPayment(id: string, dto: UpdateRenewalPaymentDto) {
    const renewal = await this.renewalsRepo.findOne({ where: { id } });
    if (!renewal) {
      throw new NotFoundException("Renewal request not found");
    }
    if (renewal.status === RenewalStatus.ACTIVE) {
      throw new BadRequestException("Payment already applied to an active renewal");
    }
    renewal.paymentStatus = dto.paymentStatus;
    if (dto.transactionId) {
      renewal.transactionId = dto.transactionId;
    }
    await this.renewalsRepo.save(renewal);
    return { message: "Renewal payment status updated", data: this.toSafeRenewal(renewal, true) };
  }

  /**
   * Applies the renewal: extends membership expiry by the requested period,
   * restores EXPIRED memberships to ACTIVE and issues a receipt reference.
   * Requires admin approval and verified payment first.
   */
  async activate(actor: AuthenticatedUser, id: string) {
    const renewal = await this.renewalsRepo.findOne({ where: { id } });
    if (!renewal) {
      throw new NotFoundException("Renewal request not found");
    }
    if (!ALLOWED_TRANSITIONS[renewal.status].includes(RenewalStatus.ACTIVE)) {
      throw new BadRequestException(
        `Invalid status transition: ${renewal.status} -> ACTIVE (approve the renewal first)`,
      );
    }
    if (renewal.paymentStatus !== RenewalPaymentStatus.SUCCESS) {
      throw new BadRequestException("Payment must be marked SUCCESS before activation");
    }

    const membership = await this.membershipRepo.findOne({
      where: { id: renewal.membershipId },
    });
    if (!membership) {
      throw new NotFoundException("Membership not found");
    }

    const today = new Date().toISOString().slice(0, 10);
    const previousExpiry = membership.expiryDate;
    const base =
      previousExpiry && previousExpiry > today ? previousExpiry : today;
    const newExpiry = this.plusYears(base, renewal.periodYears);

    membership.expiryDate = newExpiry;
    if (membership.status === MembershipStatus.EXPIRED) {
      membership.status = MembershipStatus.ACTIVE;
    }
    await this.membershipRepo.save(membership);

    renewal.status = RenewalStatus.ACTIVE;
    renewal.previousExpiry = previousExpiry;
    renewal.newExpiry = newExpiry;
    renewal.receiptNumber = await this.nextReceiptNumber();
    renewal.reviewedBy = actor.id;
    renewal.reviewedAt = new Date();
    await this.renewalsRepo.save(renewal);

    return { message: "Renewal applied - membership extended", data: this.toSafeRenewal(renewal, true) };
  }

  async getForActor(actor: AuthenticatedUser, id: string): Promise<RenewalRequest> {
    const renewal = await this.renewalsRepo.findOne({
      where: { id },
      relations: { membership: { user: true }, requestedByUser: true },
    });
    if (!renewal) {
      throw new NotFoundException("Renewal request not found");
    }
    if (actor.role !== UserRole.ADMIN && renewal.membership.userId !== actor.id) {
      throw new ForbiddenException("You can only access renewals of your own membership");
    }
    return renewal;
  }

  async listForMembership(membershipNumber: string, query: ListRenewalsQueryDto) {
    const membership = await this.membershipRepo.findOne({
      where: { membershipNumber },
    });
    if (!membership) {
      throw new NotFoundException(`Membership ${membershipNumber} not found`);
    }
    const qb = this.renewalsRepo
      .createQueryBuilder("renewal")
      .where("renewal.membershipId = :membershipId", { membershipId: membership.id })
      .orderBy("renewal.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.status) {
      qb.andWhere("renewal.status = :status", { status: query.status });
    }
    const [renewals, total] = await qb.getManyAndCount();
    return {
      message: "Renewal history fetched",
      data: {
        items: renewals.map((r) => this.toSafeRenewal(r, true)),
        meta: buildPaginationMeta(total, query.page, query.limit),
      },
    };
  }

  private assertEligible(membership: Membership): void {
    if (membership.expiryDate === null) {
      throw new BadRequestException("Lifetime memberships do not require renewal");
    }
    const eligible = [MembershipStatus.ACTIVE, MembershipStatus.EXPIRED];
    if (!eligible.includes(membership.status)) {
      throw new BadRequestException(
        `Membership status ${membership.status} is not eligible for renewal`,
      );
    }
  }

  private applyFilters(
    qb: SelectQueryBuilder<RenewalRequest>,
    query: ListRenewalsQueryDto,
  ): void {
    if (query.status) {
      qb.andWhere("renewal.status = :status", { status: query.status });
    }
    if (query.paymentStatus) {
      qb.andWhere("renewal.paymentStatus = :paymentStatus", { paymentStatus: query.paymentStatus });
    }
    if (query.membershipId) {
      qb.andWhere("renewal.membershipId = :membershipId", { membershipId: query.membershipId });
    }
  }

  /** Policy-driven amount (env-configurable until HRSJM confirms the fee schedule). */
  private amountForYears(years: number): string {
    const feePerYear = Number(this.configService.renewalFeePerYear);
    return (feePerYear * years).toFixed(2);
  }

  /** RCV-<year>-<serial> sequential per calendar year. */
  private async nextReceiptNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RCV-${year}-`;
    const last = await this.renewalsRepo
      .createQueryBuilder("renewal")
      .where("renewal.receipt_number LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("renewal.receipt_number", "DESC")
      .getOne();

    const lastSerial = last?.receiptNumber ? Number(last.receiptNumber.split("-").pop()) : 0;
    return `${prefix}${String(lastSerial + 1).padStart(5, "0")}`;
  }

  private plusYears(dateIso: string, years: number): string {
    const date = new Date(`${dateIso}T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() + years);
    date.setUTCMilliseconds(date.getUTCMilliseconds() - 1); // inclusive last day
    return date.toISOString().slice(0, 10);
  }

  private toSafeRenewal(renewal: RenewalRequest, includeMembers = false) {
    const safe = {
      id: renewal.id,
      membershipId: renewal.membershipId,
      membershipNumber: renewal.membership?.membershipNumber,
      periodYears: renewal.periodYears,
      amount: renewal.amount,
      paymentMethod: renewal.paymentMethod,
      transactionId: renewal.transactionId,
      paymentStatus: renewal.paymentStatus,
      status: renewal.status,
      receiptNumber: renewal.receiptNumber,
      previousExpiry: renewal.previousExpiry,
      newExpiry: renewal.newExpiry,
      adminRemark: renewal.adminRemark,
      memberNote: renewal.memberNote,
      reviewedAt: renewal.reviewedAt,
      createdAt: renewal.createdAt,
      updatedAt: renewal.updatedAt,
    };
    if (includeMembers && renewal.membership?.user) {
      return {
        ...safe,
        member: {
          id: renewal.membership.user.id,
          fullName: renewal.membership.user.fullName,
          email: renewal.membership.user.email,
        },
      };
    }
    return safe;
  }
}