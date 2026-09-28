import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationAudience } from '../entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty({ description: 'Notification title', example: 'Annual General Meeting Reminder' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @ApiProperty({ description: 'Notification body text', example: 'The HRSJM AGM is scheduled for this Sunday at 10 AM.' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  body: string;

  @ApiProperty({
    description: 'Target recipient audience',
    enum: NotificationAudience,
    example: NotificationAudience.ALL_USERS,
  })
  @IsEnum(NotificationAudience)
  target_audience: NotificationAudience;

  @ApiPropertyOptional({
    description: 'List of specific user UUIDs if target_audience is SPECIFIC_USER',
    type: [String],
    example: ['4b83d6eb-7065-4ba6-897b-746e3e88694a'],
  })
  @ValidateIf((o) => o.target_audience === NotificationAudience.SPECIFIC_USER)
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  recipient_user_ids?: string[];

  @ApiPropertyOptional({
    description: 'Optional future ISO date for scheduling',
    example: '2026-10-01T10:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  scheduled_at?: string;
}
