import { IsDateString, IsNotEmpty } from 'class-validator';

export class ProfitLossSummaryQueryDto {
  @IsNotEmpty()
  @IsDateString()
  from_date: string;

  @IsNotEmpty()
  @IsDateString()
  to_date: string;
}
