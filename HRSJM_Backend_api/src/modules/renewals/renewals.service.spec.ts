import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Repository } from "typeorm";
import { RenewalsService } from "./renewals.service";
import { ApiConfigService } from "../../shared/helpers/api-config.service";
import { Membership, MembershipStatus } from "../memberships/entities/membership.entity";
import {
  RenewalPaymentMethod,
  RenewalPaymentStatus,
  RenewalRequest,
  RenewalStatus,
} from "./entities/renewal-request.entity";
import { UserRole } from "../users/entities/user.entity";

const year = new Date().getFullYear();

const makeMembership = (overrides: Partial<Membership> = {}): Membership =>
  ({
    id: "m-1",
    membershipNumber: `HRSJM-${year}-00001`,
    userId: "u-member",
    status: MembershipStatus.ACTIVE,
    expiryDate: `${year + 1}-01-01`,
    ...overrides,
  }) as unknown as Membership;

const makeRenewal = (overrides: Partial<RenewalRequest> = {}): RenewalRequest =>
  ({
    id: "r-1",
    membershipId: "m-1",
    requestedBy: "u-member",
    periodYears: 1,
    amount: "500.00",
    paymentMethod: "CASH",
    paymentStatus: RenewalPaymentStatus.PENDING,
    status: RenewalStatus.PENDING,
    ...overrides,
  }) as unknown as RenewalRequest;

const actor = { id: "u-member", email: "a@example.com", role: UserRole.MEMBER };
const admin = { id: "u-admin", email: "admin@example.com", role: UserRole.ADMIN };

