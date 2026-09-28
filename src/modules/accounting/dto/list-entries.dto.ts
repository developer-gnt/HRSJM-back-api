import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { EntryType, ReferenceType } from '../enums/accounting.enums';

export class ListEntriesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(ReferenceType)
  reference_type?: ReferenceType;

  @IsOptional()
  @IsUUID()
  reference_id?: string;

  @IsOptional()
  @IsEnum(EntryType)
  entry_type?: EntryType;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}
