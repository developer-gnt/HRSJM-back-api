import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { AccountEntity } from '../entities/account.entity';
import { AccountingEntryEntity } from '../entities/accounting-entry.entity';
import { AccountingEntryLineEntity } from '../entities/accounting-entry-line.entity';
import { EntryType, ReferenceType } from '../enums/accounting.enums';

export interface PostingLineInput {
  account_id?: string;
  account_code?: string;
  debit_amount?: number;
  credit_amount?: number;
  line_description?: string | null;
}

export interface PostEntryParams {
  entry_date: Date;
  reference_type: ReferenceType;
  reference_id: string;
  description: string;
  lines: PostingLineInput[];
  acting_user_id?: string | null;
}

/** Paise-integer conversion — money comparisons avoid float drift. */
export function toPaise(value: number): number {
  return Math.round(Number(value) * 100);
}

function formatEntryNumber(entryDate: Date, seq: number): string {
  const y = entryDate.getUTCFullYear();
  const m = String(entryDate.getUTCMonth() + 1).padStart(2, '0');
  const d = entryDate.getUTCDate().toString().padStart(2, '0');
  return `JE-${y}${m}${d}-${String(seq).padStart(5, '0')}`;
}

/**
 * Core double-entry posting engine (used by Phases 5, 7, 8, 9).
 * Every method takes the caller's transactional EntityManager so posting is
 * atomic with the surrounding financial operation. Posted entries are
 * immutable; corrections go through `reverse` (mirrored entry) only.
 */
@Injectable()
export class AccountingPostingService {
  /**
   * Posts a balanced journal entry inside the caller's transaction.
   * Idempotent per (reference_type, reference_id): when a JOURNAL entry for
   * the same source document already exists, it is returned unchanged.
   */
  async postEntry(
    manager: EntityManager,
    params: PostEntryParams,
  ): Promise<AccountingEntryEntity> {
    const lines = params.lines ?? [];
    if (lines.length < 2) {
      throw new BadRequestException({
        message: 'Accounting entry requires at least two lines',
        code: 'ACCOUNTING_ENTRY_INVALID_LINES',
        details: { line_count: lines.length },
      });
    }

    let debitTotal = 0;
    let creditTotal = 0;
    for (const line of lines) {
      const debit = line.debit_amount ?? 0;
      const credit = line.credit_amount ?? 0;
      if (!line.account_id && !line.account_code) {
        throw new BadRequestException({
          message: 'Each entry line requires an account',
          code: 'ACCOUNTING_LINE_MISSING_ACCOUNT',
          details: null,
        });
      }
      if (debit < 0 || credit < 0) {
        throw new BadRequestException({
          message: 'Entry line amounts must not be negative',
          code: 'ACCOUNTING_LINE_NEGATIVE',
          details: { debit_amount: debit, credit_amount: credit },
        });
      }
      const debitPaise = toPaise(debit);
      const creditPaise = toPaise(credit);
      if (debitPaise > 0 && creditPaise > 0) {
        throw new BadRequestException({
          message: 'Each entry line must be either debit or credit, not both',
          code: 'ACCOUNTING_LINE_BOTH_SIDES',
          details: { debit_amount: debit, credit_amount: credit },
        });
      }
      if (debitPaise === 0 && creditPaise === 0) {
        throw new BadRequestException({
          message: 'Each entry line must carry a debit or credit amount',
          code: 'ACCOUNTING_LINE_EMPTY',
          details: null,
        });
      }
      debitTotal += debitPaise;
      creditTotal += creditPaise;
    }

    if (debitTotal !== creditTotal) {
      throw new BadRequestException({
        message: 'Accounting entry is not balanced: total debit must equal total credit',
        code: 'ACCOUNTING_ENTRY_UNBALANCED',
        details: { total_debit: debitTotal / 100, total_credit: creditTotal / 100 },
      });
    }

    const existing = await manager.findOne(AccountingEntryEntity, {
      where: {
        reference_type: params.reference_type,
        reference_id: params.reference_id,
        entry_type: EntryType.JOURNAL,
      },
    });
    if (existing) {
      return existing;
    }

    const accounts = await this.resolveAccounts(manager, lines);

    const entry = manager.create(AccountingEntryEntity, {
      entry_number: await this.generateEntryNumber(manager, params.entry_date),
      entry_date: params.entry_date,
      entry_type: EntryType.JOURNAL,
      reference_type: params.reference_type,
      reference_id: params.reference_id,
      description: params.description,
      created_by: params.acting_user_id ?? null,
      updated_by: params.acting_user_id ?? null,
    });
    const savedEntry = await manager.save(AccountingEntryEntity, entry);

    const lineEntities = lines.map((line, index) => {
      const account = accounts[line.account_id ?? line.account_code!];
      return manager.create(AccountingEntryLineEntity, {
        accounting_entry_id: savedEntry.id,
        account_id: account.id,
        debit_amount: line.debit_amount ?? 0,
        credit_amount: line.credit_amount ?? 0,
        line_description: line.line_description ?? null,
        line_number: index + 1,
        created_by: params.acting_user_id ?? null,
        updated_by: params.acting_user_id ?? null,
      });
    });
    await manager.save(AccountingEntryLineEntity, lineEntities);

    savedEntry.lines = lineEntities;
    return savedEntry;
  }

