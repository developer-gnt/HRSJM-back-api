import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RenewalRequestEntity } from './entities/renewal-request.entity';
import { RenewalsController } from './controllers/renewals.controller';
import { AdminRenewalsController } from './controllers/admin-renewals.controller';
import { RenewalsService } from './services/renewals.service';
import { MembershipEntity } from '../memberships/entities/membership.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

import { ReceiptEntity } from '../membership-payments/entities/receipt.entity';

import { RenewalCalculationService } from './services/renewal-calculation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RenewalRequestEntity,
      MembershipEntity,
      ReceiptEntity,
    ]),
    AuditModule,
    NotificationsModule,
  ],
  controllers: [RenewalsController, AdminRenewalsController],
  providers: [RenewalsService, RenewalCalculationService],
  exports: [RenewalsService, RenewalCalculationService],
})
export class RenewalsModule {}
