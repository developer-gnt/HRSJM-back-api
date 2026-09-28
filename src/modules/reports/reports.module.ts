import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../accounting/entities/accounting-entry.entity';
import { AccountingEntryLineEntity } from '../accounting/entities/accounting-entry-line.entity';
import { ReportsController } from './controllers/reports.controller';
import { TrialBalanceService } from './services/trial-balance.service';
import { ProfitLossService } from './services/profit-loss.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      AccountingEntryEntity,
      AccountingEntryLineEntity,
    ]),
  ],
  controllers: [ReportsController],
  providers: [TrialBalanceService, ProfitLossService],
  exports: [TrialBalanceService, ProfitLossService],
})
export class ReportsModule {}
