import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipCategoryEntity } from './entities/membership-category.entity';
import { MembershipCategoriesController } from './controllers/membership-categories.controller';
import { MembershipCategoriesService } from './services/membership-categories.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MembershipCategoryEntity]),
    AuditModule,
  ],
  controllers: [MembershipCategoriesController],
  providers: [MembershipCategoriesService],
  exports: [MembershipCategoriesService],
})
export class MembershipCategoriesModule {}
