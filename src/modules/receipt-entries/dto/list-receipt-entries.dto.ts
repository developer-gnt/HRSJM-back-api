import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  ReceiptPaymentMethod,
  ReceiptStatus,
} from '../enums/receipt-entry.enums';

export class ListReceiptEntriesDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00.000Z',
    description: 'Filter receipts on or after this date',
  })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59.999Z',
    description: 'Filter receipts on or before this date',
  })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000756',
    description: 'Filter by income account ID',
  })
  @IsOptional()
  @IsUUID()
  income_account_id?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000751',
    description: 'Filter by received-in asset account ID',
  })
  @IsOptional()
  @IsUUID()
  received_in_account_id?: string;

  @ApiPropertyOptional({
    enum: ReceiptStatus,
    example: ReceiptStatus.POSTED,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(ReceiptStatus)
  status?: ReceiptStatus;

  @ApiPropertyOptional({
    enum: ReceiptPaymentMethod,
    example: ReceiptPaymentMethod.BANK_TRANSFER,
    description: 'Filter by payment method',
  })
  @IsOptional()
  @IsEnum(ReceiptPaymentMethod)
  payment_method?: ReceiptPaymentMethod;

  @ApiPropertyOptional({
    example: 'Tariq',
    description: 'Search by voucher number, received from, reference, or description',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
