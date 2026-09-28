import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ExpensePaymentMethod } from '../enums/expense-entry.enums';

export class CreateExpenseEntryDto {
  @ApiProperty({
    example: '2026-09-28T00:00:00.000Z',
    description: 'Date when the expense was incurred',
  })
  @IsNotEmpty()
  @IsDateString()
  expense_date: string;

  @ApiProperty({
    example: 'Apex Office Supplies Ltd',
    description: 'Name of the recipient / payee',
    maxLength: 150,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  paid_to: string;

  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000757',
    description: 'ID of the expense account (must be of type EXPENSE)',
  })
  @IsNotEmpty()
  @IsUUID()
  expense_account_id: string;

  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000751',
    description: 'ID of the paid-from asset account (Bank or Cash)',
  })
  @IsNotEmpty()
  @IsUUID()
  paid_from_account_id: string;

  @ApiProperty({
    example: 5000.0,
    description: 'Expense amount in INR',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({
    enum: ExpensePaymentMethod,
    example: ExpensePaymentMethod.BANK_TRANSFER,
    description: 'Payment method used',
  })
  @IsNotEmpty()
  @IsEnum(ExpensePaymentMethod)
  payment_method: ExpensePaymentMethod;

  @ApiPropertyOptional({
    example: 'INV-2026-9823',
    description: 'External invoice / bill / reference number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference_number?: string;

  @ApiPropertyOptional({
    example: 'Annual office stationery and printer supplies',
    description: 'Detailed description of the expense',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/receipts/bill-9823.pdf',
    description: 'URL or storage reference to the uploaded bill/attachment',
  })
  @IsOptional()
  @IsString()
  attachment_url?: string;
}
