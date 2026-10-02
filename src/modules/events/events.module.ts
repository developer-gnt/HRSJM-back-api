import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { EventEntity } from './entities/event.entity';
import { EventsService } from './services/events.service';
import { EventsController } from './controllers/events.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventEntity]),
    JwtModule.register({}),
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
