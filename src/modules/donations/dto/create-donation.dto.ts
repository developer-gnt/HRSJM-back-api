import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDonationDto {
  @ApiProperty({ example: 'Jane Donor', description: 'Name of the donor' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  donor_name: string;

  @ApiPropertyOptional({ example: '9876501234', description: 'Donor mobile number' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  donor_mobile?: string;

  @ApiPropertyOptional({ example: '9876501234', description: 'Alias for donor_mobile' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  mobile_number?: string;

  @ApiPropertyOptional({ example: 'jane.donor@example.com', description: 'Donor email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  donor_email?: string;

  @ApiPropertyOptional({ example: 'jane.donor@example.com', description: 'Alias for donor_email' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: 'General Medical Aid', description: 'Cause or campaign for donation' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cause?: string;

  @ApiPropertyOptional({ example: 'General Medical Aid', description: 'Alias for cause' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  campaign?: string;

  @ApiProperty({ example: 2500.0, description: 'Donation amount in INR' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: false, description: 'Whether donation is anonymous' })
  @IsOptional()
  @IsBoolean()
  is_anonymous?: boolean;

  @ApiPropertyOptional({ example: 'Donation remark', description: 'Optional remark/note' })
  @IsOptional()
  @IsString()
  remark?: string;
}
