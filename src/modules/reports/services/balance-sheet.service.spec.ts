import { BalanceSheetService } from './balance-sheet.service';
import { AccountType } from '../../accounting/enums/accounting.enums';

describe('BalanceSheetService', () => {
  let service: BalanceSheetService;
  let accountRepo: Record<string, jest.Mock>;
  let mockQb: Record<string, jest.Mock>;

  const createMockQb = () => {
    const qb: Record<string, jest.Mock> = {
      leftJoin: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    return qb;
  };

  beforeEach(() => {
    mockQb = createMockQb();
    accountRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };
    service = new BalanceSheetService(accountRepo as never);
  });

  describe('getBalanceSheet', () => {
    it('calculates assets, liabilities, equity and validates equation Assets = Liabilities + Equity', async () => {
      // Scenario:
      // Asset (Bank): Dr 10,000, Cr 2,000 => Net Asset = 8,000
      // Liability (Accounts Payable): Dr 0, Cr 1,000 => Net Liability = 1,000
      // Equity (Corpus Fund): Dr 0, Cr 2,000 => Net Equity Account = 2,000
      // Income (Membership): Dr 0, Cr 7,000 => Net Income = 7,000
      // Expense (Office): Dr 2,000, Cr 0 => Net Expense = 2,000
      // Surplus = 7,000 - 2,000 = 5,000
      // Total Equity = 2,000 (Corpus) + 5,000 (Surplus) = 7,000
      // Total Liabilities + Equity = 1,000 + 7,000 = 8,000
      // Total Assets = 8,000 => Balanced!
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          gross_debit: '10000.00',
          gross_credit: '2000.00',
        },
        {
          id: 'acc-2',
          account_code: '2001',
          account_name: 'Accounts Payable',
          account_type: AccountType.LIABILITY,
          gross_debit: '0.00',
          gross_credit: '1000.00',
        },
        {
          id: 'acc-3',
          account_code: '3001',
          account_name: 'Corpus Fund',
          account_type: AccountType.FUND_EQUITY,
          gross_debit: '0.00',
          gross_credit: '2000.00',
        },
        {
          id: 'acc-4',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '7000.00',
        },
        {
          id: 'acc-5',
          account_code: '5001',
          account_name: 'Office Expenses',
          account_type: AccountType.EXPENSE,
          gross_debit: '2000.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getBalanceSheet({
        as_of_date: '2026-09-28',
      });

      expect(result.assets.items).toHaveLength(1);
      expect(result.assets.total).toBe(8000);

      expect(result.liabilities.items).toHaveLength(1);
      expect(result.liabilities.total).toBe(1000);

      expect(result.equity.items).toHaveLength(1);
      expect(result.equity.total_equity_accounts).toBe(2000);
      expect(result.equity.current_surplus_deficit).toBe(5000);
      expect(result.equity.total).toBe(7000);

      expect(result.total_assets).toBe(8000);
      expect(result.total_liabilities).toBe(1000);
      expect(result.total_equity).toBe(7000);
      expect(result.total_liabilities_and_equity).toBe(8000);
      expect(result.difference).toBe(0);
      expect(result.is_balanced).toBe(true);
    });

    it('omits zero-balance accounts when include_zero_balances is false', async () => {
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          gross_debit: '5000.00',
          gross_credit: '0.00',
        },
        {
          id: 'acc-2',
          account_code: '1002',
          account_name: 'Cash',
          account_type: AccountType.ASSET,
          gross_debit: '0.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getBalanceSheet({
        include_zero_balances: false,
      });

      expect(result.assets.items).toHaveLength(1);
      expect(result.assets.items[0].account.account_code).toBe('1001');
    });
  });

  describe('getBalanceSheetSummary', () => {
    it('returns high-level summary with counts and verified balance', async () => {
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          gross_debit: '10000.00',
          gross_credit: '0.00',
        },
        {
          id: 'acc-4',
          account_code: '4001',
          account_name: 'Donation Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '10000.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const summary = await service.getBalanceSheetSummary({
        as_of_date: '2026-09-28',
      });

      expect(summary.total_assets).toBe(10000);
      expect(summary.total_liabilities).toBe(0);
      expect(summary.total_equity).toBe(10000);
      expect(summary.current_surplus_deficit).toBe(10000);
      expect(summary.total_liabilities_and_equity).toBe(10000);
      expect(summary.difference).toBe(0);
      expect(summary.is_balanced).toBe(true);
      expect(summary.asset_accounts_count).toBe(1);
      expect(summary.liability_accounts_count).toBe(0);
      expect(summary.equity_accounts_count).toBe(0);
    });
  });
});
