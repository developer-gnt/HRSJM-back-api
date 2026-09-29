import { IsOptional, IsString } from 'class-validator';

export class VerifyDonationPaymentDto {
  @IsOptional()
  @IsString()
  payment_id?: string;

  @IsString()
  gateway_payment_id: string;

  @IsOptional()
  @IsString()
  gateway_order_id?: string;

  @IsOptional()
  @IsString()
  gateway_signature?: string;

  @IsOptional()
  gateway_payload?: Record<string, unknown>;
}
