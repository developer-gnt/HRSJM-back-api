import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationEntity } from './entities/donation.entity';
import { DonationRefundEntity } from './entities/donation-refund.entity';
import { DonationPaymentEntity } from '../donation-payments/entities/donation-payment.entity';
import { ReceiptEntryEntity } from '../receipt-entries/entities/receipt-entry.entity';
import { DonationsController } from './controllers/donations.controller';
import { DonationsService } from './services/donations.service';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Scaffold for the donations resource. Phase 9 owns only the refund
 * endpoint and refund records — full donations CRUD is Arshad's module
 * and will extend this one.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DonationEntity,
      DonationRefundEntity,
      DonationPaymentEntity,
      ReceiptEntryEntity,
    ]),
    AccountingModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}
