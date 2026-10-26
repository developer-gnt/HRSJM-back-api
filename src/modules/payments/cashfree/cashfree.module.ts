import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import cashfreeConfig from '../../../config/cashfree.config';
import { DonationPaymentEntity } from '../../donation-payments/entities/donation-payment.entity';
import { DonationPaymentsModule } from '../../donation-payments/donation-payments.module';
import { MembershipPaymentEntity } from '../../membership-payments/entities/membership-payment.entity';
import { PaymentTransactionEntity } from '../../membership-payments/entities/payment-transaction.entity';
import { MembershipPaymentsModule } from '../../membership-payments/membership-payments.module';
import { CashfreeController } from './cashfree.controller';
import { CashfreeOrdersService } from './cashfree-orders.service';
import { CashfreeService } from './cashfree.service';

import { DonationEntity } from '../../donations/entities/donation.entity';
import { MembershipEntity } from '../../memberships/entities/membership.entity';
import { RenewalRequestEntity } from '../../renewals/entities/renewal-request.entity';
import { RenewalsModule } from '../../renewals/renewals.module';

@Module({
  imports: [
    ConfigModule.forFeature(cashfreeConfig),
    TypeOrmModule.forFeature([
      DonationPaymentEntity,
      MembershipPaymentEntity,
      PaymentTransactionEntity,
      DonationEntity,
      MembershipEntity,
      RenewalRequestEntity,
    ]),
    DonationPaymentsModule,
    MembershipPaymentsModule,
    RenewalsModule,
  ],
  controllers: [CashfreeController],
  providers: [CashfreeService, CashfreeOrdersService],
  exports: [CashfreeService, CashfreeOrdersService],
})
export class CashfreeModule {}
