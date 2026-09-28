import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { AccountType } from '../../accounting/enums/accounting.enums';

export class TrialBalanceQueryDto {
  @IsOptional()
  @IsDateString()
  as_of_date?: string;

  @IsOptional()
  @IsUUID()
  account_id?: string;

  @IsOptional()
  @IsEnum(AccountType)
  account_type?: AccountType;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') return true;
    if (value === 'false' || value === false || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean()
  include_zero_balances?: boolean = false;
}
