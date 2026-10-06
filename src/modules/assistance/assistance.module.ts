import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistanceRequestEntity } from './entities/assistance-request.entity';
import { UserEntity } from '../users/entities/user.entity';
import { AssistanceController } from './controllers/assistance.controller';
import { AssistanceService } from './services/assistance.service';
import { DocumentsModule } from '../documents/documents.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssistanceRequestEntity, UserEntity]),
    DocumentsModule,
    AuditModule,
    NotificationsModule,
    UsersModule,
  ],
  controllers: [AssistanceController],
  providers: [AssistanceService],
  exports: [AssistanceService],
})
export class AssistanceModule {}

