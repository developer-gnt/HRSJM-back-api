import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../../shared/decorators/current-user.decorator";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { UsersService } from "../users/users.service";
import {
  Donation,
  DonationStatus,
} from "./entities/donation.entity";
import {
  CreateDonationDto,
  CreateGuestDonationDto,
  ListDonationsQueryDto,
  UpdateDonationStatusDto,
} from "./dto/donation.dto";

const ALLOWED_TRANSITIONS: Record<DonationStatus, DonationStatus[]> = {
  [DonationStatus.PENDING]: [DonationStatus.RECEIVED, DonationStatus.FAILED],
  [DonationStatus.RECEIVED]: [DonationStatus.REFUNDED],
  [DonationStatus.FAILED]: [],
  [DonationStatus.REFUNDED]: [],
};

function toSafeDonation(donation: Donation, includeAdminFields = false) {
  const safe: Record<string, unknown> = {
    id: donation.id,
    amount: donation.amount,
    paymentMethod: donation.paymentMethod,
    transactionId: donation.transactionId,
    donationDate: donation.donationDate,
    cause: donation.cause,
    status: donation.status,
    receiptNumber: donation.receiptNumber,
    remarks: donation.remarks,
    createdAt: donation.createdAt,
  };
  if (donation.donorUserId) {
    safe.donor = {
      linked: true,
      id: donation.donorUserId,
      fullName: donation.donorUser?.fullName ?? donation.donorName,
      email: donation.donorUser?.email ?? undefined,
    };
  } else {
    safe.donor = {
      linked: false,
      fullName: donation.donorName,
      email: donation.donorEmail,
      mobile: donation.donorMobile,
    };
  }
  if (includeAdminFields) {
    safe.createdBy = donation.createdBy;
  }
  return safe;
}

@Injectable()
export class DonationsService {
  private readonly logger = new Logger("Donations");

  constructor(
    @InjectRepository(Donation)
    private readonly donationsRepo: Repository<Donation>,
    private readonly usersService: UsersService,
  ) {}

  // Donation financials (ledger postings, receipt issuing) are owned by the
  // senior accounting system - this module only records and displays.

  async createLinked(actor: AuthenticatedUser, dto: CreateDonationDto) {
    const user = await this.usersService.findEntityById(actor.id);
    const donation = await this.donationsRepo.save(
      this.donationsRepo.create({
        donorUserId: actor.id,
        donorName: user?.fullName ?? actor.email,
        amount: dto.amount.toFixed(2),
        paymentMethod: dto.paymentMethod,
        transactionId: dto.transactionId?.trim() || null,
        donationDate: dto.donationDate
          ? new Date(dto.donationDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        cause: dto.cause?.trim() || null,
        status: DonationStatus.PENDING,
        remarks: dto.remarks?.trim() || null,
        createdBy: actor.id,
      }),
    );
    this.logger.log(`Linked donation recorded: ${donation.id} by ${actor.id}`);
    return { message: "Donation recorded", data: toSafeDonation(donation) };
  }

  async createGuest(dto: CreateGuestDonationDto) {
    const donation = await this.donationsRepo.save(
      this.donationsRepo.create({
        donorUserId: null,
        donorName: dto.donorName.trim(),
        donorEmail: dto.donorEmail?.trim() || null,
        donorMobile: dto.donorMobile?.trim() || null,
        amount: dto.amount.toFixed(2),
        paymentMethod: dto.paymentMethod,
        transactionId: dto.transactionId?.trim() || null,
        donationDate: dto.donationDate
          ? new Date(dto.donationDate).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
        cause: dto.cause?.trim() || null,
        status: DonationStatus.PENDING,
        remarks: dto.remarks?.trim() || null,
        createdBy: null,
      }),
    );
    this.logger.log(`Guest donation recorded: ${donation.id}`);
    return { message: "Guest donation recorded", data: toSafeDonation(donation) };
  }

  async listMine(actor: AuthenticatedUser, query: ListDonationsQueryDto) {
    const qb = this.donationsRepo
      .createQueryBuilder("d")
      .where("d.donorUserId = :userId", { userId: actor.id })
      .orderBy("d.createdAt", "DESC")
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 10))
      .take(query.limit ?? 10);

    if (query.status) {
      qb.andWhere("d.status = :status", { status: query.status });
    }
    const [donations, total] = await qb.getManyAndCount();
    return {
      message: "Your donations fetched",
      data: {
        items: donations.map((d) => toSafeDonation(d)),
        meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
      },
    };
  }

  async listAll(query: ListDonationsQueryDto) {
    const qb = this.donationsRepo
      .createQueryBuilder("d")
      .leftJoinAndSelect("d.donorUser", "donor")
      .orderBy("d.createdAt", "DESC")
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 10))
      .take(query.limit ?? 10);

    if (query.status) {
      qb.andWhere("d.status = :status", { status: query.status });
    }
    if (query.method) {
      qb.andWhere("d.paymentMethod = :method", { method: query.method });
    }
    if (query.fromDate) {
      qb.andWhere("d.donationDate >= :fromDate", { fromDate: query.fromDate.slice(0, 10) });
    }
    if (query.toDate) {
      qb.andWhere("d.donationDate <= :toDate", { toDate: query.toDate.slice(0, 10) });
    }
    if (query.search) {
      qb.andWhere(
        "(LOWER(d.donorName) LIKE :search OR LOWER(d.donorEmail) LIKE :search OR LOWER(donor.email) LIKE :search)",
        { search: `%${query.search.toLowerCase()}%` },
      );
    }

    const [donations, total] = await qb.getManyAndCount();
    const receivedAmount = donations
      .filter((d) => d.status === DonationStatus.RECEIVED)
      .reduce((sum, d) => sum + Number(d.amount), 0);
    return {
      message: "Donations fetched",
      data: {
        items: donations.map((d) => toSafeDonation(d, true)),
        meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
        // Page-only received sum; authoritative totals live in senior accounting
        pageReceivedAmount: receivedAmount.toFixed(2),
      },
    };
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const donation = await this.donationsRepo.findOne({
      where: { id },
      relations: { donorUser: true },
    });
    if (!donation) {
      throw new NotFoundException("Donation not found");
    }
    const isAdmin = actor.role === "ADMIN";
    if (!isAdmin && donation.donorUserId !== actor.id) {
      // Non-admins must not learn about other donors' donations
      throw new NotFoundException("Donation not found");
    }
    return {
      message: "Donation fetched",
      data: toSafeDonation(donation, isAdmin),
    };
  }

  async updateStatus(actor: AuthenticatedUser, id: string, dto: UpdateDonationStatusDto) {
    const donation = await this.donationsRepo.findOne({ where: { id } });
    if (!donation) {
      throw new NotFoundException("Donation not found");
    }
    const allowed = ALLOWED_TRANSITIONS[donation.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Invalid status transition: ${donation.status} -> ${dto.status}`);
    }
    donation.status = dto.status;
    if (dto.receiptNumber !== undefined) {
      // Display-only reference; the senior accounting system owns real receipts
      donation.receiptNumber = dto.receiptNumber.trim() || null;
    }
    if (dto.remarks !== undefined) {
      donation.remarks = dto.remarks.trim() || null;
    }
    await this.donationsRepo.save(donation);
    this.logger.log(`Donation ${donation.id} -> ${donation.status} by ${actor.id}`);
    return { message: "Donation status updated", data: toSafeDonation(donation, true) };
  }
}