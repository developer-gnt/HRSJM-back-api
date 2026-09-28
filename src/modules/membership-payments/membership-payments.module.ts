import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipPaymentEntity } from './entities/membership-payment.entity';
import { ReceiptEntity } from './entities/receipt.entity';
import { PaymentTransactionEntity } from './entities/payment-transaction.entity';
import { MembershipEntity } from '../memberships/entities/membership.entity';
import { MembershipPaymentsController } from './controllers/membership-payments.controller';
import { MembershipPaymentsService } from './services/membership-payments.service';
import { AuditModule } from '../audit/audit.module';
import { AccountingModule } from '../accounting/accounting.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipPaymentEntity,
      ReceiptEntity,
      PaymentTransactionEntity,
      MembershipEntity,
    ]),
    AccountingModule,
    AuditModule,
    NotificationsModule,
  ],
  controllers: [MembershipPaymentsController],
  providers: [MembershipPaymentsService],
  exports: [MembershipPaymentsService],
})
export class MembershipPaymentsModule {}
