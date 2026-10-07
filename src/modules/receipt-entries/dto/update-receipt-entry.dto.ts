import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ReceiptPaymentMethod } from '../enums/receipt-entry.enums';

export class UpdateReceiptEntryDto {
  @ApiPropertyOptional({
    example: '2026-10-07',
    description: 'Updated receipt date (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  receipt_date?: string;

  @ApiPropertyOptional({
    example: 'Dr. Tariq Khan',
    description: 'Updated name of payer / source party',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  received_from?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000756',
    description: 'ID of the income account (must be of type INCOME)',
  })
  @IsOptional()
  @IsUUID()
  income_account_id?: string;

  @ApiPropertyOptional({
    example: '00000000-0000-4000-8000-000000000751',
    description: 'ID of the receiving asset account (Bank or Cash)',
  })
  @IsOptional()
  @IsUUID()
  received_in_account_id?: string;

  @ApiPropertyOptional({
    example: 25000.0,
    description: 'Updated received amount in INR',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({
    enum: ReceiptPaymentMethod,
    example: ReceiptPaymentMethod.BANK_TRANSFER,
    description: 'Updated payment method / receiving channel',
  })
  @IsOptional()
  @IsEnum(ReceiptPaymentMethod)
  payment_method?: ReceiptPaymentMethod;

  @ApiPropertyOptional({
    example: 'UTR-20260928-8832-REV',
    description: 'Updated reference / transaction / cheque number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference_number?: string;

  @ApiPropertyOptional({
    example: 'Updated description for receipt',
    description: 'Updated description of the receipt',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/receipts/proof-8832-updated.pdf',
    description: 'Updated attachment URL',
  })
  @IsOptional()
  @IsString()
  attachment_url?: string;
}
