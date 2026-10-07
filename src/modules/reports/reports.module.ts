import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../accounting/entities/accounting-entry.entity';
import { AccountingEntryLineEntity } from '../accounting/entities/accounting-entry-line.entity';
import { UserEntity } from '../users/entities/user.entity';
import { DonationEntity } from '../donations/entities/donation.entity';
import { SupportTicketEntity } from '../support/entities/support-ticket.entity';
import { EventEntity } from '../events/entities/event.entity';
import { BlogEntity } from '../blogs/entities/blog.entity';
import { NewsEntity } from '../news/entities/news.entity';
import { MembershipEntity } from '../memberships/entities/membership.entity';
import { ReportsController } from './controllers/reports.controller';
import { TrialBalanceService } from './services/trial-balance.service';
import { ProfitLossService } from './services/profit-loss.service';
import { BalanceSheetService } from './services/balance-sheet.service';
import { ReportsAnalyticsService } from './services/reports-analytics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      AccountingEntryEntity,
      AccountingEntryLineEntity,
      UserEntity,
      DonationEntity,
      SupportTicketEntity,
      EventEntity,
      BlogEntity,
      NewsEntity,
      MembershipEntity,
    ]),
  ],
  controllers: [ReportsController],
  providers: [
    TrialBalanceService,
    ProfitLossService,
    BalanceSheetService,
    ReportsAnalyticsService,
  ],
  exports: [
    TrialBalanceService,
    ProfitLossService,
    BalanceSheetService,
    ReportsAnalyticsService,
  ],
})
export class ReportsModule {}
