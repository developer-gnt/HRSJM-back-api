import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AssistanceRequest } from "../assistance/entities/assistance-request.entity";
import { Document } from "../documents/entities/document.entity";
import { Membership } from "../memberships/entities/membership.entity";
import { NotificationRecipient } from "../notifications/entities/notification-recipient.entity";
import { RenewalRequest } from "../renewals/entities/renewal-request.entity";
import { SupportTicket } from "../support/entities/support-ticket.entity";
import { Donation } from "../donations/entities/donation.entity";
import { UsersModule } from "../users/users.module";
import { User } from "../users/entities/user.entity";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Membership,
      RenewalRequest,
      AssistanceRequest,
      SupportTicket,
      Document,
      Donation,
      NotificationRecipient,
    ]),
    UsersModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}