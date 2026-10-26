import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
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

export function detectTicketSource(
  description?: string,
  subject?: string,
): 'website' | 'web' | 'app' {
  const desc = description || '';
  if (
    desc.includes('Source: Website') ||
    desc.includes('[Source: Website]') ||
    desc.includes('Complainant Information:\n- Full Name:')
  ) {
    return 'website';
  }
  if (
    desc.includes('Source: Web App') ||
    desc.includes('Source: Web') ||
    desc.includes('[Source: Web]')
  ) {
    return 'web';
  }
  if (
    desc.includes('Source: App') ||
    desc.includes('Source: Mobile App') ||
    desc.includes('[Source: App]')
  ) {
    return 'app';
  }
  return 'app';
}

import * as bcrypt from 'bcryptjs';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { UsersService } from '../../users/services/users.service';
import { MailService } from '../../mail/mail.service';
import { CreatePublicComplaintDto } from '../dto/create-public-complaint.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly tickets: Repository<SupportTicketEntity>,
    @InjectRepository(SupportTicketMessageEntity)
    private readonly messages: Repository<SupportTicketMessageEntity>,
    private readonly documentsService: DocumentsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async create(
    dto: CreateTicketDto,
    actingUserId: string,
  ): Promise<SupportTicketEntity> {
    let description = dto.description.trim();
    if (dto.source && !description.includes('Source:')) {
      const sourceLabel =
        dto.source === 'web'
          ? 'Web App'
          : dto.source === 'website'
            ? 'Website'
            : 'App';
      description += `\n\n- Source: ${sourceLabel}`;
    }

    const ticket = this.tickets.create({
      user_id: actingUserId,
      subject: dto.subject.trim(),
      description,
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

    // Real-time notifications to user and admins
    await this.notifications.sendToUser(
      actingUserId,
      'Support Ticket Created',
      `Your support ticket "${saved.subject}" has been submitted and assigned for review.`,
      actingUserId,
    );
    await this.notifications.sendToAdmins(
      'New Support Ticket',
      `Support ticket submitted: "${saved.subject}".`,
      actingUserId,
    );

    // Dispatch confirmation email to ticket creator if email is available
    try {
      const ticketRef = `HRSJM-CMP-${saved.id.slice(0, 8).toUpperCase()}`;
      const catMatch = saved.subject.match(/^\[(?:Complaint:\s*)?(.*?)\]/i);
      const complaintType = catMatch ? catMatch[1].trim() : 'Grievance / Support';

      const userRecord = await this.usersService.findById(actingUserId);
      const desc = saved.description || '';
      const descEmailMatch = desc.match(/(?:Email|email)\s*:\s*([^\s\n\r]+@[^\s\n\r]+)/);
      const recipientEmail = userRecord?.email || (descEmailMatch ? descEmailMatch[1].trim() : null);

      if (recipientEmail && recipientEmail.includes('@') && !recipientEmail.toLowerCase().includes('n/a')) {
        this.mailService
          .sendComplaintConfirmationEmail({
            complainantName: userRecord?.full_name || 'Citizen',
            complainantEmail: recipientEmail,
            ticketId: ticketRef,
            complaintType,
            state: 'India',
            policeStation: 'Assigned Center',
            details: saved.description,
            submittedAt: saved.created_at || new Date(),
            status: saved.status,
          })
          .catch((mailErr) => {
            this.logger.error(`Failed to send complaint confirmation email for ticket ${ticketRef}: ${mailErr.message}`);
          });
      }
    } catch (mailErr) {
      this.logger.warn(`Error resolving user email for ticket creation: ${(mailErr as Error).message}`);
    }

    return saved;
  }

  async createPublicComplaint(dto: CreatePublicComplaintDto): Promise<{
    success: boolean;
    ticketId: string;
    id: string;
    status: string;
    complainantName: string;
    complaintType: string;
    message: string;
    submittedAt: Date;
  }> {
    const cleanPhone = dto.phone.trim();
    let targetUserId = '';

    // Check if user exists by phone or email
    const existingUser = await this.usersService.findByLoginIdentifier(cleanPhone);
    if (existingUser) {
      targetUserId = existingUser.id;
    } else if (dto.email) {
      const emailUser = await this.usersService.findByLoginIdentifier(dto.email.trim());
      if (emailUser) {
        targetUserId = emailUser.id;
      }
    }

    // If new user, create a user record with role USER
    if (!targetUserId) {
      const passwordHash = await bcrypt.hash('Citizen@123', 10);
      const newUser = await this.usersService.createUserWithRole({
        full_name: dto.fullName.trim() || 'Citizen Complainant',
        mobile_number: cleanPhone,
        email: dto.email ? dto.email.trim().toLowerCase() : null,
        password_hash: passwordHash,
        roleName: 'USER',
      });
      targetUserId = newUser.id;
    }

    const subject = `[${dto.complaintType.trim()}] ${dto.fullName.trim()} - ${dto.policeStation.trim()}, ${dto.state.trim()}`;
    const description = `Complainant Information:
- Full Name: ${dto.fullName.trim()}
- Phone: ${cleanPhone}
- Email: ${dto.email ? dto.email.trim().toLowerCase() : 'Not Provided'}
- State: ${dto.state.trim()}
- Nearby Police Station: ${dto.policeStation.trim()}
- Complaint Category: ${dto.complaintType.trim()}
- Source: Website

Details of Concern:
${dto.details.trim()}`;

    let fullDescription = description;
    if (dto.aadhaarFileName || dto.handwrittenFileName || dto.reportedToOtherDept) {
      fullDescription += `\n\nVerified Document Attachments:`;
      if (dto.aadhaarFileName) fullDescription += `\n- Aadhaar Card: ${dto.aadhaarFileName}`;
      if (dto.handwrittenFileName) fullDescription += `\n- Handwritten Complaint: ${dto.handwrittenFileName}`;
      if (dto.reportedToOtherDept) {
        fullDescription += `\n- Reported to Another Dept: Yes (${dto.otherDeptName || 'Specified'})`;
        if (dto.otherDeptFileName) fullDescription += ` (Copy: ${dto.otherDeptFileName})`;
      } else {
        fullDescription += `\n- Reported to Another Dept: No`;
      }
    }

    const ticket = this.tickets.create({
      user_id: targetUserId,
      subject,
      description: fullDescription,
      status: TicketStatus.SUBMITTED,
      created_by: targetUserId,
      updated_by: targetUserId,
    });

    const saved = await this.tickets.save(ticket);
    const ticketRef = `HRSJM-CMP-${saved.id.slice(0, 8).toUpperCase()}`;

    await this.audit.record({
      event: 'support_ticket.public_complaint',
      actorId: targetUserId,
      entityType: 'support_tickets',
      entityId: saved.id,
      metadata: {
        ticketRef,
        subject: saved.subject,
        complainantName: dto.fullName.trim(),
        phone: cleanPhone,
      },
    });

    // Send notifications to user and admin
    await this.notifications.sendToUser(
      targetUserId,
      'Complaint Registered',
      `Your complaint regarding "${dto.complaintType.trim()}" has been registered (Ticket ID: ${ticketRef}). Our team will review your case.`,
      targetUserId,
    );
    await this.notifications.sendToAdmins(
      'New Citizen Complaint',
      `New complaint filed by ${dto.fullName.trim()} (${cleanPhone}) for "${dto.complaintType.trim()}" - Ref: ${ticketRef}.`,
      targetUserId,
    );

    // Shoot confirmation email to complainant
    if (dto.email && dto.email.includes('@')) {
      this.mailService
        .sendComplaintConfirmationEmail({
          complainantName: dto.fullName.trim(),
          complainantEmail: dto.email.trim().toLowerCase(),
          complainantPhone: cleanPhone,
          ticketId: ticketRef,
          complaintType: dto.complaintType.trim(),
          state: dto.state.trim(),
          policeStation: dto.policeStation.trim(),
          details: dto.details.trim(),
          submittedAt: saved.created_at,
          status: 'Submitted & Assigned for Review',
        })
        .catch((mailErr) => {
          console.error(
            `[SupportService] Failed to send complaint confirmation email: ${mailErr.message}`,
          );
        });
    }

    return {
      success: true,
      ticketId: ticketRef,
      id: saved.id,
      status: saved.status,
      complainantName: dto.fullName.trim(),
      complaintType: dto.complaintType.trim(),
      message:
        'Your complaint has been successfully registered and assigned for review. A confirmation email has been sent.',
      submittedAt: saved.created_at,
    };
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

    if (dto.category && dto.category !== 'ALL') {
      const catTerm = `%[${dto.category.toLowerCase()}]%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(ticket.subject) LIKE :catTerm').orWhere(
            'LOWER(ticket.description) LIKE :catTerm',
          );
        }),
      ).setParameter('catTerm', catTerm);
    }

    if (dto.from_date) {
      qb.andWhere('ticket.created_at >= :fromDate', { fromDate: dto.from_date });
    }

    if (dto.to_date) {
      qb.andWhere('ticket.created_at <= :toDate', { toDate: dto.to_date });
    }

    const [rawItems, total] = await qb.getManyAndCount();

    let items = rawItems.map((t) => {
      if (t.user) {
        delete (t.user as { password_hash?: string }).password_hash;
      }
      if (t.resolved_by_user) {
        delete (t.resolved_by_user as { password_hash?: string }).password_hash;
      }
      const ticketRef = `HRSJM-CMP-${t.id.slice(0, 8).toUpperCase()}`;
      const catMatch = t.subject.match(/^\[(?:Complaint:\s*)?(.*?)\]/i);
      const category = catMatch ? catMatch[1].trim() : 'Assistance';
      const source = detectTicketSource(t.description, t.subject);
      return Object.assign(t, {
        ticket_number: ticketRef,
        ticketId: ticketRef,
        category,
        priority: 'High',
        source,
      });
    });

    if (dto.source && dto.source !== 'ALL') {
      const targetSource = dto.source.toLowerCase().trim();
      items = items.filter((it: any) => it.source === targetSource);
    }

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

  async getStats(
    dto: ListTicketsDto,
    actingUserId: string,
    isAdmin = false,
  ): Promise<{
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
  }> {
    const buildBase = () => {
      const qb = this.tickets.createQueryBuilder('ticket');
      if (!isAdmin) {
        qb.andWhere('ticket.user_id = :userId', { userId: actingUserId });
      } else if (dto.user_id) {
        qb.andWhere('ticket.user_id = :userId', { userId: dto.user_id });
      }
      if (dto.category && dto.category !== 'ALL') {
        const catTerm = `%[${dto.category.toLowerCase()}]%`;
        qb.andWhere(
          new Brackets((w) => {
            w.where('LOWER(ticket.subject) LIKE :catTerm').orWhere(
              'LOWER(ticket.description) LIKE :catTerm',
            );
          }),
        ).setParameter('catTerm', catTerm);
      }
      if (dto.from_date) {
        qb.andWhere('ticket.created_at >= :fromDate', { fromDate: dto.from_date });
      }
      if (dto.to_date) {
        qb.andWhere('ticket.created_at <= :toDate', { toDate: dto.to_date });
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
      return qb;
    };

    const [total, open, inProgress, resolved, closed] = await Promise.all([
      buildBase().getCount(),
      buildBase().andWhere('ticket.status = :st', { st: TicketStatus.SUBMITTED }).getCount(),
      buildBase().andWhere('ticket.status = :st', { st: TicketStatus.UNDER_REVIEW }).getCount(),
      buildBase().andWhere('ticket.status = :st', { st: TicketStatus.RESOLVED }).getCount(),
      buildBase().andWhere('ticket.status = :st', { st: TicketStatus.CLOSED }).getCount(),
    ]);

    return {
      total,
      open,
      inProgress,
      resolved,
      closed,
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

    const ticketRef = `HRSJM-CMP-${ticket.id.slice(0, 8).toUpperCase()}`;
    const catMatch = ticket.subject.match(/^\[(?:Complaint:\s*)?(.*?)\]/i);
    const category = catMatch ? catMatch[1].trim() : 'Assistance';
    const source = detectTicketSource(ticket.description, ticket.subject);
    return Object.assign(ticket, {
      ticket_number: ticketRef,
      ticketId: ticketRef,
      category,
      priority: 'High',
      source,
    });
  }

  async updateStatus(
    id: string,
    dto: UpdateTicketStatusDto,
    actingUserId: string,
  ): Promise<SupportTicketEntity> {
    const ticket = await this.tickets.findOne({
      where: { id },
      relations: ['user'],
    });

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

    // Real-time notification to ticket owner
    await this.notifications.sendToUser(
      saved.user_id,
      'Support Ticket Status Updated',
      `Your support ticket "${saved.subject}" is now ${saved.status}.`,
      actingUserId,
    );

    // Shoot transactional email to complainant on action (review started, resolved, closed)
    try {
      const desc = saved.description || '';
      const descEmailMatch = desc.match(/(?:Email|email)\s*:\s*([^\s\n\r]+@[^\s\n\r]+)/);
      const descNameMatch = desc.match(/(?:Full Name|Complainant)\s*:\s*([^\n\r]+)/);

      const recipientEmail =
        ticket.user?.email ||
        (descEmailMatch ? descEmailMatch[1].trim() : null);
      const recipientName =
        ticket.user?.full_name ||
        (descNameMatch ? descNameMatch[1].trim() : null) ||
        'Citizen';

      if (
        recipientEmail &&
        recipientEmail.includes('@') &&
        !recipientEmail.toLowerCase().includes('n/a')
      ) {
        const ticketRef = `HRSJM-CMP-${saved.id.slice(0, 8).toUpperCase()}`;
        const catMatch = saved.subject.match(/^\[(?:Complaint:\s*)?(.*?)\]/i);
        const category = catMatch ? catMatch[1].trim() : 'Grievance';

        this.mailService
          .sendTicketStatusUpdateEmail({
            complainantName: recipientName,
            complainantEmail: recipientEmail,
            ticketId: ticketRef,
            subject: saved.subject,
            category,
            status: saved.status as any,
            note: dto.note?.trim(),
            updatedAt: saved.updated_at || new Date(),
          })
          .catch((mailErr) => {
            this.logger.error(
              `[SupportService] Failed to send status update email for ${ticketRef}: ${mailErr.message}`,
            );
          });
      }
    } catch (mailTriggerErr) {
      this.logger.warn(`Error resolving email for ticket update: ${(mailTriggerErr as Error).message}`);
    }

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

    // Real-time notification: if admin replied, notify user; if user replied, notify admins
    if (isAdmin) {
      await this.notifications.sendToUser(
        ticket.user_id,
        'Support Ticket Update',
        `An administrator replied to your ticket: "${ticket.subject}".`,
        actingUserId,
      );
    } else {
      await this.notifications.sendToAdmins(
        'New Ticket Message',
        `New reply on ticket: "${ticket.subject}".`,
        actingUserId,
      );
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
