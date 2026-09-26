import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AuthenticatedUser } from "../../shared/decorators/current-user.decorator";
import { buildPaginationMeta } from "../../shared/dto/pagination.dto";
import { UserRole } from "../users/entities/user.entity";
import { DocumentType, RelatedEntityType } from "../documents/entities/document.entity";
import { DocumentsService } from "../documents/documents.service";
import { SupportTicket, TicketStatus } from "./entities/support-ticket.entity";
import { SupportTicketMessage } from "./entities/support-ticket-message.entity";
import {
  CreateTicketDto,
  CreateTicketMessageDto,
  ListTicketsQueryDto,
  UpdateTicketStatusDto,
} from "./dto/ticket.dto";

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.SUBMITTED]: [TicketStatus.UNDER_REVIEW, TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.UNDER_REVIEW]: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

function toSafeTicket(ticket: SupportTicket, includeOwner = false) {
  const safe = {
    id: ticket.id,
    subject: ticket.subject,
    description: ticket.description,
    status: ticket.status,
    resolvedAt: ticket.resolvedAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
  if (includeOwner && ticket.user) {
    return {
      ...safe,
      owner: { id: ticket.user.id, fullName: ticket.user.fullName, email: ticket.user.email },
    };
  }
  return safe;
}

function toSafeMessage(message: SupportTicketMessage) {
  return {
    id: message.id,
    ticketId: message.ticketId,
    body: message.body,
    createdAt: message.createdAt,
    author: message.author
      ? { id: message.author.id, fullName: message.author.fullName, role: message.author.role }
      : undefined,
  };
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger("Support");

  constructor(
    @InjectRepository(SupportTicket)
    private readonly ticketsRepo: Repository<SupportTicket>,
    @InjectRepository(SupportTicketMessage)
    private readonly messagesRepo: Repository<SupportTicketMessage>,
    private readonly documentsService: DocumentsService,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateTicketDto) {
    const ticket = this.ticketsRepo.create({
      userId: actor.id,
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      status: TicketStatus.SUBMITTED,
    });
    await this.ticketsRepo.save(ticket);
    this.logger.log(`Ticket created: ${ticket.id} by ${actor.id}`);
    return { message: "Support ticket submitted", data: toSafeTicket(ticket) };
  }

  async listMine(actor: AuthenticatedUser, query: ListTicketsQueryDto) {
    const qb = this.ticketsRepo
      .createQueryBuilder("ticket")
      .where("ticket.userId = :userId", { userId: actor.id })
      .orderBy("ticket.createdAt", "DESC")
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 10))
      .take(query.limit ?? 10);

    if (query.status) {
      qb.andWhere("ticket.status = :status", { status: query.status });
    }
    if (query.search) {
      qb.andWhere("LOWER(ticket.subject) LIKE :search", {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    const [tickets, total] = await qb.getManyAndCount();
    return {
      message: "Your support tickets fetched",
      data: {
        items: tickets.map((t) => toSafeTicket(t)),
        meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
      },
    };
  }

  async listAll(query: ListTicketsQueryDto) {
    const qb = this.ticketsRepo
      .createQueryBuilder("ticket")
      .leftJoinAndSelect("ticket.user", "user")
      .orderBy("ticket.createdAt", "DESC")
      .skip(((query.page ?? 1) - 1) * (query.limit ?? 10))
      .take(query.limit ?? 10);

    if (query.status) {
      qb.andWhere("ticket.status = :status", { status: query.status });
    }
    if (query.search) {
      qb.andWhere("LOWER(ticket.subject) LIKE :search", {
        search: `%${query.search.toLowerCase()}%`,
      });
    }

    const [tickets, total] = await qb.getManyAndCount();
    return {
      message: "Support tickets fetched",
      data: {
        items: tickets.map((t) => toSafeTicket(t, true)),
        meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 10),
      },
    };
  }

  async getForActor(actor: AuthenticatedUser, id: string): Promise<SupportTicket> {
    const ticket = await this.ticketsRepo.findOne({ where: { id }, relations: { user: true } });
    if (!ticket) {
      throw new NotFoundException("Support ticket not found");
    }
    if (actor.role !== UserRole.ADMIN && ticket.userId !== actor.id) {
      throw new ForbiddenException("You can only access your own support tickets");
    }
    return ticket;
  }

  async getById(actor: AuthenticatedUser, id: string) {
    const ticket = await this.getForActor(actor, id);
    return {
      message: "Support ticket fetched",
      data: toSafeTicket(ticket, actor.role === UserRole.ADMIN),
    };
  }

  async updateStatus(actor: AuthenticatedUser, id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.getForActor(actor, id);
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can change ticket status");
    }
    const allowed = ALLOWED_TRANSITIONS[ticket.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Invalid status transition: ${ticket.status} -> ${dto.status}`);
    }
    ticket.status = dto.status;
    if (dto.status === TicketStatus.RESOLVED) {
      ticket.resolvedBy = actor.id;
      ticket.resolvedAt = new Date();
    }
    await this.ticketsRepo.save(ticket);

    if (dto.note) {
      await this.messagesRepo.save(
        this.messagesRepo.create({
          ticketId: ticket.id,
          authorId: actor.id,
          body: dto.note.trim(),
        }),
      );
    }
    return { message: "Ticket status updated", data: toSafeTicket(ticket, true) };
  }

  async addMessage(actor: AuthenticatedUser, id: string, dto: CreateTicketMessageDto) {
    const ticket = await this.getForActor(actor, id);
    const message = await this.messagesRepo.save(
      this.messagesRepo.create({
        ticketId: ticket.id,
        authorId: actor.id,
        body: dto.body.trim(),
      }),
    );

    // First admin response moves an untouched ticket into review
    if (actor.role === UserRole.ADMIN && ticket.status === TicketStatus.SUBMITTED) {
      ticket.status = TicketStatus.UNDER_REVIEW;
      await this.ticketsRepo.save(ticket);
    }
    return {
      message: "Message added to ticket",
      data: { ...toSafeMessage(message), ticketStatus: ticket.status },
    };
  }

  async listMessages(actor: AuthenticatedUser, id: string) {
    await this.getForActor(actor, id); // ownership enforced
    const messages = await this.messagesRepo
      .createQueryBuilder("message")
      .leftJoinAndSelect("message.author", "author")
      .where("message.ticketId = :ticketId", { ticketId: id })
      .orderBy("message.createdAt", "ASC")
      .getMany();

    return {
      message: "Ticket messages fetched",
      data: { items: messages.map(toSafeMessage) },
    };
  }

  async attachDocument(
    actor: AuthenticatedUser,
    id: string,
    file: Express.Multer.File | undefined,
    meta: { documentName?: string; description?: string },
  ) {
    const ticket = await this.getForActor(actor, id); // ownership enforced
    return this.documentsService.upload(actor, file, {
      documentName: meta.documentName?.trim() || `Ticket attachment - ${id}`,
      documentType: DocumentType.SUPPORT_TICKET_ATTACHMENT,
      relatedEntityType: RelatedEntityType.SUPPORT_TICKET,
      relatedEntityId: id,
      description: meta.description,
      ownerId: ticket.userId,
    });
  }
}