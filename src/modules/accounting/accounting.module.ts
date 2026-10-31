import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from './entities/account.entity';
import { AccountingEntryEntity } from './entities/accounting-entry.entity';
import { AccountingEntryLineEntity } from './entities/accounting-entry-line.entity';
import { ReceiptEntryEntity } from '../receipt-entries/entities/receipt-entry.entity';
import { ExpenseEntryEntity } from '../expense-entries/entities/expense-entry.entity';
import { DonationEntity } from '../donations/entities/donation.entity';
import { MembershipPaymentEntity } from '../membership-payments/entities/membership-payment.entity';
import { AccountsController } from './controllers/accounts.controller';
import { AccountingController } from './controllers/accounting.controller';
import { PassbookController } from './controllers/passbook.controller';
import { AccountsService } from './services/accounts.service';
import { AccountingEntriesService } from './services/accounting-entries.service';
import { AccountingPostingService } from './services/accounting-posting.service';
import { LedgerService } from './services/ledger.service';
import { PassbookExportService } from './services/passbook-export.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      AccountingEntryEntity,
      AccountingEntryLineEntity,
      ReceiptEntryEntity,
      ExpenseEntryEntity,
      DonationEntity,
      MembershipPaymentEntity,
    ]),
    AuditModule,
  ],
  controllers: [AccountsController, AccountingController, PassbookController],
  providers: [
    AccountsService,
    AccountingEntriesService,
    AccountingPostingService,
    LedgerService,
    PassbookExportService,
  ],
  exports: [AccountingPostingService, PassbookExportService],
})
export class AccountingModule {}
