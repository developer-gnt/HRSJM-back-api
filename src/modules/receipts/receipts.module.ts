import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceiptsController } from './controllers/receipts.controller';
import { ReceiptsService } from './services/receipts.service';
import { ReceiptEntity } from '../membership-payments/entities/receipt.entity';
import { DonationPaymentEntity } from '../donation-payments/entities/donation-payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ReceiptEntity, DonationPaymentEntity])],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
