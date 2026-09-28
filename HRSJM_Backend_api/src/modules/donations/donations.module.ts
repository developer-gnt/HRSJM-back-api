import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersModule } from "../users/users.module";
import { Donation } from "./entities/donation.entity";
import { DonationsController } from "./donations.controller";
import { DonationsService } from "./donations.service";

@Module({
  imports: [TypeOrmModule.forFeature([Donation]), UsersModule],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}