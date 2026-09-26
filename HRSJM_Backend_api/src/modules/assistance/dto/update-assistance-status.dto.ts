import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { AssistanceRequestStatus } from "../entities/assistance-request.entity";

export class UpdateAssistanceStatusDto {
  @ApiProperty({ enum: AssistanceRequestStatus })
  @IsEnum(AssistanceRequestStatus)
  status!: AssistanceRequestStatus;

  @ApiPropertyOptional({ example: "Verified supporting documents" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminRemark?: string;
}