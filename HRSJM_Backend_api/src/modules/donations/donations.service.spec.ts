import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { DonationsService } from "./donations.service";
import { UsersService } from "../users/users.service";
import { Donation, DonationMethod, DonationStatus } from "./entities/donation.entity";
import { CreateDonationDto } from "./dto/donation.dto";
import { UserRole } from "../users/entities/user.entity";

const donor = { id: "u-donor", email: "d@example.com", role: UserRole.DONOR };
const admin = { id: "u-admin", email: "a@example.com", role: UserRole.ADMIN };
const stranger = { id: "u-stranger", email: "s@example.com", role: UserRole.MEMBER };

const makeDonation = (overrides: Partial<Donation> = {}): Donation =>
  ({
    id: "dn-1",
    donorUserId: donor.id,
    donorUser: { id: donor.id, fullName: "Rahim Uddin", email: donor.email } as never,
    donorName: "Rahim Uddin",
    donorEmail: donor.email,
    donorMobile: null,
    amount: "2500.00",
    paymentMethod: "BANK_TRANSFER",
    transactionId: null,
    donationDate: "2026-09-28",
    cause: "Orphan Care",
    status: DonationStatus.PENDING,
    receiptNumber: null,
    remarks: null,
    createdBy: null,
    ...overrides,
  }) as unknown as Donation;

const dto: CreateDonationDto = { amount: 2500, paymentMethod: DonationMethod.BANK_TRANSFER };

describe("DonationsService", () => {
  let service: DonationsService;
  let donationsRepo: Record<string, jest.Mock>;
  let usersService: { findEntityById: jest.Mock };

  beforeEach(() => {
    donationsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...makeDonation(), ...x })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    usersService = { findEntityById: jest.fn(async () => ({ id: donor.id, fullName: "Rahim Uddin" })) };
    service = new DonationsService(
      donationsRepo as unknown as Repository<Donation>,
      usersService as unknown as UsersService,
    );
  });

  describe("createLinked", () => {
    it("links the donation to the authenticated donor", async () => {
      const result = await service.createLinked(donor, dto);
      expect(result.data.donor).toMatchObject({ linked: true, id: donor.id });
      expect(result.data.status).toBe(DonationStatus.PENDING);
      expect(result.data.amount).toBe("2500.00");
    });

    it("defaults the donation date to today", async () => {
      await service.createLinked(donor, dto);
      const created = donationsRepo.create.mock.calls[0][0];
      expect(created.donationDate).toBe(new Date().toISOString().slice(0, 10));
    });
  });

  describe("createGuest", () => {
    it("records a guest donation without a linked user", async () => {
      const result = await service.createGuest({
        ...dto,
        donorName: "Rafiq Mahmood",
        donorEmail: "r@example.com",
      });
      expect(result.data.donor).toMatchObject({ linked: false, fullName: "Rafiq Mahmood" });
      expect(donationsRepo.create.mock.calls[0][0].donorUserId).toBeNull();
    });
  });

  describe("getById (visibility)", () => {
    it("lets the linked donor view their donation", async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation());
      const result = await service.getById(donor, "dn-1");
      expect(result.data.id).toBe("dn-1");
    });

    it("lets admins view any donation with admin fields", async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation());
      const result = await service.getById(admin, "dn-1");
      expect((result.data as Record<string, unknown>).createdBy).toBeDefined();
    });

    it("hides other users' donations behind 404", async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation());
      await expect(service.getById(stranger, "dn-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateStatus (lifecycle)", () => {
    it("PENDING -> RECEIVED with a display-only receipt number", async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation());
      const result = await service.updateStatus(admin, "dn-1", {
        status: DonationStatus.RECEIVED,
        receiptNumber: "RCV-2026-0001",
      });
      expect(result.data.status).toBe(DonationStatus.RECEIVED);
      expect(result.data.receiptNumber).toBe("RCV-2026-0001");
    });

    it("PENDING -> RECEIVED -> REFUNDED is allowed", async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation({ status: DonationStatus.RECEIVED }));
      const result = await service.updateStatus(admin, "dn-1", { status: DonationStatus.REFUNDED });
      expect(result.data.status).toBe(DonationStatus.REFUNDED);
    });

    it("rejects PENDING -> REFUNDED", async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation());
      await expect(
        service.updateStatus(admin, "dn-1", { status: DonationStatus.REFUNDED }),
      ).rejects.toThrow(BadRequestException);
    });

    it("locks terminal states (REFUNDED)", async () => {
      donationsRepo.findOne.mockResolvedValue(makeDonation({ status: DonationStatus.REFUNDED }));
      await expect(
        service.updateStatus(admin, "dn-1", { status: DonationStatus.RECEIVED }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("listMine", () => {
    it("scopes to the donor's own donations", async () => {
      const builder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [[makeDonation()], 1]),
      };
      donationsRepo.createQueryBuilder.mockReturnValue(builder);
      const result = await service.listMine(donor, { page: 1, limit: 10 });
      expect(builder.where).toHaveBeenCalledWith("d.donorUserId = :userId", { userId: donor.id });
      expect(result.data.items[0].donor).toMatchObject({ linked: true });
    });
  });

  describe("listAll", () => {
    it("computes the received amount on the page and admin fields", async () => {
      const builder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [
          [makeDonation({ status: DonationStatus.RECEIVED }), makeDonation({ id: "dn-2", status: DonationStatus.PENDING })],
          2,
        ]),
      };
      donationsRepo.createQueryBuilder.mockReturnValue(builder);
      const result = await service.listAll({ page: 1, limit: 10 });
      expect(result.data.pageReceivedAmount).toBe("2500.00");
      expect(result.data.items.every((d: Record<string, unknown>) => "createdBy" in d)).toBe(true);
    });
  });
});