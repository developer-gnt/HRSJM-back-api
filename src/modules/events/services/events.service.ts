import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EventEntity, EventStatus } from '../entities/event.entity';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { ListEventsDto } from '../dto/list-events.dto';
import { NotificationsService } from '../../notifications/services/notifications.service';
import { NotificationAudience } from '../../notifications/entities/notification.entity';

export interface EventStatsSummary {
  total: number;
  upcoming: number;
  completed: number;
  cancelled: number;
}

export interface EventsListResponse {
  items: EventEntity[];
  stats: EventStatsSummary;
  totalCount: number;
  page: number;
  limit: number;
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventRepo: Repository<EventEntity>,
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  async findAll(dto: ListEventsDto): Promise<EventsListResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    // 0. Automatically mark past UPCOMING events as COMPLETED when end date has passed
    try {
      await this.eventRepo
        .createQueryBuilder()
        .update(EventEntity)
        .set({ status: EventStatus.COMPLETED })
        .where('status = :status', { status: EventStatus.UPCOMING })
        .andWhere(
          '((end_at IS NOT NULL AND end_at < :now) OR (end_at IS NULL AND start_at < :now))',
          { now: new Date() },
        )
        .execute();
    } catch {
      // Ignore update errors if read-only or concurrent
    }

    // 1. Calculate aggregated summary counts for the stat cards
    const [total, upcoming, completed, cancelled] = await Promise.all([
      this.eventRepo.count({ where: { deleted_at: IsNull() } }),
      this.eventRepo.count({ where: { status: EventStatus.UPCOMING, deleted_at: IsNull() } }),
      this.eventRepo.count({ where: { status: EventStatus.COMPLETED, deleted_at: IsNull() } }),
      this.eventRepo.count({ where: { status: EventStatus.CANCELLED, deleted_at: IsNull() } }),
    ]);

    const stats: EventStatsSummary = {
      total,
      upcoming,
      completed,
      cancelled,
    };

    // 2. Query filtered items
    const qb = this.eventRepo.createQueryBuilder('e')
      .where('e.deleted_at IS NULL');

    if (dto.status && dto.status !== 'ALL') {
      qb.andWhere('e.status = :status', { status: dto.status });
    }

    if (dto.category) {
      qb.andWhere('LOWER(e.category) = LOWER(:category)', { category: dto.category });
    }

    if (dto.search && dto.search.trim()) {
      const s = `%${dto.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(e.title) LIKE :s OR LOWER(e.location) LIKE :s OR LOWER(e.category) LIKE :s)',
        { s },
      );
    }

    if (dto.status === EventStatus.UPCOMING) {
      // Upcoming events ordered chronologically ascending (nearest first)
      qb.orderBy('e.start_at', 'ASC');
    } else if (dto.status === EventStatus.COMPLETED) {
      // Completed events ordered descending (most recent first)
      qb.orderBy('e.start_at', 'DESC');
    } else {
      // All events: UPCOMING first (ascending/nearest first), followed by COMPLETED/others (descending)
      qb.addOrderBy(
        `CASE WHEN e.status = '${EventStatus.UPCOMING}' THEN 0 ELSE 1 END`,
        'ASC',
      );
      qb.addOrderBy(
        `CASE WHEN e.status = '${EventStatus.UPCOMING}' THEN e.start_at END`,
        'ASC',
      );
      qb.addOrderBy('e.start_at', 'DESC');
    }
    qb.skip(skip).take(limit);

    const [items, totalCount] = await qb.getManyAndCount();

    return {
      items,
      stats,
      totalCount,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<EventEntity> {
    const event = await this.eventRepo.findOne({
      where: { id },
    });

    if (!event) {
      throw new NotFoundException(`Event with ID "${id}" was not found.`);
    }

    return event;
  }

  async create(dto: CreateEventDto, userId?: string): Promise<EventEntity> {
    const event = this.eventRepo.create({
      ...dto,
      created_by: userId ?? null,
      updated_by: userId ?? null,
      start_at: new Date(dto.start_at),
      end_at: dto.end_at ? new Date(dto.end_at) : null,
      status: dto.status ?? EventStatus.UPCOMING,
    });

    const saved = await this.eventRepo.save(event);

    if (this.notifications && saved.status === EventStatus.UPCOMING) {
      const dateStr = new Date(saved.start_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const locationStr = saved.location ? ` at ${saved.location}` : '';
      this.notifications
        .broadcastToAudience(
          NotificationAudience.ALL_USERS,
          `New Event: ${saved.title} 📅`,
          `Join us for "${saved.title}" on ${dateStr}${locationStr}. View full details in the Events tab.`,
          userId,
        )
        .catch(() => {});
    }

    return saved;
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    userId?: string,
  ): Promise<EventEntity> {
    const event = await this.findOne(id);

    if (dto.start_at) {
      event.start_at = new Date(dto.start_at);
    }
    if (dto.end_at !== undefined) {
      event.end_at = dto.end_at ? new Date(dto.end_at) : null;
    }

    Object.assign(event, {
      ...dto,
      updated_by: userId ?? null,
      start_at: dto.start_at ? new Date(dto.start_at) : event.start_at,
      end_at: dto.end_at !== undefined ? (dto.end_at ? new Date(dto.end_at) : null) : event.end_at,
    });

    return this.eventRepo.save(event);
  }

  async remove(id: string, userId?: string): Promise<boolean> {
    const event = await this.findOne(id);
    event.deleted_at = new Date();
    event.updated_by = userId ?? null;
    await this.eventRepo.save(event);
    return true;
  }
}
