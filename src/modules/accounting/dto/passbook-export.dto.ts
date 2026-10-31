import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum PassbookTransactionType {
  ALL = 'ALL',
  PAYMENT_IN = 'PAYMENT_IN',
  PAYMENT_OUT = 'PAYMENT_OUT',
}

export enum PassbookExportFormat {
  PDF = 'PDF',
  XLSX = 'XLSX',
  CSV = 'CSV',
}

export class PassbookExportQueryDto {
  @ApiPropertyOptional({
    enum: PassbookTransactionType,
    description: 'Filter transaction stream: ALL, PAYMENT_IN, or PAYMENT_OUT',
    default: PassbookTransactionType.ALL,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim().toUpperCase() as PassbookTransactionType) : value,
  )
  @IsEnum(PassbookTransactionType, {
    message: 'transactionType must be one of: ALL, PAYMENT_IN, PAYMENT_OUT',
  })
  transactionType?: PassbookTransactionType = PassbookTransactionType.ALL;

  @ApiPropertyOptional({
    description: 'Start date in YYYY-MM-DD format (inclusive)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'fromDate must be in YYYY-MM-DD format',
  })
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'End date in YYYY-MM-DD format (inclusive)',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'toDate must be in YYYY-MM-DD format',
  })
  toDate?: string;

  @ApiPropertyOptional({
    enum: PassbookExportFormat,
    description: 'Desired export document format: PDF, XLSX, or CSV',
    default: PassbookExportFormat.PDF,
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? (value.trim().toUpperCase() as PassbookExportFormat) : value,
  )
  @IsEnum(PassbookExportFormat, {
    message: 'format must be one of: PDF, XLSX, CSV',
  })
  format?: PassbookExportFormat = PassbookExportFormat.PDF;
}

