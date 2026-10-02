import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { RenewalRequestEntity } from '../../renewals/entities/renewal-request.entity';
import { AssistanceRequestEntity } from '../../assistance/entities/assistance-request.entity';
import { SupportTicketEntity } from '../../support/entities/support-ticket.entity';
import { DonationEntity } from '../../donations/entities/donation.entity';
import { DocumentEntity } from '../../documents/entities/document.entity';
import { NotificationRecipientEntity, DeliveryStatus } from '../../notifications/entities/notification-recipient.entity';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import { ReceiptEntity } from '../../membership-payments/entities/receipt.entity';
import { AuditLogEntity } from '../../audit/entities/audit-log.entity';
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { AssistanceRequestStatus } from '../../assistance/entities/assistance-request.entity';
import { TicketStatus } from '../../support/entities/support-ticket.entity';
import { ListMembersQueryDto } from '../dto/list-members.dto';

/** Month keys (YYYY-MM) for the last N months, oldest first, ending this month. */
function lastNMonthKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepo: Repository<MembershipEntity>,
    @InjectRepository(RenewalRequestEntity)
    private readonly renewalsRepo: Repository<RenewalRequestEntity>,
    @InjectRepository(AssistanceRequestEntity)
    private readonly assistanceRepo: Repository<AssistanceRequestEntity>,
    @InjectRepository(SupportTicketEntity)
    private readonly ticketsRepo: Repository<SupportTicketEntity>,
    @InjectRepository(DonationEntity)
    private readonly donationsRepo: Repository<DonationEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documentsRepo: Repository<DocumentEntity>,
    @InjectRepository(NotificationRecipientEntity)
    private readonly recipientsRepo: Repository<NotificationRecipientEntity>,
    @InjectRepository(MembershipPaymentEntity)
    private readonly membershipPaymentsRepo: Repository<MembershipPaymentEntity>,
    @InjectRepository(ReceiptEntity)
    private readonly receiptsRepo: Repository<ReceiptEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  async getDashboard() {
    const [
      totalUsers,
      totalMemberships,
      activeMemberships,
      pendingMemberships,
      totalRenewals,
      pendingRenewals,
      totalAssistance,
      pendingAssistance,
      totalTickets,
      openTickets,
      totalDonations,
    ] = await Promise.all([
      this.usersRepo.count(),
      this.membershipsRepo.count(),
      this.membershipsRepo.count({ where: { status: MembershipStatus.ACTIVE } }),
      this.membershipsRepo.count({ where: { status: MembershipStatus.PENDING } }),
      this.renewalsRepo.count(),
      this.renewalsRepo.count({ where: { status: 'PENDING' } }),
      this.assistanceRepo.count(),
      this.assistanceRepo.count({ where: { status: AssistanceRequestStatus.PENDING } }),
      this.ticketsRepo.count(),
      this.ticketsRepo.count({ where: { status: TicketStatus.SUBMITTED } }),
      this.donationsRepo.count(),
    ]);

    const donationSumRow = await this.donationsRepo
      .createQueryBuilder('d')
      .select('SUM(d.amount)', 'total')
      .where('d.status = :status', { status: 'RECEIVED' })
      .getRawOne();

    const renewalSumRow = await this.renewalsRepo
      .createQueryBuilder('r')
      .select('SUM(r.amount)', 'total')
      .where('r.payment_status = :status', { status: 'SUCCESS' })
      .getRawOne();

    // --- Dashboard-chart additions (Phase 4) ---

    const paymentStatuses = ['PENDING', 'SUCCESS', 'FAILED'] as const;
    const [pendingPayments, successPayments, failedPayments] = await Promise.all(
      paymentStatuses.map((status) =>
        this.membershipPaymentsRepo.count({ where: { payment_status: status } }),
      ),
    );

    const assistanceStatuses = Object.values(AssistanceRequestStatus);
    const ticketStatuses = Object.values(TicketStatus);
    const [assistanceCounts, ticketCounts] = await Promise.all([
      Promise.all(
        assistanceStatuses.map((status) =>
          this.assistanceRepo.count({ where: { status } }),
        ),
      ),
      Promise.all(
        ticketStatuses.map((status) =>
          this.ticketsRepo.count({ where: { status } }),
        ),
      ),
    ]);

    const applicationsByStatus = Object.fromEntries(
      assistanceStatuses.map((status, i) => [status, assistanceCounts[i]]),
    ) as Record<AssistanceRequestStatus, number>;
    const ticketsByStatus = Object.fromEntries(
      ticketStatuses.map((status, i) => [status, ticketCounts[i]]),
    ) as Record<TicketStatus, number>;

    // Revenue from issued receipts, split by type (authoritative record of
    // collected money — membership + donation, incl. guest donors).
    const revenueRows = await this.receiptsRepo
      .createQueryBuilder('r')
      .select('r.receipt_type', 'type')
      .addSelect('SUM(r.amount)', 'total')
      .groupBy('r.receipt_type')
      .getRawMany<{ type: string; total: string | null }>();
    const revenueByType = new Map(
      revenueRows.map((row) => [row.type, parseFloat(row.total || '0')]),
    );
    const membershipIncome = revenueByType.get('MEMBERSHIP') ?? 0;
    const donationIncome = revenueByType.get('DONATION') ?? 0;

    // Member growth: cumulative total members at each of the last 6 month ends.
    const monthKeys = lastNMonthKeys(6);
    const monthStart = new Date(
      Number(monthKeys[0].slice(0, 4)),
      Number(monthKeys[0].slice(5, 7)) - 1,
      1,
    );
    const growthRows: Array<{ bucket: string; total: string }> =
      await this.usersRepo
        .createQueryBuilder('u')
        .select(
          "to_char(date_trunc('month', u.created_at), 'YYYY-MM')",
          'bucket',
        )
        .addSelect('count(*)', 'total')
        .where('u.created_at >= :monthStart', { monthStart })
        .groupBy('bucket')
        .orderBy('bucket', 'ASC')
        .getRawMany();

    const growthByMonth = new Map(
      growthRows.map((row) => [row.bucket, Number(row.total)]),
    );
    let cumulative = 0;
    const monthBucketsBefore = monthKeys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      return new Date(year, month - 1, 1);
    });
    const usersBefore = await this.usersRepo
      .createQueryBuilder('u')
      .where('u.created_at < :start', { start: monthBucketsBefore[0] })
      .getCount();
    cumulative = usersBefore;
    const memberGrowth = monthKeys.map((key) => {
      cumulative += growthByMonth.get(key) ?? 0;
      return { month: key, total: cumulative };
    });

    // Month-over-month activity for the KPI growth badges.
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const between = (repo: Repository<any>, column: string) => [
      repo
        .createQueryBuilder('x')
        .where(`x.${column} >= :start`, { start: thisMonthStart })
        .getCount(),
      repo
        .createQueryBuilder('x')
        .where(`x.${column} >= :start AND x.${column} < :end`, {
          start: prevMonthStart,
          end: thisMonthStart,
        })
        .getCount(),
    ];
    const [usersThisMonth, usersPrevMonth] = await Promise.all(
      between(this.usersRepo, 'created_at'),
    );
    const [assistanceThisMonth, assistancePrevMonth] = await Promise.all(
      between(this.assistanceRepo, 'created_at'),
    );
    const [ticketsThisMonth, ticketsPrevMonth] = await Promise.all(
      between(this.ticketsRepo, 'created_at'),
    );
    const [donationsThisMonth, donationsPrevMonth] = await Promise.all(
      between(this.donationsRepo, 'created_at'),
    );

    // Recent activity feed: last 10 audit events.
    const recentAudit = await this.auditRepo.find({
      order: { created_at: 'DESC' },
      take: 10,
    });

    return {
      users: {
        total: totalUsers,
        thisMonth: usersThisMonth,
        prevMonth: usersPrevMonth,
      },
      memberships: {
        total: totalMemberships,
        active: activeMemberships,
        pending: pendingMemberships,
      },
      renewals: {
        total: totalRenewals,
        pending: pendingRenewals,
        collectedAmount: parseFloat(renewalSumRow?.total || '0'),
      },
      assistance: {
        total: totalAssistance,
        pending: pendingAssistance,
        thisMonth: assistanceThisMonth,
        prevMonth: assistancePrevMonth,
      },
      tickets: {
        total: totalTickets,
        open: openTickets,
        thisMonth: ticketsThisMonth,
        prevMonth: ticketsPrevMonth,
      },
      donations: {
        total: totalDonations,
        receivedAmount: parseFloat(donationSumRow?.total || '0'),
        thisMonth: donationsThisMonth,
        prevMonth: donationsPrevMonth,
      },
      membershipPayments: {
        pending: pendingPayments,
        success: successPayments,
        failed: failedPayments,
      },
      applicationsByStatus,
      ticketsByStatus,
      revenue: {
        membershipIncome,
        donationIncome,
        total: membershipIncome + donationIncome,
      },
      memberGrowth,
      recentActivity: recentAudit.map((log) => ({
        id: log.id,
        event: log.event,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        actor_id: log.actor_id,
        created_at: log.created_at,
      })),
    };
  }

  async listMembers(query: ListMembersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.user_roles', 'userRole')
      .leftJoinAndSelect('userRole.role', 'role')
      .orderBy('user.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.role) {
      qb.andWhere('role.name = :role', { role: query.role });
    }
    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        '(LOWER(user.full_name) LIKE :search OR LOWER(user.email) LIKE :search OR user.mobile_number LIKE :search)',
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

    const userIds = users.map((u) => u.id);
    let latestByUser = new Map<string, MembershipEntity>();

    if (userIds.length > 0) {
      const memberships = await this.membershipsRepo
        .createQueryBuilder('m')
        .leftJoinAndSelect('m.category', 'category')
        .where('m.user_id IN (:...userIds)', { userIds })
        .orderBy('m.created_at', 'DESC')
        .getMany();

      for (const mem of memberships) {
        if (!latestByUser.has(mem.user_id)) {
          latestByUser.set(mem.user_id, mem);
        }
      }
    }

    return {
      items: users.map((user) => {
        const membership = latestByUser.get(user.id);
        const { password_hash, ...safeUser } = user;
        return {
          ...safeUser,
          membership: membership
            ? {
                id: membership.id,
                membershipNumber: membership.membership_number,
                category: membership.category?.name,
                status: membership.status,
                startDate: membership.start_date,
                expiryDate: membership.expiry_date,
              }
            : null,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getMember360(id: string) {
    const user = await this.usersRepo.findOne({
      where: { id },
      relations: ['roles', 'roles.role'],
    });

    if (!user) {
      throw new NotFoundException({
        message: 'Member not found',
        code: 'USER_NOT_FOUND',
        details: { id },
      });
    }

    const memberships = await this.membershipsRepo.find({
      where: { user_id: id },
      relations: ['category'],
      order: { created_at: 'DESC' },
    });
    const membershipIds = memberships.map((m) => m.id);

    const [renewals, assistanceRequests, tickets, docCount, documents, readCount, unreadCount] =
      await Promise.all([
        membershipIds.length > 0
          ? this.renewalsRepo.find({
              where: { membership_id: In(membershipIds) },
              order: { created_at: 'DESC' },
              take: 20,
            })
          : Promise.resolve([]),
        this.assistanceRepo.find({
          where: { user_id: id },
          order: { created_at: 'DESC' },
          take: 20,
        }),
        this.ticketsRepo.find({
          where: { user_id: id },
          order: { created_at: 'DESC' },
          take: 20,
        }),
        this.documentsRepo.count({ where: { user_id: id, is_archived: false } }),
        this.documentsRepo.find({
          where: { user_id: id, is_archived: false },
          order: { created_at: 'DESC' },
          take: 10,
        }),
        this.recipientsRepo.count({
          where: { user_id: id, delivery_status: DeliveryStatus.SENT, read_at: Not(IsNull()) },
        }),
        this.recipientsRepo.count({
          where: { user_id: id, delivery_status: DeliveryStatus.SENT, read_at: IsNull() },
        }),
      ]);

    const { password_hash, ...safeUser } = user;

    return {
      profile: safeUser,
      memberships: memberships.map((m) => ({
        id: m.id,
        membershipNumber: m.membership_number,
        category: m.category?.name,
        status: m.status,
        startDate: m.start_date,
        expiryDate: m.expiry_date,
        createdAt: m.created_at,
      })),
      renewals: renewals.map((r) => ({
        id: r.id,
        periodYears: r.period_years,
        amount: r.amount,
        paymentMethod: r.payment_method,
        paymentStatus: r.payment_status,
        status: r.status,
        newExpiry: r.new_expiry,
        receiptNumber: r.receipt_number,
        createdAt: r.created_at,
      })),
      assistanceRequests: assistanceRequests.map((a) => ({
        id: a.id,
        fullName: a.full_name,
        requestedAmount: a.requested_amount,
        status: a.status,
        createdAt: a.created_at,
      })),
      tickets: tickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        createdAt: t.created_at,
      })),
      documents: {
        total: docCount,
        items: documents.map((d) => ({
          id: d.id,
          documentName: d.document_name,
          documentType: d.document_type,
          createdAt: d.created_at,
        })),
      },
      notifications: { read: readCount, unread: unreadCount },
    };
  }
}
