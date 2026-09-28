import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { NotificationsService } from "./notifications.service";
import { DeliveryStatus, NotificationRecipient } from "./entities/notification-recipient.entity";
import {
  Notification,
  NotificationAudience,
  NotificationStatus,
} from "./entities/notification.entity";
import { User, UserRole, UserStatus } from "../users/entities/user.entity";

const admin = { id: "u-admin", email: "a@example.com", role: UserRole.ADMIN };
const member = { id: "u-member", email: "m@example.com", role: UserRole.MEMBER };

const makeUsers = (overrides: Partial<User> = {}): User[] =>
  [
    { id: "u-1", role: UserRole.MEMBER, status: UserStatus.ACTIVE, fullName: "One" },
    { id: "u-2", role: UserRole.MEMBER, status: UserStatus.ACTIVE, fullName: "Two" },
    { id: "u-3", role: UserRole.DONOR, status: UserStatus.ACTIVE, fullName: "Three" },
  ].map((u) => ({ ...u, ...overrides })) as unknown as User[];

describe("NotificationsService", () => {
  let service: NotificationsService;
  let notificationsRepo: Record<string, jest.Mock>;
  let recipientsRepo: Record<string, jest.Mock>;
  let usersRepo: Record<string, jest.Mock>;

  beforeEach(() => {
    notificationsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: "n-1", createdAt: new Date(), ...x })),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(async (x) => ({ id: "n-1", status: NotificationStatus.SENT, sentAt: new Date(), ...x.where })),
      createQueryBuilder: jest.fn(),
    };
    recipientsRepo = {
      insert: jest.fn(async () => ({})),
      update: jest.fn(async () => ({ affected: 2 })),
      count: jest.fn(async () => 0),
      save: jest.fn(async (x) => x),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    usersRepo = {
      find: jest.fn(async ({ where } = {}) => {
        const idFilter = where?.id;
        // Handle both plain ids and TypeORM In() find operators
        const idList: string[] | null =
          idFilter === undefined
            ? null
            : typeof idFilter === "string"
              ? [idFilter]
              : ((idFilter as { value?: string[] }).value ?? []);
        return makeUsers().filter(
          (u) =>
            u.status === UserStatus.ACTIVE &&
            (!where?.role || u.role === where.role) &&
            (!idList || idList.includes(u.id)),
        );
      }),
    };
    service = new NotificationsService(
      notificationsRepo as unknown as Repository<Notification>,
      recipientsRepo as unknown as Repository<NotificationRecipient>,
      usersRepo as unknown as Repository<User>,
    );
    (service as unknown as { logger: unknown }).logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  const recipientCount = (result: { data: unknown }) =>
    (result.data as { recipientCount?: number }).recipientCount ?? -1;
  const sentStatus = (result: { data: unknown }) =>
    (result.data as { status?: NotificationStatus; sentAt?: Date | null }).status;

  describe("create (immediate send)", () => {
    it("fans out one PENDING->SENT recipient row per active member and marks SENT", async () => {
      const result = await service.create(admin, {
        title: "AGM notice",
        body: "Please attend.",
        targetAudience: NotificationAudience.MEMBERS,
      });
      expect(sentStatus(result)).toBe(NotificationStatus.SENT);
      expect(recipientCount(result)).toBe(2); // only the MEMBER role users
      expect(recipientsRepo.insert).toHaveBeenCalledTimes(1);
      const rows = recipientsRepo.insert.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ userId: "u-1", deliveryStatus: DeliveryStatus.PENDING });
    });

    it("sends to ALL active users for ALL_USERS", async () => {
      const result = await service.create(admin, {
        title: "All hands",
        body: "Hello everyone",
        targetAudience: NotificationAudience.ALL_USERS,
      });
      expect(usersRepo.find).toHaveBeenCalledWith({ where: { status: UserStatus.ACTIVE } });
      expect(recipientCount(result)).toBe(3);
    });

    it("targets specific users for SPECIFIC_USER", async () => {
      const result = await service.create(admin, {
        title: "Direct",
        body: "Personal",
        targetAudience: NotificationAudience.SPECIFIC_USER,
        userIds: ["u-3"],
      });
      expect(recipientCount(result)).toBe(1);
    });

    it("requires userIds for SPECIFIC_USER (400)", async () => {
      await expect(
        service.create(admin, {
          title: "Direct",
          body: "Personal",
          targetAudience: NotificationAudience.SPECIFIC_USER,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects unknown SPECIFIC_USER ids listing them (400)", async () => {
      await expect(
        service.create(admin, {
          title: "Direct",
          body: "Personal",
          targetAudience: NotificationAudience.SPECIFIC_USER,
          userIds: ["u-1", "missing-1"],
        }),
      ).rejects.toThrow("Unknown or inactive user ids: missing-1");
    });

    it("chunks huge audiences", async () => {
      const many = Array.from({ length: 1100 }, (_, i) => ({
        id: `u-${i}`,
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
        fullName: `U${i}`,
      })) as unknown as User[];
      usersRepo.find.mockResolvedValue(many);

      await service.create(admin, {
        title: "Big",
        body: "Big audience",
        targetAudience: NotificationAudience.MEMBERS,
      });
      expect(recipientsRepo.insert).toHaveBeenCalledTimes(3); // 500 + 500 + 100
    });
  });

  describe("create (scheduled)", () => {
    it("stays SCHEDULED with sentAt null when scheduled in the future", async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const result = await service.create(admin, {
        title: "Later",
        body: "Not yet",
        targetAudience: NotificationAudience.DONORS,
        scheduledAt: future,
      } as never);
      expect(result.data.status).toBe(NotificationStatus.SCHEDULED);
      expect(result.data.sentAt).toBeFalsy();
      // recipients still fanned out as PENDING
      expect(recipientsRepo.insert).toHaveBeenCalled();
    });
  });

  describe("markRead", () => {
    it("marks an unread recipient row read", async () => {
      recipientsRepo.findOne.mockResolvedValue({
        id: "nr-1",
        userId: member.id,
        readAt: null,
        notification: { id: "n-1", title: "T", body: "B", sentAt: new Date() },
      });
      const result = await service.markRead(member, "nr-1");
      expect(result.data.readAt).toBeDefined();
      expect(recipientsRepo.save).toHaveBeenCalled();
    });

    it("is idempotent when already read", async () => {
      const readAt = new Date("2026-01-01");
      recipientsRepo.findOne.mockResolvedValue({
        id: "nr-1",
        userId: member.id,
        readAt,
        notification: { id: "n-1" },
      });
      const result = await service.markRead(member, "nr-1");
      expect(result.data.readAt).toBe(readAt);
      expect(recipientsRepo.save).not.toHaveBeenCalled();
    });

    it("hides other users' rows behind 404", async () => {
      recipientsRepo.findOne.mockResolvedValue({ id: "nr-1", userId: "someone-else", readAt: null });
      await expect(service.markRead(member, "nr-1")).rejects.toThrow(NotFoundException);
    });

    it("throws 404 for unknown rows", async () => {
      recipientsRepo.findOne.mockResolvedValue(null);
      await expect(service.markRead(member, "nope")).rejects.toThrow(NotFoundException);
    });
  });

  describe("markAllRead", () => {
    it("updates only unread rows and reports the count", async () => {
      recipientsRepo.update.mockResolvedValue({ affected: 5 });
      const result = await service.markAllRead(member);
      expect(recipientsRepo.update).toHaveBeenCalledWith(
        { userId: member.id, deliveryStatus: DeliveryStatus.SENT, readAt: expect.anything() },
        { readAt: expect.any(Date) },
      );
      expect(result.data.updated).toBe(5);
    });
  });

  describe("processDueSends (ticker)", () => {
    it("dispatches due scheduled notifications", async () => {
      const due = [
        { id: "n-due", status: NotificationStatus.SCHEDULED, scheduledAt: new Date(Date.now() - 1000), targetAudience: NotificationAudience.DONORS, save: undefined },
      ] as unknown as Notification[];
      notificationsRepo.createQueryBuilder.mockReturnValue({
        where: () => ({
          andWhere: () => ({
            andWhere: () => ({
              orderBy: () => ({ take: () => ({ getMany: async () => due }) }),
            }),
          }),
        }),
      });
      usersRepo.find.mockResolvedValue(makeUsers().filter((u) => u.role === UserRole.DONOR));

      await (service as unknown as { processDueSends: () => Promise<void> }).processDueSends();
      expect(recipientsRepo.update).toHaveBeenCalledWith(
        { notificationId: "n-due", deliveryStatus: DeliveryStatus.PENDING },
        { deliveryStatus: DeliveryStatus.SENT },
      );
      expect(notificationsRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: NotificationStatus.SENT }));
    });

    it("does not dispatch while a tick is already running", async () => {
      const internal = service as unknown as { ticking: boolean; processDueSends: () => Promise<void>; notificationsRepo: Record<string, jest.Mock> };
      internal.ticking = true;
      await internal.processDueSends();
      expect(internal.notificationsRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});