  /**
   * Reverses a posted journal with a mirrored REVERSAL entry inside the
   * caller's transaction. The original entry is never modified or deleted.
   */
  async reverse(
    manager: EntityManager,
    entryId: string,
    actingUserId?: string | null,
  ): Promise<AccountingEntryEntity> {
    const entry = await manager.findOne(AccountingEntryEntity, {
      where: { id: entryId },
      relations: ['lines', 'lines.account'],
    });
    if (!entry) {
      throw new NotFoundException({
        message: 'Accounting entry not found',
        code: 'ACCOUNTING_ENTRY_NOT_FOUND',
        details: { id: entryId },
      });
    }
    if (entry.entry_type === EntryType.REVERSAL) {
      throw new BadRequestException({
        message: 'A reversal entry cannot be reversed',
        code: 'ACCOUNTING_REVERSAL_OF_REVERSAL',
        details: { id: entryId },
      });
    }

    const existingReversal = await manager.findOne(AccountingEntryEntity, {
      where: { reversal_of_entry_id: entryId },
    });
    if (existingReversal) {
      throw new ConflictException({
        message: 'Accounting entry has already been reversed',
        code: 'ACCOUNTING_ENTRY_ALREADY_REVERSED',
        details: {
          id: entryId,
          reversal_entry_number: existingReversal.entry_number,
        },
      });
    }

    const reversal = manager.create(AccountingEntryEntity, {
      entry_number: await this.generateEntryNumber(manager, new Date()),
      entry_date: new Date(),
      entry_type: EntryType.REVERSAL,
      reference_type: entry.reference_type,
      reference_id: entry.reference_id,
      description: `Reversal of ${entry.entry_number}: ${entry.description}`,
      reversal_of_entry_id: entry.id,
      created_by: actingUserId ?? null,
      updated_by: actingUserId ?? null,
    });
    const savedReversal = await manager.save(AccountingEntryEntity, reversal);

    const lineEntities = (entry.lines ?? []).map((line, index) =>
      manager.create(AccountingEntryLineEntity, {
        accounting_entry_id: savedReversal.id,
        account_id: line.account_id,
        debit_amount: line.credit_amount,
        credit_amount: line.debit_amount,
        line_description: line.line_description ?? null,
        line_number: index + 1,
        created_by: actingUserId ?? null,
        updated_by: actingUserId ?? null,
      }),
    );
    await manager.save(AccountingEntryLineEntity, lineEntities);

    savedReversal.lines = lineEntities;
    return savedReversal;
  }

  private async resolveAccounts(
    manager: EntityManager,
    lines: PostingLineInput[],
  ): Promise<Record<string, AccountEntity>> {
    const ids = [...new Set(lines.map((l) => l.account_id).filter(Boolean))] as string[];
    const codes = [...new Set(lines.map((l) => l.account_code).filter(Boolean))] as string[];

    const found = await manager.find(AccountEntity, {
      where: [
        ...(ids.length ? [{ id: In(ids) }] : []),
        ...(codes.length ? [{ account_code: In(codes) }] : []),
      ],
    });

    const byId = new Map(found.map((a) => [a.id, a]));
    const byCode = new Map(
      found.filter((a) => a.account_code).map((a) => [a.account_code as string, a]),
    );

    const resolved: Record<string, AccountEntity> = {};
    for (const line of lines) {
      const key = line.account_id ?? line.account_code!;
      const account = line.account_id
        ? byId.get(line.account_id)
        : byCode.get(line.account_code!);
      if (!account) {
        throw new NotFoundException({
          message: 'Accounting account not found',
          code: 'ACCOUNT_NOT_FOUND',
          details: { account: key },
        });
      }
      if (!account.is_active) {
        throw new BadRequestException({
          message: 'Accounting account is inactive and cannot be posted to',
          code: 'ACCOUNT_NOT_ACTIVE',
          details: { account: key },
        });
      }
      resolved[key] = account;
    }
    return resolved;
  }

  private async generateEntryNumber(
    manager: EntityManager,
    entryDate: Date,
  ): Promise<string> {
    const result: { seq: string }[] = await manager.query(
      `SELECT nextval('accounting_entry_number_seq') AS seq`,
    );
    const seq = parseInt(result[0]?.seq ?? '0', 10);
    return formatEntryNumber(entryDate, seq);
  }
}