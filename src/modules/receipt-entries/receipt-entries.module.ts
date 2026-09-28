import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../accounting/entities/accounting-entry.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { ReceiptEntriesController } from './controllers/receipt-entries.controller';
import { ReceiptEntryEntity } from './entities/receipt-entry.entity';
import { ReceiptEntriesService } from './services/receipt-entries.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReceiptEntryEntity,
      AccountEntity,
      AccountingEntryEntity,
    ]),
    AccountingModule,
    AuditModule,
  ],
  controllers: [ReceiptEntriesController],
  providers: [ReceiptEntriesService],
  exports: [ReceiptEntriesService],
})
export class ReceiptEntriesModule {}
