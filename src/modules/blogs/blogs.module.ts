import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlogEntity } from './entities/blog.entity';
import { BlogsService } from './services/blogs.service';
import { BlogsController } from './controllers/blogs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlogEntity]),
  ],
  controllers: [BlogsController],
  providers: [BlogsService],
  exports: [BlogsService],
})
export class BlogsModule {}
