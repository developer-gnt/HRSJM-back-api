import { Transform } from 'class-transformer';
import { IsDateString, IsOptional } from 'class-validator';

export class TrialBalanceSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  @Transform(({ obj, value }) => value || obj.asOfDate || obj.date || obj.to_date)
  as_of_date?: string;

  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  to_date?: string;
}

