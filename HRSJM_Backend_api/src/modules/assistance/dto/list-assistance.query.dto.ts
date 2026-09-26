import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import { AssistanceRequestStatus } from "../entities/assistance-request.entity";

export class ListAssistanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AssistanceRequestStatus })
  @IsOptional()
  @IsEnum(AssistanceRequestStatus)
  status?: AssistanceRequestStatus;
}