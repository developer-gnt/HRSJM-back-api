import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsEnum, IsOptional, IsUUID, Matches } from "class-validator";
import { MembershipCategory } from "../entities/membership.entity";

export class CreateMembershipDto {
  @ApiProperty({ example: "b76665e6-8149-43f4-8cb0-3fb752c6c924" })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: MembershipCategory, example: MembershipCategory.REGULAR })
  @IsEnum(MembershipCategory)
  category!: MembershipCategory;

  @ApiPropertyOptional({ example: "2026-09-26", description: "Defaults to today" })
  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @ApiPropertyOptional({
    example: "500.00",
    description: "Defaults to 500.00 (REGULAR/STUDENT) or 10000.00 (LIFETIME)",
  })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: "feeAmount must be a numeric amount like 500.00" })
  feeAmount?: string;
}