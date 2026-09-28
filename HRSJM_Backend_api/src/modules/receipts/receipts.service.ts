import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { AuthenticatedUser } from "../../shared/decorators/current-user.decorator";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { AccountingBoundaryService } from "../accounting/accounting-boundary.service";
import { Document, DocumentType, RelatedEntityType } from "../documents/entities/document.entity";
import { DocumentsService } from "../documents/documents.service";
import { IncomeReceipt, ReceiptMethod } from "./entities/income-receipt.entity";
import { CreateReceiptDto, ListReceiptsQueryDto } from "./dto/receipt.dto";

const ENTRY_NUMBER_RETRIES = 3;

function toSafeReceipt(receipt: IncomeReceipt, includeAudit = false) {
  const safe = {
    id: receipt.id,
    entryNumber: receipt.entryNumber,
    receiptDate: receipt.receiptDate,
    receivedFrom: receipt.receivedFrom,
    incomeAccount: receipt.incomeAccount,
    receivedInAccount: receipt.receivedInAccount,
    amount: receipt.amount,
    method: receipt.method,
    remarks: receipt.remarks,
    attachmentDocumentId: receipt.attachmentDocumentId,
    postingRef: receipt.postingRef,
    postedAt: receipt.postedAt,
    createdAt: receipt.createdAt,
  };
  if (includeAudit && receipt.createdByUser) {
    return {
      ...safe,
      audit: {
        createdBy: receipt.createdByUser.id,
        createdByFullName: receipt.createdByUser.fullName,
        createdAt: receipt.createdAt,
      },
    };
  }
  return safe;
}

