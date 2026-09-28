import {
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMembershipDto {
  @ApiProperty({ description: 'Membership category UUID', example: 'd0577be3-8547-4952-b88d-e6b77e8be2c7' })
  @IsUUID()
  category_id: string;

  @ApiPropertyOptional({ description: 'Optional user ID if applied by admin' })
  @IsOptional()
  @IsUUID()
  user_id?: string;

  @ApiPropertyOptional({ description: 'Applicant full name', example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  full_name?: string;

  @ApiPropertyOptional({ description: 'Applicant mobile number', example: '9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobile_number?: string;

  @ApiPropertyOptional({ description: 'Applicant email address', example: 'john.doe@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Personal details (dob, gender, address)',
    example: { dob: '1990-01-01', gender: 'MALE', address: '123 Main St, New Delhi' },
  })
  @IsOptional()
  @IsObject()
  personal_details?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Additional application data payload' })
  @IsOptional()
  @IsObject()
  application_data?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Admin notes' })
  @IsOptional()
  @IsString()
  admin_notes?: string;
}
