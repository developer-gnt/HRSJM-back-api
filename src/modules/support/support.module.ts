import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { SupportTicketMessageEntity } from './entities/support-ticket-message.entity';
import { SupportController } from './controllers/support.controller';
import { ContactController } from './controllers/contact.controller';
import { SupportService } from './services/support.service';
import { DocumentsModule } from '../documents/documents.module';
import { AuditModule } from '../audit/audit.module';

import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SupportTicketEntity,
      SupportTicketMessageEntity,
    ]),
    DocumentsModule,
    AuditModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [SupportController, ContactController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
