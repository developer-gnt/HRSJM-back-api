import { NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { AdminService } from "./admin.service";
import { UsersService } from "../users/users.service";
import { User, UserRole, UserStatus } from "../users/entities/user.entity";
import { Membership, MembershipStatus } from "../memberships/entities/membership.entity";
import { RenewalPaymentStatus, RenewalRequest, RenewalStatus } from "../renewals/entities/renewal-request.entity";
import { AssistanceRequest, AssistanceRequestStatus } from "../assistance/entities/assistance-request.entity";
import { SupportTicket, TicketStatus } from "../support/entities/support-ticket.entity";
import { Document } from "../documents/entities/document.entity";
import { Donation, DonationStatus } from "../donations/entities/donation.entity";
import { NotificationRecipient } from "../notifications/entities/notification-recipient.entity";

// The dashboard fires a fixed sequence of group-by queries inside Promise.all;
// each getRawMany call pops the next canned result.
const RAW_QUEUE = [
  [{ status: "MEMBER", count: "2" }, { status: "DONOR", count: "1" }, { status: "ADMIN", count: "1" }], // users by role
  [{ status: "ACTIVE", count: "3" }, { status: "SUSPENDED", count: "1" }], // users by status
  [{ status: "ACTIVE", count: "2" }, { status: "EXPIRED", count: "1" }], // memberships by status
  [{ status: "REGULAR", count: "3" }], // memberships by category
  [{ status: "PENDING", count: "1" }, { status: "ACTIVE", count: "2" }], // renewals by status
  [{ status: "SUCCESS", count: "2" }], // renewal payments
  [{ status: "PENDING", count: "3" }], // assistance
  [{ status: "SUBMITTED", count: "1" }, { status: "RESOLVED", count: "2" }], // tickets
  [{ status: "RECEIVED", count: "1" }, { status: "PENDING", count: "1" }], // donations by status
  [{ status: "CASH", count: "1" }], // donations by method
];

const makeQueryBuilder = (): Record<string, jest.Mock> => {
  const builder: Record<string, jest.Mock> = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => RAW_QUEUE.shift() ?? []),
    getRawOne: jest.fn(async () => ({ total: "1234.50" })),
    getCount: jest.fn(async () => 7),
    getMany: jest.fn(async () => []),
    getManyAndCount: jest.fn(async () => [[], 0]),
  };
  return builder;
};

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: "u-member",
    email: "m@example.com",
    fullName: "Member",
    passwordHash: "h",
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User;

