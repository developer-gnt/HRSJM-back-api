import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
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
import { UsersService } from '../../users/services/users.service';
import { NotificationsService } from '../../notifications/services/notifications.service';

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
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  async create(
    dto: CreateAssistanceRequestDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<AssistanceRequestEntity> {
    let targetUserId = actingUserId;

    if (dto.user_id && isAdmin) {
      targetUserId = dto.user_id;
    } else if (dto.mobile) {
      const cleanMobile = dto.mobile.trim();
      const existingUser = await this.usersService.findByLoginIdentifier(cleanMobile);
      if (existingUser) {
        targetUserId = existingUser.id;
      } else {
        if (dto.email) {
          const emailUser = await this.usersService.findByLoginIdentifier(dto.email.trim());
          if (emailUser) {
            throw new ConflictException({
              message: 'Email is already registered by another account',
              code: 'EMAIL_TAKEN',
              details: { email: dto.email },
            });
          }
        }
        const passwordHash = await bcrypt.hash('123456', 10);
        const newUser = await this.usersService.createUserWithRole({
          full_name: dto.full_name.trim() || 'Donation Seeker',
          mobile_number: cleanMobile,
          email: dto.email ? dto.email.trim().toLowerCase() : null,
          password_hash: passwordHash,
          roleName: 'DONATION_SEEKER',
        });
        targetUserId = newUser.id;
      }
    }

    const initialStatus = dto.status || AssistanceRequestStatus.PENDING;

    const request = this.assistance.create({
      user_id: targetUserId,
      full_name: dto.full_name.trim(),
      mobile: dto.mobile.trim(),
      email: dto.email ? dto.email.trim().toLowerCase() : null,
      requested_amount: dto.requested_amount,
      reason: dto.reason.trim(),
      description: dto.description?.trim() ?? null,
      status: initialStatus,
      admin_remark: dto.admin_remark?.trim() ?? null,
      reviewed_by: initialStatus !== AssistanceRequestStatus.PENDING ? actingUserId : null,
      reviewed_at: initialStatus !== AssistanceRequestStatus.PENDING ? new Date() : null,
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
        status: saved.status,
      },
    });

    // Real-time notifications to applicant and admins
    await this.notifications.sendToUser(
      targetUserId,
      'Assistance Request Submitted',
      `Your request for ₹${saved.requested_amount} (${saved.reason}) has been received and is ${saved.status.toLowerCase().replace('_', ' ')}.`,
      actingUserId,
    );
    await this.notifications.sendToAdmins(
      'New Assistance Request',
      `Assistance request for ₹${saved.requested_amount} submitted for ${saved.full_name}.`,
      actingUserId,
    );

    return saved;
  }

  async getStats(
    actingUserId: string,
    isAdmin = false,
    query?: ListAssistanceDto,
  ): Promise<{
    total: number;
    underReview: number;
    approved: number;
    rejected: number;
    closed: number;
    totalAmount: number;
  }> {
    const qb = this.assistance.createQueryBuilder('request');
    if (!isAdmin) {
      qb.andWhere('request.user_id = :userId', { userId: actingUserId });
    }

    if (query?.category) {
      qb.andWhere('LOWER(request.reason) LIKE :cat', {
        cat: `%${query.category.toLowerCase()}%`,
      });
    }

    if (query?.min_amount !== undefined) {
      qb.andWhere('request.requested_amount >= :minAmt', {
        minAmt: query.min_amount,
      });
    }

    if (query?.max_amount !== undefined) {
      qb.andWhere('request.requested_amount <= :maxAmt', {
        maxAmt: query.max_amount,
      });
    }

    if (query?.from_date) {
      qb.andWhere('request.created_at >= :fromD', {
        fromD: new Date(query.from_date),
      });
    }

    if (query?.to_date) {
      qb.andWhere('request.created_at <= :toD', {
        toD: new Date(query.to_date),
      });
    }

    const [total, underReview, pending, approved, rejected, closed, sumResult] = await Promise.all([
      qb.clone().getCount(),
      qb.clone().andWhere('request.status = :s', { s: AssistanceRequestStatus.UNDER_REVIEW }).getCount(),
      qb.clone().andWhere('request.status = :s', { s: AssistanceRequestStatus.PENDING }).getCount(),
      qb.clone().andWhere('request.status = :s', { s: AssistanceRequestStatus.APPROVED }).getCount(),
      qb.clone().andWhere('request.status = :s', { s: AssistanceRequestStatus.REJECTED }).getCount(),
      qb.clone().andWhere('request.status = :s', { s: AssistanceRequestStatus.CLOSED }).getCount(),
      qb.clone().select('SUM(request.requested_amount)', 'sum').getRawOne<{ sum: string | null }>(),
    ]);

    return {
      total,
      underReview: underReview + pending,
      approved,
      rejected,
      closed,
      totalAmount: sumResult?.sum ? parseFloat(sumResult.sum) : 0,
    };
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

    if (dto.category) {
      qb.andWhere('LOWER(request.reason) LIKE :cat', {
        cat: `%${dto.category.toLowerCase()}%`,
      });
    }

    if (dto.min_amount !== undefined) {
      qb.andWhere('request.requested_amount >= :minAmt', {
        minAmt: dto.min_amount,
      });
    }

    if (dto.max_amount !== undefined) {
      qb.andWhere('request.requested_amount <= :maxAmt', {
        maxAmt: dto.max_amount,
      });
    }

    if (dto.from_date) {
      qb.andWhere('request.created_at >= :fromD', {
        fromD: new Date(dto.from_date),
      });
    }

    if (dto.to_date) {
      qb.andWhere('request.created_at <= :toD', {
        toD: new Date(dto.to_date),
      });
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

    // Real-time notification to applicant
    await this.notifications.sendToUser(
      saved.user_id,
      'Assistance Request Status Updated',
      `Your assistance request status has been updated to ${saved.status}.${saved.admin_remark ? ' Remarks: ' + saved.admin_remark : ''}`,
      actingUserId,
    );

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
