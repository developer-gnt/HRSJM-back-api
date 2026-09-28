import { BadRequestException } from '@nestjs/common';
import { ProfitLossService } from './profit-loss.service';
import { AccountType } from '../../accounting/enums/accounting.enums';

describe('ProfitLossService', () => {
  let service: ProfitLossService;
  let accountRepo: Record<string, jest.Mock>;
  let mockQb: Record<string, jest.Mock>;

  const createMockQb = () => {
    const qb: Record<string, jest.Mock> = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
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
    service = new ProfitLossService(accountRepo as never);
  });

  describe('getProfitLoss', () => {
    it('calculates income, expenses and surplus result accurately', async () => {
      const mockRawData = [
        {
          id: 'acc-inc-1',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '5000.00',
        },
        {
          id: 'acc-inc-2',
          account_code: '4003',
          account_name: 'Donation Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '3000.00',
        },
        {
          id: 'acc-exp-1',
          account_code: '5001',
          account_name: 'Office Expenses',
          account_type: AccountType.EXPENSE,
          gross_debit: '2000.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getProfitLoss({
        from_date: '2026-04-01',
        to_date: '2027-03-31',
      });

      expect(result.income.items).toHaveLength(2);
      expect(result.income.total).toBe(8000);

      expect(result.expenses.items).toHaveLength(1);
      expect(result.expenses.total).toBe(2000);

      expect(result.total_income).toBe(8000);
      expect(result.total_expenses).toBe(2000);
      expect(result.net_result).toBe(6000);
      expect(result.result_type).toBe('SURPLUS');
    });

    it('calculates deficit result when expenses exceed income', async () => {
      const mockRawData = [
        {
          id: 'acc-inc-1',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '1000.00',
        },
        {
          id: 'acc-exp-1',
          account_code: '5001',
          account_name: 'Office Rent',
          account_type: AccountType.EXPENSE,
          gross_debit: '4000.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getProfitLoss({
        from_date: '2026-04-01',
        to_date: '2027-03-31',
      });

      expect(result.total_income).toBe(1000);
      expect(result.total_expenses).toBe(4000);
      expect(result.net_result).toBe(-3000);
      expect(result.result_type).toBe('DEFICIT');
    });

    it('rejects invalid date range where from_date is after to_date', async () => {
      await expect(
        service.getProfitLoss({
          from_date: '2027-01-01',
          to_date: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('omits zero-balance accounts when include_zero_balances is false', async () => {
      const mockRawData = [
        {
          id: 'acc-inc-1',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '1000.00',
        },
        {
          id: 'acc-inc-2',
          account_code: '4004',
          account_name: 'Other Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const result = await service.getProfitLoss({
        from_date: '2026-04-01',
        to_date: '2027-03-31',
        include_zero_balances: false,
      });

      expect(result.income.items).toHaveLength(1);
      expect(result.income.items[0].account.account_code).toBe('4001');
    });
  });

  describe('getProfitLossSummary', () => {
    it('returns high-level summary with account counts and net result', async () => {
      const mockRawData = [
        {
          id: 'acc-inc-1',
          account_code: '4001',
          account_name: 'Membership Income',
          account_type: AccountType.INCOME,
          gross_debit: '0.00',
          gross_credit: '5000.00',
        },
        {
          id: 'acc-exp-1',
          account_code: '5001',
          account_name: 'Office Expenses',
          account_type: AccountType.EXPENSE,
          gross_debit: '1200.00',
          gross_credit: '0.00',
        },
      ];

      mockQb.getRawMany.mockResolvedValue(mockRawData);

      const summary = await service.getProfitLossSummary({
        from_date: '2026-04-01',
        to_date: '2027-03-31',
      });

      expect(summary.total_income).toBe(5000);
      expect(summary.total_expenses).toBe(1200);
      expect(summary.net_result).toBe(3800);
      expect(summary.result_type).toBe('SURPLUS');
      expect(summary.income_accounts_count).toBe(1);
      expect(summary.expense_accounts_count).toBe(1);
    });
  });
});
