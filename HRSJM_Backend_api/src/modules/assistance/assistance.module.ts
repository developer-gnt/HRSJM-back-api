import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentsModule } from "../documents/documents.module";
import { AssistanceRequest } from "./entities/assistance-request.entity";
import { AssistanceController } from "./assistance.controller";
import { AssistanceService } from "./assistance.service";

@Module({
  imports: [TypeOrmModule.forFeature([AssistanceRequest]), DocumentsModule],
  controllers: [AssistanceController],
  providers: [AssistanceService],
  exports: [AssistanceService],
})
export class AssistanceModule {}