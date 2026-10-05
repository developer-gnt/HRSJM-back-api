import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsEntity } from './entities/news.entity';
import { NewsService } from './services/news.service';
import { NewsController } from './controllers/news.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NewsEntity]),
  ],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
