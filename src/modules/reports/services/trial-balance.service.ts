import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountType } from '../../accounting/enums/accounting.enums';
import { toInclusiveEnd } from '../../accounting/services/accounting-entries.service';
import { TrialBalanceQueryDto } from '../dto/trial-balance-query.dto';
import { TrialBalanceSummaryQueryDto } from '../dto/trial-balance-summary-query.dto';

export interface TrialBalanceAccountItem {
  account: {
    id: string;
    account_code: string | null;
    account_name: string;
    account_type: AccountType;
  };
  gross_debit: number;
  gross_credit: number;
  debit_balance: number;
  credit_balance: number;
}

export interface TrialBalanceReportResponse {
  as_of_date: string;
  accounts: TrialBalanceAccountItem[];
  total_debit: number;
  total_credit: number;
  total_gross_debit: number;
  total_gross_credit: number;
  difference: number;
  is_balanced: boolean;
}

export interface AccountTypeSummary {
  account_type: AccountType;
  total_debit: number;
  total_credit: number;
  net_balance: number;
  account_count: number;
}

export interface TrialBalanceSummaryResponse {
  as_of_date: string;
  total_debit: number;
  total_credit: number;
  difference: number;
  is_balanced: boolean;
  total_accounts: number;
  by_account_type: Record<AccountType, AccountTypeSummary>;
}

