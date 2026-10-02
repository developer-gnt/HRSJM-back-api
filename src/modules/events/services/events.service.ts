import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { EventEntity, EventStatus } from '../entities/event.entity';
import { CreateEventDto } from '../dto/create-event.dto';
import { UpdateEventDto } from '../dto/update-event.dto';
import { ListEventsDto } from '../dto/list-events.dto';

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
  ) {}

  async findAll(dto: ListEventsDto): Promise<EventsListResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

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

    qb.orderBy('e.start_at', 'DESC');
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

    return this.eventRepo.save(event);
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
