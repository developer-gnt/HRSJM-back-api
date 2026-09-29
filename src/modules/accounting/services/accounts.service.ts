import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AccountEntity } from '../entities/account.entity';
import { CreateAccountDto } from '../dto/create-account.dto';
import { UpdateAccountDto } from '../dto/update-account.dto';
import { UpdateAccountStatusDto } from '../dto/update-account-status.dto';
import { ListAccountsDto } from '../dto/list-accounts.dto';
import { AccountType } from '../enums/accounting.enums';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListAccountsDto): Promise<{
    items: AccountEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.accounts
      .createQueryBuilder('account')
      .leftJoinAndSelect('account.parent', 'parent')
      .orderBy('account.account_code', 'ASC', 'NULLS LAST')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.account_type) {
      qb.andWhere('account.account_type = :type', { type: dto.account_type });
    }
    if (dto.parent_account_id) {
      qb.andWhere('account.parent_account_id = :parentId', {
        parentId: dto.parent_account_id,
      });
    }
    if (dto.is_active !== undefined) {
      qb.andWhere('account.is_active = :active', { active: dto.is_active });
    }
    if (dto.search) {
      const term = `%${dto.search.toLowerCase()}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(account.account_name) LIKE :term').orWhere(
            'LOWER(account.account_code) LIKE :term',
          );
        }),
      ).setParameter('term', term);
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

  async getById(id: string): Promise<AccountEntity> {
    const account = await this.accounts.findOne({
      where: { id },
      relations: ['parent'],
    });
    if (!account) {
      throw new NotFoundException({
        message: 'Account not found',
        code: 'ACCOUNT_NOT_FOUND',
        details: { id },
      });
    }
    return account;
  }

  async create(
    dto: CreateAccountDto,
    actingUserId?: string,
  ): Promise<AccountEntity> {
    if (dto.parent_account_id) {
      const parent = await this.accounts.findOne({
        where: { id: dto.parent_account_id },
      });
      if (!parent) {
        throw new NotFoundException({
          message: 'Parent account not found',
          code: 'ACCOUNT_PARENT_NOT_FOUND',
          details: { parent_account_id: dto.parent_account_id },
        });
      }
      if (parent.account_type !== dto.account_type) {
        throw new BadRequestException({
          message: 'Parent account must be of the same account type',
          code: 'ACCOUNT_PARENT_TYPE_MISMATCH',
          details: {
            parent_type: parent.account_type,
            account_type: dto.account_type,
          },
        });
      }
    }

    const existingName = await this.accounts
      .createQueryBuilder('account')
      .where('LOWER(account.account_name) = LOWER(:name)', {
        name: dto.account_name.trim(),
      })
      .getOne();
    if (existingName) {
      throw new ConflictException({
        message: 'Account with this name already exists',
        code: 'ACCOUNT_NAME_TAKEN',
        details: { account_name: dto.account_name },
      });
    }

    let finalCode: string;
    if (dto.account_code && dto.account_code.trim().length > 0) {
      const code = dto.account_code.trim().toUpperCase();
      const existingCode = await this.accounts
        .createQueryBuilder('account')
        .where('LOWER(account.account_code) = LOWER(:code)', {
          code: code.toLowerCase(),
        })
        .getOne();
      if (existingCode) {
        throw new ConflictException({
          message: 'Account with this code already exists',
          code: 'ACCOUNT_CODE_TAKEN',
          details: { account_code: dto.account_code },
        });
      }
      finalCode = code;
    } else {
      finalCode = await this.generateNextAccountCode(dto.account_type);
    }

    const account = this.accounts.create({
      account_name: dto.account_name.trim(),
      account_code: finalCode,
      account_type: dto.account_type,
      parent_account_id: dto.parent_account_id ?? null,
      description: dto.description ?? null,
      is_active: true,
      created_by: actingUserId ?? null,
      updated_by: actingUserId ?? null,
    });

    const saved = await this.saveGuarded(account);

    await this.audit.record({
      event: 'account.created',
      actorId: actingUserId ?? null,
      entityType: 'accounts',
      entityId: saved.id,
      metadata: {
        account_name: saved.account_name,
        account_type: saved.account_type,
        account_code: saved.account_code,
      },
    });

    return saved;
  }

  async generateNextAccountCode(accountType: AccountType): Promise<string> {
    const baseCodeMap: Record<string, number> = {
      ASSET: 1001,
      LIABILITY: 2001,
      FUND_EQUITY: 3001,
      INCOME: 4001,
      EXPENSE: 5001,
    };

    const base = baseCodeMap[accountType] ?? 1001;
    const minRange = Math.floor(base / 1000) * 1000;
    const maxRange = minRange + 999;

    const existingAccounts = await this.accounts
      .createQueryBuilder('account')
      .select('account.account_code', 'account_code')
      .where('account.account_type = :accountType', { accountType })
      .getRawMany<{ account_code: string | null }>();

    let maxNum = base - 1;
    for (const acc of existingAccounts) {
      if (acc.account_code) {
        const parsed = parseInt(acc.account_code, 10);
        if (!isNaN(parsed) && parsed >= minRange && parsed <= maxRange) {
          if (parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }

    let candidate = maxNum + 1;
    while (
      await this.accounts.findOne({
        where: { account_code: candidate.toString() },
      })
    ) {
      candidate++;
    }

    return candidate.toString();
  }

  async update(
    id: string,
    dto: UpdateAccountDto,
    actingUserId?: string,
  ): Promise<AccountEntity> {
    const account = await this.getById(id);

    if (
      dto.account_name &&
      dto.account_name.trim().toLowerCase() !== account.account_name.toLowerCase()
    ) {
      const existingName = await this.accounts
        .createQueryBuilder('account')
        .where('LOWER(account.account_name) = LOWER(:name) AND account.id != :id', {
          name: dto.account_name.trim(),
          id,
        })
        .getOne();
      if (existingName) {
        throw new ConflictException({
          message: 'Account with this name already exists',
          code: 'ACCOUNT_NAME_TAKEN',
          details: { account_name: dto.account_name },
        });
      }
      account.account_name = dto.account_name.trim();
    }

    if (
      dto.account_code &&
      (!account.account_code ||
        dto.account_code.trim().toLowerCase() !== account.account_code.toLowerCase())
    ) {
      const existingCode = await this.accounts
        .createQueryBuilder('account')
        .where('LOWER(account.account_code) = LOWER(:code) AND account.id != :id', {
          code: dto.account_code.trim(),
          id,
        })
        .getOne();
      if (existingCode) {
        throw new ConflictException({
          message: 'Account with this code already exists',
          code: 'ACCOUNT_CODE_TAKEN',
          details: { account_code: dto.account_code },
        });
      }
      account.account_code = dto.account_code.trim().toUpperCase();
    }

    if (dto.parent_account_id !== undefined) {
      if (dto.parent_account_id === account.id) {
        throw new BadRequestException({
          message: 'An account cannot be its own parent',
          code: 'ACCOUNT_PARENT_SELF',
          details: null,
        });
      }
      if (dto.parent_account_id !== null) {
        const parent = await this.accounts.findOne({
          where: { id: dto.parent_account_id },
        });
        if (!parent) {
          throw new NotFoundException({
            message: 'Parent account not found',
            code: 'ACCOUNT_PARENT_NOT_FOUND',
            details: { parent_account_id: dto.parent_account_id },
          });
        }
        if (parent.account_type !== account.account_type) {
          throw new BadRequestException({
            message: 'Parent account must be of the same account type',
            code: 'ACCOUNT_PARENT_TYPE_MISMATCH',
            details: {
              parent_type: parent.account_type,
              account_type: account.account_type,
            },
          });
        }
      }
      account.parent_account_id = dto.parent_account_id ?? null;
    }

    if (dto.description !== undefined) {
      account.description = dto.description;
    }

    account.updated_by = actingUserId ?? null;
    const saved = await this.saveGuarded(account);

    await this.audit.record({
      event: 'account.updated',
      actorId: actingUserId ?? null,
      entityType: 'accounts',
      entityId: saved.id,
      metadata: { changes: dto },
    });

    return saved;
  }

  async updateStatus(
    id: string,
    dto: UpdateAccountStatusDto,
    actingUserId?: string,
  ): Promise<AccountEntity> {
    const account = await this.getById(id);

    if (!dto.is_active) {
      const activeChildren = await this.accounts.count({
        where: { parent_account_id: id, is_active: true },
      });
      if (activeChildren > 0) {
        throw new ConflictException({
          message: 'Account has active child accounts and cannot be deactivated',
          code: 'ACCOUNT_HAS_ACTIVE_CHILDREN',
          details: { active_children: activeChildren },
        });
      }
    }

    account.is_active = dto.is_active;
    account.updated_by = actingUserId ?? null;
    const saved = await this.accounts.save(account);

    await this.audit.record({
      event: 'account.status_updated',
      actorId: actingUserId ?? null,
      entityType: 'accounts',
      entityId: saved.id,
      metadata: { is_active: saved.is_active },
    });

    return saved;
  }

  /**
   * Converts a concurrent-insert unique-index violation (pg 23505) into the
   * same 409 the pre-checks produce — the pre-check alone cannot cover
   * simultaneous requests.
   */
  private async saveGuarded(account: AccountEntity): Promise<AccountEntity> {
    try {
      return await this.accounts.save(account);
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
          ? 'Account with this code already exists'
          : 'Account with this name already exists',
        code: isCode ? 'ACCOUNT_CODE_TAKEN' : 'ACCOUNT_NAME_TAKEN',
        details: isCode
          ? { account_code: account.account_code }
          : { account_name: account.account_name },
      });
    }
  }
}
