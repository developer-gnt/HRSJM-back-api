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

  @ApiPropertyOptional({ description: 'Aadhaar card attachment file name', example: 'aadhaar_card.pdf' })
  @IsOptional()
  @IsString()
  aadhaarFileName?: string;

  @ApiPropertyOptional({ description: 'Aadhaar card base64 or URL' })
  @IsOptional()
  @IsString()
  aadhaarFileUri?: string;

  @ApiPropertyOptional({ description: 'Handwritten complaint letter attachment file name', example: 'handwritten_complaint.jpg' })
  @IsOptional()
  @IsString()
  handwrittenFileName?: string;

  @ApiPropertyOptional({ description: 'Handwritten complaint letter base64 or URL' })
  @IsOptional()
  @IsString()
  handwrittenFileUri?: string;

  @ApiPropertyOptional({ description: 'Whether the issue was reported to another department', example: false })
  @IsOptional()
  reportedToOtherDept?: boolean;

  @ApiPropertyOptional({ description: 'Name of other department previously reported to', example: 'State Police Department' })
  @IsOptional()
  @IsString()
  otherDeptName?: string;

  @ApiPropertyOptional({ description: 'Previous department complaint/acknowledgment file name', example: 'fir_copy.pdf' })
  @IsOptional()
  @IsString()
  otherDeptFileName?: string;

  @ApiPropertyOptional({ description: 'Previous department complaint copy base64 or URL' })
  @IsOptional()
  @IsString()
  otherDeptFileUri?: string;
}
