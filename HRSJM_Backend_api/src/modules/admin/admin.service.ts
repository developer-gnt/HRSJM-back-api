import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Not, Repository } from "typeorm";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { UsersService, toSafeUser } from "../users/users.service";
import { User, UserRole, UserStatus } from "../users/entities/user.entity";
import {
  Membership,
  MembershipCategory,
  MembershipStatus,
} from "../memberships/entities/membership.entity";
import {
  RenewalPaymentStatus,
  RenewalRequest,
  RenewalStatus,
} from "../renewals/entities/renewal-request.entity";
import { AssistanceRequest, AssistanceRequestStatus } from "../assistance/entities/assistance-request.entity";
import { SupportTicket, TicketStatus } from "../support/entities/support-ticket.entity";
import { Document } from "../documents/entities/document.entity";
import { DeliveryStatus, NotificationRecipient } from "../notifications/entities/notification-recipient.entity";
import { ListMembersQueryDto } from "./dto/list-members.query.dto";

// Roles surfaced in the member list when no role filter is given
const MEMBER_ROLES = [UserRole.MEMBER, UserRole.DONOR, UserRole.DONATION_SEEKER];

function countMap(
  rows: Array<{ status: string; count: string }>,
  statuses: string[],
): Record<string, number> {
  const map = Object.fromEntries(statuses.map((s) => [s, 0]));
  for (const row of rows) {
    map[row.status] = Number(row.count);
  }
  return map;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Membership)
    private readonly membershipsRepo: Repository<Membership>,
    @InjectRepository(RenewalRequest)
    private readonly renewalsRepo: Repository<RenewalRequest>,
    @InjectRepository(AssistanceRequest)
    private readonly assistanceRepo: Repository<AssistanceRequest>,
    @InjectRepository(SupportTicket)
    private readonly ticketsRepo: Repository<SupportTicket>,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    @InjectRepository(NotificationRecipient)
    private readonly recipientsRepo: Repository<NotificationRecipient>,
    private readonly usersService: UsersService,
  ) {}

  async dashboard() {
    const [
      usersByRoleRows,
      usersByStatusRows,
      membershipStatusRows,
      membershipCategoryRows,
      expiringCount,
      renewalStatusRows,
      renewalPaymentRows,
      collectedRow,
      assistanceStatusRows,
      ticketStatusRows,
    ] = await Promise.all([
      this.usersRepo
        .createQueryBuilder("user")
        .select("user.role", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("user.role")
        .getRawMany(),
      this.usersRepo
        .createQueryBuilder("user")
        .select("user.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("user.status")
        .getRawMany(),
      this.membershipsRepo
        .createQueryBuilder("m")
        .select("m.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("m.status")
        .getRawMany(),
      this.membershipsRepo
        .createQueryBuilder("m")
        .select("m.category", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("m.category")
        .getRawMany(),
      this.membershipsRepo
        .createQueryBuilder("m")
        .where("m.status = :status", { status: MembershipStatus.ACTIVE })
        .andWhere("m.expiryDate IS NOT NULL")
        .andWhere("m.expiryDate BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'")
        .getCount(),
      this.renewalsRepo
        .createQueryBuilder("r")
        .select("r.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("r.status")
        .getRawMany(),
      this.renewalsRepo
        .createQueryBuilder("r")
        .select("r.paymentStatus", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("r.paymentStatus")
        .getRawMany(),
      this.renewalsRepo
        .createQueryBuilder("r")
        .select("COALESCE(SUM(r.amount), 0)", "total")
        .where("r.paymentStatus = :status", { status: RenewalPaymentStatus.SUCCESS })
        .getRawOne(),
      this.assistanceRepo
        .createQueryBuilder("a")
        .select("a.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("a.status")
        .getRawMany(),
      this.ticketsRepo
        .createQueryBuilder("t")
        .select("t.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("t.status")
        .getRawMany(),
    ]);

    const usersByRole = countMap(usersByRoleRows, Object.values(UserRole));
    const usersByStatus = countMap(usersByStatusRows, Object.values(UserStatus));
    const membershipsByStatus = countMap(membershipStatusRows, Object.values(MembershipStatus));
    const membershipsByCategory = countMap(membershipCategoryRows, Object.values(MembershipCategory));
    const renewalsByStatus = countMap(renewalStatusRows, Object.values(RenewalStatus));
    const paymentsByStatus = countMap(renewalPaymentRows, Object.values(RenewalPaymentStatus));
    const assistanceByStatus = countMap(assistanceStatusRows, Object.values(AssistanceRequestStatus));
    const ticketsByStatus = countMap(ticketStatusRows, Object.values(TicketStatus));

    return {
      message: "Dashboard aggregates fetched",
      data: {
        users: {
          total: Object.values(usersByRole).reduce((a, b) => a + b, 0),
          byRole: usersByRole,
          byStatus: usersByStatus,
        },
        memberships: {
          total: Object.values(membershipsByStatus).reduce((a, b) => a + b, 0),
          byStatus: membershipsByStatus,
          byCategory: membershipsByCategory,
          expiringIn30Days: expiringCount,
          lifetime: membershipsByCategory[MembershipCategory.LIFETIME] ?? 0,
        },
        renewals: {
          total: Object.values(renewalsByStatus).reduce((a, b) => a + b, 0),
          byStatus: renewalsByStatus,
          payments: {
            byStatus: paymentsByStatus,
            collectedAmount: Number(collectedRow?.total ?? 0),
          },
        },
        assistance: {
          total: Object.values(assistanceByStatus).reduce((a, b) => a + b, 0),
          byStatus: assistanceByStatus,
        },
        tickets: {
          total: Object.values(ticketsByStatus).reduce((a, b) => a + b, 0),
          byStatus: ticketsByStatus,
          open: (ticketsByStatus[TicketStatus.SUBMITTED] ?? 0) + (ticketsByStatus[TicketStatus.UNDER_REVIEW] ?? 0),
        },
        // Donations section lands here with Phase 10
      },
    };
  }

  async listMembers(query: ListMembersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const qb = this.usersRepo
      .createQueryBuilder("user")
      .orderBy("user.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.role) {
      qb.andWhere("user.role = :role", { role: query.role });
    } else {
      qb.andWhere("user.role IN (:...memberRoles)", { memberRoles: MEMBER_ROLES });
    }
    if (query.status) {
      qb.andWhere("user.status = :status", { status: query.status });
    } else {
      qb.andWhere("user.status = :active", { active: UserStatus.ACTIVE });
    }
    if (query.search) {
      qb.andWhere(
        "(LOWER(user.full_name) LIKE :search OR LOWER(user.email) LIKE :search)",
        { search: `%${query.search.toLowerCase()}%` },
      );
    }
    if (query.membershipStatus) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = user.id AND m.status = :mstatus)`,
        { mstatus: query.membershipStatus },
      );
    }

    const [users, total] = await qb.getManyAndCount();

    // Latest membership per user on this page (one query, not per-user)
    const memberships = await this.membershipsRepo
      .createQueryBuilder("m")
      .where("m.userId IN (:...ids)", { ids: users.map((u) => u.id) })
      .orderBy("m.createdAt", "DESC")
      .getMany();
    const latestByUser = new Map<string, Membership>();
    for (const membership of memberships) {
      if (!latestByUser.has(membership.userId)) {
        latestByUser.set(membership.userId, membership);
      }
    }

    return {
      message: "Members fetched",
      data: {
        items: users.map((user) => {
          const membership = latestByUser.get(user.id);
          return {
            ...toSafeUser(user),
            membership: membership
              ? {
                  membershipNumber: membership.membershipNumber,
                  category: membership.category,
                  status: membership.status,
                  joiningDate: membership.joiningDate,
                  expiryDate: membership.expiryDate,
                }
              : null,
          };
        }),
        meta: buildPaginationMeta(total, page, limit),
      },
    };
  }

  async getMember360(id: string) {
    const user = await this.usersService.findEntityById(id);
    if (!user) {
      throw new NotFoundException("Member not found");
    }

    const memberships = await this.membershipsRepo.find({
      where: { userId: id },
      order: { createdAt: "DESC" },
    });
    const membershipIds = memberships.map((m) => m.id);

    const [renewals, renewalStatusRows, assistanceRequests, tickets, docCount, documents, readCount, unreadCount] =
      await Promise.all([
        membershipIds.length > 0
          ? this.renewalsRepo.find({
              where: { membershipId: In(membershipIds) },
              order: { createdAt: "DESC" },
              take: 20,
            })
          : Promise.resolve([]),
        membershipIds.length > 0
          ? this.renewalsRepo
              .createQueryBuilder("r")
              .select("r.status", "status")
              .addSelect("COUNT(*)", "count")
              .where("r.membershipId IN (:...ids)", { ids: membershipIds })
              .groupBy("r.status")
              .getRawMany()
          : Promise.resolve([]),
        this.assistanceRepo.find({
          where: { userId: id },
          order: { createdAt: "DESC" },
          take: 20,
        }),
        this.ticketsRepo.find({
          where: { userId: id },
          order: { createdAt: "DESC" },
          take: 20,
        }),
        this.documentsRepo.count({ where: { userId: id, isArchived: false } }),
        this.documentsRepo.find({
          where: { userId: id, isArchived: false },
          order: { createdAt: "DESC" },
          take: 10,
        }),
        this.recipientsRepo.count({
          where: { userId: id, deliveryStatus: DeliveryStatus.SENT, readAt: Not(IsNull()) },
        }),
        this.recipientsRepo.count({
          where: { userId: id, deliveryStatus: DeliveryStatus.SENT, readAt: IsNull() },
        }),
      ]);

    return {
      message: "Member 360 view fetched",
      data: {
        profile: toSafeUser(user),
        memberships: memberships.map((m) => ({
          membershipNumber: m.membershipNumber,
          category: m.category,
          status: m.status,
          joiningDate: m.joiningDate,
          expiryDate: m.expiryDate,
          feeAmount: m.feeAmount,
          createdAt: m.createdAt,
        })),
        renewals: {
          items: renewals.map((r) => ({
            id: r.id,
            periodYears: r.periodYears,
            amount: r.amount,
            paymentMethod: r.paymentMethod,
            paymentStatus: r.paymentStatus,
            status: r.status,
            newExpiry: r.newExpiry,
            receiptNumber: r.receiptNumber,
            createdAt: r.createdAt,
          })),
          countsByStatus: countMap(renewalStatusRows, Object.values(RenewalStatus)),
        },
        assistanceRequests: {
          items: assistanceRequests.map((a) => ({
            id: a.id,
            fullName: a.fullName,
            requestedAmount: a.requestedAmount,
            status: a.status,
            reviewedAt: a.reviewedAt,
            createdAt: a.createdAt,
          })),
        },
        tickets: {
          items: tickets.map((t) => ({
            id: t.id,
            subject: t.subject,
            status: t.status,
            resolvedAt: t.resolvedAt,
            createdAt: t.createdAt,
          })),
        },
        documents: {
          total: docCount,
          items: documents.map((d) => ({
            id: d.id,
            documentName: d.documentName,
            documentType: d.documentType,
            relatedEntityType: d.relatedEntityType,
            createdAt: d.createdAt,
          })),
        },
        notifications: { read: readCount, unread: unreadCount },
      },
    };
  }
}