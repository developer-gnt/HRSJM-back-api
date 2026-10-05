import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BlogStatus } from '../entities/blog.entity';

export class ListBlogsDto {
  @ApiPropertyOptional({ enum: ['ALL', ...Object.values(BlogStatus)], default: 'ALL' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by category name' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: ['ANY', 'TODAY', 'WEEK', 'MONTH'], default: 'ANY' })
  @IsString()
  @IsOptional()
  dateRange?: string;

  @ApiPropertyOptional({ description: 'Search keyword for title, excerpt, category or author' })
  @IsString()
  @IsOptional()
  search?: string;

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
