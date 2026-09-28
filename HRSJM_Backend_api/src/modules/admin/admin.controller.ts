import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../../shared/decorators/roles.decorator";
import { UserRole } from "../users/entities/user.entity";
import { AdminService } from "./admin.service";
import { ListMembersQueryDto } from "./dto/list-members.query.dto";

@ApiTags("admin")
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("dashboard")
  @ApiOperation({ summary: "Admin dashboard aggregates (admin only)" })
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get("members")
  @ApiOperation({ summary: "Member list with search and filters (admin only)" })
  listMembers(@Query() query: ListMembersQueryDto) {
    return this.adminService.listMembers(query);
  }

  @Get("members/:id")
  @ApiOperation({ summary: "Member detail 360 view (admin only)" })
  getMember360(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminService.getMember360(id);
  }
}