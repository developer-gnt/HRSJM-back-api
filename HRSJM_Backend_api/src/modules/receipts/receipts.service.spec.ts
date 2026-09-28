import { NotFoundException } from "@nestjs/common";
import { QueryFailedError, Repository } from "typeorm";
import { ReceiptsService } from "./receipts.service";
import { AccountingBoundaryService } from "../accounting/accounting-boundary.service";
import { DocumentsService } from "../documents/documents.service";
import { IncomeReceipt, ReceiptMethod } from "./entities/income-receipt.entity";
import { Document } from "../documents/entities/document.entity";
import { UserRole } from "../users/entities/user.entity";

const admin = { id: "u-admin", email: "a@example.com", role: UserRole.ADMIN };

const makeReceipt = (overrides: Partial<IncomeReceipt> = {}): IncomeReceipt =>
  ({
    id: "r-1",
    entryNumber: "RCV-2026-0001",
    receiptDate: "2026-09-28",
    receivedFrom: "Abdul Karim",
    incomeAccount: "Membership Fees",
    receivedInAccount: "Cash Box",
    amount: "5000.00",
    method: ReceiptMethod.CASH,
    remarks: null,
    attachmentDocumentId: null,
    createdBy: admin.id,
    createdByUser: { id: admin.id, fullName: "HRSJM Admin", email: admin.email } as never,
    postingRef: "ACC-abc",
    postedAt: new Date(),
    ...overrides,
  }) as unknown as IncomeReceipt;

const dto = {
  receiptDate: "2026-09-28T00:00:00.000Z",
  receivedFrom: "Abdul Karim",
  incomeAccount: "Membership Fees",
  receivedInAccount: "Cash Box",
  amount: 5000,
  method: ReceiptMethod.CASH,
  remarks: "Monthly fee",
};

