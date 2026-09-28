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
import { ReceiptPaymentMethod } from '../enums/receipt-entry.enums';

export class CreateReceiptEntryDto {
  @ApiProperty({
    example: '2026-09-28T00:00:00.000Z',
    description: 'Date when the payment / income was received',
  })
  @IsNotEmpty()
  @IsDateString()
  receipt_date: string;

  @ApiProperty({
    example: 'Dr. Tariq Khan',
    description: 'Name of the payer / donor / source party',
    maxLength: 150,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  received_from: string;

  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000756',
    description: 'ID of the income account (must be of type INCOME)',
  })
  @IsNotEmpty()
  @IsUUID()
  income_account_id: string;

  @ApiProperty({
    example: '00000000-0000-4000-8000-000000000751',
    description: 'ID of the receiving asset account (Bank or Cash)',
  })
  @IsNotEmpty()
  @IsUUID()
  received_in_account_id: string;

  @ApiProperty({
    example: 25000.0,
    description: 'Received amount in INR',
  })
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({
    enum: ReceiptPaymentMethod,
    example: ReceiptPaymentMethod.BANK_TRANSFER,
    description: 'Payment method received through',
  })
  @IsNotEmpty()
  @IsEnum(ReceiptPaymentMethod)
  payment_method: ReceiptPaymentMethod;

  @ApiPropertyOptional({
    example: 'UTR-20260928-8832',
    description: 'External reference / cheque / UTR / transaction number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference_number?: string;

  @ApiPropertyOptional({
    example: 'General donation received towards community hall repairs',
    description: 'Detailed description of the receipt',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/receipts/proof-8832.pdf',
    description: 'URL or storage reference to the uploaded acknowledgement/cheque/voucher',
  })
  @IsOptional()
  @IsString()
  attachment_url?: string;
}
