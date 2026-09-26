import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import { TicketStatus } from "../entities/support-ticket.entity";

export class CreateTicketDto {
  @ApiProperty({ example: "Cannot download my membership certificate" })
  @IsString()
  @Length(3, 200)
  subject!: string;

  @ApiProperty({ example: "The download button returns an error every time." })
  @IsString()
  @Length(5, 5000)
  description!: string;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus)
  status!: TicketStatus;

  // Optional closing note; recorded as an admin message on the thread
  @ApiPropertyOptional({ example: "Issue fixed, please try again." })
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  note?: string;
}

export class CreateTicketMessageDto {
  @ApiProperty({ example: "Still not working after the fix." })
  @IsString()
  @Length(1, 5000)
  body!: string;
}

export class ListTicketsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ description: "Search in subject" })
  @IsOptional()
  @IsString()
  search?: string;
}