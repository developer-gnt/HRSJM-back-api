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
import { RightStatus } from '../entities/right.entity';

export class CreateRightDto {
  @ApiProperty({ description: 'Title of the rights guide/article', example: 'Fundamental Rights of Every Citizen' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: 'URL slug', example: 'fundamental-rights' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  slug?: string;

  @ApiProperty({ description: 'Short summary or description' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Full body content paragraphs or markdown' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ description: 'Rights category', example: 'Constitutional' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ description: 'Category display label', example: 'Constitutional' })
  @IsString()
  @IsOptional()
  category_label?: string;

  @ApiPropertyOptional({ description: 'Legal reference article/act', example: 'Part III of Constitution • Articles 12–35' })
  @IsString()
  @IsOptional()
  legal_reference?: string;

  @ApiPropertyOptional({ description: 'Comma-separated highlights or JSON array', example: 'Right to Equality,Right to Freedom,Article 32 Writs' })
  @IsString()
  @IsOptional()
  highlights?: string;

  @ApiPropertyOptional({ description: 'Icon name', default: 'scale' })
  @IsString()
  @IsOptional()
  icon?: string;

  @ApiPropertyOptional({ description: 'Card color tint', default: '#FFF8E8' })
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional({ description: 'Icon color', default: '#1D4ED8' })
  @IsString()
  @IsOptional()
  icon_color?: string;

  @ApiPropertyOptional({ description: 'Badge background color', default: '#DBEAFE' })
  @IsString()
  @IsOptional()
  badge_bg?: string;

  @ApiPropertyOptional({ enum: RightStatus, default: RightStatus.PUBLISHED })
  @IsEnum(RightStatus)
  @IsOptional()
  status?: RightStatus;

  @ApiPropertyOptional({ description: 'Publish date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  published_at?: string;

  @ApiPropertyOptional({ description: 'Cover image or thumbnail URL' })
  @IsString()
  @IsOptional()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: 'Author name', default: 'HRSJM Legal Cell' })
  @IsString()
  @IsOptional()
  author?: string;

  @ApiPropertyOptional({ description: 'Author role', default: 'Legal Advisor' })
  @IsString()
  @IsOptional()
  author_role?: string;

  @ApiPropertyOptional({ description: 'Organization name', default: 'HRSJM' })
  @IsString()
  @IsOptional()
  organization?: string;

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
