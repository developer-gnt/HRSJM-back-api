import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export enum MockPaymentMethod {
  UPI = 'upi',
  CARD = 'card',
  NETBANKING = 'netbanking',
  WALLET = 'wallet',
}

export class CreateGatewayOrderDto {
  @ApiProperty({ example: 1000, description: 'Order amount in INR' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ example: 'INR', default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string = 'INR';

  @ApiPropertyOptional({ example: 'donation', description: 'Purpose of payment' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ example: 'Education Support for Children' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'entity_123' })
  @IsOptional()
  @IsString()
  entity_id?: string;

  @ApiPropertyOptional({ example: 'Aman Shaikh' })
  @IsOptional()
  @IsString()
  customer_name?: string;

  @ApiPropertyOptional({ example: 'donor@hrsjm.org' })
  @IsOptional()
  @IsString()
  customer_email?: string;

  @ApiPropertyOptional({ example: '9888880002' })
  @IsOptional()
  @IsString()
  customer_phone?: string;
}

export class ProcessGatewayChargeDto {
  @ApiProperty({ example: 'order_mock_987654321', description: 'Gateway order ID' })
  @IsNotEmpty()
  @IsString()
  order_id: string;

  @ApiProperty({ example: 1000, description: 'Amount charged' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: MockPaymentMethod, example: MockPaymentMethod.UPI })
  @IsEnum(MockPaymentMethod)
  payment_method: MockPaymentMethod;

  @ApiPropertyOptional({ example: 'user@upi' })
  @IsOptional()
  @IsString()
  upi_id?: string;

  @ApiPropertyOptional({ example: 'Google Pay' })
  @IsOptional()
  @IsString()
  upi_app?: string;

  @ApiPropertyOptional({ example: '4111 2222 3333 4444' })
  @IsOptional()
  @IsString()
  card_number?: string;

  @ApiPropertyOptional({ example: 'Aman Shaikh' })
  @IsOptional()
  @IsString()
  card_holder?: string;

  @ApiPropertyOptional({ example: 'HDFC Bank' })
  @IsOptional()
  @IsString()
  bank_name?: string;

  @ApiPropertyOptional({ example: 'Paytm Wallet' })
  @IsOptional()
  @IsString()
  wallet_name?: string;

  @ApiPropertyOptional({ example: 'success', description: 'Simulation mode: success | failure' })
  @IsOptional()
  @IsString()
  simulation_mode?: 'success' | 'failure';
}

export class VerifyGatewaySignatureDto {
  @ApiProperty({ example: 'order_mock_123' })
  @IsNotEmpty()
  @IsString()
  order_id: string;

  @ApiProperty({ example: 'pay_mock_123' })
  @IsNotEmpty()
  @IsString()
  payment_id: string;

  @ApiProperty({ example: 'mock_signature_hash' })
  @IsNotEmpty()
  @IsString()
  signature: string;
}
