import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationRecipientEntity } from './entities/notification-recipient.entity';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { UserEntity } from '../users/entities/user.entity';
import { UserRoleEntity } from '../users/entities/user-role.entity';
import { RoleEntity } from '../roles/entities/role.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationRecipientEntity,
      UserEntity,
      UserRoleEntity,
      RoleEntity,
    ]),
    AuditModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
