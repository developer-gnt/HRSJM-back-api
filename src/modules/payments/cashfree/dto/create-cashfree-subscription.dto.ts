import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCashfreeSubscriptionDto {
  @ApiPropertyOptional({ enum: ['donation', 'membership'], default: 'donation' })
  @IsOptional()
  @IsIn(['donation', 'membership'])
  purpose?: 'donation' | 'membership' = 'donation';

  @ApiPropertyOptional({ description: 'Internal reference ID (donation_id or membership_id)' })
  @IsOptional()
  @IsString()
  reference_id?: string;

  @ApiProperty({ description: 'Recurring payment amount in INR per cycle' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ description: 'Maximum authorized debit cap in INR' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  max_amount?: number;

  @ApiPropertyOptional({ enum: ['MONTHLY', 'YEARLY'], default: 'MONTHLY' })
  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  frequency?: 'MONTHLY' | 'YEARLY' = 'MONTHLY';

  @ApiPropertyOptional({ description: 'Customer or donor full name' })
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

  @ApiPropertyOptional({ description: 'Subscription plan note or description' })
  @IsOptional()
  @IsString()
  plan_note?: string;

  @ApiPropertyOptional({ description: 'Optional custom return_url override' })
  @IsOptional()
  @IsString()
  return_url?: string;

  @ApiPropertyOptional({ description: 'User ID of the donor or member' })
  @IsOptional()
  @IsString()
  user_id?: string;

  @ApiPropertyOptional({ description: 'Event ID if donation is for a specific campaign' })
  @IsOptional()
  @IsString()
  event_id?: string;

  @ApiPropertyOptional({ description: 'PAN number for 80G tax receipt' })
  @IsOptional()
  @IsString()
  pan_number?: string;
}
