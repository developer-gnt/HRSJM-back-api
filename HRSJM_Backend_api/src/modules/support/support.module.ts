import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DocumentsModule } from "../documents/documents.module";
import { SupportTicket } from "./entities/support-ticket.entity";
import { SupportTicketMessage } from "./entities/support-ticket-message.entity";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket, SupportTicketMessage]),
    DocumentsModule,
  ],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}