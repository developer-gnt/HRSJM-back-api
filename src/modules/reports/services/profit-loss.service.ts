import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountType } from '../../accounting/enums/accounting.enums';
import { toInclusiveEnd } from '../../accounting/services/accounting-entries.service';
import { ProfitLossQueryDto } from '../dto/profit-loss-query.dto';
import { ProfitLossSummaryQueryDto } from '../dto/profit-loss-summary-query.dto';

export interface ProfitLossAccountItem {
  account: {
    id: string;
    account_code: string | null;
    account_name: string;
    account_type: AccountType;
  };
  gross_debit: number;
  gross_credit: number;
  amount: number;
}

export interface ProfitLossCategoryGroup {
  items: ProfitLossAccountItem[];
  total: number;
}

export interface ProfitLossReportResponse {
  from_date: string;
  to_date: string;
  income: ProfitLossCategoryGroup;
  expenses: ProfitLossCategoryGroup;
  total_income: number;
  total_expenses: number;
  net_result: number;
  net_profit_loss: number;
  result_type: 'SURPLUS' | 'DEFICIT';
}

export interface ProfitLossSummaryResponse {
  from_date: string;
  to_date: string;
  total_income: number;
  total_expenses: number;
  net_result: number;
  net_profit_loss: number;
  result_type: 'SURPLUS' | 'DEFICIT';
  income_accounts_count: number;
  expense_accounts_count: number;
}

@Injectable()
export class ProfitLossService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
  ) {}

  /**
   * Generates a detailed Profit & Loss (Income Statement) report for a period.
   * Derived strictly from posted accounting entry lines.
   */
  async getProfitLoss(
    dto: ProfitLossQueryDto,
  ): Promise<ProfitLossReportResponse> {
    const fromDate = new Date(dto.from_date);
    const toDate = toInclusiveEnd(dto.to_date);

    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException({
        message: 'from_date cannot be after to_date',
        code: 'INVALID_DATE_RANGE',
        details: { from_date: dto.from_date, to_date: dto.to_date },
      });
    }

    const rawRows = await this.accountRepo
      .createQueryBuilder('account')
      .leftJoin('accounting_entry_lines', 'line', 'line.account_id = account.id')
      .leftJoin(
        'accounting_entries',
        'entry',
        'entry.id = line.accounting_entry_id AND entry.entry_date >= :fromDate AND entry.entry_date <= :toDate',
        { fromDate, toDate },
      )
      .where('account.account_type IN (:...types)', {
        types: [AccountType.INCOME, AccountType.EXPENSE],
      })
      .select('account.id', 'id')
      .addSelect('account.account_code', 'account_code')
      .addSelect('account.account_name', 'account_name')
      .addSelect('account.account_type', 'account_type')
      .addSelect('COALESCE(SUM(line.debit_amount), 0)', 'gross_debit')
      .addSelect('COALESCE(SUM(line.credit_amount), 0)', 'gross_credit')
      .groupBy('account.id')
      .addGroupBy('account.account_code')
      .addGroupBy('account.account_name')
      .addGroupBy('account.account_type')
      .orderBy('account.account_type', 'ASC')
      .addOrderBy('account.account_code', 'ASC', 'NULLS LAST')
      .addOrderBy('account.account_name', 'ASC')
      .getRawMany<{
        id: string;
        account_code: string | null;
        account_name: string;
        account_type: AccountType;
        gross_debit: string;
        gross_credit: string;
      }>();

    const incomeItems: ProfitLossAccountItem[] = [];
    const expenseItems: ProfitLossAccountItem[] = [];

    let totalIncomePaise = 0;
    let totalExpensePaise = 0;

    for (const row of rawRows) {
      const grossDebitPaise = Math.round(parseFloat(row.gross_debit || '0') * 100);
      const grossCreditPaise = Math.round(parseFloat(row.gross_credit || '0') * 100);

      if (
        !dto.include_zero_balances &&
        grossDebitPaise === 0 &&
        grossCreditPaise === 0
      ) {
        continue;
      }

      if (row.account_type === AccountType.INCOME) {
        // Income is credit-natural: net income = credits - debits
        const netIncomePaise = grossCreditPaise - grossDebitPaise;
        totalIncomePaise += netIncomePaise;

        incomeItems.push({
          account: {
            id: row.id,
            account_code: row.account_code,
            account_name: row.account_name,
            account_type: row.account_type,
          },
          gross_debit: grossDebitPaise / 100,
          gross_credit: grossCreditPaise / 100,
          amount: netIncomePaise / 100,
        });
      } else if (row.account_type === AccountType.EXPENSE) {
        // Expense is debit-natural: net expense = debits - credits
        const netExpensePaise = grossDebitPaise - grossCreditPaise;
        totalExpensePaise += netExpensePaise;

        expenseItems.push({
          account: {
            id: row.id,
            account_code: row.account_code,
            account_name: row.account_name,
            account_type: row.account_type,
          },
          gross_debit: grossDebitPaise / 100,
          gross_credit: grossCreditPaise / 100,
          amount: netExpensePaise / 100,
        });
      }
    }

    const netResultPaise = totalIncomePaise - totalExpensePaise;
    const netResult = netResultPaise / 100;
    const resultType = netResultPaise >= 0 ? 'SURPLUS' : 'DEFICIT';

    return {
      from_date: fromDate.toISOString(),
      to_date: toDate.toISOString(),
      income: {
        items: incomeItems,
        total: totalIncomePaise / 100,
      },
      expenses: {
        items: expenseItems,
        total: totalExpensePaise / 100,
      },
      total_income: totalIncomePaise / 100,
      total_expenses: totalExpensePaise / 100,
      net_result: netResult,
      net_profit_loss: netResult,
      result_type: resultType,
    };
  }

  /**
   * Generates a high-level Profit & Loss summary for a period.
   */
  async getProfitLossSummary(
    dto: ProfitLossSummaryQueryDto,
  ): Promise<ProfitLossSummaryResponse> {
    const report = await this.getProfitLoss({
      from_date: dto.from_date,
      to_date: dto.to_date,
      include_zero_balances: false,
    });

    return {
      from_date: report.from_date,
      to_date: report.to_date,
      total_income: report.total_income,
      total_expenses: report.total_expenses,
      net_result: report.net_result,
      net_profit_loss: report.net_profit_loss,
      result_type: report.result_type,
      income_accounts_count: report.income.items.length,
      expense_accounts_count: report.expenses.items.length,
    };
  }
}
