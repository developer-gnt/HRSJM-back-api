import { ConflictException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { MembershipsService } from "./memberships.service";
import { UsersService } from "../users/users.service";
import { Membership, MembershipCategory, MembershipStatus } from "./entities/membership.entity";
import { User, UserRole } from "../users/entities/user.entity";

const year = new Date().getFullYear();

const makeMembership = (overrides: Partial<Membership> = {}): Membership =>
  ({
    id: "m-1",
    membershipNumber: `HRSJM-${year}-00001`,
    userId: "u-1",
    category: MembershipCategory.REGULAR,
    status: MembershipStatus.ACTIVE,
    joiningDate: `${year}-01-01`,
    expiryDate: `${year + 1}-01-01`,
    feeAmount: "500.00",
    user: { id: "u-1", fullName: "Aisha Rahman", email: "aisha@example.com" } as User,
    ...overrides,
  }) as unknown as Membership;

describe("MembershipsService", () => {
  let service: MembershipsService;
  let membershipRepo: Record<string, jest.Mock>;
  let usersService: { findEntityById: jest.Mock };

  beforeEach(() => {
    membershipRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...makeMembership(), ...x })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    usersService = { findEntityById: jest.fn() };
    service = new MembershipsService(
      membershipRepo as unknown as Repository<Membership>,
      usersService as unknown as UsersService,
    );
  });

  describe("create", () => {
    const dto = { userId: "u-1", category: MembershipCategory.REGULAR };

    it("registers an ACTIVE membership with a sequential number and one-year expiry", async () => {
      usersService.findEntityById.mockResolvedValue({ id: "u-1" });
      membershipRepo.findOne.mockResolvedValue(null);
      membershipRepo.createQueryBuilder.mockReturnValue({
        where: () => ({ orderBy: () => ({ getOne: async () => null }) }),
      });

      const result = await service.create(dto);
      expect(result.data.status).toBe(MembershipStatus.ACTIVE);
      expect(result.data.membershipNumber).toMatch(new RegExp(`^HRSJM-${year}-00001$`));
      expect(result.data.expiryDate).toBeTruthy();
      expect(result.data.member).toBeUndefined(); // safe shape hides user record
    });

    it("gives LIFETIME members no expiry and the lifetime fee", async () => {
      usersService.findEntityById.mockResolvedValue({ id: "u-1" });
      membershipRepo.findOne.mockResolvedValue(null);
      membershipRepo.createQueryBuilder.mockReturnValue({
        where: () => ({ orderBy: () => ({ getOne: async () => null }) }),
      });

      const result = await service.create({ userId: "u-1", category: MembershipCategory.LIFETIME });
      expect(result.data.expiryDate).toBeNull();
      expect(result.data.feeAmount).toBe("10000.00");
    });

    it("rejects unknown users (404)", async () => {
      usersService.findEntityById.mockResolvedValue(null);
      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it("rejects a second pending/active membership (409)", async () => {
      usersService.findEntityById.mockResolvedValue({ id: "u-1" });
      membershipRepo.findOne.mockResolvedValue(makeMembership());
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe("validate", () => {
    it("reports a valid active membership", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership());
      const result = await service.validate(`HRSJM-${year}-00001`);
      expect(result.data.valid).toBe(true);
      expect(result.data.memberName).toBe("Aisha Rahman");
      expect(result.data.checkedAt).toBeDefined();
    });

    it("fails validation for expired memberships", async () => {
      membershipRepo.findOne.mockResolvedValue(
        makeMembership({ expiryDate: "2000-01-01" }),
      );
      const result = await service.validate(`HRSJM-${year}-00001`);
      expect(result.data.valid).toBe(false);
      expect(result.data.status).toBe(MembershipStatus.ACTIVE); // still active status, expired date
    });

    it("fails validation for non-active status", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership({ status: MembershipStatus.SUSPENDED }));
      const result = await service.validate(`HRSJM-${year}-00001`);
      expect(result.data.valid).toBe(false);
    });

    it("validates lifetime memberships (null expiry) as valid", async () => {
      membershipRepo.findOne.mockResolvedValue(
        makeMembership({ category: MembershipCategory.LIFETIME, expiryDate: null }),
      );
      const result = await service.validate(`HRSJM-${year}-00001`);
      expect(result.data.valid).toBe(true);
    });

    it("throws 404 for unknown numbers", async () => {
      membershipRepo.findOne.mockResolvedValue(null);
      await expect(service.validate("HRSJM-1999-99999")).rejects.toThrow(NotFoundException);
    });
  });

  describe("getDigitalId", () => {
    it("returns the digital ID fields", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership());
      const result = await service.getDigitalId(`HRSJM-${year}-00001`);
      expect(result.data).toEqual({
        membershipNumber: `HRSJM-${year}-00001`,
        category: MembershipCategory.REGULAR,
        status: MembershipStatus.ACTIVE,
        joiningDate: `${year}-01-01`,
        expiryDate: `${year + 1}-01-01`,
        memberName: "Aisha Rahman",
      });
    });
  });
});
