import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './controllers/admin.controller';
import { AdminService } from './services/admin.service';
import { UserEntity } from '../users/entities/user.entity';
import { MembershipEntity } from '../memberships/entities/membership.entity';
import { RenewalRequestEntity } from '../renewals/entities/renewal-request.entity';
import { AssistanceRequestEntity } from '../assistance/entities/assistance-request.entity';
import { SupportTicketEntity } from '../support/entities/support-ticket.entity';
import { DonationEntity } from '../donations/entities/donation.entity';
import { DocumentEntity } from '../documents/entities/document.entity';
import { NotificationRecipientEntity } from '../notifications/entities/notification-recipient.entity';
import { MembershipPaymentEntity } from '../membership-payments/entities/membership-payment.entity';
import { ReceiptEntity } from '../membership-payments/entities/receipt.entity';
import { AuditLogEntity } from '../audit/entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      MembershipEntity,
      RenewalRequestEntity,
      AssistanceRequestEntity,
      SupportTicketEntity,
      DonationEntity,
      DocumentEntity,
      NotificationRecipientEntity,
      MembershipPaymentEntity,
      ReceiptEntity,
      AuditLogEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
