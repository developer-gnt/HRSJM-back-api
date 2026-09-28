import { IsDateString, IsOptional } from 'class-validator';

export class BalanceSheetSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  as_of_date?: string;
}
