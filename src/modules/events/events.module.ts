import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './entities/event.entity';
import { EventsService } from './services/events.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventsController } from './controllers/events.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    NotificationsModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
