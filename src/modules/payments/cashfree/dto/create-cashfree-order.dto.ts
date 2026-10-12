import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export class CreateCashfreeOrderDto {
  @ApiProperty({ enum: ['donation', 'membership'], description: 'Payment purpose' })
  @IsIn(['donation', 'membership'])
  purpose: 'donation' | 'membership';

  @ApiProperty({ description: 'Internal payment record UUID (donation_payment_id or membership_payment_id)' })
  @IsUUID()
  reference_id: string;
}
