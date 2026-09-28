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
  ExpensePaymentMethod,
  ExpenseStatus,
} from '../enums/expense-entry.enums';

export class ListExpenseEntriesDto {
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
    description: 'Filter expenses on or after this date',
  })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({
    example: '2026-09-30T23:59:59.999Z',
    description: 'Filter expenses on or before this date',
  })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000757',
    description: 'Filter by expense account ID',
  })
  @IsOptional()
  @IsUUID()
  expense_account_id?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000751',
    description: 'Filter by paid-from asset account ID',
  })
  @IsOptional()
  @IsUUID()
  paid_from_account_id?: string;

  @ApiPropertyOptional({
    enum: ExpenseStatus,
    example: ExpenseStatus.POSTED,
    description: 'Filter by status',
  })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiPropertyOptional({
    enum: ExpensePaymentMethod,
    example: ExpensePaymentMethod.BANK_TRANSFER,
    description: 'Filter by payment method',
  })
  @IsOptional()
  @IsEnum(ExpensePaymentMethod)
  payment_method?: ExpensePaymentMethod;

  @ApiPropertyOptional({
    example: 'Apex',
    description: 'Search by voucher number, paid to, reference, or description',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
