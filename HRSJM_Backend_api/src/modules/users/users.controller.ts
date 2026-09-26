import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { AuthenticatedUser, CurrentUser } from "../../shared/decorators/current-user.decorator";
import { Roles } from "../../shared/decorators/roles.decorator";
import { PaginationQueryDto } from "../../shared/dto/pagination.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UserStatus, UserRole } from "./entities/user.entity";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "List users (admin only)" })
  @ApiQuery({ name: "role", required: false, enum: UserRole })
  @ApiQuery({ name: "search", required: false })
  list(
    @Query() query: PaginationQueryDto,
    @Query("role") role?: UserRole,
    @Query("search") search?: string,
  ) {
    return this.usersService.listUsers(query.page, query.limit, role, search);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by id (admin or self)" })
  async getById(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    if (currentUser.role !== UserRole.ADMIN && currentUser.id !== id) {
      throw new ForbiddenException("You can only access your own profile");
    }
    return this.usersService.getSafeUserById(id).then((user) => ({
      message: "User fetched",
      data: user,
    }));
  }

  @Patch(":id/status")
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: "Activate or suspend a user (admin only)" })
  async setStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.usersService.setStatus(id, dto.status).then((user) => ({
      message: "User status updated",
      data: user,
    }));
  }
}