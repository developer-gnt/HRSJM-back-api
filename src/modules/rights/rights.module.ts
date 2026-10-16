import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RightEntity } from './entities/right.entity';
import { RightsService } from './services/rights.service';
import { RightsController } from './controllers/rights.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([RightEntity]),
  ],
  controllers: [RightsController],
  providers: [RightsService],
  exports: [RightsService],
})
export class RightsModule {}
