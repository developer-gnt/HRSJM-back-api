import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import { MembershipStatus } from "../entities/membership.entity";

export class ListMembershipsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional({ example: "b76665e6-8149-43f4-8cb0-3fb752c6c924" })
  @IsOptional()
  @IsUUID()
  userId?: string;
}