describe("RenewalsService", () => {
  let service: RenewalsService;
  let renewalsRepo: Record<string, jest.Mock>;
  let membershipRepo: Record<string, jest.Mock>;
  let config: { renewalFeePerYear: string; renewalAllowedPeriods: number[] };

  const qb = () => ({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => null),
  });

  beforeEach(() => {
    renewalsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qb()),
    };
    membershipRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (x) => x),
      createQueryBuilder: jest.fn(() => qb()),
    };
    config = { renewalFeePerYear: "500.00", renewalAllowedPeriods: [1, 2, 5] };
    service = new RenewalsService(
      renewalsRepo as unknown as Repository<RenewalRequest>,
      membershipRepo as unknown as Repository<Membership>,
      config as unknown as ApiConfigService,
    );
  });

  describe("submit", () => {
    const dto = { membershipId: "m-1", periodYears: 1, paymentMethod: RenewalPaymentMethod.CASH };

    it("submits a PENDING renewal with the policy amount", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership());
      renewalsRepo.findOne.mockResolvedValue(null); // no open renewal

      const result = await service.submit(actor, dto);
      expect(result.data.status).toBe(RenewalStatus.PENDING);
      expect(result.data.amount).toBe("500.00");
      expect(result.data.paymentStatus).toBe(RenewalPaymentStatus.PENDING);
    });

    it("scales the amount with the period (policy-driven)", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership());
      renewalsRepo.findOne.mockResolvedValue(null);
      const result = await service.submit(actor, { ...dto, periodYears: 2 });
      expect(result.data.amount).toBe("1000.00");
    });

    it("rejects disallowed periods", async () => {
      await expect(service.submit(actor, { ...dto, periodYears: 7 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects renewing someone else's membership", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership({ userId: "someone-else" }));
      await expect(service.submit(actor, dto)).rejects.toThrow(ForbiddenException);
    });

    it("allows admins to renew on behalf", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership({ userId: "someone-else" }));
      renewalsRepo.findOne.mockResolvedValue(null);
      const result = await service.submit(admin, dto);
      expect(result.data.status).toBe(RenewalStatus.PENDING);
    });

    it("rejects lifetime memberships", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership({ expiryDate: null }));
      await expect(service.submit(actor, dto)).rejects.toThrow("Lifetime memberships");
    });

    it("rejects ineligible statuses (e.g. CANCELLED)", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership({ status: MembershipStatus.CANCELLED }));
      await expect(service.submit(actor, dto)).rejects.toThrow(BadRequestException);
    });

    it("rejects a second pending renewal (409)", async () => {
      membershipRepo.findOne.mockResolvedValue(makeMembership());
      renewalsRepo.findOne.mockResolvedValue(makeRenewal());
      await expect(service.submit(actor, dto)).rejects.toThrow(ConflictException);
    });

    it("rejects unknown memberships (404)", async () => {
      membershipRepo.findOne.mockResolvedValue(null);
      await expect(service.submit(actor, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe("approve / reject", () => {
    it("approves a PENDING renewal and stamps the reviewer", async () => {
      renewalsRepo.findOne.mockResolvedValue(makeRenewal());
      const result = await service.approve(admin, "r-1", { adminRemark: "ok" });
      expect(result.data.status).toBe(RenewalStatus.APPROVED);
      expect(result.data.reviewedAt).toBeDefined();
    });

    it("rejects invalid transitions (ACTIVE -> APPROVED)", async () => {
      renewalsRepo.findOne.mockResolvedValue(makeRenewal({ status: RenewalStatus.ACTIVE }));
      await expect(service.approve(admin, "r-1", {})).rejects.toThrow(BadRequestException);
    });

    it("rejects a PENDING renewal with a remark", async () => {
      renewalsRepo.findOne.mockResolvedValue(makeRenewal());
      const result = await service.reject(admin, "r-1", { adminRemark: "documents missing" });
      expect(result.data.status).toBe(RenewalStatus.REJECTED);
      expect(result.data.adminRemark).toBe("documents missing");
    });

    it("throws 404 for unknown ids", async () => {
      renewalsRepo.findOne.mockResolvedValue(null);
      await expect(service.approve(admin, "nope", {})).rejects.toThrow(NotFoundException);
    });
  });

  describe("activate", () => {
    it("extends expiry from the later of (current expiry, today) and issues a receipt number", async () => {
      const membership = makeMembership({ expiryDate: `${year + 1}-01-01` });
      renewalsRepo.findOne.mockResolvedValue(
        makeRenewal({ status: RenewalStatus.APPROVED, paymentStatus: RenewalPaymentStatus.SUCCESS }),
      );
      membershipRepo.findOne.mockResolvedValue(membership);

      const result = await service.activate(admin, "r-1");
      expect(result.data.status).toBe(RenewalStatus.ACTIVE);
      expect(result.data.receiptNumber).toMatch(/^RCV-\d{4}-\d{5}$/);
      expect(result.data.previousExpiry).toBe(`${year + 1}-01-01`);
      // anniversary minus 1ms -> covered through the inclusive last day
      expect(membership.expiryDate).toBe(`${year + 1}-12-31`);
    });

    it("reactivates an EXPIRED membership on activation", async () => {
      const membership = makeMembership({
        status: MembershipStatus.EXPIRED,
        expiryDate: "2020-01-01",
      });
      renewalsRepo.findOne.mockResolvedValue(
        makeRenewal({ status: RenewalStatus.APPROVED, paymentStatus: RenewalPaymentStatus.SUCCESS }),
      );
      membershipRepo.findOne.mockResolvedValue(membership);

      const result = await service.activate(admin, "r-1");
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(result.data.previousExpiry).toBe("2020-01-01");
      // expired base -> counted from today
      expect(result.data.newExpiry).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("requires payment SUCCESS before activation", async () => {
      renewalsRepo.findOne.mockResolvedValue(
        makeRenewal({ status: RenewalStatus.APPROVED, paymentStatus: RenewalPaymentStatus.PENDING }),
      );
      await expect(service.activate(admin, "r-1")).rejects.toThrow("Payment must be marked SUCCESS");
    });

    it("requires approval first (PENDING -> ACTIVE forbidden)", async () => {
      renewalsRepo.findOne.mockResolvedValue(makeRenewal());
      await expect(service.activate(admin, "r-1")).rejects.toThrow("Invalid status transition");
    });
  });

  describe("markPayment", () => {
    it("updates payment status", async () => {
      renewalsRepo.findOne.mockResolvedValue(makeRenewal());
      const result = await service.markPayment("r-1", {
        paymentStatus: RenewalPaymentStatus.SUCCESS,
        transactionId: "TRX-1",
      });
      expect(result.data.paymentStatus).toBe(RenewalPaymentStatus.SUCCESS);
      expect(result.data.transactionId).toBe("TRX-1");
    });

    it("refuses payments on already-active renewals", async () => {
      renewalsRepo.findOne.mockResolvedValue(makeRenewal({ status: RenewalStatus.ACTIVE }));
      await expect(
        service.markPayment("r-1", { paymentStatus: RenewalPaymentStatus.FAILED }),
      ).rejects.toThrow("Payment already applied");
    });
  });

  describe("getForActor", () => {
    it("enforces ownership for members", async () => {
      renewalsRepo.findOne.mockResolvedValue(
        makeRenewal({ membership: makeMembership({ userId: "someone-else" }) }),
      );
      await expect(service.getForActor(actor, "r-1")).rejects.toThrow(ForbiddenException);
    });

    it("lets admins view any renewal", async () => {
      renewalsRepo.findOne.mockResolvedValue(
        makeRenewal({ membership: makeMembership({ userId: "someone-else" }) }),
      );
      const renewal = await service.getForActor(admin, "r-1");
      expect(renewal.id).toBe("r-1");
    });
  });
});
