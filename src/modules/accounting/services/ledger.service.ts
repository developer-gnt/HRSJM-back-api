import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AccountEntity } from '../entities/account.entity';
import { AccountingEntryLineEntity } from '../entities/accounting-entry-line.entity';
import { AccountLedgerQueryDto } from '../dto/account-ledger-query.dto';
import { GlobalLedgerQueryDto } from '../dto/global-ledger-query.dto';
import { toInclusiveEnd } from './accounting-entries.service';
import { EntryType } from '../enums/accounting.enums';

export interface LedgerRow {
  entry_date: Date;
  entry_number: string;
  entry_type: string;
  reference_type: string;
  reference_id: string;
  description: string;
  line_description: string | null;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  account: {
    id: string;
    account_code: string | null;
    account_name: string;
    account_type: string;
  };
}

/** A fetched ledger line always has its entry and account (inner joins). */
type LedgerLine = AccountingEntryLineEntity & {
  entry: NonNullable<AccountingEntryLineEntity['entry']>;
  account: NonNullable<AccountingEntryLineEntity['account']>;
};

/** Paise-integer conversion — money arithmetic avoids float drift. */
export function toPaise(value: number): number {
  return Math.round(Number(value) * 100);
}

function isDebitNatural(accountType: string): boolean {
  return accountType === 'ASSET' || accountType === 'EXPENSE';
}

function signedMovement(accountType: string, debit: number, credit: number): number {
  return isDebitNatural(accountType)
    ? toPaise(debit) - toPaise(credit)
    : toPaise(credit) - toPaise(debit);
}

function paginate<T>(items: T[], page: number, limit: number) {
  return items.slice((page - 1) * limit, (page - 1) * limit + limit);
}

/**
 * Ledger reports derive strictly from posted accounting entry lines —
 * never from a separate balance table (rule.md §1.6/§1.7).
 * Volume note: rows are fetched for the filtered range and paginated in
 * memory so running balances are always continuous across pages.
 */
