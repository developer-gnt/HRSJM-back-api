import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { AssistanceService } from "./assistance.service";
import { DocumentsService } from "../documents/documents.service";
import { AssistanceRequest, AssistanceRequestStatus } from "./entities/assistance-request.entity";
import { UserRole } from "../users/entities/user.entity";

const member = { id: "u-member", email: "m@example.com", role: UserRole.MEMBER };
const admin = { id: "u-admin", email: "a@example.com", role: UserRole.ADMIN };
const stranger = { id: "u-stranger", email: "s@example.com", role: UserRole.DONOR };

const makeRequest = (overrides: Partial<AssistanceRequest> = {}): AssistanceRequest =>
  ({
    id: "ar-1",
    userId: member.id,
    fullName: "Member Name",
    mobile: "+8801700000000",
    email: null,
    requestedAmount: "1000.00",
    reason: "Need help",
    description: null,
    status: AssistanceRequestStatus.PENDING,
    adminRemark: null,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  }) as unknown as AssistanceRequest;

const dto = {
  fullName: "Member Name",
  mobile: "+8801700000000",
  requestedAmount: 1000,
  reason: "Need help",
} as never;

describe("AssistanceService", () => {
  let service: AssistanceService;
  let assistanceRepo: Record<string, jest.Mock>;
  let documentsService: { upload: jest.Mock };

  beforeEach(() => {
    assistanceRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...makeRequest(), ...x })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    documentsService = { upload: jest.fn(async () => ({ message: "ok", data: { id: "d-1" } })) };
    service = new AssistanceService(
      assistanceRepo as unknown as Repository<AssistanceRequest>,
      documentsService as unknown as DocumentsService,
    );
  });

  describe("create", () => {
    it("starts requests in PENDING state", async () => {
      const result = await service.create(member, dto);
      expect(result.data.status).toBe(AssistanceRequestStatus.PENDING);
      expect((result.data as Record<string, unknown>).userId).toBeUndefined(); // safe shape hides the FK
    });
  });

  describe("getForActor (ownership)", () => {
    it("blocks strangers (403)", async () => {
      assistanceRepo.findOne.mockResolvedValue(makeRequest());
      await expect(service.getById(stranger, "ar-1")).rejects.toThrow(ForbiddenException);
    });

    it("allows admins with owner info", async () => {
      assistanceRepo.findOne.mockResolvedValue(
        makeRequest({ user: { id: member.id, fullName: "M", email: "m@example.com" } as never }),
      );
      const result = await service.getById(admin, "ar-1");
      expect((result.data as { owner?: { id: string } }).owner?.id).toBe(member.id);
    });

    it("throws 404 for unknown ids", async () => {
      assistanceRepo.findOne.mockResolvedValue(null);
      await expect(service.getById(member, "nope")).rejects.toThrow(NotFoundException);
    });
  });

  describe("updateStatus (lifecycle)", () => {
    it("admin moves PENDING -> UNDER_REVIEW with remark", async () => {
      assistanceRepo.findOne.mockResolvedValue(makeRequest());
      const result = await service.updateStatus(admin, "ar-1", {
        status: AssistanceRequestStatus.UNDER_REVIEW,
        adminRemark: "checking",
      } as never);
      expect(result.data.status).toBe(AssistanceRequestStatus.UNDER_REVIEW);
      expect(result.data.adminRemark).toBe("checking");
      expect(result.data.reviewedAt).toBeDefined();
    });

    it("admin approves", async () => {
      assistanceRepo.findOne.mockResolvedValue(
        makeRequest({ status: AssistanceRequestStatus.UNDER_REVIEW }),
      );
      const result = await service.updateStatus(admin, "ar-1", {
        status: AssistanceRequestStatus.APPROVED,
      } as never);
      expect(result.data.status).toBe(AssistanceRequestStatus.APPROVED);
    });

    it("locks terminal states", async () => {
      assistanceRepo.findOne.mockResolvedValue(makeRequest({ status: AssistanceRequestStatus.APPROVED }));
      await expect(
        service.updateStatus(admin, "ar-1", { status: AssistanceRequestStatus.REJECTED } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects invalid jumps (PENDING -> APPROVED is allowed by design; CLOSED -> anything is not)", async () => {
      assistanceRepo.findOne.mockResolvedValue(makeRequest({ status: AssistanceRequestStatus.CLOSED }));
      await expect(
        service.updateStatus(admin, "ar-1", { status: AssistanceRequestStatus.UNDER_REVIEW } as never),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("attachDocument", () => {
    it("uploads on behalf of the requester (ownership preserved)", async () => {
      assistanceRepo.findOne.mockResolvedValue(makeRequest());
      const pdf = { originalname: "s.pdf", mimetype: "application/pdf", size: 10, buffer: Buffer.from("x") };
      await service.attachDocument(member, "ar-1", pdf as never, { documentName: "Proof" });
      const uploadDto = documentsService.upload.mock.calls[0][2];
      expect(uploadDto.ownerId).toBe(member.id);
      expect(uploadDto.relatedEntityId).toBe("ar-1");
    });

    it("enforces ownership before upload", async () => {
      assistanceRepo.findOne.mockResolvedValue(makeRequest());
      await expect(
        service.attachDocument(stranger, "ar-1", undefined, {}),
      ).rejects.toThrow(ForbiddenException);
      expect(documentsService.upload).not.toHaveBeenCalled();
    });
  });
});
