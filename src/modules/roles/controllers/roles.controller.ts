import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../../../common/guards/permissions.guard';
import { RolesService } from '../services/roles.service';
import {
  CreateRoleDto,
  RolePermissionsDto,
  UpdateRoleDto,
} from '../dto/role.dto';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('roles')
  @RequirePermissions('role.read')
  @ApiOperation({ summary: 'List all roles with their permissions (admin)' })
  listRoles() {
    return this.rolesService.listRoles();
  }

  @Post('roles')
  @RequirePermissions('role.create')
  @ApiOperation({ summary: 'Create a role (admin)' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Get('roles/:id')
  @RequirePermissions('role.read')
  @ApiOperation({ summary: 'View a role (admin)' })
  getRole(@Param('id') id: string) {
    return this.rolesService.getRole(id);
  }

  @Patch('roles/:id')
  @RequirePermissions('role.update')
  @ApiOperation({ summary: 'Update a role (admin)' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('role.delete')
  @ApiOperation({ summary: 'Delete a role (admin, baseline roles protected)' })
  async deleteRole(@Param('id') id: string) {
    await this.rolesService.deleteRole(id);
    return { id, deleted: true };
  }

  @Post('roles/:id/permissions')
  @RequirePermissions('role.update')
  @ApiOperation({ summary: 'Assign permissions to a role (admin)' })
  setRolePermissions(@Param('id') id: string, @Body() dto: RolePermissionsDto) {
    return this.rolesService.setRolePermissions(id, dto.permission_ids);
  }

  @Delete('roles/:id/permissions/:permissionId')
  @RequirePermissions('role.update')
  @ApiOperation({ summary: 'Remove a permission from a role (admin)' })
  removeRolePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.rolesService.removeRolePermission(id, permissionId);
  }
}
