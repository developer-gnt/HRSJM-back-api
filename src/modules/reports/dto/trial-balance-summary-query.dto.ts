import { IsDateString, IsOptional } from 'class-validator';

export class TrialBalanceSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  as_of_date?: string;
}
