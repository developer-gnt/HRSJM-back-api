import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { RightEntity, RightStatus } from '../entities/right.entity';
import { CreateRightDto } from '../dto/create-right.dto';
import { UpdateRightDto } from '../dto/update-right.dto';
import { ListRightsDto } from '../dto/list-rights.dto';

export interface RightsStatsSummary {
  total: number;
  published: number;
  drafts: number;
  archived: number;
}

export interface RightsListResponse {
  items: RightEntity[];
  stats: RightsStatsSummary;
  totalCount: number;
  page: number;
  limit: number;
}

@Injectable()
export class RightsService {
  constructor(
    @InjectRepository(RightEntity)
    private readonly rightRepo: Repository<RightEntity>,
  ) {}

  async findAll(dto: ListRightsDto): Promise<RightsListResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    // 1. Calculate aggregated summary counts
    const [total, published, drafts, archived] = await Promise.all([
      this.rightRepo.count({ where: { deleted_at: IsNull() } }),
      this.rightRepo.count({ where: { status: RightStatus.PUBLISHED, deleted_at: IsNull() } }),
      this.rightRepo.count({ where: { status: RightStatus.DRAFT, deleted_at: IsNull() } }),
      this.rightRepo.count({ where: { status: RightStatus.ARCHIVED, deleted_at: IsNull() } }),
    ]);

    const stats: RightsStatsSummary = {
      total,
      published,
      drafts,
      archived,
    };

    // 2. Query filtered items
    const qb = this.rightRepo.createQueryBuilder('r')
      .where('r.deleted_at IS NULL');

    if (dto.status && dto.status !== 'ALL') {
      qb.andWhere('r.status = :status', { status: dto.status });
    }

    if (dto.category && dto.category !== 'ALL') {
      qb.andWhere(
        '(LOWER(r.category) = LOWER(:category) OR LOWER(r.category_label) = LOWER(:category))',
        { category: dto.category },
      );
    }

    if (dto.dateRange && dto.dateRange !== 'ANY') {
      const now = new Date();
      if (dto.dateRange === 'TODAY') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        qb.andWhere('r.published_at >= :startOfDay', { startOfDay });
      } else if (dto.dateRange === 'WEEK') {
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        qb.andWhere('r.published_at >= :startOfWeek', { startOfWeek });
      } else if (dto.dateRange === 'MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        qb.andWhere('r.published_at >= :startOfMonth', { startOfMonth });
      }
    }

    if (dto.search && dto.search.trim()) {
      const s = `%${dto.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(r.title) LIKE :s OR LOWER(r.description) LIKE :s OR LOWER(r.category) LIKE :s OR LOWER(r.legal_reference) LIKE :s OR LOWER(r.highlights) LIKE :s OR LOWER(r.author) LIKE :s)',
        { s },
      );
    }

    qb.orderBy('r.published_at', 'DESC');
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

  async findOne(idOrSlug: string): Promise<RightEntity> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
    let item: RightEntity | null = null;

    if (isUuid) {
      item = await this.rightRepo.findOne({
        where: { id: idOrSlug, deleted_at: IsNull() },
      });
    }

    if (!item) {
      item = await this.rightRepo.findOne({
        where: { slug: idOrSlug, deleted_at: IsNull() },
      });
    }

    if (!item) {
      throw new NotFoundException(`Rights article "${idOrSlug}" not found`);
    }

    return item;
  }

  async create(dto: CreateRightDto, userId?: string): Promise<RightEntity> {
    const slug = dto.slug || this.slugify(dto.title);
    const item = this.rightRepo.create({
      ...dto,
      slug,
      created_by: userId ?? null,
      published_at: dto.published_at ? new Date(dto.published_at) : new Date(),
    });

    return this.rightRepo.save(item);
  }

  async update(id: string, dto: UpdateRightDto, userId?: string): Promise<RightEntity> {
    const item = await this.findOne(id);

    if (dto.title && !dto.slug && !item.slug) {
      dto.slug = this.slugify(dto.title);
    }

    Object.assign(item, dto, {
      updated_by: userId ?? null,
      published_at: dto.published_at ? new Date(dto.published_at) : item.published_at,
    });

    return this.rightRepo.save(item);
  }

  async remove(id: string, userId?: string): Promise<void> {
    const item = await this.findOne(id);
    item.deleted_at = new Date();
    item.deleted_by = userId ?? null;
    await this.rightRepo.save(item);
  }

  async incrementViews(id: string): Promise<{ views: number }> {
    const item = await this.findOne(id);
    item.views = (item.views || 0) + 1;
    await this.rightRepo.save(item);
    return { views: item.views };
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }
}
