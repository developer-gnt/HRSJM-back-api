import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { Repository } from 'typeorm';
import { DocumentEntity, RelatedEntityType } from '../entities/document.entity';
import { UploadDocumentDto } from '../dto/upload-document.dto';
import { ListDocumentsDto } from '../dto/list-documents.dto';
import { AuditService } from '../../audit/services/audit.service';

export const STORAGE_DIR = path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    private readonly audit: AuditService,
  ) {}

  async upload(
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<DocumentEntity> {
    if (!file) {
      throw new BadRequestException({
        message: 'File is required',
        code: 'FILE_REQUIRED',
        details: null,
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        message: 'File is too large. Maximum size is 10 MB',
        code: 'FILE_TOO_LARGE',
        details: { maxSizeBytes: MAX_FILE_SIZE, receivedBytes: file.size },
      });
    }

    const extension = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      throw new BadRequestException({
        message: `File extension not allowed: ${extension || '(none)'}`,
        code: 'INVALID_FILE_EXTENSION',
        details: { allowedExtensions: ALLOWED_EXTENSIONS },
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        message: `MIME type not allowed: ${file.mimetype}`,
        code: 'INVALID_MIME_TYPE',
        details: { allowedMimeTypes: ALLOWED_MIME_TYPES },
      });
    }

    const ownerId = isAdmin && dto.owner_id ? dto.owner_id : actingUserId;
    const fileName = `${randomUUID()}${extension}`;

    await mkdir(STORAGE_DIR, { recursive: true });
    const storagePath = path.join('uploads', fileName);
    await writeFile(path.join(process.cwd(), storagePath), file.buffer);

    const document = this.documents.create({
      user_id: ownerId,
      created_by: actingUserId,
      updated_by: actingUserId,
      document_name: dto.document_name.trim(),
      document_type: dto.document_type,
      file_name: fileName,
      original_file_name: path.basename(file.originalname),
      mime_type: file.mimetype,
      file_size: file.size,
      storage_path: storagePath,
      related_entity_type: dto.related_entity_type ?? null,
      related_entity_id: dto.related_entity_id ?? null,
      description: dto.description ?? null,
      is_archived: false,
    });

    const saved = await this.documents.save(document);

    await this.audit.record({
      event: 'document.uploaded',
      actorId: actingUserId,
      entityType: 'documents',
      entityId: saved.id,
      metadata: {
        userId: ownerId,
        fileName: saved.file_name,
        originalName: saved.original_file_name,
        fileSize: saved.file_size,
        relatedType: saved.related_entity_type,
        relatedId: saved.related_entity_id,
      },
    });

    return saved;
  }

  async list(
    dto: ListDocumentsDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{
    items: DocumentEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.documents
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.user', 'user')
      .where('document.is_archived = false')
      .orderBy('document.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (!isAdmin) {
      qb.andWhere('document.user_id = :userId', { userId: actingUserId });
    } else if (dto.user_id) {
      qb.andWhere('document.user_id = :userId', { userId: dto.user_id });
    }

    if (dto.document_type) {
      qb.andWhere('document.document_type = :docType', {
        docType: dto.document_type,
      });
    }

    if (dto.related_entity_type) {
      qb.andWhere('document.related_entity_type = :relType', {
        relType: dto.related_entity_type,
      });
    }

    if (dto.related_entity_id) {
      qb.andWhere('document.related_entity_id = :relId', {
        relId: dto.related_entity_id,
      });
    }

    const [rawItems, total] = await qb.getManyAndCount();

    const items = rawItems.map((d) => {
      if (d.user) {
        delete (d.user as { password_hash?: string }).password_hash;
      }
      return d;
    });

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<DocumentEntity> {
    const document = await this.documents.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!document || document.is_archived) {
      throw new NotFoundException({
        message: 'Document not found',
        code: 'DOCUMENT_NOT_FOUND',
        details: { id },
      });
    }

    if (!isAdmin && document.user_id !== actingUserId) {
      throw new ForbiddenException({
        message: 'You can only access your own documents',
        code: 'DOCUMENT_ACCESS_DENIED',
        details: null,
      });
    }

    if (document.user) {
      delete (document.user as { password_hash?: string }).password_hash;
    }

    return document;
  }

  async findByRelatedEntity(
    relatedEntityType: RelatedEntityType,
    relatedEntityId: string,
  ): Promise<DocumentEntity[]> {
    return this.documents.find({
      where: {
        related_entity_type: relatedEntityType,
        related_entity_id: relatedEntityId,
        is_archived: false,
      },
      order: { created_at: 'DESC' },
    });
  }

  async archive(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<DocumentEntity> {
    const document = await this.getById(id, actingUserId, isAdmin);
    document.is_archived = true;
    document.updated_by = actingUserId;

    const saved = await this.documents.save(document);

    await this.audit.record({
      event: 'document.archived',
      actorId: actingUserId,
      entityType: 'documents',
      entityId: saved.id,
      metadata: { fileName: saved.file_name },
    });

    return saved;
  }
}
