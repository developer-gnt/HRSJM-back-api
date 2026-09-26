import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

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
  @MinLength(5)
  @MaxLength(255)
  reason: string;

  @IsOptional()
  @IsString()
  description?: string;
}
