import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * account_type is deliberately excluded — it is immutable after creation.
 */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  account_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  account_code?: string;

  @IsOptional()
  @IsUUID()
  parent_account_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
