import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePublicComplaintDto {
  @ApiProperty({ description: 'Full Name of the complainant', example: 'Rajesh Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ description: '10-digit Phone Number', example: '9876543210' })
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  phone: string;

  @ApiPropertyOptional({ description: 'Complainant email address', example: 'rajesh@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'State / Union Territory', example: 'Maharashtra' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  state: string;

  @ApiProperty({ description: 'Nearby Police Station', example: 'Bandra Police Station' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  policeStation: string;

  @ApiProperty({ description: 'Type or category of complaint', example: 'Human Rights Violation' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  complaintType: string;

  @ApiProperty({ description: 'Detailed description of the concern / incident', example: 'Details of the incident...' })
  @IsString()
  @MinLength(10)
  details: string;
}