describe("AdminService", () => {
  let service: AdminService;
  let repos: Record<string, Record<string, jest.Mock>>;
  let usersService: { findEntityById: jest.Mock };

  beforeEach(() => {
    const makeRepo = (): Record<string, jest.Mock> => ({
      find: jest.fn(async () => []),
      findOne: jest.fn(async () => null),
      save: jest.fn(async (x) => x),
      count: jest.fn(async () => 0),
      createQueryBuilder: jest.fn(makeQueryBuilder),
    });
    repos = {
      users: makeRepo(),
      memberships: makeRepo(),
      renewals: makeRepo(),
      assistance: makeRepo(),
      tickets: makeRepo(),
      documents: makeRepo(),
      donations: makeRepo(),
      recipients: makeRepo(),
    };
    usersService = { findEntityById: jest.fn(async () => makeUser()) };
    service = new AdminService(
      repos.users as unknown as Repository<User>,
      repos.memberships as unknown as Repository<Membership>,
      repos.renewals as unknown as Repository<RenewalRequest>,
      repos.assistance as unknown as Repository<AssistanceRequest>,
      repos.tickets as unknown as Repository<SupportTicket>,
      repos.documents as unknown as Repository<Document>,
      repos.donations as unknown as Repository<Donation>,
      repos.recipients as unknown as Repository<NotificationRecipient>,
      usersService as unknown as UsersService,
    );
  });

  describe("dashboard", () => {
    it("returns every aggregate section with computed counts", async () => {
      const result = await service.dashboard();
      const data = result.data;
      expect(data.users.byRole).toMatchObject({ MEMBER: 2, DONOR: 1, ADMIN: 1 });
      expect(data.users.total).toBe(4);
      expect(data.users.byStatus).toMatchObject({ ACTIVE: 3, SUSPENDED: 1 });
      expect(data.memberships.byStatus).toMatchObject({ ACTIVE: 2, EXPIRED: 1 });
      expect(data.memberships.expiringIn30Days).toBe(7);
      expect(data.renewals.byStatus).toMatchObject({ PENDING: 1, ACTIVE: 2 });
      expect(data.renewals.payments).toMatchObject({ byStatus: { SUCCESS: 2 }, collectedAmount: 1234.5 });
      expect(data.assistance.byStatus).toMatchObject({ PENDING: 3 });
      expect(data.tickets).toMatchObject({ byStatus: { SUBMITTED: 1, RESOLVED: 2 }, open: 1 });
      expect(data.donations).toMatchObject({ byStatus: { RECEIVED: 1, PENDING: 1 }, receivedAmount: 1234.5, byMethod: { CASH: 1 } });
    });
  });

  describe("listMembers", () => {
    it("excludes admins by default and attaches the latest membership", async () => {
      const userQb = makeQueryBuilder();
      userQb.getManyAndCount.mockResolvedValue([[makeUser()], 1]);
      repos.users.createQueryBuilder.mockReturnValue(userQb);
      const memberships: Membership[] = [
        { id: "m-new", userId: "u-member", membershipNumber: "HRSJM-2026-00009", createdAt: new Date("2026-01-01"), status: MembershipStatus.ACTIVE },
        { id: "m-old", userId: "u-member", membershipNumber: "HRSJM-2025-00001", createdAt: new Date("2025-01-01") },
      ] as unknown as Membership[];
      const mQb = makeQueryBuilder();
      mQb.getMany.mockResolvedValue(memberships);
      repos.memberships.createQueryBuilder.mockReturnValue(mQb);

      const result = await service.listMembers({ page: 1, limit: 10 });
      expect(userQb.andWhere).toHaveBeenCalledWith("user.role IN (:...memberRoles)", {
        memberRoles: [UserRole.MEMBER, UserRole.DONOR, UserRole.DONATION_SEEKER],
      });
      expect(result.data.items[0].membership?.membershipNumber).toBe("HRSJM-2026-00009"); // newest wins
      expect(result.data.items[0]).not.toHaveProperty("passwordHash");
    });

    it("respects explicit role/status/membership filters", async () => {
      const userQb = makeQueryBuilder();
      repos.users.createQueryBuilder.mockReturnValue(userQb);
      await service.listMembers({ page: 1, limit: 10, role: UserRole.DONOR, status: UserStatus.SUSPENDED, membershipStatus: MembershipStatus.ACTIVE, search: "x" });
      expect(userQb.andWhere).toHaveBeenCalledWith("user.role = :role", { role: UserRole.DONOR });
      expect(userQb.andWhere).toHaveBeenCalledWith("user.status = :status", { status: UserStatus.SUSPENDED });
      expect(userQb.andWhere).toHaveBeenCalledWith(
        `EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = user.id AND m.status = :mstatus)`,
        { mstatus: MembershipStatus.ACTIVE },
      );
      expect(userQb.andWhere).toHaveBeenCalledWith(expect.stringContaining("LIKE"), { search: "%x%" });
    });
  });

  describe("getMember360", () => {
    it("assembles profile + all sections", async () => {
      repos.memberships.find.mockResolvedValue([
        { membershipNumber: "HRSJM-2026-00001", userId: "u-member", category: "REGULAR", status: "ACTIVE", joiningDate: "2026-01-01", expiryDate: "2027-01-01", feeAmount: "500.00", createdAt: new Date() },
      ]);
      repos.renewals.find.mockResolvedValue([
        { id: "r-1", periodYears: 1, amount: "500.00", paymentMethod: "CASH", paymentStatus: "SUCCESS", status: RenewalStatus.ACTIVE, newExpiry: "2027-01-01", receiptNumber: "RCV-2026-00001", createdAt: new Date() },
      ]);
      const renewalsQb = makeQueryBuilder();
      renewalsQb.getRawMany.mockResolvedValue([{ status: "ACTIVE", count: "1" }]);
      repos.renewals.createQueryBuilder.mockReturnValue(renewalsQb);
      repos.assistance.find.mockResolvedValue([
        { id: "ar-1", fullName: "Member", requestedAmount: "1000.00", status: AssistanceRequestStatus.PENDING, reviewedAt: null, createdAt: new Date() },
      ]);
      repos.tickets.find.mockResolvedValue([
        { id: "t-1", subject: "S", status: TicketStatus.SUBMITTED, resolvedAt: null, createdAt: new Date() },
      ]);
      repos.documents.count.mockResolvedValue(3);
      repos.documents.find.mockResolvedValue([
        { id: "d-1", documentName: "Doc", documentType: "OTHER", relatedEntityType: null, createdAt: new Date() },
      ]);
      repos.recipients.count.mockResolvedValueOnce(2).mockResolvedValueOnce(5); // read, unread

      const result = await service.getMember360("u-member");
      const data = result.data;
      expect(data.profile.email).toBe("m@example.com");
      expect(data.profile).not.toHaveProperty("passwordHash");
      expect(data.memberships[0].membershipNumber).toBe("HRSJM-2026-00001");
      expect(data.renewals.countsByStatus).toMatchObject({ ACTIVE: 1 });
      expect(data.assistanceRequests.items).toHaveLength(1);
      expect(data.tickets.items).toHaveLength(1);
      expect(data.documents).toMatchObject({ total: 3 });
      expect(data.notifications).toEqual({ read: 2, unread: 5 });
    });

    it("throws 404 for unknown members", async () => {
      usersService.findEntityById.mockResolvedValue(null);
      await expect(service.getMember360("nope")).rejects.toThrow(NotFoundException);
    });
  });
});