import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundDonationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
