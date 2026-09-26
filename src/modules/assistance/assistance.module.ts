import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssistanceRequestEntity } from './entities/assistance-request.entity';
import { AssistanceController } from './controllers/assistance.controller';
import { AssistanceService } from './services/assistance.service';
import { DocumentsModule } from '../documents/documents.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AssistanceRequestEntity]),
    DocumentsModule,
    AuditModule,
  ],
  controllers: [AssistanceController],
  providers: [AssistanceService],
  exports: [AssistanceService],
})
export class AssistanceModule {}
