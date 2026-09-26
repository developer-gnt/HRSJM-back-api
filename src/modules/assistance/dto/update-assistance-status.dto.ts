import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AssistanceRequestStatus } from '../entities/assistance-request.entity';

export class UpdateAssistanceStatusDto {
  @IsEnum(AssistanceRequestStatus)
  status: AssistanceRequestStatus;

  @IsOptional()
  @IsString()
  admin_remark?: string;
}
