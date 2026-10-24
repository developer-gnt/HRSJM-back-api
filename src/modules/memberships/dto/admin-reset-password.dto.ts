import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminResetPasswordDto {
  @ApiPropertyOptional({
    description:
      'Optional new password to set directly (minimum 6 characters). If omitted, a secure reset token is generated in the database.',
    example: 'TempPass@2026',
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  new_password?: string;
}
