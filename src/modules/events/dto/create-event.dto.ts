import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus } from '../entities/event.entity';

export class CreateEventDto {
  @ApiProperty({ description: 'Title of the event', example: 'Human Rights Awareness Seminar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Full description of the event' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ description: 'Short summary' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  short_information?: string;

  @ApiProperty({ description: 'Category of the event', example: 'Seminar' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiPropertyOptional({ description: 'Event format', default: 'IN_PERSON' })
  @IsString()
  @IsOptional()
  event_type?: string;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  @IsString()
  @IsOptional()
  cover_image_url?: string;

  @ApiProperty({ description: 'Start date and time (ISO 8601)' })
  @IsDateString()
  @IsNotEmpty()
  start_at: string;

  @ApiPropertyOptional({ description: 'End date and time (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  end_at?: string;

  @ApiPropertyOptional({ description: 'Is all day event', default: false })
  @IsBoolean()
  @IsOptional()
  all_day?: boolean;

  @ApiProperty({ description: 'Event venue/location', example: 'Kurla, Mumbai' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  location: string;

  @ApiPropertyOptional({ description: 'Full physical address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'Organizing committee or team' })
  @IsString()
  @IsOptional()
  organized_by?: string;

  @ApiPropertyOptional({ description: 'Whether registration is required', default: true })
  @IsBoolean()
  @IsOptional()
  registration_required?: boolean;

  @ApiPropertyOptional({ description: 'Maximum seating capacity', default: 100 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  capacity?: number;

  @ApiPropertyOptional({ description: 'Registrations count so far', default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  registrations?: number;

  @ApiPropertyOptional({ description: 'Max registrations per person', default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  per_person_limit?: number;

  @ApiPropertyOptional({ description: 'Target audience' })
  @IsString()
  @IsOptional()
  target_audience?: string;

  @ApiPropertyOptional({ description: 'Language of event' })
  @IsString()
  @IsOptional()
  language?: string;

  @ApiPropertyOptional({ description: 'Tags array', type: [String] })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: EventStatus, default: EventStatus.UPCOMING })
  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;
}
