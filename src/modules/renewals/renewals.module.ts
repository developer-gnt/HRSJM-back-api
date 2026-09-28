import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RenewalRequestEntity } from './entities/renewal-request.entity';
import { RenewalsController } from './controllers/renewals.controller';
import { AdminRenewalsController } from './controllers/admin-renewals.controller';
import { RenewalsService } from './services/renewals.service';
import { MembershipEntity } from '../memberships/entities/membership.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RenewalRequestEntity, MembershipEntity]),
    AuditModule,
  ],
  controllers: [RenewalsController, AdminRenewalsController],
  providers: [RenewalsService],
  exports: [RenewalsService],
})
export class RenewalsModule {}
