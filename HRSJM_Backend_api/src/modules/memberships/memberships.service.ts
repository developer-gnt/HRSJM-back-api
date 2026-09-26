import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { UsersService } from "../users/users.service";
import { Membership, MembershipCategory, MembershipStatus } from "./entities/membership.entity";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { ListMembershipsQueryDto } from "./dto/list-memberships.query.dto";

const BLOCKING_STATUSES = [MembershipStatus.PENDING, MembershipStatus.ACTIVE];

@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepo: Repository<Membership>,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateMembershipDto) {
    const user = await this.usersService.findEntityById(dto.userId);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const existing = await this.membershipRepo.findOne({
      where: { userId: dto.userId, status: In(BLOCKING_STATUSES) },
    });
    if (existing) {
      throw new ConflictException("User already has a pending or active membership");
    }

    const category = dto.category;
    const joiningDate = dto.joiningDate ?? new Date().toISOString().slice(0, 10);
    const feeAmount =
      dto.feeAmount ??
      (category === MembershipCategory.LIFETIME ? "10000.00" : "500.00");

    const membership = this.membershipRepo.create({
      userId: dto.userId,
      category,
      status: MembershipStatus.ACTIVE,
      joiningDate,
      expiryDate: category === MembershipCategory.LIFETIME ? null : this.plusOneYear(joiningDate),
      feeAmount,
    });
    membership.membershipNumber = await this.nextMembershipNumber();
    await this.membershipRepo.save(membership);

    return { message: "Membership registered", data: this.toSafeMembership(membership) };
  }

  async list(query: ListMembershipsQueryDto) {
    const qb = this.membershipRepo
      .createQueryBuilder("membership")
      .leftJoinAndSelect("membership.user", "user")
      .orderBy("membership.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) {
      qb.andWhere("membership.status = :status", { status: query.status });
    }
    if (query.userId) {
      qb.andWhere("membership.userId = :userId", { userId: query.userId });
    }

    const [memberships, total] = await qb.getManyAndCount();
    return {
      message: "Memberships fetched",
      data: {
        items: memberships.map((m) => this.toSafeMembership(m)),
        meta: buildPaginationMeta(total, query.page, query.limit),
      },
    };
  }

  async getDigitalId(membershipNumber: string) {
    const membership = await this.findByMembershipNumber(membershipNumber);
    return {
      message: "Membership ID fetched",
      data: {
        membershipNumber: membership.membershipNumber,
        category: membership.category,
        status: membership.status,
        joiningDate: membership.joiningDate,
        expiryDate: membership.expiryDate,
        memberName: membership.user.fullName,
      },
    };
  }

  async validate(membershipNumber: string) {
    const membership = await this.findByMembershipNumber(membershipNumber);
    const valid = this.isCurrentlyValid(membership);
    return {
      message: valid ? "Membership is valid" : "Membership is not valid",
      data: {
        valid,
        status: membership.status,
        category: membership.category,
        expiryDate: membership.expiryDate,
        memberName: membership.user.fullName,
        checkedAt: new Date().toISOString(),
      },
    };
  }

  async findByMembershipNumber(membershipNumber: string): Promise<Membership> {
    const membership = await this.membershipRepo.findOne({
      where: { membershipNumber },
      relations: { user: true },
    });
    if (!membership) {
      throw new NotFoundException(`Membership ${membershipNumber} not found`);
    }
    return membership;
  }

  private isCurrentlyValid(membership: Membership): boolean {
    if (membership.status !== MembershipStatus.ACTIVE) {
      return false;
    }
    if (membership.expiryDate === null) {
      return true; // lifetime
    }
    return membership.expiryDate >= new Date().toISOString().slice(0, 10);
  }

  /** HRSJM-<year>-<serial> sequential per calendar year. */
  private async nextMembershipNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `HRSJM-${year}-`;
    const last = await this.membershipRepo
      .createQueryBuilder("membership")
      .where("membership.membership_number LIKE :prefix", { prefix: `${prefix}%` })
      .orderBy("membership.membership_number", "DESC")
      .getOne();

    const lastSerial = last ? Number(last.membershipNumber.split("-").pop()) : 0;
    return `${prefix}${String(lastSerial + 1).padStart(5, "0")}`;
  }

  private plusOneYear(dateIso: string): string {
    const date = new Date(`${dateIso}T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    date.setUTCMilliseconds(date.getUTCMilliseconds() - 1); // inclusive last day
    return date.toISOString().slice(0, 10);
  }

  /** Never expose passwordHash or any other user secrets. */
  private toSafeMembership(m: Membership) {
    return {
      id: m.id,
      membershipNumber: m.membershipNumber,
      category: m.category,
      status: m.status,
      joiningDate: m.joiningDate,
      expiryDate: m.expiryDate,
      feeAmount: m.feeAmount,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      member: m.user
        ? { id: m.user.id, fullName: m.user.fullName, email: m.user.email }
        : undefined,
    };
  }
}