@Injectable()
export class TrialBalanceService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
  ) {}

  /**
   * Generates a detailed Trial Balance report as of a specified date.
   * Derived strictly from posted accounting entry lines.
   */
  async getTrialBalance(
    dto: TrialBalanceQueryDto,
  ): Promise<TrialBalanceReportResponse> {
    const asOfDate = dto.as_of_date
      ? toInclusiveEnd(dto.as_of_date)
      : new Date();

    const qb = this.accountRepo
      .createQueryBuilder('account')
      .leftJoin('accounting_entry_lines', 'line', 'line.account_id = account.id')
      .leftJoin(
        'accounting_entries',
        'entry',
        'entry.id = line.accounting_entry_id AND entry.entry_date <= :asOfDate',
        { asOfDate },
      )
      .select('account.id', 'id')
      .addSelect('account.account_code', 'account_code')
      .addSelect('account.account_name', 'account_name')
      .addSelect('account.account_type', 'account_type')
      .addSelect('account.is_active', 'is_active')
      .addSelect('COALESCE(SUM(line.debit_amount), 0)', 'gross_debit')
      .addSelect('COALESCE(SUM(line.credit_amount), 0)', 'gross_credit')
      .groupBy('account.id')
      .addGroupBy('account.account_code')
      .addGroupBy('account.account_name')
      .addGroupBy('account.account_type')
      .addGroupBy('account.is_active')
      .orderBy('account.account_code', 'ASC', 'NULLS LAST')
      .addOrderBy('account.account_name', 'ASC');

    if (dto.account_id) {
      qb.andWhere('account.id = :accountId', { accountId: dto.account_id });
    }

    if (dto.account_type) {
      qb.andWhere('account.account_type = :accountType', {
        accountType: dto.account_type,
      });
    }

    const rawRows = await qb.getRawMany<{
      id: string;
      account_code: string | null;
      account_name: string;
      account_type: AccountType;
      is_active: boolean;
      gross_debit: string;
      gross_credit: string;
    }>();

    let totalDebitPaise = 0;
    let totalCreditPaise = 0;
    let totalGrossDebitPaise = 0;
    let totalGrossCreditPaise = 0;

    const accountItems: TrialBalanceAccountItem[] = [];

    for (const row of rawRows) {
      const grossDebitPaise = Math.round(parseFloat(row.gross_debit || '0') * 100);
      const grossCreditPaise = Math.round(parseFloat(row.gross_credit || '0') * 100);

      let debitBalancePaise = 0;
      let creditBalancePaise = 0;

      if (grossDebitPaise > grossCreditPaise) {
        debitBalancePaise = grossDebitPaise - grossCreditPaise;
      } else if (grossCreditPaise > grossDebitPaise) {
        creditBalancePaise = grossCreditPaise - grossDebitPaise;
      }

      // Filter zero balances unless explicitly requested
      if (
        !dto.include_zero_balances &&
        grossDebitPaise === 0 &&
        grossCreditPaise === 0
      ) {
        continue;
      }

      totalDebitPaise += debitBalancePaise;
      totalCreditPaise += creditBalancePaise;
      totalGrossDebitPaise += grossDebitPaise;
      totalGrossCreditPaise += grossCreditPaise;

      accountItems.push({
        account: {
          id: row.id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
        },
        gross_debit: grossDebitPaise / 100,
        gross_credit: grossCreditPaise / 100,
        debit_balance: debitBalancePaise / 100,
        credit_balance: creditBalancePaise / 100,
      });
    }

    const diffPaise = Math.abs(totalDebitPaise - totalCreditPaise);
    const difference = diffPaise / 100;
    const isBalanced = diffPaise === 0;

    return {
      as_of_date: asOfDate.toISOString(),
      accounts: accountItems,
      total_debit: totalDebitPaise / 100,
      total_credit: totalCreditPaise / 100,
      total_gross_debit: totalGrossDebitPaise / 100,
      total_gross_credit: totalGrossCreditPaise / 100,
      difference,
      is_balanced: isBalanced,
    };
  }

  /**
   * Generates a high-level Trial Balance Summary report as of a specified date.
   */
  async getTrialBalanceSummary(
    dto: TrialBalanceSummaryQueryDto,
  ): Promise<TrialBalanceSummaryResponse> {
    const report = await this.getTrialBalance({
      as_of_date: dto.as_of_date,
      include_zero_balances: false,
    });

    const byAccountType: Record<AccountType, AccountTypeSummary> = {
      [AccountType.ASSET]: {
        account_type: AccountType.ASSET,
        total_debit: 0,
        total_credit: 0,
        net_balance: 0,
        account_count: 0,
      },
      [AccountType.LIABILITY]: {
        account_type: AccountType.LIABILITY,
        total_debit: 0,
        total_credit: 0,
        net_balance: 0,
        account_count: 0,
      },
      [AccountType.FUND_EQUITY]: {
        account_type: AccountType.FUND_EQUITY,
        total_debit: 0,
        total_credit: 0,
        net_balance: 0,
        account_count: 0,
      },
      [AccountType.INCOME]: {
        account_type: AccountType.INCOME,
        total_debit: 0,
        total_credit: 0,
        net_balance: 0,
        account_count: 0,
      },
      [AccountType.EXPENSE]: {
        account_type: AccountType.EXPENSE,
        total_debit: 0,
        total_credit: 0,
        net_balance: 0,
        account_count: 0,
      },
    };

    for (const item of report.accounts) {
      const type = item.account.account_type;
      if (byAccountType[type]) {
        byAccountType[type].total_debit = Math.round(
          (byAccountType[type].total_debit + item.debit_balance) * 100,
        ) / 100;
        byAccountType[type].total_credit = Math.round(
          (byAccountType[type].total_credit + item.credit_balance) * 100,
        ) / 100;
        byAccountType[type].account_count += 1;

        // Net balance: ASSET/EXPENSE are natural debits (debit - credit), others natural credits (credit - debit)
        if (type === AccountType.ASSET || type === AccountType.EXPENSE) {
          byAccountType[type].net_balance = Math.round(
            (byAccountType[type].total_debit - byAccountType[type].total_credit) * 100,
          ) / 100;
        } else {
          byAccountType[type].net_balance = Math.round(
            (byAccountType[type].total_credit - byAccountType[type].total_debit) * 100,
          ) / 100;
        }
      }
    }

    return {
      as_of_date: report.as_of_date,
      total_debit: report.total_debit,
      total_credit: report.total_credit,
      difference: report.difference,
      is_balanced: report.is_balanced,
      total_accounts: report.accounts.length,
      by_account_type: byAccountType,
    };
  }
}
