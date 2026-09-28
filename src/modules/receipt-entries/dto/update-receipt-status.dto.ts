import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReceiptStatus } from '../enums/receipt-entry.enums';

export class UpdateReceiptStatusDto {
  @ApiProperty({
    enum: [ReceiptStatus.CANCELLED],
    example: ReceiptStatus.CANCELLED,
    description:
      'Status to apply (receipt vouchers can be cancelled/voided with automatic accounting reversal)',
  })
  @IsNotEmpty()
  @IsIn([ReceiptStatus.CANCELLED])
  status: ReceiptStatus;

  @ApiPropertyOptional({
    example: 'Cheque bounced / transaction disputed',
    description: 'Reason for receipt cancellation',
  })
  @IsOptional()
  @IsString()
  cancellation_reason?: string;
}
