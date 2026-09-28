import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ExpenseStatus } from '../enums/expense-entry.enums';

export class UpdateExpenseStatusDto {
  @ApiProperty({
    enum: [ExpenseStatus.CANCELLED],
    example: ExpenseStatus.CANCELLED,
    description: 'Status to apply (expenses can be cancelled/voided with automatic accounting reversal)',
  })
  @IsNotEmpty()
  @IsIn([ExpenseStatus.CANCELLED])
  status: ExpenseStatus;

  @ApiPropertyOptional({
    example: 'Duplicate entry created in error',
    description: 'Reason for cancellation',
  })
  @IsOptional()
  @IsString()
  cancellation_reason?: string;
}
