import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipEntity } from './entities/membership.entity';
import { MembershipsController } from './controllers/memberships.controller';
import { MembershipsService } from './services/memberships.service';
import { MembershipCategoryEntity } from '../membership-categories/entities/membership-category.entity';
import { MembershipPaymentEntity } from '../membership-payments/entities/membership-payment.entity';
import { DocumentsModule } from '../documents/documents.module';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';

import { RenewalRequestEntity } from '../renewals/entities/renewal-request.entity';
import { MembershipIdController } from './controllers/membership-id.controller';

import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipEntity,
      MembershipCategoryEntity,
      MembershipPaymentEntity,
      RenewalRequestEntity,
    ]),
    DocumentsModule,
    AuditModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [MembershipsController, MembershipIdController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
