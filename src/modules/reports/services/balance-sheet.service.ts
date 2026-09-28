import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../../accounting/entities/account.entity';
import { AccountType } from '../../accounting/enums/accounting.enums';
import { toInclusiveEnd } from '../../accounting/services/accounting-entries.service';
import { BalanceSheetQueryDto } from '../dto/balance-sheet-query.dto';
import { BalanceSheetSummaryQueryDto } from '../dto/balance-sheet-summary-query.dto';

export interface BalanceSheetAccountItem {
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

export interface BalanceSheetCategoryGroup {
  items: BalanceSheetAccountItem[];
  total: number;
}

export interface EquityCategoryGroup {
  items: BalanceSheetAccountItem[];
  total_equity_accounts: number;
  current_surplus_deficit: number;
  total: number;
}

export interface BalanceSheetReportResponse {
  as_of_date: string;
  assets: BalanceSheetCategoryGroup;
  liabilities: BalanceSheetCategoryGroup;
  equity: EquityCategoryGroup;
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  total_liabilities_and_equity: number;
  difference: number;
  is_balanced: boolean;
}

export interface BalanceSheetSummaryResponse {
  as_of_date: string;
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  current_surplus_deficit: number;
  total_liabilities_and_equity: number;
  difference: number;
  is_balanced: boolean;
  asset_accounts_count: number;
  liability_accounts_count: number;
  equity_accounts_count: number;
}

@Injectable()
export class BalanceSheetService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
  ) {}

  /**
   * Generates a detailed Balance Sheet report as of a specified date.
   * Derived strictly from posted accounting entry lines.
   * Satisfies: Total Assets = Total Liabilities + Total Equity (including Current Surplus/Deficit).
   */
  async getBalanceSheet(
    dto: BalanceSheetQueryDto,
  ): Promise<BalanceSheetReportResponse> {
    const asOfDate = dto.as_of_date
      ? toInclusiveEnd(dto.as_of_date)
      : new Date();

    const rawRows = await this.accountRepo
      .createQueryBuilder('account')
      .leftJoin('accounting_entry_lines', 'line', 'line.account_id = account.id')
      .leftJoin('accounting_entries', 'entry', 'entry.id = line.accounting_entry_id')
      // Date filter must be a row filter, not part of the LEFT JOIN's ON
      // clause — an ON-clause condition would leave out-of-range lines in
      // the join (entry NULL) and their amounts would still be summed.
      .andWhere('(line.id IS NULL OR entry.entry_date <= :asOfDate)', {
        asOfDate,
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
      .orderBy('account.account_code', 'ASC', 'NULLS LAST')
      .addOrderBy('account.account_name', 'ASC')
      .getRawMany<{
        id: string;
        account_code: string | null;
        account_name: string;
        account_type: AccountType;
        gross_debit: string;
        gross_credit: string;
      }>();

    const assetItems: BalanceSheetAccountItem[] = [];
    const liabilityItems: BalanceSheetAccountItem[] = [];
    const equityItems: BalanceSheetAccountItem[] = [];

    let totalAssetsPaise = 0;
    let totalLiabilitiesPaise = 0;
    let totalEquityAccountsPaise = 0;
    let totalIncomePaise = 0;
    let totalExpensePaise = 0;

    for (const row of rawRows) {
      const grossDebitPaise = Math.round(parseFloat(row.gross_debit || '0') * 100);
      const grossCreditPaise = Math.round(parseFloat(row.gross_credit || '0') * 100);

      const hasMovement = grossDebitPaise !== 0 || grossCreditPaise !== 0;

      switch (row.account_type) {
        case AccountType.ASSET: {
          // Asset is debit-natural: net asset = debits - credits
          const netAssetPaise = grossDebitPaise - grossCreditPaise;
          totalAssetsPaise += netAssetPaise;

          if (dto.include_zero_balances || hasMovement) {
            assetItems.push({
              account: {
                id: row.id,
                account_code: row.account_code,
                account_name: row.account_name,
                account_type: row.account_type,
              },
              gross_debit: grossDebitPaise / 100,
              gross_credit: grossCreditPaise / 100,
              amount: netAssetPaise / 100,
            });
          }
          break;
        }

        case AccountType.LIABILITY: {
          // Liability is credit-natural: net liability = credits - debits
          const netLiabilityPaise = grossCreditPaise - grossDebitPaise;
          totalLiabilitiesPaise += netLiabilityPaise;

          if (dto.include_zero_balances || hasMovement) {
            liabilityItems.push({
              account: {
                id: row.id,
                account_code: row.account_code,
                account_name: row.account_name,
                account_type: row.account_type,
              },
              gross_debit: grossDebitPaise / 100,
              gross_credit: grossCreditPaise / 100,
              amount: netLiabilityPaise / 100,
            });
          }
          break;
        }

        case AccountType.FUND_EQUITY: {
          // Fund/Equity is credit-natural: net equity = credits - debits
          const netEquityPaise = grossCreditPaise - grossDebitPaise;
          totalEquityAccountsPaise += netEquityPaise;

          if (dto.include_zero_balances || hasMovement) {
            equityItems.push({
              account: {
                id: row.id,
                account_code: row.account_code,
                account_name: row.account_name,
                account_type: row.account_type,
              },
              gross_debit: grossDebitPaise / 100,
              gross_credit: grossCreditPaise / 100,
              amount: netEquityPaise / 100,
            });
          }
          break;
        }

        case AccountType.INCOME: {
          // Cumulative Income: credits - debits
          totalIncomePaise += grossCreditPaise - grossDebitPaise;
          break;
        }

        case AccountType.EXPENSE: {
          // Cumulative Expenses: debits - credits
          totalExpensePaise += grossDebitPaise - grossCreditPaise;
          break;
        }
      }
    }

    // Current Surplus / Deficit from inception up to as_of_date
    const currentSurplusDeficitPaise = totalIncomePaise - totalExpensePaise;
    const totalEquityPaise = totalEquityAccountsPaise + currentSurplusDeficitPaise;
    const totalLiabilitiesAndEquityPaise = totalLiabilitiesPaise + totalEquityPaise;

    const diffPaise = Math.abs(totalAssetsPaise - totalLiabilitiesAndEquityPaise);
    const difference = diffPaise / 100;
    const isBalanced = diffPaise === 0;

    return {
      as_of_date: asOfDate.toISOString(),
      assets: {
        items: assetItems,
        total: totalAssetsPaise / 100,
      },
      liabilities: {
        items: liabilityItems,
        total: totalLiabilitiesPaise / 100,
      },
      equity: {
        items: equityItems,
        total_equity_accounts: totalEquityAccountsPaise / 100,
        current_surplus_deficit: currentSurplusDeficitPaise / 100,
        total: totalEquityPaise / 100,
      },
      total_assets: totalAssetsPaise / 100,
      total_liabilities: totalLiabilitiesPaise / 100,
      total_equity: totalEquityPaise / 100,
      total_liabilities_and_equity: totalLiabilitiesAndEquityPaise / 100,
      difference,
      is_balanced: isBalanced,
    };
  }

  /**
   * Generates a high-level Balance Sheet summary report as of a specified date.
   */
  async getBalanceSheetSummary(
    dto: BalanceSheetSummaryQueryDto,
  ): Promise<BalanceSheetSummaryResponse> {
    const report = await this.getBalanceSheet({
      as_of_date: dto.as_of_date,
      include_zero_balances: false,
    });

    return {
      as_of_date: report.as_of_date,
      total_assets: report.total_assets,
      total_liabilities: report.total_liabilities,
      total_equity: report.total_equity,
      current_surplus_deficit: report.equity.current_surplus_deficit,
      total_liabilities_and_equity: report.total_liabilities_and_equity,
      difference: report.difference,
      is_balanced: report.is_balanced,
      asset_accounts_count: report.assets.items.length,
      liability_accounts_count: report.liabilities.items.length,
      equity_accounts_count: report.equity.items.length,
    };
  }
}
