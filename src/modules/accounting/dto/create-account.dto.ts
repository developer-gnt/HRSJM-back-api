import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AccountType } from '../enums/accounting.enums';

export class CreateAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  account_name: string;

  @IsEnum(AccountType)
  account_type: AccountType;

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
