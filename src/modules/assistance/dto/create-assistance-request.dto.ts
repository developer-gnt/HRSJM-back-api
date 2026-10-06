import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AssistanceRequestStatus } from '../entities/assistance-request.entity';

export class CreateAssistanceRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  full_name: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  mobile: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  requested_amount: number;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  reason: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  user_id?: string;

  @IsOptional()
  @IsString()
  admin_remark?: string;

  @IsOptional()
  @IsEnum(AssistanceRequestStatus)
  status?: AssistanceRequestStatus;
}

