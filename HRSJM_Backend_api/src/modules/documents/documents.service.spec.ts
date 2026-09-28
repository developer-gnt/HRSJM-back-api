import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { DocumentsService } from "./documents.service";
import { ApiConfigService } from "../../shared/helpers/api-config.service";
import { UsersService } from "../users/users.service";
import { Document, DocumentType, RelatedEntityType } from "./entities/document.entity";
import { UserRole } from "../users/entities/user.entity";

const owner = { id: "u-owner", email: "o@example.com", role: UserRole.MEMBER };
const admin = { id: "u-admin", email: "a@example.com", role: UserRole.ADMIN };
const stranger = { id: "u-stranger", email: "s@example.com", role: UserRole.MEMBER };

const makeDocument = (overrides: Partial<Document> = {}): Document =>
  ({
    id: "d-1",
    userId: owner.id,
    createdBy: owner.id,
    documentName: "My slip",
    documentType: DocumentType.OTHER,
    fileName: "uuid.pdf",
    originalFileName: "slip.pdf",
    mimeType: "application/pdf",
    fileSize: 100,
    storagePath: "uploads/uuid.pdf",
    relatedEntityType: RelatedEntityType.OTHER,
    relatedEntityId: null,
    description: null,
    isArchived: false,
    ...overrides,
  }) as unknown as Document;

const file = (overrides: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({
    originalname: "slip.pdf",
    mimetype: "application/pdf",
    size: 100,
    buffer: Buffer.from("%PDF-1.4 test"),
    ...overrides,
  }) as Express.Multer.File;

describe("DocumentsService", () => {
  let service: DocumentsService;
  let documentsRepo: Record<string, jest.Mock>;
  let usersService: { findEntityById: jest.Mock };
  let configService: { documentMaxSizeBytes: number };

  beforeEach(() => {
    documentsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...makeDocument(), ...x })),
      findOne: jest.fn(),
      count: jest.fn(async () => 0),
      createQueryBuilder: jest.fn(),
    };
    usersService = { findEntityById: jest.fn(async () => ({ id: owner.id })) };
    configService = { documentMaxSizeBytes: 5 * 1024 * 1024 };
    service = new DocumentsService(
      documentsRepo as unknown as Repository<Document>,
      usersService as unknown as UsersService,
      configService as unknown as ApiConfigService,
    );
  });

  describe("upload", () => {
    it("stores with a server-generated UUID filename, original name as metadata", async () => {
      const result = await service.upload(owner, file(), { documentName: "My slip" } as never);
      const created = documentsRepo.create.mock.calls[0][0];
      expect(created.fileName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
      expect(created.fileName).not.toContain("slip");
      expect(created.originalFileName).toBe("slip.pdf");
      expect(created.userId).toBe(owner.id);
      expect(result.data.documentName).toBe("My slip");
    });

    it("rejects missing files", async () => {
      await expect(service.upload(owner, undefined, { documentName: "x" } as never)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects disallowed extensions", async () => {
      const bad = file({ originalname: "evil.exe", mimetype: "application/octet-stream" });
      await expect(service.upload(owner, bad, { documentName: "x" } as never)).rejects.toThrow(
        "extension not allowed",
      );
    });

    it("rejects disallowed MIME types even with a good extension", async () => {
      const sneaky = file({ originalname: "fake.pdf", mimetype: "application/x-msdownload" });
      await expect(service.upload(owner, sneaky, { documentName: "x" } as never)).rejects.toThrow(
        "MIME type not allowed",
      );
    });

    it("rejects oversized files", async () => {
      const big = file({ size: 6 * 1024 * 1024 });
      await expect(service.upload(owner, big, { documentName: "x" } as never)).rejects.toThrow(
        "too large",
      );
    });

    it("lets admins upload on behalf of another owner", async () => {
      await service.upload(
        admin,
        file(),
        { documentName: "On behalf", ownerId: "u-owner" } as never,
      );
      expect(documentsRepo.create.mock.calls[0][0].userId).toBe("u-owner");
    });

    it("ignores ownerId from non-admin uploaders", async () => {
      await service.upload(
        stranger,
        file(),
        { documentName: "Sneaky", ownerId: "u-owner" } as never,
      );
      expect(documentsRepo.create.mock.calls[0][0].userId).toBe(stranger.id);
    });
  });

  describe("getForActor (ownership)", () => {
    it("lets the owner fetch their document", async () => {
      documentsRepo.findOne.mockResolvedValue(makeDocument());
      const result = await service.getById(owner, "d-1");
      expect(result.data.id).toBe("d-1");
    });

    it("lets admins fetch any document with owner info", async () => {
      documentsRepo.findOne.mockResolvedValue(
        makeDocument({ user: { id: owner.id, fullName: "O", email: "o@example.com" } as never }),
      );
      const result = await service.getById(admin, "d-1");
      expect(result.data.owner?.id).toBe(owner.id);
    });

    it("blocks strangers (403)", async () => {
      documentsRepo.findOne.mockResolvedValue(makeDocument());
      await expect(service.getById(stranger, "d-1")).rejects.toThrow(ForbiddenException);
    });

    it("treats archived documents as gone (404)", async () => {
      documentsRepo.findOne.mockResolvedValue(makeDocument({ isArchived: true }));
      await expect(service.getById(owner, "d-1")).rejects.toThrow(NotFoundException);
    });

    it("throws 404 for missing documents", async () => {
      documentsRepo.findOne.mockResolvedValue(null);
      await expect(service.getById(owner, "nope")).rejects.toThrow(NotFoundException);
    });
  });

  describe("archive", () => {
    it("soft-deletes without removing the row", async () => {
      documentsRepo.findOne.mockResolvedValue(makeDocument());
      const result = await service.archive(owner, "d-1");
      expect(result.data.isArchived).toBe(true);
      expect(documentsRepo.save).toHaveBeenCalled();
    });
  });
});
