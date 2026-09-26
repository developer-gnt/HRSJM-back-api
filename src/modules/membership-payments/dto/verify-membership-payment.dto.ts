import { IsOptional, IsString } from 'class-validator';

export class VerifyMembershipPaymentDto {
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
