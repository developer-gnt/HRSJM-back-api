import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  SupportTicketEntity,
  TicketStatus,
} from '../entities/support-ticket.entity';
import { SupportTicketMessageEntity } from '../entities/support-ticket-message.entity';
import { CreateTicketDto } from '../dto/create-ticket.dto';
import { CreateTicketMessageDto } from '../dto/create-ticket-message.dto';
import { ListTicketsDto } from '../dto/list-tickets.dto';
import { UpdateTicketStatusDto } from '../dto/update-ticket-status.dto';
import { DocumentsService } from '../../documents/services/documents.service';
import {
  DocumentType,
  RelatedEntityType,
} from '../../documents/entities/document.entity';
import { AuditService } from '../../audit/services/audit.service';

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.SUBMITTED]: [
    TicketStatus.UNDER_REVIEW,
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
  ],
  [TicketStatus.UNDER_REVIEW]: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  [TicketStatus.RESOLVED]: [TicketStatus.CLOSED],
  [TicketStatus.CLOSED]: [],
};

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly tickets: Repository<SupportTicketEntity>,
    @InjectRepository(SupportTicketMessageEntity)
    private readonly messages: Repository<SupportTicketMessageEntity>,
    private readonly documentsService: DocumentsService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: CreateTicketDto,
    actingUserId: string,
  ): Promise<SupportTicketEntity> {
    const ticket = this.tickets.create({
      user_id: actingUserId,
      subject: dto.subject.trim(),
      description: dto.description.trim(),
      status: TicketStatus.SUBMITTED,
      created_by: actingUserId,
      updated_by: actingUserId,
    });

    const saved = await this.tickets.save(ticket);

    await this.audit.record({
      event: 'support_ticket.created',
      actorId: actingUserId,
      entityType: 'support_tickets',
      entityId: saved.id,
      metadata: { subject: saved.subject },
    });

    return saved;
  }

  async list(
    dto: ListTicketsDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{
    items: SupportTicketEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.tickets
      .createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.user', 'user')
      .leftJoinAndSelect('ticket.resolved_by_user', 'resolved_by_user')
      .orderBy('ticket.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (!isAdmin) {
      qb.andWhere('ticket.user_id = :userId', { userId: actingUserId });
    } else if (dto.user_id) {
      qb.andWhere('ticket.user_id = :userId', { userId: dto.user_id });
    }

    if (dto.status) {
      qb.andWhere('ticket.status = :status', { status: dto.status });
    }

    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(ticket.subject) LIKE :term').orWhere(
            'LOWER(ticket.description) LIKE :term',
          );
        }),
      ).setParameter('term', term);
    }

    const [rawItems, total] = await qb.getManyAndCount();

    const items = rawItems.map((t) => {
      if (t.user) {
        delete (t.user as { password_hash?: string }).password_hash;
      }
      if (t.resolved_by_user) {
        delete (t.resolved_by_user as { password_hash?: string }).password_hash;
      }
      return t;
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
  ): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findOne({
      where: { id },
      relations: ['user', 'resolved_by_user'],
    });

    if (!ticket) {
      throw new NotFoundException({
        message: 'Support ticket not found',
        code: 'SUPPORT_TICKET_NOT_FOUND',
        details: { id },
      });
    }

    if (!isAdmin && ticket.user_id !== actingUserId) {
      throw new ForbiddenException({
        message: 'You can only access your own support tickets',
        code: 'SUPPORT_TICKET_ACCESS_DENIED',
        details: null,
      });
    }

    if (ticket.user) {
      delete (ticket.user as { password_hash?: string }).password_hash;
    }
    if (ticket.resolved_by_user) {
      delete (ticket.resolved_by_user as { password_hash?: string }).password_hash;
    }

    return ticket;
  }

  async updateStatus(
    id: string,
    dto: UpdateTicketStatusDto,
    actingUserId: string,
  ): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findOne({ where: { id } });

    if (!ticket) {
      throw new NotFoundException({
        message: 'Support ticket not found',
        code: 'SUPPORT_TICKET_NOT_FOUND',
        details: { id },
      });
    }

    const allowed = ALLOWED_TRANSITIONS[ticket.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException({
        message: `Invalid status transition from ${ticket.status} to ${dto.status}`,
        code: 'INVALID_STATUS_TRANSITION',
        details: { currentStatus: ticket.status, targetStatus: dto.status },
      });
    }

    ticket.status = dto.status;
    if (dto.status === TicketStatus.RESOLVED) {
      ticket.resolved_by = actingUserId;
      ticket.resolved_at = new Date();
    }
    ticket.updated_by = actingUserId;

    const saved = await this.tickets.save(ticket);

    if (dto.note) {
      const msg = this.messages.create({
        ticket_id: ticket.id,
        author_id: actingUserId,
        body: dto.note.trim(),
        created_by: actingUserId,
        updated_by: actingUserId,
      });
      await this.messages.save(msg);
    }

    await this.audit.record({
      event: 'support_ticket.status_updated',
      actorId: actingUserId,
      entityType: 'support_tickets',
      entityId: saved.id,
      metadata: { status: saved.status },
    });

    return saved;
  }

  async addMessage(
    id: string,
    dto: CreateTicketMessageDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<SupportTicketMessageEntity> {
    const ticket = await this.getById(id, actingUserId, isAdmin);

    const message = this.messages.create({
      ticket_id: ticket.id,
      author_id: actingUserId,
      body: dto.body.trim(),
      created_by: actingUserId,
      updated_by: actingUserId,
    });

    const saved = await this.messages.save(message);

    // If admin responds to a submitted ticket, move it to UNDER_REVIEW
    if (isAdmin && ticket.status === TicketStatus.SUBMITTED) {
      ticket.status = TicketStatus.UNDER_REVIEW;
      ticket.updated_by = actingUserId;
      await this.tickets.save(ticket);
    }

    return saved;
  }

  async listMessages(
    id: string,
    actingUserId: string,
    isAdmin = false,
  ): Promise<SupportTicketMessageEntity[]> {
    await this.getById(id, actingUserId, isAdmin);

    const raw = await this.messages
      .createQueryBuilder('msg')
      .leftJoinAndSelect('msg.author', 'author')
      .where('msg.ticket_id = :ticketId', { ticketId: id })
      .orderBy('msg.created_at', 'ASC')
      .getMany();

    return raw.map((m) => {
      if (m.author) {
        delete (m.author as { password_hash?: string }).password_hash;
      }
      return m;
    });
  }

  async attachDocument(
    id: string,
    file: Express.Multer.File | undefined,
    meta: { document_name?: string; description?: string },
    actingUserId: string,
    isAdmin = false,
  ) {
    const ticket = await this.getById(id, actingUserId, isAdmin);
    return this.documentsService.upload(
      file,
      {
        document_name: meta.document_name?.trim() || `Ticket attachment - ${id}`,
        document_type: DocumentType.SUPPORT_TICKET_ATTACHMENT,
        related_entity_type: RelatedEntityType.SUPPORT_TICKET,
        related_entity_id: id,
        description: meta.description,
        owner_id: ticket.user_id,
      },
      actingUserId,
      isAdmin,
    );
  }
}
