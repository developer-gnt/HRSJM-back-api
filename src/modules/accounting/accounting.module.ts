import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from './entities/account.entity';
import { AccountingEntryEntity } from './entities/accounting-entry.entity';
import { AccountingEntryLineEntity } from './entities/accounting-entry-line.entity';
import { AccountsController } from './controllers/accounts.controller';
import { AccountingController } from './controllers/accounting.controller';
import { AccountsService } from './services/accounts.service';
import { AccountingEntriesService } from './services/accounting-entries.service';
import { AccountingPostingService } from './services/accounting-posting.service';
import { LedgerService } from './services/ledger.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      AccountingEntryEntity,
      AccountingEntryLineEntity,
    ]),
    AuditModule,
  ],
  controllers: [AccountsController, AccountingController],
  providers: [
    AccountsService,
    AccountingEntriesService,
    AccountingPostingService,
    LedgerService,
  ],
  exports: [AccountingPostingService],
})
export class AccountingModule {}
