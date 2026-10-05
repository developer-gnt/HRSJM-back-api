import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsStatus } from '../entities/news.entity';

export class CreateNewsDto {
  @ApiProperty({ description: 'Title or headline of news item', example: 'HRSJM Organizes Legal Aid Camp in Kurla' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'URL slug', example: 'hrsjm-organizes-legal-aid-camp-in-kurla' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  slug?: string;

  @ApiProperty({ description: 'Short summary' })
  @IsString()
  @IsNotEmpty()
  summary: string;

  @ApiPropertyOptional({ description: 'Detailed summary for full view' })
  @IsString()
  @IsOptional()
  summary_detailed?: string;

  @ApiPropertyOptional({ description: 'Body content paragraphs (or raw text/json string)' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ description: 'News category', example: 'Legal' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ enum: NewsStatus, default: NewsStatus.PUBLISHED })
  @IsEnum(NewsStatus)
  @IsOptional()
  status?: NewsStatus;

  @ApiPropertyOptional({ description: 'Publish date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  published_at?: string;

  @ApiPropertyOptional({ description: 'Featured image or thumbnail URL' })
  @IsString()
  @IsOptional()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: 'Author name', default: 'HRSJM Team' })
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional({ description: 'Tags array', type: [String] })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Highlights array', type: [String] })
  @IsOptional()
  highlights?: string[];

  @ApiPropertyOptional({ description: 'Gallery image URLs array', type: [String] })
  @IsOptional()
  gallery?: string[];

  @ApiPropertyOptional({ description: 'Allow comments', default: true })
  @IsBoolean()
  @IsOptional()
  allow_comments?: boolean;
}
