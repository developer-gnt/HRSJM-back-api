import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { NewsEntity, NewsStatus } from '../entities/news.entity';
import { CreateNewsDto } from '../dto/create-news.dto';
import { UpdateNewsDto } from '../dto/update-news.dto';
import { ListNewsDto } from '../dto/list-news.dto';

export interface NewsStatsSummary {
  total: number;
  published: number;
  drafts: number;
  archived: number;
}

export interface NewsListResponse {
  items: NewsEntity[];
  stats: NewsStatsSummary;
  totalCount: number;
  page: number;
  limit: number;
}

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(NewsEntity)
    private readonly newsRepo: Repository<NewsEntity>,
  ) {}

  async findAll(dto: ListNewsDto): Promise<NewsListResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    // 1. Calculate aggregated summary counts for stat cards & status tabs
    const [total, published, drafts, archived] = await Promise.all([
      this.newsRepo.count({ where: { deleted_at: IsNull() } }),
      this.newsRepo.count({ where: { status: NewsStatus.PUBLISHED, deleted_at: IsNull() } }),
      this.newsRepo.count({ where: { status: NewsStatus.DRAFT, deleted_at: IsNull() } }),
      this.newsRepo.count({ where: { status: NewsStatus.ARCHIVED, deleted_at: IsNull() } }),
    ]);

    const stats: NewsStatsSummary = {
      total,
      published,
      drafts,
      archived,
    };

    // 2. Query filtered items
    const qb = this.newsRepo.createQueryBuilder('n')
      .where('n.deleted_at IS NULL');

    if (dto.status && dto.status !== 'ALL') {
      qb.andWhere('n.status = :status', { status: dto.status });
    }

    if (dto.category) {
      qb.andWhere('LOWER(n.category) = LOWER(:category)', { category: dto.category });
    }

    if (dto.search && dto.search.trim()) {
      const s = `%${dto.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(n.title) LIKE :s OR LOWER(n.summary) LIKE :s OR LOWER(n.category) LIKE :s OR LOWER(n.author) LIKE :s)',
        { s },
      );
    }

    qb.orderBy('n.published_at', 'DESC');
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

  async findOne(id: string): Promise<NewsEntity> {
    const item = await this.newsRepo.findOne({
      where: { id, deleted_at: IsNull() },
    });
    if (!item) {
      throw new NotFoundException(`News article with ID ${id} not found`);
    }
    return item;
  }

  async create(dto: CreateNewsDto, userId?: string): Promise<NewsEntity> {
    const slug = dto.slug || this.generateSlug(dto.title);
    const item = this.newsRepo.create({
      ...dto,
      slug,
      published_at: dto.published_at ? new Date(dto.published_at) : new Date(),
      status: dto.status ?? NewsStatus.PUBLISHED,
      author: dto.author || 'HRSJM Team',
      created_by: userId,
      updated_by: userId,
    });
    return this.newsRepo.save(item);
  }

  async update(id: string, dto: UpdateNewsDto, userId?: string): Promise<NewsEntity> {
    const item = await this.findOne(id);

    if (dto.title && !dto.slug && !item.slug) {
      item.slug = this.generateSlug(dto.title);
    }

    Object.assign(item, {
      ...dto,
      published_at: dto.published_at ? new Date(dto.published_at) : item.published_at,
      updated_by: userId,
    });

    return this.newsRepo.save(item);
  }

  async remove(id: string, userId?: string): Promise<void> {
    const item = await this.findOne(id);
    item.deleted_at = new Date();
    item.deleted_by = userId ?? null;
    await this.newsRepo.save(item);
  }

  async incrementViews(id: string): Promise<{ views: number }> {
    const item = await this.findOne(id);
    item.views = (item.views || 0) + 1;
    await this.newsRepo.save(item);
    return { views: item.views };
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 200);
  }
}
