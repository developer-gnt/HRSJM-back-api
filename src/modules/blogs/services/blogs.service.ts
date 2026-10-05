import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { BlogEntity, BlogStatus } from '../entities/blog.entity';
import { CreateBlogDto } from '../dto/create-blog.dto';
import { UpdateBlogDto } from '../dto/update-blog.dto';
import { ListBlogsDto } from '../dto/list-blogs.dto';

export interface BlogStatsSummary {
  total: number;
  published: number;
  drafts: number;
  archived: number;
}

export interface BlogsListResponse {
  items: BlogEntity[];
  stats: BlogStatsSummary;
  totalCount: number;
  page: number;
  limit: number;
}

@Injectable()
export class BlogsService {
  constructor(
    @InjectRepository(BlogEntity)
    private readonly blogRepo: Repository<BlogEntity>,
  ) {}

  async findAll(dto: ListBlogsDto): Promise<BlogsListResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    const skip = (page - 1) * limit;

    // 1. Calculate aggregated summary counts
    const [total, published, drafts, archived] = await Promise.all([
      this.blogRepo.count({ where: { deleted_at: IsNull() } }),
      this.blogRepo.count({ where: { status: BlogStatus.PUBLISHED, deleted_at: IsNull() } }),
      this.blogRepo.count({ where: { status: BlogStatus.DRAFT, deleted_at: IsNull() } }),
      this.blogRepo.count({ where: { status: BlogStatus.ARCHIVED, deleted_at: IsNull() } }),
    ]);

    const stats: BlogStatsSummary = {
      total,
      published,
      drafts,
      archived,
    };

    // 2. Query filtered items
    const qb = this.blogRepo.createQueryBuilder('b')
      .where('b.deleted_at IS NULL');

    if (dto.status && dto.status !== 'ALL') {
      qb.andWhere('b.status = :status', { status: dto.status });
    }

    if (dto.category) {
      qb.andWhere('LOWER(b.category) = LOWER(:category)', { category: dto.category });
    }

    if (dto.dateRange && dto.dateRange !== 'ANY') {
      const now = new Date();
      if (dto.dateRange === 'TODAY') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        qb.andWhere('b.published_at >= :startOfDay', { startOfDay });
      } else if (dto.dateRange === 'WEEK') {
        const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        qb.andWhere('b.published_at >= :startOfWeek', { startOfWeek });
      } else if (dto.dateRange === 'MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        qb.andWhere('b.published_at >= :startOfMonth', { startOfMonth });
      }
    }

    if (dto.search && dto.search.trim()) {
      const s = `%${dto.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(b.title) LIKE :s OR LOWER(b.excerpt) LIKE :s OR LOWER(b.category) LIKE :s OR LOWER(b.author) LIKE :s)',
        { s },
      );
    }

    qb.orderBy('b.published_at', 'DESC');
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

  async findOne(id: string): Promise<BlogEntity> {
    const item = await this.blogRepo.findOne({
      where: { id, deleted_at: IsNull() },
    });
    if (!item) {
      throw new NotFoundException(`Blog article with ID ${id} not found`);
    }
    return item;
  }

  async create(dto: CreateBlogDto, userId?: string): Promise<BlogEntity> {
    const slug = dto.slug || this.generateSlug(dto.title);
    const item = this.blogRepo.create({
      ...dto,
      slug,
      published_at: dto.published_at ? new Date(dto.published_at) : new Date(),
      status: dto.status ?? BlogStatus.PUBLISHED,
      author: dto.author || 'HRSJM Admin',
      created_by: userId,
      updated_by: userId,
    });
    return this.blogRepo.save(item);
  }

  async update(id: string, dto: UpdateBlogDto, userId?: string): Promise<BlogEntity> {
    const item = await this.findOne(id);

    if (dto.title && !dto.slug && !item.slug) {
      item.slug = this.generateSlug(dto.title);
    }

    Object.assign(item, {
      ...dto,
      published_at: dto.published_at ? new Date(dto.published_at) : item.published_at,
      updated_by: userId,
    });

    return this.blogRepo.save(item);
  }

  async remove(id: string, userId?: string): Promise<void> {
    const item = await this.findOne(id);
    item.deleted_at = new Date();
    item.deleted_by = userId ?? null;
    await this.blogRepo.save(item);
  }

  async incrementViews(id: string): Promise<{ views: number }> {
    const item = await this.findOne(id);
    item.views = (item.views || 0) + 1;
    await this.blogRepo.save(item);
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
