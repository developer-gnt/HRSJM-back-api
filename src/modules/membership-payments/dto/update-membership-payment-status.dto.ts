import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';

export class UpdateMembershipPaymentStatusDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
