import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  AssistanceRequestEntity,
  AssistanceRequestStatus,
} from '../entities/assistance-request.entity';
import { CreateAssistanceRequestDto } from '../dto/create-assistance-request.dto';
import { ListAssistanceDto } from '../dto/list-assistance.dto';
import { UpdateAssistanceStatusDto } from '../dto/update-assistance-status.dto';
import { DocumentsService } from '../../documents/services/documents.service';
import {
  DocumentType,
  RelatedEntityType,
} from '../../documents/entities/document.entity';
import { AuditService } from '../../audit/services/audit.service';

const ALLOWED_TRANSITIONS: Record<
  AssistanceRequestStatus,
  AssistanceRequestStatus[]
> = {
  [AssistanceRequestStatus.PENDING]: [
    AssistanceRequestStatus.UNDER_REVIEW,
    AssistanceRequestStatus.APPROVED,
    AssistanceRequestStatus.REJECTED,
    AssistanceRequestStatus.CLOSED,
  ],
  [AssistanceRequestStatus.UNDER_REVIEW]: [
    AssistanceRequestStatus.APPROVED,
    AssistanceRequestStatus.REJECTED,
    AssistanceRequestStatus.CLOSED,
  ],
  [AssistanceRequestStatus.APPROVED]: [AssistanceRequestStatus.CLOSED],
  [AssistanceRequestStatus.REJECTED]: [AssistanceRequestStatus.CLOSED],
  [AssistanceRequestStatus.CLOSED]: [],
};

@Injectable()
export class AssistanceService {
  constructor(
    @InjectRepository(AssistanceRequestEntity)
    private readonly assistance: Repository<AssistanceRequestEntity>,
    private readonly documentsService: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateAssistanceRequestDto,
    actingUserId: string,
  ): Promise<AssistanceRequestEntity> {
    const request = this.assistance.create({
      user_id: actingUserId,
      full_name: dto.full_name.trim(),
      mobile: dto.mobile.trim(),
      email: dto.email ?? null,
      requested_amount: dto.requested_amount,
      reason: dto.reason.trim(),
      description: dto.description ?? null,
      status: AssistanceRequestStatus.PENDING,
      created_by: actingUserId,
      updated_by: actingUserId,
    });

    const saved = await this.assistance.save(request);

    await this.audit.record({
      event: 'assistance_request.created',
      actorId: actingUserId,
      entityType: 'assistance_requests',
      entityId: saved.id,
      metadata: {
        requestedAmount: saved.requested_amount,
        reason: saved.reason,
      },
    });

    return saved;
  }

  async list(
    dto: ListAssistanceDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{
    items: AssistanceRequestEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.assistance
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user')
      .leftJoinAndSelect('request.reviewed_by_user', 'reviewed_by_user')
      .orderBy('request.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (!isAdmin) {
      qb.andWhere('request.user_id = :userId', { userId: actingUserId });
    } else if (dto.user_id) {
      qb.andWhere('request.user_id = :userId', { userId: dto.user_id });
    }

    if (dto.status) {
      qb.andWhere('request.status = :status', { status: dto.status });
    }

    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(request.full_name) LIKE :term')
            .orWhere('request.mobile LIKE :term')
            .orWhere('LOWER(request.reason) LIKE :term');
        }),
      ).setParameter('term', term);
    }

    const [rawItems, total] = await qb.getManyAndCount();

    const items = rawItems.map((r) => {
      if (r.user) {
        delete (r.user as { password_hash?: string }).password_hash;
      }
      if (r.reviewed_by_user) {
        delete (r.reviewed_by_user as { password_hash?: string }).password_hash;
      }
      return r;
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
  ): Promise<AssistanceRequestEntity> {
    const request = await this.assistance.findOne({
      where: { id },
      relations: ['user', 'reviewed_by_user'],
    });

    if (!request) {
      throw new NotFoundException({
        message: 'Assistance request not found',
        code: 'ASSISTANCE_REQUEST_NOT_FOUND',
        details: { id },
      });
    }

    if (!isAdmin && request.user_id !== actingUserId) {
      throw new ForbiddenException({
        message: 'You can only access your own assistance requests',
        code: 'ASSISTANCE_REQUEST_ACCESS_DENIED',
        details: null,
      });
    }

    if (request.user) {
      delete (request.user as { password_hash?: string }).password_hash;
    }
    if (request.reviewed_by_user) {
      delete (request.reviewed_by_user as { password_hash?: string }).password_hash;
    }

    return request;
  }

  async updateStatus(
    id: string,
    dto: UpdateAssistanceStatusDto,
    actingUserId: string,
  ): Promise<AssistanceRequestEntity> {
    const request = await this.assistance.findOne({ where: { id } });

    if (!request) {
      throw new NotFoundException({
        message: 'Assistance request not found',
        code: 'ASSISTANCE_REQUEST_NOT_FOUND',
        details: { id },
      });
    }

    const allowed = ALLOWED_TRANSITIONS[request.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException({
        message: `Invalid status transition from ${request.status} to ${dto.status}`,
        code: 'INVALID_STATUS_TRANSITION',
        details: { currentStatus: request.status, targetStatus: dto.status },
      });
    }

    request.status = dto.status;
    if (dto.admin_remark !== undefined) {
      request.admin_remark = dto.admin_remark;
    }
    request.reviewed_by = actingUserId;
    request.reviewed_at = new Date();
    request.updated_by = actingUserId;

    const saved = await this.assistance.save(request);

    await this.audit.record({
      event: 'assistance_request.status_updated',
      actorId: actingUserId,
      entityType: 'assistance_requests',
      entityId: saved.id,
      metadata: { status: saved.status, adminRemark: saved.admin_remark },
    });

    return saved;
  }

  async attachDocument(
    id: string,
    file: Express.Multer.File | undefined,
    meta: { document_name?: string; description?: string },
    actingUserId: string,
    isAdmin = false,
  ) {
    const request = await this.getById(id, actingUserId, isAdmin);
    return this.documentsService.upload(
      file,
      {
        document_name: meta.document_name?.trim() || `Assistance doc - ${id}`,
        document_type: DocumentType.ASSISTANCE_DOCUMENT,
        related_entity_type: RelatedEntityType.ASSISTANCE_REQUEST,
        related_entity_id: id,
        description: meta.description,
        owner_id: request.user_id,
      },
      actingUserId,
      isAdmin,
    );
  }
}
