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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipEntity,
      MembershipCategoryEntity,
      MembershipPaymentEntity,
    ]),
    DocumentsModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
