import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import * as path from "path";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../../shared/decorators/current-user.decorator";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { ApiConfigService } from "../../shared/helpers/api-config.service";
import { UsersService } from "../users/users.service";
import { UserRole } from "../users/entities/user.entity";
import { Document, DocumentType, RelatedEntityType } from "./entities/document.entity";
import { ListDocumentsQueryDto } from "./dto/list-documents.query.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";

export const STORAGE_DIR = path.join(process.cwd(), "uploads");

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export interface SafeDocument {
  id: string;
  documentName: string;
  documentType: DocumentType;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  relatedEntityType: RelatedEntityType | null;
  relatedEntityId: string | null;
  description: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner?: { id: string; fullName: string; email: string };
}

function toSafeDocument(document: Document, includeOwner = false): SafeDocument {
  const safe: SafeDocument = {
    id: document.id,
    documentName: document.documentName,
    documentType: document.documentType,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    relatedEntityType: document.relatedEntityType,
    relatedEntityId: document.relatedEntityId,
    description: document.description,
    isArchived: document.isArchived,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
  if (includeOwner && document.user) {
    safe.owner = {
      id: document.user.id,
      fullName: document.user.fullName,
      email: document.user.email,
    };
  }
  return safe;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger("Documents");

  constructor(
    @InjectRepository(Document)
    private readonly documentsRepo: Repository<Document>,
    private readonly usersService: UsersService,
    private readonly configService: ApiConfigService,
  ) {}

  async upload(actor: AuthenticatedUser, file: Express.Multer.File | undefined, dto: UploadDocumentDto) {
    if (!file) {
      throw new BadRequestException("File is required");
    }
    const maxSize = this.configService.documentMaxSizeBytes;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File is too large. Maximum size is ${Math.round(maxSize / (1024 * 1024))} MB`,
      );
    }
    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException(`File extension not allowed: ${extension || "(none)"}`);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`MIME type not allowed: ${file.mimetype}`);
    }

    // Admins may upload on behalf of another user; everyone else owns their upload
    const ownerId =
      actor.role === UserRole.ADMIN && dto.ownerId ? dto.ownerId : actor.id;
    if (ownerId !== actor.id) {
      const owner = await this.usersService.findEntityById(ownerId);
      if (!owner) {
        throw new NotFoundException("Owner user not found");
      }
    }

    // Safe filename: server-generated UUID, user-supplied name stored as metadata only
    const fileName = `${randomUUID()}${extension}`;
    await mkdir(STORAGE_DIR, { recursive: true });
    const storagePath = path.join("uploads", fileName);
    await writeFile(path.join(process.cwd(), storagePath), file.buffer);

    const document = this.documentsRepo.create({
      userId: ownerId,
      createdBy: actor.id,
      documentName: dto.documentName.trim(),
      documentType: dto.documentType,
      fileName,
      originalFileName: path.basename(file.originalname),
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath,
      relatedEntityType: dto.relatedEntityType ?? null,
      relatedEntityId: dto.relatedEntityId ?? null,
      description: dto.description ?? null,
    });
    await this.documentsRepo.save(document);

    this.logger.log(`Document uploaded: ${document.id} by ${actor.id} (${file.size} bytes)`);
    return { message: "Document uploaded", data: toSafeDocument(document) };
  }

  async list(actor: AuthenticatedUser, query: ListDocumentsQueryDto) {
    const qb = this.documentsRepo
      .createQueryBuilder("document")
      .leftJoinAndSelect("document.user", "user")
      .where("document.isArchived = false")
      .orderBy("document.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    // Non-admins only ever see their own documents
    if (actor.role !== UserRole.ADMIN) {
      qb.andWhere("document.userId = :actorId", { actorId: actor.id });
    }
    if (query.documentType) {
      qb.andWhere("document.documentType = :documentType", { documentType: query.documentType });
    }
    if (query.relatedEntityType) {
      qb.andWhere("document.relatedEntityType = :relatedEntityType", {
        relatedEntityType: query.relatedEntityType,
      });
    }
    if (query.relatedEntityId) {
      qb.andWhere("document.relatedEntityId = :relatedEntityId", {
        relatedEntityId: query.relatedEntityId,
      });
    }

    const [documents, total] = await qb.getManyAndCount();
    return {
      message: "Documents fetched",
      data: {
        items: documents.map((d) => toSafeDocument(d, actor.role === UserRole.ADMIN)),
        meta: buildPaginationMeta(total, query.page, query.limit),
      },
    };
  }

  /** Admin or owner only; archived documents are treated as gone. */
  async getForActor(actor: AuthenticatedUser, id: string): Promise<Document> {
    const document = await this.documentsRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!document || document.isArchived) {
      throw new NotFoundException("Document not found");
    }
    if (actor.role !== UserRole.ADMIN && document.userId !== actor.id) {
      throw new ForbiddenException("You can only access your own documents");
    }
    return document;
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const document = await this.getForActor(actor, id);
    return {
      message: "Document fetched",
      data: toSafeDocument(document, actor.role === UserRole.ADMIN),
    };
  }

  async archive(actor: AuthenticatedUser, id: string) {
    const document = await this.getForActor(actor, id);
    document.isArchived = true;
    await this.documentsRepo.save(document);
    this.logger.log(`Document archived: ${document.id} by ${actor.id}`);
    return { message: "Document archived", data: toSafeDocument(document) };
  }
}