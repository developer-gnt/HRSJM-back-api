jest.mock('../../../common/guards/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

import { ReportsController } from './reports.controller';
import { TrialBalanceService } from '../services/trial-balance.service';
import { ProfitLossService } from '../services/profit-loss.service';
import { BalanceSheetService } from '../services/balance-sheet.service';
import { AccountType } from '../../accounting/enums/accounting.enums';

describe('ReportsController', () => {
  let controller: ReportsController;
  let trialBalanceService: Record<string, jest.Mock>;
  let profitLossService: Record<string, jest.Mock>;
  let balanceSheetService: Record<string, jest.Mock>;

  beforeEach(() => {
    trialBalanceService = {
      getTrialBalance: jest.fn().mockResolvedValue({
        as_of_date: '2026-09-28T00:00:00.000Z',
        accounts: [],
        total_debit: 0,
        total_credit: 0,
        total_gross_debit: 0,
        total_gross_credit: 0,
        difference: 0,
        is_balanced: true,
      }),
      getTrialBalanceSummary: jest.fn().mockResolvedValue({
        as_of_date: '2026-09-28T00:00:00.000Z',
        total_debit: 0,
        total_credit: 0,
        difference: 0,
        is_balanced: true,
        total_accounts: 0,
        by_account_type: {},
      }),
    };

    profitLossService = {
      getProfitLoss: jest.fn().mockResolvedValue({
        from_date: '2026-04-01T00:00:00.000Z',
        to_date: '2027-03-31T23:59:59.999Z',
        income: { items: [], total: 0 },
        expenses: { items: [], total: 0 },
        total_income: 0,
        total_expenses: 0,
        net_result: 0,
        net_profit_loss: 0,
        result_type: 'SURPLUS',
      }),
      getProfitLossSummary: jest.fn().mockResolvedValue({
        from_date: '2026-04-01T00:00:00.000Z',
        to_date: '2027-03-31T23:59:59.999Z',
        total_income: 0,
        total_expenses: 0,
        net_result: 0,
        net_profit_loss: 0,
        result_type: 'SURPLUS',
        income_accounts_count: 0,
        expense_accounts_count: 0,
      }),
    };

    balanceSheetService = {
      getBalanceSheet: jest.fn().mockResolvedValue({
        as_of_date: '2026-09-28T00:00:00.000Z',
        assets: { items: [], total: 0 },
        liabilities: { items: [], total: 0 },
        equity: {
          items: [],
          total_equity_accounts: 0,
          current_surplus_deficit: 0,
          total: 0,
        },
        total_assets: 0,
        total_liabilities: 0,
        total_equity: 0,
        total_liabilities_and_equity: 0,
        difference: 0,
        is_balanced: true,
      }),
      getBalanceSheetSummary: jest.fn().mockResolvedValue({
        as_of_date: '2026-09-28T00:00:00.000Z',
        total_assets: 0,
        total_liabilities: 0,
        total_equity: 0,
        current_surplus_deficit: 0,
        total_liabilities_and_equity: 0,
        difference: 0,
        is_balanced: true,
        asset_accounts_count: 0,
        liability_accounts_count: 0,
        equity_accounts_count: 0,
      }),
    };

    controller = new ReportsController(
      trialBalanceService as unknown as TrialBalanceService,
      profitLossService as unknown as ProfitLossService,
      balanceSheetService as unknown as BalanceSheetService,
    );
  });

  describe('getTrialBalance', () => {
    it('calls service.getTrialBalance with query dto', async () => {
      const dto = {
        as_of_date: '2026-09-28',
        account_type: AccountType.ASSET,
        include_zero_balances: true,
      };

      const res = await controller.getTrialBalance(dto);
      expect(trialBalanceService.getTrialBalance).toHaveBeenCalledWith(dto);
      expect(res.is_balanced).toBe(true);
    });
  });

  describe('getTrialBalanceSummary', () => {
    it('calls service.getTrialBalanceSummary with query dto', async () => {
      const dto = { as_of_date: '2026-09-28' };

      const res = await controller.getTrialBalanceSummary(dto);
      expect(trialBalanceService.getTrialBalanceSummary).toHaveBeenCalledWith(dto);
      expect(res.is_balanced).toBe(true);
    });
  });

  describe('getProfitLoss', () => {
    it('calls service.getProfitLoss with query dto', async () => {
      const dto = {
        from_date: '2026-04-01',
        to_date: '2027-03-31',
        include_zero_balances: true,
      };

      const res = await controller.getProfitLoss(dto);
      expect(profitLossService.getProfitLoss).toHaveBeenCalledWith(dto);
      expect(res.result_type).toBe('SURPLUS');
    });
  });

  describe('getProfitLossSummary', () => {
    it('calls service.getProfitLossSummary with query dto', async () => {
      const dto = {
        from_date: '2026-04-01',
        to_date: '2027-03-31',
      };

      const res = await controller.getProfitLossSummary(dto);
      expect(profitLossService.getProfitLossSummary).toHaveBeenCalledWith(dto);
      expect(res.result_type).toBe('SURPLUS');
    });
  });

  describe('getBalanceSheet', () => {
    it('calls service.getBalanceSheet with query dto', async () => {
      const dto = {
        as_of_date: '2026-09-28',
        include_zero_balances: true,
      };

      const res = await controller.getBalanceSheet(dto);
      expect(balanceSheetService.getBalanceSheet).toHaveBeenCalledWith(dto);
      expect(res.is_balanced).toBe(true);
    });
  });

  describe('getBalanceSheetSummary', () => {
    it('calls service.getBalanceSheetSummary with query dto', async () => {
      const dto = { as_of_date: '2026-09-28' };

      const res = await controller.getBalanceSheetSummary(dto);
      expect(balanceSheetService.getBalanceSheetSummary).toHaveBeenCalledWith(dto);
      expect(res.is_balanced).toBe(true);
    });
  });
});
