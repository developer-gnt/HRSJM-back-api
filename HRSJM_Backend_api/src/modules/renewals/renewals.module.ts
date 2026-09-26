import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Membership } from "../memberships/entities/membership.entity";
import { RenewalRequest } from "./entities/renewal-request.entity";
import { AdminRenewalsController, MembershipRenewalHistoryController } from "./admin-renewals.controller";
import { RenewalsController } from "./renewals.controller";
import { RenewalsService } from "./renewals.service";

@Module({
  imports: [TypeOrmModule.forFeature([RenewalRequest, Membership])],
  controllers: [
    RenewalsController,
    AdminRenewalsController,
    MembershipRenewalHistoryController,
  ],
  providers: [RenewalsService],
  exports: [RenewalsService],
})
export class RenewalsModule {}