@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(AccountingEntryLineEntity)
    private readonly lines: Repository<AccountingEntryLineEntity>,
  ) {}

  async accountLedger(accountId: string, dto: AccountLedgerQueryDto) {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException({
        message: 'Account not found',
        code: 'ACCOUNT_NOT_FOUND',
        details: { id: accountId },
      });
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const rows = (await this.fetchRows({
      accountId,
      from: dto.from_date ?? null,
      to: dto.to_date ?? null,
    })) as LedgerLine[];

    const opening = dto.from_date
      ? await this.openingBalancePaise(
          accountId,
          new Date(dto.from_date),
          account.account_type,
        )
      : 0;

    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;
    const ledgerRows: LedgerRow[] = rows.map((row) => {
      totalDebit += toPaise(row.debit_amount);
      totalCredit += toPaise(row.credit_amount);
      running += signedMovement(
        account.account_type,
        row.debit_amount,
        row.credit_amount,
      );
      return {
        entry_date: row.entry.entry_date,
        entry_number: row.entry.entry_number,
        entry_type: row.entry.entry_type,
        reference_type: row.entry.reference_type,
        reference_id: row.entry.reference_id,
        description: row.entry.description,
        line_description: row.line_description,
        debit_amount: row.debit_amount,
        credit_amount: row.credit_amount,
        running_balance: running / 100,
        account: {
          id: account.id,
          account_code: account.account_code,
          account_name: account.account_name,
          account_type: account.account_type,
        },
      };
    });

    return {
      account: {
        id: account.id,
        account_code: account.account_code,
        account_name: account.account_name,
        account_type: account.account_type,
      },
      from_date: dto.from_date ?? null,
      to_date: dto.to_date ?? null,
      opening_balance: opening / 100,
      items: paginate(ledgerRows, page, limit),
      meta: {
        page,
        limit,
        total: ledgerRows.length,
        totalPages: Math.max(1, Math.ceil(ledgerRows.length / limit)),
        total_debit: totalDebit / 100,
        total_credit: totalCredit / 100,
        closing_balance: running / 100,
      },
    };
  }

  async globalLedger(dto: GlobalLedgerQueryDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const rows = (await this.fetchRows({
      accountId: dto.account_id ?? null,
      from: dto.from_date,
      to: dto.to_date,
      entryType: dto.entry_type ?? null,
      reference: dto.reference ?? null,
    })) as LedgerLine[];

    // Opening balances per account: everything before from_date.
    const openings = new Map<string, number>();
    const openingRows = (await this.fetchRows({
      accountId: dto.account_id ?? null,
      from: null,
      to: null,
      before: new Date(dto.from_date),
    })) as LedgerLine[];
    for (const row of openingRows) {
      const account = row.account;
      openings.set(
        account.id,
        (openings.get(account.id) ?? 0) +
          signedMovement(account.account_type, row.debit_amount, row.credit_amount),
      );
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const ledgerRows: LedgerRow[] = rows.map((row) => {
      const account = row.account;
      totalDebit += toPaise(row.debit_amount);
      totalCredit += toPaise(row.credit_amount);
      const running =
        (openings.get(account.id) ?? 0) +
        signedMovement(account.account_type, row.debit_amount, row.credit_amount);
      openings.set(account.id, running);
      return {
        entry_date: row.entry.entry_date,
        entry_number: row.entry.entry_number,
        entry_type: row.entry.entry_type,
        reference_type: row.entry.reference_type,
        reference_id: row.entry.reference_id,
        description: row.entry.description,
        line_description: row.line_description,
        debit_amount: row.debit_amount,
        credit_amount: row.credit_amount,
        running_balance: running / 100,
        account: {
          id: account.id,
          account_code: account.account_code,
          account_name: account.account_name,
          account_type: account.account_type,
        },
      };
    });

    return {
      from_date: dto.from_date,
      to_date: dto.to_date,
      items: paginate(ledgerRows, page, limit),
      meta: {
        page,
        limit,
        total: ledgerRows.length,
        totalPages: Math.max(1, Math.ceil(ledgerRows.length / limit)),
        total_debit: totalDebit / 100,
        total_credit: totalCredit / 100,
      },
    };
  }

  private async fetchRows(options: {
    accountId: string | null;
    from: string | null;
    to: string | null;
    entryType?: EntryType | null;
    reference?: string | null;
    before?: Date | null;
  }): Promise<AccountingEntryLineEntity[]> {
    const qb = this.lines
      .createQueryBuilder('line')
      .innerJoinAndSelect('line.entry', 'entry')
      .innerJoinAndSelect('line.account', 'account')
      .orderBy('entry.entry_date', 'ASC')
      .addOrderBy('entry.entry_number', 'ASC')
      .addOrderBy('line.line_number', 'ASC');

    if (options.accountId) {
      qb.andWhere('line.account_id = :accountId', { accountId: options.accountId });
    }
    if (options.from) {
      qb.andWhere('entry.entry_date >= :fromDate', {
        fromDate: new Date(options.from),
      });
    }
    if (options.to) {
      qb.andWhere('entry.entry_date <= :toDate', {
        toDate: toInclusiveEnd(options.to),
      });
    }
    if (options.before) {
      qb.andWhere('entry.entry_date < :beforeDate', { beforeDate: options.before });
    }
    if (options.entryType) {
      qb.andWhere('entry.entry_type = :entryType', { entryType: options.entryType });
    }
    if (options.reference) {
      const ref = options.reference.trim();
      qb.andWhere(
        new Brackets((w) => {
          w.where('LOWER(entry.entry_number) LIKE :refTerm')
            .orWhere('entry.reference_id::text = :refExact')
            .orWhere('LOWER(entry.description) LIKE :refTerm');
        }),
      ).setParameters({
        refTerm: `%${ref.toLowerCase()}%`,
        refExact: ref,
      });
    }

    return qb.getMany();
  }

  private async openingBalancePaise(
    accountId: string,
    before: Date,
    accountType: string,
  ): Promise<number> {
    const result = await this.lines
      .createQueryBuilder('line')
      .innerJoin('line.entry', 'entry')
      .select('COALESCE(SUM(line.debit_amount), 0)', 'debit')
      .addSelect('COALESCE(SUM(line.credit_amount), 0)', 'credit')
      .where('line.account_id = :accountId', { accountId })
      .andWhere('entry.entry_date < :beforeDate', { beforeDate: before })
      .getRawOne<{ debit: string; credit: string }>();

    const debit = toPaise(parseFloat(result?.debit ?? '0'));
    const credit = toPaise(parseFloat(result?.credit ?? '0'));
    // Opening balance in the account's natural direction.
    return isDebitNatural(accountType) ? debit - credit : credit - debit;
  }
}
