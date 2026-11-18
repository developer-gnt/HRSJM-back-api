import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DonationPaymentEntity } from './entities/donation-payment.entity';
import { DonationEntity } from '../donations/entities/donation.entity';
import { ReceiptEntity } from '../membership-payments/entities/receipt.entity';
import { PaymentTransactionEntity } from '../membership-payments/entities/payment-transaction.entity';
import { ReceiptEntryEntity } from '../receipt-entries/entities/receipt-entry.entity';
import { AccountEntity } from '../accounting/entities/account.entity';
import { UserEntity } from '../users/entities/user.entity';
import { MembershipEntity } from '../memberships/entities/membership.entity';
import { DonationPaymentsController } from './controllers/donation-payments.controller';
import { DonationPaymentsService } from './services/donation-payments.service';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DonationPaymentEntity,
      DonationEntity,
      PaymentTransactionEntity,
      ReceiptEntity,
      ReceiptEntryEntity,
      AccountEntity,
      UserEntity,
      MembershipEntity,
    ]),
    AccountingModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [DonationPaymentsController],
  providers: [DonationPaymentsService],
  exports: [DonationPaymentsService],
})
export class DonationPaymentsModule {}
