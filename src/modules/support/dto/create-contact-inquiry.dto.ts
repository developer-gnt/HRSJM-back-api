import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContactInquiryDto {
  @ApiProperty({ example: 'Rahul Sharma', description: 'Citizen full name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'citizen@example.com', description: 'Citizen email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: '9876543210', description: 'Citizen 10-digit phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Legal Aid Query', description: 'Subject of the inquiry' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ example: 'I need legal guidance regarding human rights.', description: 'Inquiry message' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(3000)
  message: string;
}
