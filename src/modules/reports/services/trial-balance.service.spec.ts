import { TrialBalanceService } from './trial-balance.service';
import { AccountType } from '../../accounting/enums/accounting.enums';

describe('TrialBalanceService', () => {
  let service: TrialBalanceService;
  let accountRepo: Record<string, jest.Mock>;
  let mockQb: Record<string, jest.Mock>;

  const createMockQb = () => {
    const qb: Record<string, jest.Mock> = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    return qb;
  };

  beforeEach(() => {
    mockQb = createMockQb();
    accountRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQb),
    };
    service = new TrialBalanceService(accountRepo as never);
  });

  describe('getTrialBalance', () => {
    it('calculates balanced debit and credit totals correctly', async () => {
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          is_active: true,
          gross_debit: '1500.00',
          gross_credit: '500.00',
        },
        {
          id: 'acc-2',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
          is_active: true,
          gross_debit: '0.00',
          gross_credit: '1000.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getTrialBalance({
        as_of_date: '2026-09-28',
      });

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0]).toEqual({
        account: {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
        },
        gross_debit: 1500,
        gross_credit: 500,
        debit_balance: 1000,
        credit_balance: 0,
      });
      expect(result.accounts[1]).toEqual({
        account: {
          id: 'acc-2',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
        },
        gross_debit: 0,
        gross_credit: 1000,
        debit_balance: 0,
        credit_balance: 1000,
      });

      expect(result.total_debit).toBe(1000);
      expect(result.total_credit).toBe(1000);
      expect(result.total_gross_debit).toBe(1500);
      expect(result.total_gross_credit).toBe(1500);
      expect(result.difference).toBe(0);
      expect(result.is_balanced).toBe(true);
    });

    it('surfaces imbalance and difference visibly if debits and credits do not match', async () => {
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          is_active: true,
          gross_debit: '1000.00',
          gross_credit: '0.00',
        },
        {
          id: 'acc-2',
          account_code: '4001',
          account_name: 'Donation Income',
          account_type: AccountType.INCOME,
          is_active: true,
          gross_debit: '0.00',
          gross_credit: '800.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getTrialBalance({});

      expect(result.total_debit).toBe(1000);
      expect(result.total_credit).toBe(800);
      expect(result.difference).toBe(200);
      expect(result.is_balanced).toBe(false);
    });

    it('filters zero balance accounts by default when include_zero_balances is false', async () => {
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          is_active: true,
          gross_debit: '500.00',
          gross_credit: '0.00',
        },
        {
          id: 'acc-2',
          account_code: '1002',
          account_name: 'Cash',
          account_type: AccountType.ASSET,
          is_active: true,
          gross_debit: '0.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getTrialBalance({ include_zero_balances: false });
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].account.id).toBe('acc-1');
    });

    it('includes zero balance accounts when include_zero_balances is true', async () => {
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          is_active: true,
          gross_debit: '500.00',
          gross_credit: '0.00',
        },
        {
          id: 'acc-2',
          account_code: '1002',
          account_name: 'Cash',
          account_type: AccountType.ASSET,
          is_active: true,
          gross_debit: '0.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getTrialBalance({ include_zero_balances: true });
      expect(result.accounts).toHaveLength(2);
    });

    it('applies account_id and account_type filters to QueryBuilder', async () => {
      mockQb.getRawMany.mockResolvedValue([]);

      await service.getTrialBalance({
        account_id: 'acc-123',
        account_type: AccountType.EXPENSE,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith('account.id = :accountId', {
        accountId: 'acc-123',
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'account.account_type = :accountType',
        { accountType: AccountType.EXPENSE },
      );
    });
  });

  describe('getTrialBalanceSummary', () => {
    it('returns grouped breakdown by account types', async () => {
      const mockRawData = [
        {
          id: 'acc-1',
          account_code: '1001',
          account_name: 'Bank',
          account_type: AccountType.ASSET,
          is_active: true,
          gross_debit: '2500.00',
          gross_credit: '500.00',
        },
        {
          id: 'acc-2',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
          is_active: true,
          gross_debit: '0.00',
          gross_credit: '1500.00',
        },
        {
          id: 'acc-3',
          account_code: '5001',
          account_name: 'Office Expenses',
          account_type: AccountType.EXPENSE,
          is_active: true,
          gross_debit: '500.00',
          gross_credit: '0.00',
        },
        {
          id: 'acc-4',
          account_code: '2001',
          account_name: 'Accounts Payable',
          account_type: AccountType.LIABILITY,
          is_active: true,
          gross_debit: '0.00',
          gross_credit: '1000.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const summary = await service.getTrialBalanceSummary({
        as_of_date: '2026-09-28',
      });

      expect(summary.total_debit).toBe(2500);
      expect(summary.total_credit).toBe(2500);
      expect(summary.difference).toBe(0);
      expect(summary.is_balanced).toBe(true);
      expect(summary.total_accounts).toBe(4);

      expect(summary.by_account_type[AccountType.ASSET]).toEqual({
        account_type: AccountType.ASSET,
        total_debit: 2000,
        total_credit: 0,
        net_balance: 2000,
        account_count: 1,
      });

      expect(summary.by_account_type[AccountType.INCOME]).toEqual({
        account_type: AccountType.INCOME,
        total_debit: 0,
        total_credit: 1500,
        net_balance: 1500,
        account_count: 1,
      });

      expect(summary.by_account_type[AccountType.EXPENSE]).toEqual({
        account_type: AccountType.EXPENSE,
        total_debit: 500,
        total_credit: 0,
        net_balance: 500,
        account_count: 1,
      });

      expect(summary.by_account_type[AccountType.LIABILITY]).toEqual({
        account_type: AccountType.LIABILITY,
        total_debit: 0,
        total_credit: 1000,
        net_balance: 1000,
        account_count: 1,
      });
    });
  });
});
