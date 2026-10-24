import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CheckDuplicatesDto {
  @ApiPropertyOptional({
    description: '10-digit mobile number to check availability for',
    example: '9876543210',
  })
  @IsOptional()
  @IsString()
  mobile_number?: string;

  @ApiPropertyOptional({
    description: 'Email address to check availability for',
    example: 'member@hrsjm.org',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
