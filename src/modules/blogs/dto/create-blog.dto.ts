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
import { BlogStatus } from '../entities/blog.entity';

export class CreateBlogDto {
  @ApiProperty({ description: 'Title of the blog article', example: 'Understanding Your Legal Rights as a Citizen' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'URL slug', example: 'understanding-your-legal-rights-as-a-citizen' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  slug?: string;

  @ApiProperty({ description: 'Short excerpt/description of the blog' })
  @IsString()
  @IsNotEmpty()
  excerpt: string;

  @ApiPropertyOptional({ description: 'Body content paragraphs (or raw text/json string)' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ description: 'Blog category', example: 'Know Your Rights' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ enum: BlogStatus, default: BlogStatus.PUBLISHED })
  @IsEnum(BlogStatus)
  @IsOptional()
  status?: BlogStatus;

  @ApiPropertyOptional({ description: 'Publish date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  published_at?: string;

  @ApiPropertyOptional({ description: 'Cover image or thumbnail URL' })
  @IsString()
  @IsOptional()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: 'Author name', default: 'HRSJM Admin' })
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional({ description: 'Tags array', type: [String] })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Featured article flag', default: false })
  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @ApiPropertyOptional({ description: 'Allow comments', default: true })
  @IsBoolean()
  @IsOptional()
  allow_comments?: boolean;
}
