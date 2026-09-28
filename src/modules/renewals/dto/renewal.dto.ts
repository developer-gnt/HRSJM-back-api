import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  RenewalPaymentMethod,
  RenewalPaymentStatus,
  RenewalStatus,
} from '../entities/renewal-request.entity';

export class CreateRenewalDto {
  @ApiProperty({ description: 'Membership ID to renew' })
  @IsUUID()
  membership_id: string;

  @ApiPropertyOptional({ description: 'Renewal period in years (1-5)', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  period_years?: number;

  @ApiPropertyOptional({ description: 'Renewal fee amount (auto-calculated if omitted)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    description: 'Payment method',
    enum: RenewalPaymentMethod,
    default: RenewalPaymentMethod.CASH,
  })
  @IsOptional()
  @IsEnum(RenewalPaymentMethod)
  payment_method?: RenewalPaymentMethod;

  @ApiPropertyOptional({ description: 'Optional transaction or payment reference ID' })
  @IsOptional()
  @IsString()
  transaction_id?: string;

  @ApiPropertyOptional({ description: 'Note from the member requesting renewal' })
  @IsOptional()
  @IsString()
  member_note?: string;
}

export class ListRenewalsDto {
  @ApiPropertyOptional({ description: 'Filter by renewal status', enum: RenewalStatus })
  @IsOptional()
  @IsEnum(RenewalStatus)
  status?: RenewalStatus;

  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: RenewalPaymentStatus,
  })
  @IsOptional()
  @IsEnum(RenewalPaymentStatus)
  payment_status?: RenewalPaymentStatus;

  @ApiPropertyOptional({ description: 'Filter by membership ID' })
  @IsOptional()
  @IsUUID()
  membership_id?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ReviewRenewalDto {
  @ApiPropertyOptional({ description: 'Admin remark' })
  @IsOptional()
  @IsString()
  admin_remark?: string;
}

export class UpdateRenewalPaymentDto {
  @ApiProperty({ enum: RenewalPaymentStatus })
  @IsEnum(RenewalPaymentStatus)
  payment_status: RenewalPaymentStatus;

  @ApiPropertyOptional({ description: 'Transaction / reference ID' })
  @IsOptional()
  @IsString()
  transaction_id?: string;
}