describe("ReceiptsService", () => {
  let service: ReceiptsService;
  let receiptsRepo: Record<string, jest.Mock>;
  let documentsRepo: Record<string, jest.Mock>;
  let accounting: { postIncomeReceipt: jest.Mock };
  let documentsService: { upload: jest.Mock };

  const qbWithMax = (max: unknown): Record<string, jest.Mock> => ({
    select: jest.fn(() => ({
      where: jest.fn(() => ({ getRawOne: jest.fn(async () => ({ max })) })),
    })),
  });

  beforeEach(() => {
    receiptsRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...makeReceipt(), ...x })),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => qbWithMax(null)),
    };
    documentsRepo = { findOne: jest.fn(async () => null) };
    accounting = {
      postIncomeReceipt: jest.fn(async () => ({
        accepted: true,
        postingRef: "ACC-123",
        postedAt: new Date().toISOString(),
      })),
    };
    documentsService = { upload: jest.fn(async () => ({ message: "ok", data: { id: "d-1" } })) };
    service = new ReceiptsService(
      receiptsRepo as unknown as Repository<IncomeReceipt>,
      documentsRepo as unknown as Repository<Document>,
      accounting as unknown as AccountingBoundaryService,
      documentsService as unknown as DocumentsService,
    );
  });

  describe("create", () => {
    it("assigns the first entry number of the year and forwards the posting", async () => {
      const result = await service.create(admin, dto as never);
      expect(result.data.entryNumber).toBe("RCV-2026-0001");
      expect(result.data.postingRef).toBe("ACC-123");
      expect(result.data.postedAt).toBeDefined();
      expect((result.data as { audit?: { createdByFullName?: string } }).audit?.createdByFullName).toBeDefined();
      const posting = accounting.postIncomeReceipt.mock.calls[0][0];
      expect(posting).toMatchObject({
        entryNumber: "RCV-2026-0001",
        amount: "5000.00",
        incomeAccount: "Membership Fees",
      });
    });

    it("increments from the last entry number of the year", async () => {
      receiptsRepo.createQueryBuilder.mockReturnValue(qbWithMax("RCV-2026-0007"));
      const result = await service.create(admin, dto as never);
      expect(result.data.entryNumber).toBe("RCV-2026-0008");
    });

    it("retries with the next number on a unique violation", async () => {
      const uniqueError = Object.create(QueryFailedError.prototype);
      (uniqueError as unknown as { code: string }).code = "23505";
      let calls = 0;
      receiptsRepo.save = jest.fn(async (x: IncomeReceipt) => {
        calls += 1;
        if (calls === 1) {
          throw uniqueError;
        }
        return { ...makeReceipt(), ...x };
      });
      receiptsRepo.createQueryBuilder.mockReturnValue(qbWithMax("RCV-2026-0003"));

      const result = await service.create(admin, dto as never);
      expect(result.data.entryNumber).toBe("RCV-2026-0004");
      // 1 failing attempt + 1 successful retry + 1 posting-result save
      expect(calls).toBe(3);
    });

    it("normalizes datetime values to YYYY-MM-DD", async () => {
      await service.create(admin, dto as never);
      expect(receiptsRepo.create.mock.calls[0][0].receiptDate).toBe("2026-09-28");
    });

    it("stores the amount with 2 decimals", async () => {
      await service.create(admin, { ...dto, amount: 12000.5 } as never);
      expect(receiptsRepo.create.mock.calls[0][0].amount).toBe("12000.50");
    });
  });

  describe("getById", () => {
    it("returns the receipt with null attachment when none linked", async () => {
      receiptsRepo.findOne.mockResolvedValue(makeReceipt());
      const result = await service.getById("r-1");
      expect(result.data.attachment).toBeNull();
      expect(result.data.postingRef).toBe("ACC-abc");
    });

    it("returns attachment metadata when linked", async () => {
      receiptsRepo.findOne.mockResolvedValue(makeReceipt({ attachmentDocumentId: "d-1" }));
      documentsRepo.findOne.mockResolvedValue({
        id: "d-1",
        documentName: "Cash slip",
        originalFileName: "slip.pdf",
        mimeType: "application/pdf",
        fileSize: 100,
      });
      const result = await service.getById("r-1");
      expect(result.data.attachment?.documentName).toBe("Cash slip");
    });

    it("throws 404 for unknown receipts", async () => {
      receiptsRepo.findOne.mockResolvedValue(null);
      await expect(service.getById("nope")).rejects.toThrow(NotFoundException);
    });
  });

  describe("attachDocument", () => {
    it("uploads via the documents service and links it to the receipt", async () => {
      receiptsRepo.findOne.mockResolvedValue(makeReceipt());
      const pdf = { originalname: "s.pdf", mimetype: "application/pdf", size: 10, buffer: Buffer.from("x") };
      const result = await service.attachDocument(admin, "r-1", pdf as never, { documentName: "Cash slip" });
      const uploadDto = documentsService.upload.mock.calls[0][2];
      expect(uploadDto.relatedEntityType).toBe("RECEIPT_ENTRY");
      expect(uploadDto.relatedEntityId).toBe("r-1");
      expect(result.data.attachmentDocumentId).toBe("d-1");
    });

    it("throws 404 for unknown receipts before uploading", async () => {
      receiptsRepo.findOne.mockResolvedValue(null);
      await expect(service.attachDocument(admin, "nope", undefined, {})).rejects.toThrow(
        NotFoundException,
      );
      expect(documentsService.upload).not.toHaveBeenCalled();
    });
  });

  describe("list", () => {
    it("returns items with meta and a page amount sum", async () => {
      const builder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [
          [makeReceipt(), makeReceipt({ amount: "2500.00", method: ReceiptMethod.BANK_TRANSFER })],
          2,
        ]),
      };
      receiptsRepo.createQueryBuilder.mockReturnValue(builder);

      const result = await service.list({ page: 1, limit: 10 } as never);
      expect(result.data.items).toHaveLength(2);
      expect(result.data.meta.total).toBe(2);
      expect(result.data.pageAmountTotal).toBe("7500.00");
    });

    it("applies date range and method filters", async () => {
      const builder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [[], 0]),
      };
      receiptsRepo.createQueryBuilder.mockReturnValue(builder);

      await service.list({
        page: 1,
        limit: 10,
        fromDate: "2026-09-01",
        toDate: "2026-09-30",
        method: ReceiptMethod.CASH,
        incomeAccount: "Membership Fees",
      } as never);
      // fromDate + toDate + incomeAccount + method
      expect(builder.andWhere).toHaveBeenCalledTimes(4);
    });
  });
});