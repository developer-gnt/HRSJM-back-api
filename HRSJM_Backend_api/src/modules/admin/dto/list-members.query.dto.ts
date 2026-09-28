import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../shared/dto/pagination.dto";
import { UserRole, UserStatus } from "../../users/entities/user.entity";
import { MembershipStatus } from "../../memberships/entities/membership.entity";

export class ListMembersQueryDto extends PaginationQueryDto {
  // Defaults to every non-admin account (members, donors, donation seekers)
  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  // Matches users who hold at least one membership in this status
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  membershipStatus?: MembershipStatus;

  @ApiPropertyOptional({ description: "Search in full name and email" })
  @IsOptional()
  @IsString()
  search?: string;
}
