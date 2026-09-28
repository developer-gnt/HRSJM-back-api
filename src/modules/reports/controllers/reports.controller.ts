import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { TrialBalanceService } from '../services/trial-balance.service';
import { ProfitLossService } from '../services/profit-loss.service';
import { BalanceSheetService } from '../services/balance-sheet.service';
import { TrialBalanceQueryDto } from '../dto/trial-balance-query.dto';
import { TrialBalanceSummaryQueryDto } from '../dto/trial-balance-summary-query.dto';
import { ProfitLossQueryDto } from '../dto/profit-loss-query.dto';
import { ProfitLossSummaryQueryDto } from '../dto/profit-loss-summary-query.dto';
import { BalanceSheetQueryDto } from '../dto/balance-sheet-query.dto';
import { BalanceSheetSummaryQueryDto } from '../dto/balance-sheet-summary-query.dto';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly trialBalanceService: TrialBalanceService,
    private readonly profitLossService: ProfitLossService,
    private readonly balanceSheetService: BalanceSheetService,
  ) {}

  @Get('trial-balance')
  @RequirePermissions('trial_balance.read')
  @ApiOperation({
    summary: 'Get detailed trial balance report as of date (admin)',
  })
  getTrialBalance(@Query() dto: TrialBalanceQueryDto) {
    return this.trialBalanceService.getTrialBalance(dto);
  }

  @Get('trial-balance/summary')
  @RequirePermissions('trial_balance.read')
  @ApiOperation({
    summary: 'Get trial balance summary and account-type breakdown as of date (admin)',
  })
  getTrialBalanceSummary(@Query() dto: TrialBalanceSummaryQueryDto) {
    return this.trialBalanceService.getTrialBalanceSummary(dto);
  }

  @Get('profit-loss')
  @RequirePermissions('profit_loss.read')
  @ApiOperation({
    summary: 'Get detailed profit and loss (income statement) report for a period (admin)',
  })
  getProfitLoss(@Query() dto: ProfitLossQueryDto) {
    return this.profitLossService.getProfitLoss(dto);
  }

  @Get('profit-loss/summary')
  @RequirePermissions('profit_loss.read')
  @ApiOperation({
    summary: 'Get profit and loss summary for a period (admin)',
  })
  getProfitLossSummary(@Query() dto: ProfitLossSummaryQueryDto) {
    return this.profitLossService.getProfitLossSummary(dto);
  }

  @Get('balance-sheet')
  @RequirePermissions('balance_sheet.read')
  @ApiOperation({
    summary: 'Get detailed balance sheet report as of date (admin)',
  })
  getBalanceSheet(@Query() dto: BalanceSheetQueryDto) {
    return this.balanceSheetService.getBalanceSheet(dto);
  }

  @Get('balance-sheet/summary')
  @RequirePermissions('balance_sheet.read')
  @ApiOperation({
    summary: 'Get balance sheet summary as of date (admin)',
  })
  getBalanceSheetSummary(@Query() dto: BalanceSheetSummaryQueryDto) {
    return this.balanceSheetService.getBalanceSheetSummary(dto);
  }
}
