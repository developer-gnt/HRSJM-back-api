import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../../shared/decorators/current-user.decorator";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { UserRole } from "../users/entities/user.entity";
import {
  AssistanceRequest,
  AssistanceRequestStatus,
} from "./entities/assistance-request.entity";
import { CreateAssistanceRequestDto } from "./dto/create-assistance-request.dto";
import { ListAssistanceQueryDto } from "./dto/list-assistance.query.dto";
import { UpdateAssistanceStatusDto } from "./dto/update-assistance-status.dto";
import { UploadDocumentDto } from "../documents/dto/upload-document.dto";
import { DocumentsService } from "../documents/documents.service";
import { DocumentType, RelatedEntityType } from "../documents/entities/document.entity";

const ALLOWED_TRANSITIONS: Record<AssistanceRequestStatus, AssistanceRequestStatus[]> = {
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
  [AssistanceRequestStatus.APPROVED]: [],
  [AssistanceRequestStatus.REJECTED]: [],
  [AssistanceRequestStatus.CLOSED]: [],
};

export function toSafeRequest(
  request: AssistanceRequest,
  includeOwner = false,
) {
  const safe = {
    id: request.id,
    fullName: request.fullName,
    mobile: request.mobile,
    email: request.email,
    requestedAmount: request.requestedAmount,
    reason: request.reason,
    description: request.description,
    status: request.status,
    adminRemark: request.adminRemark,
    reviewedAt: request.reviewedAt,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
  if (includeOwner && request.user) {
    return {
      ...safe,
      owner: { id: request.user.id, fullName: request.user.fullName, email: request.user.email },
    };
  }
  return safe;
}

@Injectable()
export class AssistanceService {
  constructor(
    @InjectRepository(AssistanceRequest)
    private readonly assistanceRepo: Repository<AssistanceRequest>,
    private readonly documentsService: DocumentsService,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateAssistanceRequestDto) {
    const request = this.assistanceRepo.create({
      userId: actor.id,
      fullName: dto.fullName.trim(),
      mobile: dto.mobile.trim(),
      email: dto.email ?? null,
      requestedAmount: dto.requestedAmount,
      reason: dto.reason.trim(),
      description: dto.description ?? null,
      status: AssistanceRequestStatus.PENDING,
    });
    await this.assistanceRepo.save(request);
    return { message: "Assistance request submitted", data: toSafeRequest(request) };
  }

  async listMine(actor: AuthenticatedUser, query: ListAssistanceQueryDto) {
    const qb = this.assistanceRepo
      .createQueryBuilder("request")
      .where("request.userId = :userId", { userId: actor.id })
      .orderBy("request.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) {
      qb.andWhere("request.status = :status", { status: query.status });
    }

    const [requests, total] = await qb.getManyAndCount();
    return {
      message: "Your assistance requests fetched",
      data: {
        items: requests.map((r) => toSafeRequest(r)),
        meta: buildPaginationMeta(total, query.page, query.limit),
      },
    };
  }

  async listAll(query: ListAssistanceQueryDto) {
    const qb = this.assistanceRepo
      .createQueryBuilder("request")
      .leftJoinAndSelect("request.user", "user")
      .orderBy("request.createdAt", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.status) {
      qb.andWhere("request.status = :status", { status: query.status });
    }

    const [requests, total] = await qb.getManyAndCount();
    return {
      message: "Assistance requests fetched",
      data: {
        items: requests.map((r) => toSafeRequest(r, true)),
        meta: buildPaginationMeta(total, query.page, query.limit),
      },
    };
  }

  async getForActor(actor: AuthenticatedUser, id: string) {
    const request = await this.assistanceRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!request) {
      throw new NotFoundException("Assistance request not found");
    }
    if (actor.role !== UserRole.ADMIN && request.userId !== actor.id) {
      throw new ForbiddenException("You can only access your own assistance requests");
    }
    return request;
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const request = await this.getForActor(actor, id);
    return {
      message: "Assistance request fetched",
      data: toSafeRequest(request, actor.role === UserRole.ADMIN),
    };
  }

  async updateStatus(actor: AuthenticatedUser, id: string, dto: UpdateAssistanceStatusDto) {
    const request = await this.assistanceRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException("Assistance request not found");
    }
    const allowed = ALLOWED_TRANSITIONS[request.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${request.status} -> ${dto.status}`,
      );
    }
    request.status = dto.status;
    request.adminRemark = dto.adminRemark ?? request.adminRemark;
    request.reviewedBy = actor.id;
    request.reviewedAt = new Date();
    await this.assistanceRepo.save(request);
    return { message: "Assistance request status updated", data: toSafeRequest(request, true) };
  }

  async attachDocument(
    actor: AuthenticatedUser,
    id: string,
    file: Express.Multer.File | undefined,
    meta: { documentName?: string; description?: string },
  ) {
    const request = await this.getForActor(actor, id); // ownership enforced
    return this.documentsService.upload(actor, file, {
      documentName: meta.documentName?.trim() || `Assistance document - ${id}`,
      documentType: DocumentType.ASSISTANCE_DOCUMENT,
      relatedEntityType: RelatedEntityType.ASSISTANCE_REQUEST,
      relatedEntityId: id,
      description: meta.description,
      // Document belongs to the requester, even when an admin attaches it
      ownerId: request.userId,
    } satisfies UploadDocumentDto);
  }
}