import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListEventsDto {
  @ApiPropertyOptional({ enum: ['ALL', 'UPCOMING', 'COMPLETED', 'CANCELLED', 'DRAFT'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by category name' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Search query across title, location and category' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by is_enabled (true/false/ALL)' })
  @IsOptional()
  @IsString()
  is_enabled?: string;

  @ApiPropertyOptional({ description: 'Alias for is_enabled (camelCase)' })
  @IsOptional()
  @IsString()
  isEnabled?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 50;
}
