import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PermissionEntity } from '../entities/permission.entity';
import { ListPermissionsDto } from '../dto/list-permissions.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissions: Repository<PermissionEntity>,
  ) {}

  async listPermissions(dto: ListPermissionsDto): Promise<{
    items: { id: string; name: string; description: string | null }[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.permissions
      .createQueryBuilder('permission')
      .orderBy('permission.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(permission.name) LIKE :term').orWhere(
            'LOWER(permission.description) LIKE :term',
          );
        }),
      ).setParameter('term', term);
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findByName(name: string): Promise<PermissionEntity> {
    const permission = await this.permissions.findOne({ where: { name } });
    if (!permission) {
      throw new NotFoundException({
        message: 'Permission not found',
        code: 'PERMISSION_NOT_FOUND',
        details: null,
      });
    }
    return permission;
  }

  async createIfMissing(
    name: string,
    description: string,
  ): Promise<PermissionEntity> {
    const existing = await this.permissions.findOne({ where: { name } });
    if (existing) return existing;
    try {
      return await this.permissions.save(
        this.permissions.create({ name, description }),
      );
    } catch (error) {
      // Unique-violation race → treat as existing
      if (
        error instanceof Error &&
        (error as { code?: string }).code === '23505'
      ) {
        const found = await this.permissions.findOne({ where: { name } });
        if (found) return found;
      }
      throw error;
    }
  }

  async assertUniqueName(name: string): Promise<void> {
    const found = await this.permissions.findOne({ where: { name } });
    if (found) {
      throw new ConflictException({
        message: 'Permission already exists',
        code: 'PERMISSION_ALREADY_EXISTS',
        details: null,
      });
    }
  }
}
