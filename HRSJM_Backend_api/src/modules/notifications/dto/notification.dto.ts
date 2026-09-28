import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import {
  NotificationAudience,
  NotificationStatus,
} from "../entities/notification.entity";

export class CreateNotificationDto {
  @ApiProperty({ example: "Annual General Meeting 2026" })
  @IsString()
  @Length(3, 150)
  title!: string;

  @ApiProperty({
    example:
      "The AGM will be held on 2026-10-15 at the community hall. All members are requested to attend.",
  })
  @IsString()
  @Length(3, 5000)
  body!: string;

  @ApiProperty({ enum: NotificationAudience })
  @IsEnum(NotificationAudience)
  targetAudience!: NotificationAudience;

  // Required when targetAudience is SPECIFIC_USER, ignored otherwise
  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    description: "Recipient user ids; required only for SPECIFIC_USER",
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID("all", { each: true })
  userIds?: string[];

  // Optional future ISO datetime; omit to send immediately
  @ApiPropertyOptional({ example: "2026-10-01T09:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;

  @ApiPropertyOptional({ enum: NotificationAudience })
  @IsOptional()
  @IsEnum(NotificationAudience)
  audience?: NotificationAudience;
}

export class ListMyNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  unreadOnly?: boolean;
}