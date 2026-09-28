import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationPaymentEntity } from './entities/donation-payment.entity';
import { DonationEntity } from '../donations/entities/donation.entity';
import { ReceiptEntity } from '../membership-payments/entities/receipt.entity';
import { PaymentTransactionEntity } from '../membership-payments/entities/payment-transaction.entity';
import { DonationPaymentsController } from './controllers/donation-payments.controller';
import { DonationPaymentsService } from './services/donation-payments.service';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DonationPaymentEntity,
      DonationEntity,
      PaymentTransactionEntity,
      ReceiptEntity,
    ]),
    AccountingModule,
    AuditModule,
  ],
  controllers: [DonationPaymentsController],
  providers: [DonationPaymentsService],
  exports: [DonationPaymentsService],
})
export class DonationPaymentsModule {}
