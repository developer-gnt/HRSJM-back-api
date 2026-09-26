import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { SupportTicketMessageEntity } from './entities/support-ticket-message.entity';
import { SupportController } from './controllers/support.controller';
import { SupportService } from './services/support.service';
import { DocumentsModule } from '../documents/documents.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportTicketEntity,
      SupportTicketMessageEntity,
    ]),
    DocumentsModule,
    AuditModule,
  ],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
