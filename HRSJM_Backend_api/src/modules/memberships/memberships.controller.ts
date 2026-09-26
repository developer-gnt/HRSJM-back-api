import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../shared/decorators/roles.decorator";
import { UserRole } from "../users/entities/user.entity";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { ListMembershipsQueryDto } from "./dto/list-memberships.query.dto";
import { MembershipsService } from "./memberships.service";

// JwtAuthGuard + RolesGuard are registered globally in AppModule,
// so @Roles() alone is enough here.
@ApiTags("admin/memberships")
@ApiBearerAuth()
@Controller("admin/memberships")
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Register a member and issue digital membership ID (admin only)" })
  create(@Body() dto: CreateMembershipDto) {
    return this.membershipsService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List memberships with filters (admin only)" })
  list(@Query() query: ListMembershipsQueryDto) {
    return this.membershipsService.list(query);
  }
}