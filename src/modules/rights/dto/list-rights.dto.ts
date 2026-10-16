import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { RightStatus } from '../entities/right.entity';

export class ListRightsDto {
  @ApiPropertyOptional({ description: 'Filter by status or ALL' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by category (Constitutional, Women & Child, etc.)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by date range: TODAY | WEEK | MONTH | ANY' })
  @IsOptional()
  @IsString()
  dateRange?: string;

  @ApiPropertyOptional({ description: 'Search term for title, description, category, or legal reference' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;
}
