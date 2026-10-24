import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCashfreeOrderDto {
  @ApiProperty({ enum: ['donation', 'membership'], description: 'Payment purpose' })
  @IsIn(['donation', 'membership'])
  purpose: 'donation' | 'membership';

  @ApiPropertyOptional({ description: 'Internal payment record UUID or reference ID' })
  @IsOptional()
  @IsString()
  reference_id?: string;

  @ApiPropertyOptional({ description: 'Order payment amount in INR' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount?: number;

  @ApiPropertyOptional({ description: 'Customer or applicant full name' })
  @IsOptional()
  @IsString()
  customer_name?: string;

  @ApiPropertyOptional({ description: 'Customer mobile number' })
  @IsOptional()
  @IsString()
  customer_phone?: string;

  @ApiPropertyOptional({ description: 'Customer email address' })
  @IsOptional()
  @IsString()
  customer_email?: string;

  @ApiPropertyOptional({ description: 'Order note or description' })
  @IsOptional()
  @IsString()
  order_note?: string;

  @ApiPropertyOptional({ description: 'Optional custom return_url override' })
  @IsOptional()
  @IsString()
  return_url?: string;
}
