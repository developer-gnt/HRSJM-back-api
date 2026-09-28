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
import { MembershipStatus } from '../../../common/enums/membership-status.enum';
import { AssistanceRequestStatus } from '../../assistance/entities/assistance-request.entity';
import { TicketStatus } from '../../support/entities/support-ticket.entity';
import { ListMembersQueryDto } from '../dto/list-members.dto';

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

    return {
      users: { total: totalUsers },
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
      },
      tickets: {
        total: totalTickets,
        open: openTickets,
      },
      donations: {
        total: totalDonations,
        receivedAmount: parseFloat(donationSumRow?.total || '0'),
      },
    };
  }

  async listMembers(query: ListMembersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'userRole')
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
