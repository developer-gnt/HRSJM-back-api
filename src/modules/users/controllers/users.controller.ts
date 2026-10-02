import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { UsersAdminService } from '../services/users-admin.service';
import { RolesService } from '../../roles/services/roles.service';
import { UsersService } from '../services/users.service';
import {
  ListUsersDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UserRoleDto,
} from '../dto/user-admin.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersAdmin: UsersAdminService,
    private readonly rolesService: RolesService,
    private readonly usersService: UsersService,
  ) {}

  /** Declared before ':id' routes so 'me/permissions' is never captured as an id. */
  @Get('me/permissions')
  @ApiOperation({
    summary: "List the authenticated user's effective permission keys (all roles)",
  })
  async mePermissions(@AuthenticatedUser() user: { sub: string }) {
    const permissions = await this.usersService.getEffectivePermissionNames(
      user.sub,
    );
    return { user_id: user.sub, permissions };
  }

  @Get()
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'List/search/filter users (admin)' })
  listUsers(@Query() dto: ListUsersDto) {
    return this.usersAdmin.listUsers(dto);
  }

  @Get(':id')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'View a user (admin)' })
  getUser(@Param('id') id: string) {
    return this.usersAdmin.getUser(id);
  }

  @Patch(':id')
  @RequirePermissions('user.update')
  @ApiOperation({ summary: 'Update user profile fields (admin)' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @AuthenticatedUser() actingUser: { sub: string },
  ) {
    return this.usersAdmin.updateUser(id, dto, actingUser.sub);
  }

  @Patch(':id/status')
  @RequirePermissions('user.manage_status')
  @ApiOperation({ summary: 'Activate/deactivate a user (admin)' })
  updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @AuthenticatedUser() actingUser: { sub: string },
  ) {
    return this.usersAdmin.updateUserStatus(id, dto, actingUser.sub);
  }

  @Get(':id/roles')
  @RequirePermissions('user.read')
  @ApiOperation({ summary: 'View roles assigned to a user (admin)' })
  listUserRoles(@Param('id') id: string) {
    return this.rolesService.listUserRoles(id);
  }

  @Post(':id/roles')
  @RequirePermissions('role.assign')
  @ApiOperation({ summary: 'Assign a role to a user (admin)' })
  assignUserRole(@Param('id') id: string, @Body() dto: UserRoleDto) {
    return this.rolesService.assignUserRole(id, dto.role_id);
  }

  @Delete(':id/roles/:roleId')
  @RequirePermissions('role.assign')
  @ApiOperation({ summary: 'Remove a role from a user (admin)' })
  removeUserRole(@Param('id') id: string, @Param('roleId') roleId: string) {
    return this.rolesService.removeUserRole(id, roleId);
  }
}

// Re-export for readability in guard tests
export type { AuthenticatedRequest };
