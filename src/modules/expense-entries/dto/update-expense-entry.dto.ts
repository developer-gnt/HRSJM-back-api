import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateExpenseEntryDto {
  @ApiPropertyOptional({
    example: 'Apex Office Supplies Ltd',
    description: 'Updated name of recipient / payee',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  paid_to?: string;

  @ApiPropertyOptional({
    example: 'INV-2026-9823-REV',
    description: 'Updated external invoice / bill / reference number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference_number?: string;

  @ApiPropertyOptional({
    example: 'Updated description for office supplies',
    description: 'Updated description of the expense',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/receipts/bill-9823-updated.pdf',
    description: 'Updated attachment URL',
  })
  @IsOptional()
  @IsString()
  attachment_url?: string;
}
