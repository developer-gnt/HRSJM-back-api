import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReceiptEntryDto {
  @ApiPropertyOptional({
    example: 'Dr. Tariq Khan',
    description: 'Updated name of payer / source party',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  received_from?: string;

  @ApiPropertyOptional({
    example: 'UTR-20260928-8832-REV',
    description: 'Updated reference / transaction / cheque number',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference_number?: string;

  @ApiPropertyOptional({
    example: 'Updated description for receipt',
    description: 'Updated description of the receipt',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'https://storage.example.com/receipts/proof-8832-updated.pdf',
    description: 'Updated attachment URL',
  })
  @IsOptional()
  @IsString()
  attachment_url?: string;
}
