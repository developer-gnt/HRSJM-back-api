import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { EntryType } from '../enums/accounting.enums';

/**
 * Global ledger — from_date/to_date are required per BRD §24.
 */
export class GlobalLedgerQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsDateString()
  from_date: string;

  @IsDateString()
  to_date: string;

  @IsOptional()
  @IsUUID()
  account_id?: string;

  @IsOptional()
  @IsEnum(EntryType)
  entry_type?: EntryType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}
