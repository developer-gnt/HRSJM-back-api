import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { MembershipCategoryEntity } from '../entities/membership-category.entity';
import { CreateMembershipCategoryDto } from '../dto/create-membership-category.dto';
import { UpdateMembershipCategoryDto } from '../dto/update-membership-category.dto';
import { ListMembershipCategoriesDto } from '../dto/list-membership-categories.dto';
import { UpdateMembershipCategoryStatusDto } from '../dto/update-membership-category-status.dto';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class MembershipCategoriesService {
  constructor(
    @InjectRepository(MembershipCategoryEntity)
    private readonly categories: Repository<MembershipCategoryEntity>,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListMembershipCategoriesDto): Promise<{
    items: MembershipCategoryEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.categories
      .createQueryBuilder('category')
      .orderBy('category.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(category.name) LIKE :term')
            .orWhere('LOWER(category.code) LIKE :term')
            .orWhere('LOWER(category.description) LIKE :term');
        }),
      ).setParameter('term', term);
    }

    if (dto.status) {
      qb.andWhere('category.status = :status', { status: dto.status });
    }

    const [items, total] = await qb.getManyAndCount();

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

  async getById(id: string): Promise<MembershipCategoryEntity> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException({
        message: 'Membership category not found',
        code: 'MEMBERSHIP_CATEGORY_NOT_FOUND',
        details: null,
      });
    }
    return category;
  }

  /**
   * Persists a category, converting a concurrent-insert unique-index
   * violation (pg 23505) into the same 409 the pre-check produces —
   * the pre-check alone cannot cover simultaneous requests.
   */
  private async saveGuarded(
    category: MembershipCategoryEntity,
  ): Promise<MembershipCategoryEntity> {
    try {
      return await this.categories.save(category);
    } catch (error) {
      const driver = error as {
        code?: string;
        constraint?: string;
        driverError?: { code?: string; constraint?: string };
      };
      if ((driver.code ?? driver.driverError?.code) !== '23505') {
        throw error;
      }
      const constraint = driver.constraint ?? driver.driverError?.constraint ?? '';
      const isCode = constraint.includes('code');
      throw new ConflictException({
        message: isCode
          ? 'Membership category with this code already exists'
          : 'Membership category with this name already exists',
        code: isCode ? 'CATEGORY_CODE_TAKEN' : 'CATEGORY_NAME_TAKEN',
        details: isCode
          ? { code: category.code }
          : { name: category.name },
      });
    }
  }

  async create(
    dto: CreateMembershipCategoryDto,
    actingUserId?: string,
  ): Promise<MembershipCategoryEntity> {
    const existingName = await this.categories
      .createQueryBuilder('category')
      .where('LOWER(category.name) = LOWER(:name)', { name: dto.name.trim() })
      .getOne();

    if (existingName) {
      throw new ConflictException({
        message: 'Membership category with this name already exists',
        code: 'CATEGORY_NAME_TAKEN',
        details: { name: dto.name },
      });
    }

    if (dto.code) {
      const existingCode = await this.categories
        .createQueryBuilder('category')
        .where('LOWER(category.code) = LOWER(:code)', { code: dto.code.trim() })
        .getOne();

      if (existingCode) {
        throw new ConflictException({
          message: 'Membership category with this code already exists',
          code: 'CATEGORY_CODE_TAKEN',
          details: { code: dto.code },
        });
      }
    }

    const category = this.categories.create({
      name: dto.name.trim(),
      code: dto.code ? dto.code.trim().toUpperCase() : null,
      description: dto.description ?? null,
      fee: dto.fee,
      validity_days: dto.validity_days ?? 365,
      status: dto.status,
      created_by: actingUserId ?? null,
      updated_by: actingUserId ?? null,
    });

    const saved = await this.saveGuarded(category);

    await this.audit.record({
      event: 'membership_category.created',
      actorId: actingUserId ?? null,
      entityType: 'membership_categories',
      entityId: saved.id,
      metadata: { name: saved.name, fee: saved.fee, validity_days: saved.validity_days },
    });

    return saved;
  }

  async update(
    id: string,
    dto: UpdateMembershipCategoryDto,
    actingUserId?: string,
  ): Promise<MembershipCategoryEntity> {
    const category = await this.getById(id);

    if (dto.name && dto.name.trim().toLowerCase() !== category.name.toLowerCase()) {
      const existingName = await this.categories
        .createQueryBuilder('category')
        .where('LOWER(category.name) = LOWER(:name) AND category.id != :id', {
          name: dto.name.trim(),
          id,
        })
        .getOne();

      if (existingName) {
        throw new ConflictException({
          message: 'Membership category with this name already exists',
          code: 'CATEGORY_NAME_TAKEN',
          details: { name: dto.name },
        });
      }
      category.name = dto.name.trim();
    }

    if (dto.code && (!category.code || dto.code.trim().toLowerCase() !== category.code.toLowerCase())) {
      const existingCode = await this.categories
        .createQueryBuilder('category')
        .where('LOWER(category.code) = LOWER(:code) AND category.id != :id', {
          code: dto.code.trim(),
          id,
        })
        .getOne();

      if (existingCode) {
        throw new ConflictException({
          message: 'Membership category with this code already exists',
          code: 'CATEGORY_CODE_TAKEN',
          details: { code: dto.code },
        });
      }
      category.code = dto.code.trim().toUpperCase();
    }

    if (dto.description !== undefined) {
      category.description = dto.description;
    }
    if (dto.fee !== undefined) {
      category.fee = dto.fee;
    }
    if (dto.validity_days !== undefined) {
      category.validity_days = dto.validity_days;
    }

    category.updated_by = actingUserId ?? null;
    const saved = await this.saveGuarded(category);

    await this.audit.record({
      event: 'membership_category.updated',
      actorId: actingUserId ?? null,
      entityType: 'membership_categories',
      entityId: saved.id,
      metadata: { changes: dto },
    });

    return saved;
  }

  async updateStatus(
    id: string,
    dto: UpdateMembershipCategoryStatusDto,
    actingUserId?: string,
  ): Promise<MembershipCategoryEntity> {
    const category = await this.getById(id);
    category.status = dto.status;
    category.updated_by = actingUserId ?? null;

    const saved = await this.categories.save(category);

    await this.audit.record({
      event: 'membership_category.status_updated',
      actorId: actingUserId ?? null,
      entityType: 'membership_categories',
      entityId: saved.id,
      metadata: { status: saved.status },
    });

    return saved;
  }
}
