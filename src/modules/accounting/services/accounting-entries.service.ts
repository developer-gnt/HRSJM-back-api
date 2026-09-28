import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountingEntryEntity } from '../entities/accounting-entry.entity';
import { ListEntriesDto } from '../dto/list-entries.dto';
import { AccountingPostingService } from './accounting-posting.service';
import { AuditService } from '../../audit/services/audit.service';

@Injectable()
export class AccountingEntriesService {
  constructor(
    @InjectRepository(AccountingEntryEntity)
    private readonly entries: Repository<AccountingEntryEntity>,
    private readonly posting: AccountingPostingService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(dto: ListEntriesDto): Promise<{
    items: AccountingEntryEntity[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.entries
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.lines', 'line')
      .leftJoinAndSelect('line.account', 'account')
      .orderBy('entry.entry_date', 'DESC')
      .addOrderBy('entry.entry_number', 'DESC')
      .addOrderBy('line.line_number', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (dto.reference_type) {
      qb.andWhere('entry.reference_type = :referenceType', {
        referenceType: dto.reference_type,
      });
    }
    if (dto.reference_id) {
      qb.andWhere('entry.reference_id = :referenceId', {
        referenceId: dto.reference_id,
      });
    }
    if (dto.entry_type) {
      qb.andWhere('entry.entry_type = :entryType', { entryType: dto.entry_type });
    }
    if (dto.date_from) {
      qb.andWhere('entry.entry_date >= :dateFrom', {
        dateFrom: new Date(dto.date_from),
      });
    }
    if (dto.date_to) {
      qb.andWhere('entry.entry_date <= :dateTo', {
        dateTo: toInclusiveEnd(dto.date_to),
      });
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

  async getById(
    id: string,
  ): Promise<AccountingEntryEntity & { reversed_by: { id: string; entry_number: string } | null }> {
    const entry = await this.entries.findOne({
      where: { id },
      relations: ['lines', 'lines.account', 'reversal_of'],
    });
    if (!entry) {
      throw new NotFoundException({
        message: 'Accounting entry not found',
        code: 'ACCOUNTING_ENTRY_NOT_FOUND',
        details: { id },
      });
    }

    const reversal = await this.entries.findOne({
      where: { reversal_of_entry_id: id },
    });

    return {
      ...entry,
      reversed_by: reversal
        ? { id: reversal.id, entry_number: reversal.entry_number }
        : null,
    };
  }

  /**
   * Controlled reversal: posts a mirrored REVERSAL entry in a DB transaction.
   * The original posted entry is never edited or deleted.
   */
  async reverse(
    id: string,
    actingUserId?: string,
  ): Promise<AccountingEntryEntity & { reversed_by: { id: string; entry_number: string } | null }> {
    const reversal = await this.dataSource.transaction((manager) =>
      this.posting.reverse(manager, id, actingUserId),
    );

    await this.audit.record({
      event: 'accounting_entry.reversed',
      actorId: actingUserId ?? null,
      entityType: 'accounting_entries',
      entityId: reversal.id,
      metadata: {
        reversal_entry_number: reversal.entry_number,
        reversed_entry_id: id,
      },
    });

    return this.getById(reversal.id);
  }
}

/** Inclusive upper bound: date-only strings become end-of-day UTC. */
export function toInclusiveEnd(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59.999Z`);
  }
  return new Date(value);
}