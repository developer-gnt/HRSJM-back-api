import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDonationPaymentDto {
  @IsNotEmpty()
  @IsUUID()
  donation_id: string;

  /** Optional — defaults to the donation's recorded amount, re-validated server-side. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999.99)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  transaction_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
