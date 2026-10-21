import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ValidateUpiDto {
  @ApiProperty({
    example: 'donor@upi',
    description: 'UPI Virtual Payment Address (VPA) format validation',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'UPI ID must be a string' })
  @IsNotEmpty({ message: 'UPI ID cannot be empty' })
  @MinLength(5, { message: 'UPI ID is too short (minimum 5 characters)' })
  @MaxLength(100, { message: 'UPI ID cannot exceed 100 characters' })
  @Matches(/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/, {
    message: 'Enter a UPI ID in a supported format (e.g. username@bank)',
  })
  upiId!: string;
}
