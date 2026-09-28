import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../accounting/entities/account.entity';
import { AccountingEntryEntity } from '../accounting/entities/accounting-entry.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { ExpenseEntriesController } from './controllers/expense-entries.controller';
import { ExpenseEntryEntity } from './entities/expense-entry.entity';
import { ExpenseEntriesService } from './services/expense-entries.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ExpenseEntryEntity,
      AccountEntity,
      AccountingEntryEntity,
    ]),
    AccountingModule,
    AuditModule,
  ],
  controllers: [ExpenseEntriesController],
  providers: [ExpenseEntriesService],
  exports: [ExpenseEntriesService],
})
export class ExpenseEntriesModule {}
