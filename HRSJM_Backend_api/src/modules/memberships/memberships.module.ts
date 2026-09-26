import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersModule } from "../users/users.module";
import { Membership } from "./entities/membership.entity";
import { MembershipIdController } from "./membership-id.controller";
import { MembershipsController } from "./memberships.controller";
import { MembershipsService } from "./memberships.service";

@Module({
  imports: [TypeOrmModule.forFeature([Membership]), UsersModule],
  controllers: [MembershipsController, MembershipIdController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}