@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger("Receipts");

  constructor(
    @InjectRepository(IncomeReceipt)
    private readonly receiptsRepo: Repository<IncomeReceipt>,
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    private readonly accountingBoundary: AccountingBoundaryService,
    private readonly documentsService: DocumentsService,
  ) {}

  // Per-year sequence: RCV-2026-0001, RCV-2026-0002, ...
  private async generateEntryNumber(receiptDate: string): Promise<string> {
    const year = receiptDate.slice(0, 4);
    const prefix = `RCV-${year}-`;
    const row = await this.receiptsRepo
      .createQueryBuilder("r")
      .select("MAX(r.entryNumber)", "max")
      .where("r.entryNumber LIKE :prefix", { prefix: `${prefix}%` })
      .getRawOne();
    const seq = row?.max ? Number(String(row.max).slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, "0")}`;
  }

  async create(actor: AuthenticatedUser, dto: CreateReceiptDto) {
    // Normalize to YYYY-MM-DD regardless of how the client formatted it
    const receiptDate = new Date(dto.receiptDate).toISOString().slice(0, 10);

    let receipt!: IncomeReceipt;
    for (let attempt = 1; attempt <= ENTRY_NUMBER_RETRIES; attempt++) {
      const entryNumber = await this.generateEntryNumber(receiptDate);
      try {
        receipt = await this.receiptsRepo.save(
          this.receiptsRepo.create({
            entryNumber,
            receiptDate,
            receivedFrom: dto.receivedFrom.trim(),
            incomeAccount: dto.incomeAccount.trim(),
            receivedInAccount: dto.receivedInAccount.trim(),
            amount: dto.amount.toFixed(2),
            method: dto.method,
            remarks: dto.remarks?.trim() || null,
            createdBy: actor.id,
          }),
        );
        break;
      } catch (error) {
        // Unique violation on entry number: another entry took the sequence slot
        const isUniqueViolation = error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === "23505";
        if (!isUniqueViolation || attempt === ENTRY_NUMBER_RETRIES) {
          throw error;
        }
        this.logger.warn(`Entry number collision, retrying (${attempt}/${ENTRY_NUMBER_RETRIES})`);
      }
    }

    // CRITICAL (BRD): forward the entry to senior accounting through the
    // boundary. This API never touches ledger/report balances itself.
    const posting = await this.accountingBoundary.postIncomeReceipt({
      entryType: "INCOME_RECEIPT",
      referenceType: "RECEIPT_ENTRY",
      referenceId: receipt.id,
      entryNumber: receipt.entryNumber,
      receiptDate,
      amount: receipt.amount,
      incomeAccount: receipt.incomeAccount,
      receivedInAccount: receipt.receivedInAccount,
      method: receipt.method,
      receivedFrom: receipt.receivedFrom,
      createdBy: actor.id,
    });
    receipt.postingRef = posting.accepted ? posting.postingRef : null;
    receipt.postedAt = new Date(posting.postedAt);
    await this.receiptsRepo.save(receipt);

    this.logger.log(`Receipt created: ${receipt.entryNumber} by ${actor.id}`);
    return { message: "Income receipt recorded", data: toSafeReceipt(receipt, true) };
  }

  async list(query: ListReceiptsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const qb = this.receiptsRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.createdByUser", "creator")
      .orderBy("r.receiptDate", "DESC")
      .addOrderBy("r.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (query.fromDate) {
      qb.andWhere("r.receiptDate >= :fromDate", { fromDate: query.fromDate.slice(0, 10) });
    }
    if (query.toDate) {
      qb.andWhere("r.receiptDate <= :toDate", { toDate: query.toDate.slice(0, 10) });
    }
    if (query.incomeAccount) {
      qb.andWhere("LOWER(r.incomeAccount) = :incomeAccount", {
        incomeAccount: query.incomeAccount.toLowerCase().trim(),
      });
    }
    if (query.receivedInAccount) {
      qb.andWhere("LOWER(r.receivedInAccount) = :receivedInAccount", {
        receivedInAccount: query.receivedInAccount.toLowerCase().trim(),
      });
    }
    if (query.method) {
      qb.andWhere("r.method = :method", { method: query.method });
    }

    const [receipts, total] = await qb.getManyAndCount();
    const totalAmount = receipts.reduce((sum, r) => sum + Number(r.amount), 0);
    return {
      message: "Income receipts fetched",
      data: {
        items: receipts.map((r) => toSafeReceipt(r, true)),
        meta: buildPaginationMeta(total, page, limit),
        // Sum of the CURRENT page only (running totals belong to the senior accounting system)
        pageAmountTotal: totalAmount.toFixed(2),
      },
    };
  }

  async getById(id: string) {
    const receipt = await this.receiptsRepo.findOne({
      where: { id },
      relations: { createdByUser: true },
    });
    if (!receipt) {
      throw new NotFoundException("Income receipt not found");
    }
    let attachment: {
      id: string;
      documentName: string;
      originalFileName: string;
      mimeType: string;
      fileSize: number;
    } | null = null;
    if (receipt.attachmentDocumentId) {
      const document = await this.documentsRepo.findOne({
        where: { id: receipt.attachmentDocumentId },
      });
      if (document) {
        attachment = {
          id: document.id,
          documentName: document.documentName,
          originalFileName: document.originalFileName,
          mimeType: document.mimeType,
          fileSize: document.fileSize,
        };
      }
    }
    return {
      message: "Income receipt fetched",
      data: { ...toSafeReceipt(receipt, true), attachment },
    };
  }

  async attachDocument(
    actor: AuthenticatedUser,
    id: string,
    file: Express.Multer.File | undefined,
    meta: { documentName?: string; description?: string },
  ) {
    const receipt = await this.receiptsRepo.findOne({ where: { id } });
    if (!receipt) {
      throw new NotFoundException("Income receipt not found");
    }
    const document = await this.documentsService.upload(actor, file, {
      documentName: meta.documentName?.trim() || `Receipt attachment - ${receipt.entryNumber}`,
      documentType: DocumentType.OTHER,
      relatedEntityType: RelatedEntityType.RECEIPT_ENTRY,
      relatedEntityId: receipt.id,
      description: meta.description,
    });
    receipt.attachmentDocumentId = document.data?.id ?? null;
    await this.receiptsRepo.save(receipt);
    return {
      message: "Receipt attachment uploaded",
      data: toSafeReceipt(receipt, true),
    };
  }
}