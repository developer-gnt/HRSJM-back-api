import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipPaymentEntity } from '../membership-payments/entities/membership-payment.entity';
import { DonationPaymentEntity } from '../donation-payments/entities/donation-payment.entity';
import { ReceiptEntity } from '../membership-payments/entities/receipt.entity';
import { DonationEntity } from '../donations/entities/donation.entity';
import { UserEntity } from '../users/entities/user.entity';
import { TransactionsController } from './controllers/transactions.controller';
import { TransactionsService } from './services/transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipPaymentEntity,
      DonationPaymentEntity,
      ReceiptEntity,
      DonationEntity,
      UserEntity,
    ]),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}

