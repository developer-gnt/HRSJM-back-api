import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountingModule } from "../accounting/accounting.module";
import { DocumentsModule } from "../documents/documents.module";
import { Document } from "../documents/entities/document.entity";
import { IncomeReceipt } from "./entities/income-receipt.entity";
import { AdminReceiptsController } from "./admin-receipts.controller";
import { ReceiptsService } from "./receipts.service";

@Module({
  imports: [TypeOrmModule.forFeature([IncomeReceipt, Document]), AccountingModule, DocumentsModule],
  controllers: [AdminReceiptsController],
  providers: [ReceiptsService],
})
export class ReceiptsModule {}